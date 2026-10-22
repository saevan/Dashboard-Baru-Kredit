/**
 * core/engine.js — Orkestrasi analisis lengkap (pre-disbursement).
 * Menggabungkan: rasio (dengan debt service riil) → benchmark → gap → bobot
 * dinamis → skor 6 pilar → skor akhir → keputusan 3 lapis (registry aturan
 * tunggal) → rekomendasi nominal (scheme-aware) → risk rating & pricing legacy
 * → stress test → covenant otomatis → PD/LGD/EAD/EL & pricing berbasis risiko.
 *
 * Pure function (tanpa DOM / fetch). Menyertakan SNAPSHOT konfigurasi
 * (versi + hash + profil/sektor efektif) di `meta.snapshot` agar tiap analisis
 * dapat direproduksi.
 *
 * Rujukan: ARCHITECTURE §3, §3A, §3.5, §3.6; PRD §6.7.
 */

import {
     DEFAULT_CONFIG,
     COMPONENT_DEFS,
     PILLARS,
     PILLAR_LABELS,
     MAIN_RATIOS,
     RATIO_META,
     CONFIG_VERSION,
     resolveConfig,
     configHash,
     ruleSummary
} from './config.js';
import { computeRatios, safeDiv, RATIOS_FOR_BENCHMARK } from './ratios.js';
import { compareRatio, listSectors, applySmeCorrection, tailFlags } from './benchmark.js';
import { computeGap } from './gap.js';
import { resolveProfileWeights, adjustWeightsByGap, adjustPillarWeightsByGap } from './weights.js';
import { computeSubScores, computeFinalScore, riskRating, riskBasedPricing } from './scoring.js';
import { decide, applyStressCap } from './eligibility.js';
import { recommendNominal, effectiveDscrTarget } from './nominal.js';
import { computeDebtService, NEW_LOAN_SCHEME } from './debt-service.js';
import { runStressTest } from './stress.js';
import { generateCovenants, checkCovenants } from './covenant.js';
import { facilityRwa } from './rwa.js';
import { creditRiskModel } from './pd.js';
import { spreadFinancials } from './spreading.js';
import { ahpWeights } from './ahp.js';
import { isBankSector, hasBankData, bankRatiosSummary } from './bank-ratios.js';
import { checkStatementIntegrity } from './statement-integrity.js';
import { classifyBorrower } from './segment.js';
import { buildDailyCashflow } from './daily-cashflow.js';
import { recommendAmount } from './recommendation.js';
import { computeFiveC } from './five-c.js';
import { pefindoRating } from './rating.js';

const num = (v, d = 0) =>
     v === null || v === undefined || v === ''
          ? d
          : Number.isFinite(Number(v))
               ? Number(v)
               : d;
const round2 = (v) => Math.round(v * 100) / 100;

/** Bunga fallback bila borrower tidak mengisi (14%/tahun). */
const DEFAULT_BUNGA_TAHUNAN = 0.14;

/** Bobot dasar tiap komponen (dari COMPONENT_DEFS). */
export function baseComponentWeights() {
     const w = {};
     for (const c of COMPONENT_DEFS) w[c.key] = c.base;
     return w;
}

/**
 * Blok bobot komponen yang dipengaruhi profil company (quanti/quali) lalu gap.
 * - Profil: proporsi kuantitatif vs kualitatif dalam tiap pilar mengikuti profil.
 * - Gap: komponen kuantitatif disesuaikan (makin jauh dari median → bobot diangkat).
 * Dinormalisasi PER PILAR agar skor pilar tetap skala 0–100.
 */
export function buildComponentWeights({ config = DEFAULT_CONFIG, profiles = null, profileKey = null, gapItems = [] } = {}) {
     const k = config.gap.sensitivityK;
     const peso = resolveProfileWeights(profileKey, profiles);
     const base = baseComponentWeights();

     // 1) Blend quanti/quali per pilar
     const blended = { ...base };
     for (const pillar of PILLARS) {
          const comps = COMPONENT_DEFS.filter((c) => c.pillar === pillar);
          const quant = comps.filter((c) => c.qualitative !== true);
          const qual = comps.filter((c) => c.qualitative === true);
          const qSum = quant.reduce((a, c) => a + base[c.key], 0);
          const lSum = qual.reduce((a, c) => a + base[c.key], 0);
          if (qSum > 0 && lSum > 0) {
               for (const c of quant) blended[c.key] = (base[c.key] / qSum) * peso.quanti;
               for (const c of qual) blended[c.key] = (base[c.key] / lSum) * peso.quali;
          }
     }

     // 2) Penyesuaian gap (per pilar, lalu normalisasi per pilar)
     const normalized = {};
     const notes = [];
     for (const pillar of PILLARS) {
          const comps = COMPONENT_DEFS.filter((c) => c.pillar === pillar);
          const subW = {};
          for (const c of comps) subW[c.key] = blended[c.key];
          const res = adjustWeightsByGap(subW, gapItems, k);
          for (const c of comps) normalized[c.key] = res.normalized[c.key];
          for (const n of res.notes) notes.push({ ...n, pillar });
     }

     return {
          base,
          blended,
          normalized,
          notes,
          profile: peso,
          sensitivity_k: k
     };
}

/** Skor 6 pilar memakai bobot komponen yang sudah disesuaikan. */
export function scorePillarsWithWeights({ subscores, componentWeights }) {
     const pillars = {};
     for (const pillar of PILLARS) {
          const comps = COMPONENT_DEFS.filter((c) => c.pillar === pillar);
          let s = 0;
          let w = 0;
          for (const c of comps) {
               const cw = num(componentWeights[c.key]);
               s += num(subscores[c.key], 60) * cw;
               w += cw;
          }
          pillars[pillar] = w > 0 ? round2(s / w) : 0;
     }
     return pillars;
}

/** Deteksi periode arus kas operasional negatif dari data borrower (bila tersedia). */
function resolveNegativeOcfPeriods(keuangan = {}) {
     if (Number.isFinite(Number(keuangan.ocf_negatif_periode))) return Number(keuangan.ocf_negatif_periode);
     if (Array.isArray(keuangan.history_arus_kas)) {
          let count = 0;
          for (let i = keuangan.history_arus_kas.length - 1; i >= 0; i--) {
               if (num(keuangan.history_arus_kas[i]) < 0) count++;
               else break;
          }
          return count;
     }
     return num(keuangan.arus_kas_operasional) < 0 ? 1 : 0;
}

/**
 * Numerator kapasitas bayar mengikuti urutan basis yang sama dengan DSCR riil
 * (config.debtService.basis) agar nominal & DSCR konsisten.
 */
function capacityIncome({ keuangan = {}, ratios = {}, config = DEFAULT_CONFIG }) {
     const order = String(config.debtService?.basis || 'ocf_then_ebitda_then_ebit').split('_then_');
     const cand = {
          ocf: num(keuangan.arus_kas_operasional, NaN),
          ebitda: num(keuangan.ebitda, NaN),
          ebit: num(ratios._basis?.ebit, NaN)
     };
     for (const key of order) {
          if (key in cand && Number.isFinite(cand[key]) && cand[key] !== 0) return cand[key];
     }
     return num(ratios._basis?.ebit, 0);
}

/**
 * Jalankan analisis lengkap.
 * @param {object} borrower — skema: nama, sektor, profil_company, plafon_diajukan,
 *   tenor_bulan, bunga_tahunan, skema_angsuran, grace_period_bulan,
 *   utang_eksisting[], keuangan{}, bisnis_manajemen{}, agunan{}
 * @param {object} [options] — { config, benchmarkData, profiles, dynamicPillarWeights }
 * @returns {object} hasil analisis lengkap (termasuk meta.snapshot konfigurasi)
 */
export function runFullAnalysis(borrower = {}, options = {}) {
     // ——— 0) KONFIGURASI EFEKTIF (profil + sektor) ———
     const config = resolveConfig(options.config || DEFAULT_CONFIG, {
          profileKey: borrower.profil_company || null,
          sectorKey: borrower.sektor || null
     });
     // Koreksi UKM (L2) — no-op bila config.benchmark.smeCorrection.enabled = false.
     const benchmarkData = applySmeCorrection(options.benchmarkData || null, { config });
     const profiles = options.profiles || null;
     const dynamicPillarWeights = !!options.dynamicPillarWeights;

     const k = borrower.keuangan || {};
     // ——— 0b) SPREADING (reklasifikasi pra-rasio; no-op bila field penyesuaian kosong) ———
     const spread = spreadFinancials(k, { config });
     const kAdj = spread.adjusted;
     const ag = borrower.agunan || {};
     const bm = borrower.bisnis_manajemen || {};
     const sectorKey = borrower.sektor || null;

     const plafon = num(borrower.plafon_diajukan);
     const tenorBulan = num(borrower.tenor_bulan);
     const bungaTahunan =
          borrower.bunga_tahunan !== undefined && borrower.bunga_tahunan !== null && borrower.bunga_tahunan !== ''
               ? num(borrower.bunga_tahunan)
               : num(config.nominal?.defaultBungaTahunan, DEFAULT_BUNGA_TAHUNAN);
     const nilaiAgunan = num(ag.nilai_agunan);

     // ——— 1) DEBT SERVICE RIIL (skema angsuran + utang eksisting) ———
     const debtService = computeDebtService({ borrower, config });

     // ——— 2) RASIO (DSCR/DTI dari debt service riil bila tersedia) ———
     const ratios = computeRatios(kAdj, {
          plafon,
          tenorBulan,
          bungaTahunan,
          nilaiAgunan,
          debtService,
          config
     });

     // ——— 2b) DETEKSI DISTRESS (ekor p01/p99; kosong bila benchmark tanpa ekor) ———
     const distressFlags = benchmarkData ? tailFlags(benchmarkData, sectorKey, ratios) : [];

     // ——— 2c) TEMPLATE RASIO KHUSUS BANK (NIM/NPL/CAR/LDR/CASA/BOPO) ———
     // Aktif bila sektor = keuangan ATAU neraca memuat field khas bank.
     const bankTemplate = isBankSector(sectorKey) || hasBankData(kAdj);
     const bankSummary = bankTemplate ? bankRatiosSummary(kAdj) : null;

     // ——— 3) BENCHMARK ———
     const benchmarkItems = RATIOS_FOR_BENCHMARK.map((rk) =>
          compareRatio(benchmarkData, sectorKey, rk, ratios[rk])
     ).filter(Boolean);
     const ltv = safeDiv(plafon, nilaiAgunan);
     const sectorLabel = (() => {
          const s = listSectors(benchmarkData).find((x) => x.key === sectorKey);
          return s ? s.label : sectorKey;
     })();
     const coverage = benchmarkItems.length
          ? round2(benchmarkItems.filter((b) => b.score !== null).length / benchmarkItems.length)
          : 0;

     // ——— 4) GAP ———
     const gapSummary = computeGap({
          ratios,
          sectorKey,
          benchmarkData,
          mainRatios: MAIN_RATIOS,
          config
     });

     // ——— 5) BOBOT (profil + gap) ———
     const weights = buildComponentWeights({
          config,
          profiles,
          profileKey: borrower.profil_company,
          gapItems: gapSummary.items
     });

     let pillarWeights = { ...config.pillarWeights };
     let pillarWeightNotes = [];
     // ——— 5b) AHP (human layer) — bobot pilar dari pairwise expert judgment ———
     let ahpInfo = null;
     const ahpCfg = config.ahp || {};
     if (ahpCfg.enabled && Array.isArray(ahpCfg.pairwise) && ahpCfg.pairwise.length === PILLARS.length) {
          const res = ahpWeights(ahpCfg.pairwise, { labels: PILLARS, maxCR: ahpCfg.maxCR });
          ahpInfo = res;
          if (res.valid && (!ahpCfg.enforceConsistency || res.consistent)) {
               pillarWeights = {};
               PILLARS.forEach((p, i) => { pillarWeights[p] = res.weights[i]; });
               pillarWeightNotes.push(`AHP: bobot pilar dari pairwise expert (CR ${res.cr}).`);
          } else {
               pillarWeightNotes.push('AHP: matriks tidak valid / tidak konsisten → memakai bobot default.');
          }
     }
     if (dynamicPillarWeights) {
          const adj = adjustPillarWeightsByGap(pillarWeights, gapSummary.items, config.gap.sensitivityK);
          pillarWeights = adj.normalized;
          pillarWeightNotes = pillarWeightNotes.concat(adj.notes);
     }

     // ——— 6) SKOR ———
     const inputs = { keuangan: kAdj, bisnis_manajemen: bm, agunan: ag };
     const scoreDetails = {};
     const subscores = computeSubScores({ ratios, inputs, benchmarkData, sectorKey, trace: scoreDetails });
     const pillarScores = scorePillarsWithWeights({ subscores, componentWeights: weights.normalized });
     const finalScore = computeFinalScore(pillarScores, pillarWeights);

     // ——— 7) KEPUTUSAN (registry aturan tunggal, config efektif per profil) ———
     const extra = {
          negative_ocf_periods: resolveNegativeOcfPeriods(k),
          arrears_days: num(k.arrears_days, 0),
          ltv,
          personal_guarantee: !!ag.personal_guarantee
     };
     // ——— 7b) STRESS TEST — dihitung sebelum langkah turunan agar "sangat rentan" membatasi keputusan ———
     const stress = runStressTest({ borrower: { ...borrower, keuangan: kAdj }, config, baseRatios: ratios, debtService });
     const decision = applyStressCap(decide({ ratios, finalScore, gapSummary, extra, config }), stress, config);

     // ——— 8) NOMINAL (kapasitas DSCR − DS eksisting, scheme-aware) ———
     const ltvMaxNominal = ag.personal_guarantee
          ? num(config.hardRules?.ltv_max_with_guarantee, 0.95)
          : num(config.hardRules?.ltv_max, 0.75);
     const nominal = recommendNominal({
          ebit: ratios._basis.ebit,
          income: capacityIncome({ keuangan: k, ratios, config }),
          bebanBungaLain: num(k.beban_bunga_lain, 0),
          existingAnnualDs: debtService.existing_annual,
          dscrTarget: effectiveDscrTarget(config),
          bungaTahunan,
          tenorBulan,
          nilaiAgunan,
          ltvMax: ltvMaxNominal,
          plafonDiajukan: plafon,
          rounding: config.nominal.rounding,
          rangeWidth: config.nominal.rangeWidth,
          scheme: debtService.scheme,
          seasonalityFactor: debtService.seasonality_factor
     });
     const recommendedService = computeDebtService({
          borrower: { ...borrower, plafon_diajukan: nominal.recommended_nominal, bunga_tahunan: bungaTahunan }, config
     });
     nominal.dscr_at_recommended = nominal.recommended_nominal > 0 && recommendedService.total_annual > 0
          ? nominal.income_used / recommendedService.total_annual : null;

     // ——— 8b) SEGMENTASI BORROWER + INTEGRITAS LAPORAN KEUANGAN ———
     const segment = classifyBorrower(borrower, config);
     const integrity = checkStatementIntegrity(kAdj, { tolerancePct: config.integrity?.tolerancePct });

     // ——— 8c) ARUS KAS HARIAN (khusus segmen UMKM) ———
     const dailyCashflow = buildDailyCashflow(borrower, { debtService }, { config, segment });

     // ——— 8d) REKOMENDASI NOMINAL (bahasa awam untuk pengambil keputusan) ———
     const amountRecommendation = recommendAmount({
          nominal,
          decision,
          segment,
          integrity,
          plafonDiajukan: plafon
     });

     // ——— 9) RISK RATING & PRICING (legacy, berbasis rating) ———
     const rating = riskRating(finalScore, decision.decision);
     const legacyPricing = riskBasedPricing(rating, 0.12);

     // ——— 10) PD / LGD / EAD / EL / PRICING BERBASIS RISIKO ———
     const credit = creditRiskModel({
          score: finalScore,
          borrower: { ...borrower, plafon_diajukan: plafon, tenor_bulan: tenorBulan, bunga_tahunan: bungaTahunan },
          config,
          coverage
     });
     // ——— 10a) ATMR & MODAL REGULASI (SEOJK 24/2021) untuk plafon yang diajukan ———
     credit.rwa = facilityRwa({ borrower: { ...borrower, plafon_diajukan: plafon }, drawn: plafon, config });
     {
          // Imbal hasil atas modal regulasi: laba bersih fasilitas setelah pajak ÷ (ATMR × (KPMM + buffer)).
          const p = credit.pricing;
          const annualNet = (p.recommended_rate - p.breakeven_rate) * (1 - num(p.tax_rate, 0.22)) * plafon;
          credit.rwa.return_on_capital = credit.rwa.capital_with_buffer > 0 ? Math.round((annualNet / credit.rwa.capital_with_buffer) * 1e4) / 1e4 : null;
     }

     // ——— 10b) SKOR 5C TERTIMBANG & PEMERINGKATAN PEFINDO ———
     const fiveC = computeFiveC({ subscores, componentWeights: weights.normalized });
     const pefindo = pefindoRating(finalScore, decision.decision, credit.pd.pd_12m);

     // ——— 11) STRESS TEST — sudah dihitung di langkah 7b ———

     // ——— 12) COVENANT OTOMATIS (untuk LAYAK BERSYARAT) + status awal ———
     const covenant = generateCovenants({
          borrower,
          analysis: { decision: decision.decision },
          config
     });
     const covenantStatus = checkCovenants({
          covenants: covenant.covenants,
          metrics: {
               dscr: ratios.dscr,
               der: ratios.der,
               icr: ratios.icr,
               current_ratio: ratios.current_ratio,
               ltv,
               ocf: num(k.arus_kas_operasional),
               aging_piutang_hari: num(k.aging_piutang_hari, NaN)
          },
          config
     });

     return {
          borrower: {
               nama: borrower.nama || 'Tanpa Nama',
               sektor: sectorKey,
               sektor_label: sectorLabel,
               profil_company: borrower.profil_company || null,
               plafon_diajukan: plafon,
               tenor_bulan: tenorBulan,
               bunga_tahunan: bungaTahunan,
               skema_angsuran: debtService.scheme,
               skema_angsuran_label: debtService.scheme_label,
               grace_period_bulan: num(borrower.grace_period_bulan, 0)
          },
          ratios,
          spread,
          dupont: ratios.dupont,
          benchmark: { sectorKey, sector_label: sectorLabel, items: benchmarkItems },
          gap: gapSummary,
          weights: {
               profile: weights.profile,
               pillar_base: config.pillarWeights,
               pillar_effective: pillarWeights,
               pillar_notes: pillarWeightNotes,
               component_effective: weights.normalized,
               notes: weights.notes,
               sensitivity_k: weights.sensitivity_k,
               ahp: ahpInfo
          },
          subscores,
          score_details: scoreDetails,
          pillars: PILLARS.map((p) => ({
               key: p,
               label: PILLAR_LABELS[p],
               score: pillarScores[p],
               weight: pillarWeights[p]
          })),
          pillarScores,
          finalScore,
          five_c: fiveC,
          decision,
          debtService,
          nominal,
          segment,
          integrity,
          daily_cashflow: dailyCashflow,
          amount_recommendation: amountRecommendation,
          stress,
          covenant: { ...covenant, status: covenantStatus },
          credit,
          risk: {
               rating,
               pefindo,
               pricing: credit.pricing, // pricing berbasis EL (recommended_rate)
               legacy_pricing: legacyPricing,
               pd: credit.pd,
               lgd: credit.lgd,
               ead: credit.ead,
               loss: credit.loss
          },
          extra,
          ...(bankSummary ? { bank_ratios: bankSummary } : {}),
          coverage,
          meta: {
               engine_version: '2.3.0',
               config_version: CONFIG_VERSION,
               config_hash: configHash(config),
               generated_at: new Date().toISOString(),
               resolved_for: config.resolvedFor,
               ratios_available: Object.keys(RATIO_META).filter((rk) => ratios[rk] !== null && ratios[rk] !== undefined).length,
               dscr_basis: ratios._basis?.dscr_basis || 'proxy',
               sme_correction: { ...(config.benchmark?.smeCorrection || {}) },
               distress: distressFlags,
               bank_template: !!bankTemplate,
               segment: segment.key,
               integrity_status: integrity.status,
               snapshot: {
                    config_version: CONFIG_VERSION,
                    config_hash: configHash(config),
                    resolved_for: config.resolvedFor,
                    hard_rules: { ...config.hardRules },
                    thresholds: { ...config.thresholds },
                    nominal: { ...config.nominal },
                    debt_service: { ...config.debtService },
                    integrity: { ...config.integrity },
                    segment: { ...config.segment },
                    daily_cashflow: { ...config.dailyCashflow },
                    pricing: { ...config.pricing },
                    lgd: { ...config.lgd },
                    gap: { ...config.gap },
                    altman: { ...config.altman },
                    covenant: { ...config.covenant },
                    spreading: { ...config.spreading },
                    benchmark: { ...config.benchmark },
                    ahp: ahpInfo ? { ...ahpInfo } : null,
                    rules: ruleSummary(config)
               }
          }
     };
}

/** Template borrower kosong untuk form wizard. */
export function emptyBorrower() {
     return {
          nama: '',
          sektor: '',
          profil_company: 'ukm_mapan',
          plafon_diajukan: null,
          tenor_bulan: 36,
          bunga_tahunan: 0.14,
          skema_angsuran: NEW_LOAN_SCHEME,
          periode_angsuran: '',
          grace_period_bulan: 0,
          utang_eksisting: [],
          keuangan: {
               ebit: null,
               laba_bersih: null,
               penjualan: null,
               hpp: null,
               beban_bunga: null,
               beban_bunga_lain: 0,
               total_aset: null,
               aset_lancar: null,
               liabilitas_jangka_pendek: null,
               total_liabilitas: null,
               ekuitas: null,
               kas: null,
               piutang: null,
               persediaan: null,
               arus_kas_operasional: null,
               arrears_days: 0,
               ocf_negatif_periode: 0
          },
          bisnis_manajemen: {
               skor_model_bisnis: 0.7,
               posisi_pasar: 0.7,
               skalabilitas: 0.7,
               ketergantungan: 0.7,
               pengalaman_tim: 0.7,
               track_record_tahun: 5,
               rekam_jejak_bayar: 0.7,
               tata_kelola: 0.7,
               tren_keuangan: 0.7,
               ocf_positif: 1,
               cash_runway_bulan: 6,
               skor_industri_risk: 0.7,
               prospek_industri: 0.7,
               sensitivitas_makro: 0.6
          },
          agunan: {
               jenis: 'tanah_bangunan',
               nilai_agunan: null,
               personal_guarantee: false
          }
     };
}

/** Ringkasan ringkas untuk kartu daftar/dashboard. */
export function summarize(result) {
     if (!result) return null;
     return {
          nama: result.borrower.nama,
          sektor_label: result.borrower.sektor_label,
          plafon_diajukan: result.borrower.plafon_diajukan,
          recommended_nominal: result.nominal.recommended_nominal,
          finalScore: result.finalScore,
          decision: result.decision.decision,
          decision_label: result.decision.decision_label,
          risk_rating: result.risk.rating,
          pd_12m: result.credit?.pd?.pd_12m ?? null,
          el_amount: result.credit?.loss?.el_amount ?? null,
          recommended_rate: result.risk?.pricing?.recommended_rate ?? null,
          avg_gap_pct: result.gap.avg_gap_pct,
          generated_at: result.meta.generated_at
     };
}

export default runFullAnalysis;
