/**
 * core/stress.js — Stress test skenario (W5a).
 * Pure functions; TIDAK menyentuh DOM.
 *
 * Menjalankan skenario dari config.stress.scenarios dengan meng-shock laporan
 * keuangan + parameter fasilitas, lalu MENGHITUNG ULANG rasio memakai jalur
 * yang sama (computeRatios + debt service riil) dan MENILAI ULANG rules lewat
 * registry tunggal (evaluateRules) — sehingga DSCR/ICR/LTV/Altman konsisten.
 */

import { computeRatios } from './ratios.js';
import { computeDebtService } from './debt-service.js';
import { DEFAULT_CONFIG, evaluateRules } from './config.js';

const num = (v, d = 0) =>
     v === null || v === undefined || v === ''
          ? d
          : Number.isFinite(Number(v))
               ? Number(v)
               : d;

/**
 * Terapkan shock ke salinan blok keuangan + parameter fasilitas.
 *
 * Struktur biaya: biaya operasi = penjualan − EBIT. Bila HPP tercatat, HPP dianggap
 * biaya variabel (ikut naik-turun dengan penjualan) dan sisanya biaya tetap. Bila HPP
 * tidak tercatat, porsi variabel memakai `stress.variableCostShare` (bawaan 70%).
 * Perubahan EBIT dialirkan ke arus kas operasi setelah pajak, dan kenaikan piutang
 * mengikat kas — sehingga DSCR (berbasis arus kas) ikut tertekan.
 */
function applyShocks(financials, shocks = {}, facility = {}, config = DEFAULT_CONFIG) {
     const f = { ...financials };
     const penjualan0 = num(f.penjualan);
     const ebit0 = num(f.ebit);
     const hppRaw = Number(f.hpp);
     const hppKnown = Number.isFinite(hppRaw) && hppRaw > 0;
     const costs0 = Math.max(0, penjualan0 - ebit0);
     const variableShare = Math.min(1, Math.max(0, num(config.stress?.variableCostShare, 0.7)));
     const variable0 = hppKnown ? Math.min(hppRaw, costs0 || hppRaw) : costs0 * variableShare;
     const fixed0 = Math.max(0, costs0 - variable0);

     const salesFactor = 1 + num(shocks.penjualan, 0);
     const variable = variable0 * salesFactor * (1 + num(shocks.hpp, 0));
     const fixed = fixed0 * (1 + num(shocks.beban_operasional, 0));

     if (shocks.penjualan) f.penjualan = penjualan0 * salesFactor;
     if (hppKnown && (shocks.penjualan || shocks.hpp)) f.hpp = variable;
     if (shocks.kas) f.kas = num(f.kas) * (1 + shocks.kas);
     if (shocks.piutang) f.piutang = num(f.piutang) * (1 + shocks.piutang);
     if (shocks.piutang_aging_hari) f.aging_piutang_hari = num(f.aging_piutang_hari) + shocks.piutang_aging_hari;

     if (shocks.penjualan || shocks.hpp || shocks.beban_operasional) f.ebit = num(f.penjualan) - variable - fixed;
     if (shocks.margin_delta_pp) f.ebit = num(f.ebit) + (shocks.margin_delta_pp / 100) * num(f.penjualan);

     // Arus kas operasi ikut tertekan: perubahan EBIT setelah pajak + kas yang tertahan di piutang.
     const ocf0 = Number(f.arus_kas_operasional);
     if (Number.isFinite(ocf0)) {
          const tax = Math.min(0.9, Math.max(0, num(config.pricing?.taxRate, 0.22)));
          const ebitDelta = num(f.ebit) - ebit0;
          const receivableTied = shocks.piutang ? num(financials.piutang) * shocks.piutang : 0;
          f.arus_kas_operasional = ocf0 + ebitDelta * (1 - tax) - receivableTied;
     }

     const facilityOut = { ...facility };
     if (shocks.bunga_bps) {
          facilityOut.bungaTahunan = num(facility.bungaTahunan) + shocks.bunga_bps / 10000;
     }
     if (shocks.nilai_agunan) {
          facilityOut.nilaiAgunan = num(facility.nilaiAgunan) * (1 + shocks.nilai_agunan);
     }
     return { financials: f, facility: facilityOut };
}

/**
 * Jalankan stress test.
 * @param {object} args — { borrower, config, baseRatios, debtService }
 * @returns {{
 *   base:object, scenarios:Array, worst:object, survival_rate:number,
 *   passed:number, failed:number, recommendation:string
 * }}
 */
export function runStressTest({ borrower = {}, config = DEFAULT_CONFIG, baseRatios = null, debtService = null } = {}) {
     const fin = borrower.keuangan || {};
     const agunan = borrower.agunan || {};
     const facility = {
          plafon: num(borrower.plafon_diajukan),
          tenorBulan: num(borrower.tenor_bulan),
          bungaTahunan: num(borrower.bunga_tahunan),
          nilaiAgunan: num(agunan.nilai_agunan),
          scheme: borrower.skema_angsuran || config.debtService?.defaultScheme || 'annuity'
     };

     const computeFor = (f, fac) => {
          const ds = computeDebtService({
               borrower: { ...borrower, utang_eksisting: borrower.utang_eksisting },
               config,
               overrides: {
                    plafon: fac.plafon,
                    tenorBulan: fac.tenorBulan,
                    bungaTahunan: fac.bungaTahunan,
                    scheme: fac.scheme
               }
          });
          const ratios = computeRatios(f, {
               plafon: fac.plafon,
               tenorBulan: fac.tenorBulan,
               bungaTahunan: fac.bungaTahunan,
               nilaiAgunan: fac.nilaiAgunan,
               debtService: ds,
               config
          });
          return { ds, ratios };
     };

     const base = computeFor(fin, facility);
     const baseRatiosFinal = baseRatios || base.ratios;
     const bufferTarget = num(config.stress?.bufferTarget, 1.2) || 1.2;

     const scenarios = (config.stress?.scenarios || []).map((sc) => {
          const shocked = applyShocks(fin, sc.shocks, facility, config);
          const { ds, ratios } = computeFor(shocked.financials, shocked.facility);
          const ltv = shocked.facility.nilaiAgunan > 0 ? shocked.facility.plafon / shocked.facility.nilaiAgunan : null;

          const rule = evaluateRules({
               metrics: {
                    dscr: ratios.dscr,
                    icr: ratios.icr,
                    dti: ratios.dti,
                    ds_ratio: ratios.ds_ratio,
                    ltv,
                    altman_z: ratios.altman_z,
                    negative_ocf_periods: num(borrower.keuangan?.ocf_negatif_periode, 0),
                    arrears_days: num(fin.arrears_days, 0)
               },
               config,
               options: { personal_guarantee: !!agunan.personal_guarantee }
          });

          const survives = rule.triggered.length === 0 && num(ratios.dscr) >= bufferTarget;
          return {
               id: sc.id,
               label: sc.label,
               shocks: sc.shocks,
               dscr: ratios.dscr,
               dscr_delta: baseRatiosFinal.dscr != null && ratios.dscr != null ? ratios.dscr - baseRatiosFinal.dscr : null,
               icr: ratios.icr,
               ds_ratio: ratios.ds_ratio,
               altman_z: ratios.altman_z,
               ltv,
               aging_piutang_hari: shocked.financials.aging_piutang_hari ?? null,
               hard_violations: rule.triggered.map((d) => d.rule),
               soft_notes: rule.softNotes.map((d) => d.rule),
               survives
          };
     });

     const failed = scenarios.filter((s) => !s.survives);
     const worst = scenarios
          .slice()
          .sort((a, b) => num(a.dscr, 999) - num(b.dscr, 999))[0] || null;
     const survivalRate = scenarios.length ? (scenarios.length - failed.length) / scenarios.length : 1;

     let recommendation;
     if (!scenarios.length) recommendation = 'Belum ada skenario stress terkonfigurasi.';
     else if (survivalRate >= 0.875) recommendation = 'Tahan terhadap hampir seluruh skenario; lanjutkan dengan covenant standar.';
     else if (survivalRate >= 0.625) recommendation = 'Cukup tahan; tambahkan covenant maintenance DSCR + laporan bulanan.';
     else if (survivalRate >= 0.375) recommendation = 'Rentan; turunkan plafon / perpanjang tenor dan aktifkan covenant ketat.';
     else recommendation = 'Sangat rentan; tolak atau minta agunan tambahan + restrukturisasi struktur pembiayaan.';

     return {
          base: {
               dscr: baseRatiosFinal.dscr,
               icr: baseRatiosFinal.icr,
               ds_ratio: baseRatiosFinal.ds_ratio,
               altman_z: baseRatiosFinal.altman_z
          },
          buffer_target: bufferTarget,
          scenarios,
          worst,
          survival_rate: Math.round(survivalRate * 100) / 100,
          // Di bawah ambang ini keputusan otomatis dibatasi REVIEW (lihat applyStressCap).
          auto_min_survival: num(config.stress?.minSurvivalForAuto, 0.375),
          limits_decision: scenarios.length > 0 && survivalRate < num(config.stress?.minSurvivalForAuto, 0.375),
          passed: scenarios.length - failed.length,
          failed: failed.length,
          recommendation
     };
}

export default { runStressTest };
