/**
 * core/portfolio.js — Analitik portofolio pasca-pencairan (W4a).
 * Pure functions; TIDAK menyentuh DOM.
 *
 * Membedakan dua dunia (lihat PRD §7):
 *  1. PIPELINE (pra-pencairan)  → buildPipeline(): funnel pengajuan per tahap.
 *  2. PORTOFOLIO (pasca-cair)   → buildPortfolio(): eksposur beredar, NPL
 *     (kolektibilitas OJK 5 tingkat), provisi, Expected Loss agregat,
 *     konsentrasi (HHI + top-N), migrasi kolektibilitas, dan coverage.
 *
 * Semua memakai eksposur (outstanding), bukan sekadar plafon — sesuai arahan
 * "KPI dashboard diganti dengan metrik berbasis eksposur dan NPL".
 */

import {
     DEFAULT_CONFIG,
     COLLECTIBILITY,
     COLLECTIBILITY_ORDER,
     PIPELINE_STAGES,
     FACILITY_STATUS
} from './config.js';
import { restructuringStatus } from './restructuring.js';
import { facilityRwa, portfolioRwa } from './rwa.js';

const num = (v, d = 0) =>
     v === null || v === undefined || v === ''
          ? d
          : Number.isFinite(Number(v))
               ? Number(v)
               : d;
const r2 = (v) => Math.round(v * 100) / 100;
const r4 = (v) => Math.round(v * 1e4) / 1e4;

/** Terima berbagai bentuk baris (record UI atau borrower mentah). */
function normalizeRow(row = {}) {
     const borrower = row.borrower || row;
     const analysis = row.analysis || row.result || null;
     const monitoring = Array.isArray(row.monitoring)
          ? row.monitoring
          : row.monitoring
               ? [row.monitoring]
               : [];
     const facility = row.facility || borrower.facility || null;
     return { borrower, analysis, monitoring, facility };
}

/** Mapping label kolektibilitas manusia → key internal. */
const LABEL_TO_KEY = Object.entries(COLLECTIBILITY).reduce((acc, [key, label]) => {
     acc[String(label).toLowerCase()] = key.toLowerCase();
     return acc;
}, {});

/** Normalisasi nilai kolektibilitas apa pun (key/label) → key internal. */
export function normalizeCollectibility(value) {
     if (!value) return null;
     const s = String(value).toLowerCase().trim();
     if (COLLECTIBILITY_ORDER.includes(s)) return s;
     return LABEL_TO_KEY[s] || null;
}

/** Kolektibilitas dari hari tunggakan memakai ambang config.portfolio (POJK 40/2019). */
export function collectibilityFromDays(daysLate, config = DEFAULT_CONFIG) {
     const g = config.portfolio?.collectibilityDays || {};
     const d = num(daysLate, 0);
     if (d >= num(g.macet, 181)) return 'macet';
     if (d >= num(g.diragukan, 121)) return 'diragukan';
     if (d >= num(g.kurang_lancar, 91)) return 'kurang_lancar';
     if (d >= num(g.dpk, 1)) return 'dpk';
     return 'lancar';
}

/**
 * Kolektibilitas satu fasilitas: hari tunggakan menentukan tingkat dasar; sinyal
 * kualitatif (EWS WARNING/CRITICAL atau pelanggaran covenant material) menurunkan
 * fasilitas yang masih Lancar menjadi DPK, tetapi tidak menjadikannya NPL.
 */
export function assessCollectibility({ daysLate = 0, ewsLevel = null, covenant = null, config = DEFAULT_CONFIG } = {}) {
     const byDays = collectibilityFromDays(daysLate, config);
     const qualitative = ['WARNING', 'CRITICAL'].includes(ewsLevel) || covenant === 'material';
     if (byDays === 'lancar' && qualitative) return { key: 'dpk', basis: 'kualitatif' };
     return { key: byDays, basis: 'hari_tunggakan' };
}

/**
 * Kunci debitur untuk aturan satu debitur: ID eksplisit (obligor_id/NPWP/NIB), lalu
 * nama badan usaha lengkap (bentuk badan usaha ikut dibandingkan: PT X ≠ CV X).
 */
function obligorKeyOf(borrower = {}) {
     const explicit = borrower.obligor_id || borrower.npwp || borrower.nib;
     if (explicit) return `id:${String(explicit).replace(/[^0-9a-z]/gi, '').toLowerCase()}`;
     const name = String(borrower.nama || '').toLowerCase().replace(/[^0-9a-z]+/g, ' ').trim();
     return name ? `nama:${name}` : null;
}

/**
 * POJK 40 Pasal 5–6: seluruh fasilitas satu debitur mengikuti kualitas terburuk,
 * kecuali fasilitas proyek dengan arus kas terpisah (`ring_fenced`).
 * @param {Array} facilities — keluaran classifyFacility (fasilitas aktif)
 * @returns {Array} salinan fasilitas dengan kolektibilitas setelah contagion
 */
export function applyObligorContagion(facilities = [], config = DEFAULT_CONFIG) {
     if (config.portfolio?.obligorContagion === false) return facilities;
     const idx = (k) => COLLECTIBILITY_ORDER.indexOf(k);
     const worst = new Map();
     for (const f of facilities) {
          if (!f.obligor_key || f.ring_fenced) continue;
          const cur = worst.get(f.obligor_key);
          if (!cur || idx(f.collectibility) > idx(cur.collectibility)) worst.set(f.obligor_key, f);
     }
     return facilities.map((f) => {
          const w = f.obligor_key && !f.ring_fenced ? worst.get(f.obligor_key) : null;
          if (!w || idx(w.collectibility) <= idx(f.collectibility)) return f;
          return { ...f, own_collectibility: f.collectibility, collectibility: w.collectibility,
               collectibility_label: COLLECTIBILITY[w.collectibility.toUpperCase()] || w.collectibility,
               contagion_from: { id: w.id, nama: w.nama, collectibility: w.collectibility } };
     });
}

/** Rata-rata tertimbang pengali PD skenario makro (forward-looking overlay). */
export function scenarioPd(pd, config = DEFAULT_CONFIG) {
     const list = (config.ecl?.scenarios || []).filter((s) => num(s.weight) > 0);
     if (!list.length) return Math.min(1, num(pd));
     const total = list.reduce((a, s) => a + num(s.weight), 0);
     return list.reduce((a, s) => a + num(s.weight) * Math.min(1, num(pd) * num(s.pdMultiplier, 1)), 0) / total;
}

/**
 * Tahap PSAK 71 + pemicu SICR untuk satu fasilitas.
 * Tahap 3: tunggakan > 90 hari atau kolektibilitas NPL. Tahap 2: tunggakan > 30 hari,
 * watchlist EWS, pelanggaran covenant material, restrukturisasi, atau turun ≥ 2 notch.
 */
export function eclStage(f = {}, config = DEFAULT_CONFIG) {
     const cfg = config.ecl || {};
     const npl = config.portfolio?.nplLevels || ['kurang_lancar', 'diragukan', 'macet'];
     const days = num(f.days_late, 0);
     if (days >= num(cfg.stage3DaysPastDue, 91) || npl.includes(f.collectibility)) {
          return { stage: 3, triggers: [days >= num(cfg.stage3DaysPastDue, 91) ? `Tunggakan ${days} hari` : `Kolektibilitas ${f.collectibility_label || f.collectibility}`] };
     }
     const triggers = [];
     if (days >= num(cfg.stage2DaysPastDue, 31)) triggers.push(`Tunggakan ${days} hari (> 30 hari)`);
     if ((cfg.sicrEwsLevels || ['WARNING', 'CRITICAL']).includes(f.ews_level)) triggers.push(`Watchlist EWS (${f.ews_level})`);
     if (f.covenant === 'material') triggers.push('Pelanggaran covenant material');
     if (f.restructured) triggers.push('Restrukturisasi karena kesulitan keuangan');
     if (f.rating_notches_down !== null && f.rating_notches_down >= num(cfg.sicrRatingNotches, 2)) triggers.push(`Peringkat turun ${f.rating_notches_down} notch sejak pencairan`);
     if (f.contagion_from) triggers.push(`Fasilitas lain debitur (${f.contagion_from.nama}) bermasalah`);
     return { stage: triggers.length ? 2 : 1, triggers };
}

/** CKPN satu fasilitas: PD (tertimbang skenario) × LGD × EAD; tahap 3 memakai PD 100%. */
export function facilityEcl(f = {}, config = DEFAULT_CONFIG) {
     const { stage, triggers } = eclStage(f, config);
     const ead = num(f.outstanding);
     const lgd = f.lgd === null || f.lgd === undefined ? null : num(f.lgd);
     const basePd = stage === 3 ? 1 : stage === 2 ? f.pd_lifetime ?? f.pd_12m : f.pd_12m;
     if (lgd === null || basePd === null || basePd === undefined) {
          return { stage, triggers, horizon: stage === 1 ? '12 bulan' : 'seumur fasilitas', pd_used: null, ecl: null };
     }
     const pd = stage === 3 ? 1 : scenarioPd(basePd, config);
     return { stage, triggers, horizon: stage === 1 ? '12 bulan' : 'seumur fasilitas', pd_used: r4(pd), ecl: Math.round(pd * lgd * ead) };
}

/** PPKA minimum POJK 40 satu fasilitas (umum untuk Lancar, khusus setelah agunan untuk lainnya). */
export function facilityPpka(f = {}, config = DEFAULT_CONFIG) {
     const rate = num(config.portfolio?.provisionRate?.[f.collectibility], 0);
     const netLevels = config.portfolio?.provisionNetOfCollateral || ['dpk', 'kurang_lancar', 'diragukan', 'macet'];
     const deductible = netLevels.includes(f.collectibility) ? Math.min(num(f.outstanding), num(f.collateral_deductible)) : 0;
     const base = Math.max(0, num(f.outstanding) - deductible);
     return { rate, base: Math.round(base), amount: Math.round(base * rate) };
}

/** Status fasilitas efektif (pipeline/aktif/lunas/ditolak). */
function facilityStatusOf(row) {
     const b = row.borrower || {};
     const explicit = b.facility_status || row.facility?.status;
     if (explicit && Object.values(FACILITY_STATUS).includes(explicit)) return explicit;
     const dec = row.analysis?.decision?.decision;
     if (dec === 'TIDAK_LAYAK') return FACILITY_STATUS.DITOLAK;
     if (dec) return FACILITY_STATUS.PIPELINE;
     return FACILITY_STATUS.PIPELINE;
}

/** Eksposur beredar (outstanding) sebuah fasilitas aktif. */
function outstandingOf(row) {
     const b = row.borrower || {};
     const plafon = num(b.plafon_diajukan);
     const explicit = row.facility?.outstanding ?? b.outstanding ?? b.saldo_pokok;
     if (explicit !== undefined && explicit !== null && explicit !== '') return Math.max(0, num(explicit));
     // Default: fasilitas aktif diasumsikan ditarik penuh (konservatif untuk eksposur).
     return plafon;
}

/** Hari tunggakan mentah dari borrower / monitoring terakhir (undefined bila tidak tercatat). */
function rawDaysLate(row) {
     const b = row.borrower || {};
     const p = row.monitoring[row.monitoring.length - 1]?.params || {};
     return [b.days_late, p.p11, p.P11, p.P11_days_late, p.days_late].find((v) => v !== undefined && v !== null && v !== '');
}

const daysKnownOf = (row) => rawDaysLate(row) !== undefined;

/** Hari tunggakan terakhir dari monitor/borrower. */
function daysLateOf(row) {
     return num(rawDaysLate(row), 0);
}

const covenantOf = (params = {}) => params.P20_covenant ?? params.p20 ?? params.P20 ?? null;

/** Kolektibilitas satu catatan monitoring, dihitung ulang dari parameternya bila tersedia. */
function monitoringCollectibility(m, config) {
     const p = m?.params || {};
     const days = p.P11_days_late ?? p.p11 ?? p.P11 ?? p.days_late;
     if ((days === undefined || days === null || days === '') && !m?.ews_level) return normalizeCollectibility(m?.collectibility);
     return assessCollectibility({ daysLate: days, ewsLevel: m.ews_level, covenant: covenantOf(p), config }).key;
}

/** EWS level terakhir. */
function ewsLevelOf(row) {
     const last = row.monitoring[row.monitoring.length - 1];
     return last?.ews_level || 'NORMAL';
}

/** Klasifikasi satu fasilitas → baris portofolio. */
export function classifyFacility(row, config = DEFAULT_CONFIG) {
     const { borrower, analysis } = row;
     const status = facilityStatusOf(row);
     const plafon = num(borrower.plafon_diajukan);
     const outstanding = status === FACILITY_STATUS.AKTIF ? outstandingOf(row) : 0;
     const daysLate = daysLateOf(row);

     const lastMon = row.monitoring[row.monitoring.length - 1];
     const params = lastMon?.params || {};
     const covenant = covenantOf(params);
     // Kolektibilitas diturunkan ulang dari tunggakan + sinyal EWS agar mengikuti ambang POJK 40 terkini;
     // label tersimpan hanya dipakai bila data hari tunggakan tidak ada (mis. data impor).
     const stored = daysKnownOf(row) ? null : normalizeCollectibility(lastMon?.collectibility);
     const assessed = stored
          ? { key: stored, basis: 'tercatat' }
          : assessCollectibility({ daysLate, ewsLevel: lastMon?.ews_level, covenant, config });
     // Kredit hasil restrukturisasi tidak boleh lebih baik dari batas masa tunggu POJK 40.
     const restructuring = borrower.restructuring ? restructuringStatus(borrower.restructuring, { config }) : null;
     const { key: collectibility, basis: collectibilityBasis } =
          restructuring && COLLECTIBILITY_ORDER.indexOf(restructuring.cap) > COLLECTIBILITY_ORDER.indexOf(assessed.key)
               ? { key: restructuring.cap, basis: 'masa_tunggu_restrukturisasi' }
               : assessed;

     const credit = analysis?.credit || null;
     const analysisPlafon = num(analysis?.borrower?.plafon_diajukan, plafon);
     const elAmount = num(credit?.loss?.el_amount, 0);
     const ulAmount = num(credit?.loss?.ul_amount, 0);
     const pd12 = num(credit?.pd?.pd_12m, null);
     const pdLifetime = num(credit?.pd?.pd_lifetime, null);
     const lgd = num(credit?.lgd?.lgd, null);
     const originIndex = num(analysis?.risk?.pefindo?.index ?? analysis?.rating?.index, null);
     const currentIndex = num(row.facility?.rating_index ?? borrower.rating_index_terkini ?? lastMon?.rating_index, null);

     return {
          id: borrower.id || null,
          nama: borrower.nama || 'Tanpa Nama',
          sektor: borrower.sektor || null,
          sektor_label: analysis?.borrower?.sektor_label || borrower.sektor || '—',
          status,
          plafon,
          outstanding,
          days_late: daysLate,
          ews_level: ewsLevelOf(row),
          collectibility,
          collectibility_label: COLLECTIBILITY[collectibility.toUpperCase()] || collectibility,
          collectibility_basis: collectibilityBasis,
          obligor_key: obligorKeyOf(borrower),
          ring_fenced: !!(borrower.ring_fenced || row.facility?.ring_fenced),
          covenant,
          restructured: !!(borrower.restructuring || borrower.restrukturisasi || row.facility?.restructured || params.restrukturisasi),
          restructuring,
          rating_notches_down: originIndex !== null && currentIndex !== null ? currentIndex - originIndex : null,
          collateral_deductible: Math.round(num(credit?.lgd?.recovery_value, 0)),
          pd_12m: pd12,
          pd_lifetime: pdLifetime,
          lgd,
          el_amount: outstanding > 0 && analysisPlafon > 0 ? Math.round(elAmount * (outstanding / analysisPlafon)) : 0,
          ul_amount: outstanding > 0 && analysisPlafon > 0 ? Math.round(ulAmount * (outstanding / analysisPlafon)) : 0,
          decision: analysis?.decision?.decision || null,
          finalScore: analysis?.finalScore ?? null
     };
}

/* ============================================================== PIPELINE ==== */

/**
 * Funnel pengajuan (pra-pencairan) — jumlah & nilai per tahap.
 * Tahap default diturunkan dari status analisis bila tak diisi eksplisit.
 */
export function buildPipeline(rows = [], config = DEFAULT_CONFIG) {
     const stageKeys = PIPELINE_STAGES.map((s) => s.key);
     const buckets = new Map(stageKeys.map((k) => [k, { key: k, label: (PIPELINE_STAGES.find((s) => s.key === k) || {}).label || k, count: 0, amount: 0, items: [] }]));

     const infra = config && typeof config === 'object' ? config : DEFAULT_CONFIG;

     for (const raw of rows) {
          const row = normalizeRow(raw);
          const b = row.borrower || {};
          if (['aktif', 'lunas'].includes(b.facility_status || row.facility?.status)) continue;
          let stage = b.stage || b.pipeline_stage;
          if (!stageKeys.includes(stage)) {
               const dec = row.analysis?.decision?.decision;
               if (b.facility_status === 'ditolak') stage = 'ditolak';
               else if (dec) stage = 'review';
               else stage = 'draft';
          }
          const bucket = buckets.get(stage) || buckets.get('draft');
          const amount = num(b.plafon_diajukan);
          bucket.count += 1;
          bucket.amount += amount;
          bucket.items.push({ id: b.id || null, nama: b.nama || 'Tanpa Nama', amount });
     }

     const stages = [...buckets.values()].map((s) => ({ ...s, amount: Math.round(s.amount) }));
     const total = stages.reduce((a, s) => a + s.count, 0);
     const approvedCount = (buckets.get('disetujui')?.count || 0);
     const rejectedCount = (buckets.get('ditolak')?.count || 0);
     const decided = approvedCount + rejectedCount;

     return {
          stages,
          totals: {
               count: total,
               amount: Math.round(stages.reduce((a, s) => a + s.amount, 0)),
               approved: approvedCount,
               rejected: rejectedCount,
               conversion_rate: decided ? r4(approvedCount / decided) : 0,
               approval_rate_all: total ? r4(approvedCount / total) : 0
          }
     };
}

/* ============================================================ PORTOFOLIO ==== */

/**
 * Ringkasan portofolio berbasis eksposur & NPL.
 * @param {object} args — { rows, config }
 * @returns {object} ringkasan portofolio lengkap
 */
export function buildPortfolio({ rows = [], config = DEFAULT_CONFIG } = {}) {
     const nplLevels = Array.isArray(config.portfolio?.nplLevels)
          ? config.portfolio.nplLevels
          : ['kurang_lancar', 'diragukan', 'macet'];
     const provisionRate = config.portfolio?.provisionRate || {};

     const isActive = (f) => f.status === FACILITY_STATUS.AKTIF && f.outstanding > 0;
     const normalized = rows.map((raw) => normalizeRow(raw));
     const classified = normalized.map((row) => classifyFacility(row, config));
     const adjusted = applyObligorContagion(classified.filter(isActive), config);
     let next = 0;
     const facilities = classified.map((f, i) => {
          if (!isActive(f)) return f;
          const c = adjusted[next++];
          const ecl = facilityEcl(c, config);
          const borrower = normalized[i].borrower || {};
          // Fasilitas revolving: sisa plafon adalah komitmen yang dapat ditarik kembali.
          const undrawn = borrower.revolving ? Math.max(0, c.plafon - c.outstanding) : 0;
          const rwa = facilityRwa({ borrower, drawn: c.outstanding, undrawn, daysLate: c.days_late, specificProvision: ecl.ecl, config });
          return { ...c, ecl_stage: ecl.stage, sicr_triggers: ecl.triggers, ecl_horizon: ecl.horizon, ecl_pd: ecl.pd_used, ecl_amount: ecl.ecl, ppka: facilityPpka(c, config), rwa };
     });
     const aktif = facilities.filter(isActive);

     const totalExposure = aktif.reduce((a, f) => a + f.outstanding, 0);
     const totalPlafon = aktif.reduce((a, f) => a + f.plafon, 0);

     // Distribusi kolektibilitas + provisi
     const byCollectibility = COLLECTIBILITY_ORDER.map((key) => {
          const group = aktif.filter((f) => f.collectibility === key);
          const exposure = group.reduce((a, f) => a + f.outstanding, 0);
          const rate = num(provisionRate[key], 0);
          return {
               key,
               label: COLLECTIBILITY[key.toUpperCase()] || key,
               count: group.length,
               exposure: Math.round(exposure),
               share: totalExposure > 0 ? r4(exposure / totalExposure) : 0,
               provision_rate: rate,
               provision: group.reduce((a, f) => a + f.ppka.amount, 0),
               is_npl: nplLevels.includes(key)
          };
     });

     // CKPN PSAK 71 per tahap; fasilitas tanpa PD/LGD tidak dijumlahkan dan dilaporkan terpisah.
     const byStage = [1, 2, 3].map((stage) => {
          const group = aktif.filter((f) => f.ecl_stage === stage);
          const known = group.filter((f) => f.ecl_amount !== null);
          const exposure = group.reduce((a, f) => a + f.outstanding, 0);
          const ecl = known.reduce((a, f) => a + f.ecl_amount, 0);
          return { stage, label: ['', 'Tahap 1 · ECL 12 bulan', 'Tahap 2 · ECL seumur fasilitas (SICR)', 'Tahap 3 · Gagal bayar'][stage],
               count: group.length, exposure: Math.round(exposure), ecl: Math.round(ecl), unknown: group.length - known.length,
               coverage: exposure > 0 ? r4(ecl / exposure) : 0 };
     });
     const ckpnTotal = byStage.reduce((a, s) => a + s.ecl, 0);
     const eclUnknown = byStage.reduce((a, s) => a + s.unknown, 0);
     const contagionItems = aktif.filter((f) => f.contagion_from).map((f) => ({ id: f.id, nama: f.nama,
          from: f.own_collectibility, to: f.collectibility, source: f.contagion_from.nama, source_id: f.contagion_from.id, outstanding: f.outstanding,
          from_label: COLLECTIBILITY[f.own_collectibility.toUpperCase()] || f.own_collectibility, to_label: f.collectibility_label }));

     // NPL
     const nplExposure = byCollectibility.filter((g) => g.is_npl).reduce((a, g) => a + g.exposure, 0);
     const provisionTotal = byCollectibility.reduce((a, g) => a + g.provision, 0);
     const grossNplRatio = totalExposure > 0 ? nplExposure / totalExposure : 0;
     const netNplExposure = Math.max(0, nplExposure - provisionTotal);
     const netNplRatio = totalExposure > 0 ? netNplExposure / totalExposure : 0;

     // Expected Loss & Unexpected Loss agregat (dari analisis per borrower)
     const elTotal = aktif.reduce((a, f) => a + f.el_amount, 0);
     const ulTotal = aktif.reduce((a, f) => a + f.ul_amount, 0);

     // Konsentrasi sektor (HHI) + top-N
     const sectorMap = new Map();
     for (const f of aktif) {
          const key = f.sektor || 'unknown';
          const cur = sectorMap.get(key) || { key, label: f.sektor_label || key, exposure: 0, count: 0 };
          cur.exposure += f.outstanding;
          cur.count += 1;
          sectorMap.set(key, cur);
     }
     const bySector = [...sectorMap.values()]
          .map((s) => ({ ...s, exposure: Math.round(s.exposure), share: totalExposure > 0 ? r4(s.exposure / totalExposure) : 0 }))
          .sort((a, b) => b.exposure - a.exposure);
     const hhi = r4(bySector.reduce((a, s) => a + s.share * s.share, 0));

     const topN = num(config.portfolio?.topNConcentration, 10);
     const sortedByExposure = aktif.slice().sort((a, b) => b.outstanding - a.outstanding);
     const topItems = sortedByExposure.slice(0, topN);
     const topShare = totalExposure > 0 ? topItems.reduce((a, f) => a + f.outstanding, 0) / totalExposure : 0;

     const hhiAlert = num(config.portfolio?.hhiAlert, 0.25);
     const hhiStatus = hhi >= hhiAlert ? 'terkonsentrasi' : hhi >= hhiAlert * 0.6 ? 'waspada' : 'terdiversifikasi';

     // Migrasi kolektibilitas (bandingkan 2 monitoring terakhir per borrower)
     const migration = computeMigration(facilities, rows, config);

     // NPL rating
     let nplStatus = 'sehat';
     if (grossNplRatio >= 0.05) nplStatus = 'tinggi';
     else if (grossNplRatio >= 0.02) nplStatus = 'perhatian';

     // Watchlist: fasilitas NPL / EWS non-normal, urut eksposur menurun
     const watchlist = aktif
          .filter((f) => f.collectibility !== 'lancar' || ['CRITICAL', 'WARNING'].includes(f.ews_level))
          .sort((a, b) => b.outstanding - a.outstanding)
          .map((f) => ({
               id: f.id,
               nama: f.nama,
               sektor_label: f.sektor_label,
               outstanding: f.outstanding,
               collectibility_label: f.collectibility_label,
               ews_level: f.ews_level,
               days_late: f.days_late,
               el_amount: f.el_amount,
               ecl_stage: f.ecl_stage
          }));

     return {
          generated_at: new Date().toISOString(),
          totals: {
               facilities: facilities.length,
               active: aktif.length,
               exposure: Math.round(totalExposure),
               plafon: Math.round(totalPlafon),
               borrowers: new Set(facilities.map((f) => f.id)).size
          },
          by_collectibility: byCollectibility,
          npl: {
               gross_exposure: Math.round(nplExposure),
               gross_ratio: r4(grossNplRatio),
               net_exposure: Math.round(netNplExposure),
               net_ratio: r4(netNplRatio),
               levels: nplLevels,
               status: nplStatus
          },
          provision: {
               total: Math.round(provisionTotal),
               basis: 'PPKA minimum POJK 40/2019',
               coverage_ratio: nplExposure > 0 ? r4(provisionTotal / nplExposure) : null,
               ckpn_total: ckpnTotal,
               // Bila CKPN < PPKA, selisihnya dibentuk dari laba ditahan / diperhitungkan sebagai pengurang modal.
               shortfall: eclUnknown ? null : Math.max(0, Math.round(provisionTotal) - ckpnTotal)
          },
          ecl: {
               by_stage: byStage,
               total: ckpnTotal,
               unknown: eclUnknown,
               rate: totalExposure > 0 ? r4(ckpnTotal / totalExposure) : 0,
               scenarios: (config.ecl?.scenarios || []).map((s) => ({ key: s.key, label: s.label, weight: s.weight, pd_multiplier: s.pdMultiplier }))
          },
          rwa: portfolioRwa(aktif, config),
          restructured: aktif.filter((f) => f.restructuring).map((f) => ({ id: f.id, nama: f.nama, outstanding: f.outstanding,
               collectibility_label: f.collectibility_label, cap: f.restructuring.cap, consecutive_on_time: f.restructuring.consecutive_on_time,
               next_upgrade_in: f.restructuring.next_upgrade_in, in_grace: f.restructuring.in_grace })),
          contagion: {
               facilities: contagionItems.length,
               obligors: new Set(aktif.filter((f) => f.contagion_from).map((f) => f.obligor_key)).size,
               items: contagionItems
          },
          loss: {
               el_total: Math.round(elTotal),
               ul_total: Math.round(ulTotal),
               el_rate: totalExposure > 0 ? r4(elTotal / totalExposure) : 0,
               ul_rate: totalExposure > 0 ? r4(ulTotal / totalExposure) : 0
          },
          concentration: {
               hhi,
               hhi_alert: hhiAlert,
               status: hhiStatus,
               by_sector: bySector,
               top_n: { n: topN, share: r4(topShare), items: topItems.map((f) => ({ id: f.id, nama: f.nama, outstanding: f.outstanding, share: totalExposure > 0 ? r4(f.outstanding / totalExposure) : 0 })) }
          },
          migration,
          watchlist,
          facilities
     };
}

/** Migrasi kolektibilitas dari dua monitoring terakhir. */
function computeMigration(facilities = [], rows = [], config = DEFAULT_CONFIG) {
     let upgrades = 0;
     let downgrades = 0;
     let stable = 0;
     let noHistory = 0;
     const moves = [];
     const idx = (key) => COLLECTIBILITY_ORDER.indexOf(key);

     for (let i = 0; i < rows.length; i++) {
          // Migrasi hanya bermakna untuk fasilitas yang sudah cair (ada eksposur
          // berjalan). Fasilitas pipeline/lunas/ditolak tidak dihitung.
          const fac = facilities[i];
          if (fac && (fac.status !== FACILITY_STATUS.AKTIF || fac.outstanding <= 0)) continue;

          const row = normalizeRow(rows[i]);
          const hist = row.monitoring
               .map((m) => monitoringCollectibility(m, config))
               .filter(Boolean);
          // Riwayat < 2 periode: BUKAN "stabil", cukup belum bisa dinilai.
          if (hist.length < 2) {
               noHistory += 1;
               continue;
          }
          const from = hist[hist.length - 2];
          const to = hist[hist.length - 1];
          const delta = idx(to) - idx(from);
          const b = row.borrower || {};
          if (delta < 0) upgrades += 1;
          else if (delta > 0) downgrades += 1;
          else stable += 1;
          if (delta !== 0) {
               moves.push({
                    id: b.id || null,
                    nama: b.nama || 'Tanpa Nama',
                    from,
                    to,
                    from_label: COLLECTIBILITY[from.toUpperCase()] || from,
                    to_label: COLLECTIBILITY[to.toUpperCase()] || to,
                    direction: delta > 0 ? 'downgrade' : 'upgrade'
               });
          }
     }

     return {
          upgrades,
          downgrades,
          stable,
          no_history: noHistory,
          comparable: upgrades + downgrades + stable,
          net: upgrades - downgrades,
          moves: moves.sort((a, b) => (a.direction === b.direction ? 0 : a.direction === 'downgrade' ? -1 : 1))
     };
}

export default { buildPortfolio, buildPipeline, classifyFacility, collectibilityFromDays, assessCollectibility, applyObligorContagion, eclStage, facilityEcl, facilityPpka, normalizeCollectibility };
