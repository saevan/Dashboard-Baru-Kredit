/**
 * core/bank-ratios.js — Template rasio khusus bank / lembaga keuangan.
 *
 * Perusahaan non-keuangan dianalisis dengan rasio standar (ROA, DER, ICR, dst).
 * Untuk sektor perbankan, rasio tersebut kurang relevan sehingga dipakai
 * template khusus sesuai praktik OJK/BI:
 *   · NIM  (Net Interest Margin)   = (pendapatan bunga − beban bunga) / aset produktif
 *   · NPL  (Non-Performing Loan)   = kredit bermasalah / total kredit
 *   · CAR  (Capital Adequacy Ratio)= modal / ATMR (aset tertimbang menurut risiko)
 *   · LDR  (Loan to Deposit Ratio) = kredit diberikan / dana pihak ketiga
 *   · CASA (CASA ratio)            = giro + tabungan / dana pihak ketiga
 *   · BOPO (efisiensi operasional) = beban operasional / pendapatan operasional
 *   · NPL coverage                 = cadangan kerugian (CKPN) / kredit bermasalah
 *   · ROA/ROE bank                 = laba bersih / total aset (ekuitas)
 *
 * Pure functions; TIDAK menyentuh DOM. Rujukan: ARCHITECTURE §3.2, §4.3.
 */

import { safeDiv } from './ratios.js';

/** Angka finite atau null (bukan 0 paksa) supaya rasio tak terhitung → null. */
const num = (v) => {
     if (v === null || v === undefined || v === '') return null;
     const n = Number(v);
     return Number.isFinite(n) ? n : null;
};

/** Ambil nilai pertama yang terdefinisi (dukung alias id/en). */
const pick = (...vals) => {
     for (const v of vals) {
          const n = num(v);
          if (n !== null) return n;
     }
     return null;
};

/** Sektor yang memakai template perbankan. */
export const BANK_SECTORS = ['IDX-FINANCIALS'];

/** Apakah sektor ini (nama kode atau label) diperlakukan sebagai bank? */
export function isBankSector(sectorKey = '') {
     if (!sectorKey) return false;
     const key = String(sectorKey).toUpperCase();
     return BANK_SECTORS.includes(key) || /BANK|FINANCIAL|KEUANGAN/.test(key);
}

/**
 * Metadata rasio khusus bank (untuk render generic di UI).
 * `direction`: 'higher' = makin besar makin baik, 'lower' = makin kecil makin baik,
 *              'band'   = ada rentang ideal (lihat BANK_THRESHOLDS).
 * `unit`: 'ratio' (desimal) — pemformatan persen dilakukan di UI.
 */
export const BANK_RATIOS = [
     { key: 'nim', label: 'NIM (Net Interest Margin)', direction: 'higher', unit: 'ratio' },
     { key: 'npl_gross', label: 'NPL Gross', direction: 'lower', unit: 'ratio' },
     { key: 'npl_net', label: 'NPL Net', direction: 'lower', unit: 'ratio' },
     { key: 'npl_coverage', label: 'NPL Coverage (CKPN/NPL)', direction: 'higher', unit: 'ratio' },
     { key: 'car', label: 'CAR (Capital Adequacy Ratio)', direction: 'higher', unit: 'ratio' },
     { key: 'ldr', label: 'LDR (Loan to Deposit Ratio)', direction: 'band', unit: 'ratio' },
     { key: 'casa', label: 'CASA Ratio', direction: 'higher', unit: 'ratio' },
     { key: 'bopo', label: 'BOPO (Beban/Pendapatan Operasional)', direction: 'lower', unit: 'ratio' },
     { key: 'roa_bank', label: 'ROA (bank)', direction: 'higher', unit: 'ratio' },
     { key: 'roe_bank', label: 'ROE (bank)', direction: 'higher', unit: 'ratio' }
];

/** Daftar key rasio bank. */
export const BANK_RATIO_KEYS = BANK_RATIOS.map((r) => r.key);

/**
 * Ambang batas praktis (indikatif, konservatif untuk lender UKM).
 *  · direction: 'higher' → good bila v ≥ good, risk bila v < warn.
 *  · direction: 'lower'  → good bila v ≤ good, risk bila v > warn.
 *  · band: good bila lo ≤ v ≤ hi; risk bila di luar warnBand.
 */
export const BANK_THRESHOLDS = {
     nim: { direction: 'higher', good: 0.03, warn: 0.02 },
     npl_gross: { direction: 'lower', good: 0.02, warn: 0.05 },
     npl_net: { direction: 'lower', good: 0.01, warn: 0.03 },
     npl_coverage: { direction: 'higher', good: 1.0, warn: 0.8 },
     car: { direction: 'higher', good: 0.12, warn: 0.08 },
     ldr: { band: [0.78, 0.92], warnBand: [0.65, 1.0] },
     casa: { direction: 'higher', good: 0.5, warn: 0.3 },
     bopo: { direction: 'lower', good: 0.75, warn: 0.9 },
     roa_bank: { direction: 'higher', good: 0.015, warn: 0.005 },
     roe_bank: { direction: 'higher', good: 0.15, warn: 0.08 }
};

export const BANK_LEVEL_LABEL = {
     good: 'Sehat',
     warning: 'Perhatian',
     risk: 'Berisiko'
};

/**
 * Tingkat NPL (Non-Performing Loan) menurut peringkat kesehatan bank OJK:
 *   P1 Sangat Sehat (<2%) · P2 Sehat (2–5%) · P3 Cukup Sehat (5–8%)
 *   P4 Kurang Sehat (8–12%) · P5 Tidak Sehat (≥12%).
 * `max` adalah batas atas eksklusif dalam bentuk desimal (0.02 = 2%).
 */
export const NPL_TIERS = [
     { code: 'P1', key: 'sangat_sehat', label: 'Sangat Sehat', tone: 'good', max: 0.02, min: 0 },
     { code: 'P2', key: 'sehat', label: 'Sehat', tone: 'good', max: 0.05, min: 0.02 },
     { code: 'P3', key: 'cukup_sehat', label: 'Cukup Sehat', tone: 'warning', max: 0.08, min: 0.05 },
     { code: 'P4', key: 'kurang_sehat', label: 'Kurang Sehat', tone: 'risk', max: 0.12, min: 0.08 },
     { code: 'P5', key: 'tidak_sehat', label: 'Tidak Sehat', tone: 'risk', max: Infinity, min: 0.12 }
];

/** Label tingkat NPL (dipakai UI). */
export const NPL_TIER_LABEL = Object.fromEntries(NPL_TIERS.map((t) => [t.key, t.label]));

/**
 * Klasifikasikan NPL Gross (desimal) ke tingkat kesehatan OJK.
 * @param {number} nplGross — NPL gross sebagai desimal (0.035 = 3,5%)
 * @returns {{code:string,key:string,label:string,tone:string,npl:number,min:number,max:number,range_label:string}|null}
 */
export function nplTier(nplGross) {
     const v = num(nplGross);
     if (v === null) return null;
     const abs = Math.abs(v);
     for (const t of NPL_TIERS) {
          if (abs < t.max) {
               return {
                    code: t.code,
                    key: t.key,
                    label: t.label,
                    tone: t.tone,
                    npl: v,
                    min: t.min,
                    max: t.max,
                    range_label: rangeLabel(t)
               };
          }
     }
     const last = NPL_TIERS[NPL_TIERS.length - 1];
     return { code: last.code, key: last.key, label: last.label, tone: last.tone, npl: v, min: last.min, max: last.max, range_label: rangeLabel(last) };
}

function rangeLabel(t) {
     const pct = (x) => `${(x * 100).toFixed(1)}%`;
     if (t.max === Infinity) return `≥ ${pct(t.min)}`;
     if (t.min === 0) return `< ${pct(t.max)}`;
     return `${pct(t.min)} – ${pct(t.max)}`;
}

/**
 * Skor kesehatan bank komposit (0–100) dari hasil template: kombinasi jumlah
 * rasio berisiko / perhatian + tingkat NPL. Dipakai untuk badge ringkas.
 * @param {{items?:Array,npl_tier?:object}} summary — keluaran bankRatiosSummary
 * @returns {{score:number, label:string, tone:string}}
 */
export function bankHealthScore(summary = {}) {
     const items = summary.items || [];
     const evaluated = items.filter((it) => it.level);
     const riskCount = evaluated.filter((it) => it.level === 'risk').length;
     const warningCount = evaluated.filter((it) => it.level === 'warning').length;
     let score = 100;
     if (evaluated.length) {
          score -= (riskCount / evaluated.length) * 60;
          score -= (warningCount / evaluated.length) * 25;
     }
     const tier = summary.npl_tier;
     if (tier) {
          if (tier.key === 'tidak_sehat') score -= 20;
          else if (tier.key === 'kurang_sehat') score -= 12;
          else if (tier.key === 'cukup_sehat') score -= 5;
     }
     score = Math.max(0, Math.min(100, Math.round(score)));
     const label = score >= 80 ? 'Sehat' : score >= 60 ? 'Perhatian' : 'Berisiko';
     const tone = score >= 80 ? 'good' : score >= 60 ? 'warning' : 'risk';
     return { score, label, tone };
}

/**
 * Hitung seluruh rasio khusus bank dari blok keuangan.
 * Field boleh memakai nama Indonesia atau Inggris (alias).
 * @param {object} f — blok keuangan
 * @returns {object} rasio (desimal) + `_basis` nilai mentah untuk audit
 */
export function computeBankRatios(f = {}) {
     const pendapatanBunga = pick(f.pendapatan_bunga, f.interest_income) ?? 0;
     const bebanBunga = pick(f.beban_bunga, f.interest_expense) ?? 0;
     const totalAset = pick(f.total_aset, f.total_assets) ?? 0;
     const asetProduktif = pick(f.aset_produktif, f.earning_assets, f.total_aset) ?? 0;
     const kreditBermasalah = pick(f.kredit_bermasalah, f.npl, f.kredit_kurang_lancar) ?? 0;
     const totalKredit = pick(f.total_kredit, f.kredit_diberikan, f.loans) ?? 0;
     const cadangan = pick(f.cadangan_kerugian, f.ckpn, f.loan_loss_provision) ?? 0;
     const modal = pick(f.modal, f.tier1, f.ekuitas) ?? 0;
     const atmr = pick(f.atmr, f.rwa, f.aset_tertimbang_risiko) ?? 0;
     const danaPihakKetiga = pick(f.dana_pihak_ketiga, f.dpk, f.third_party_funds) ?? 0;
     const giro = pick(f.giro ?? f.demand_deposit) ?? 0;
     const tabungan = pick(f.tabungan ?? f.saving_deposit) ?? 0;
     const bebanOperasional = pick(f.beban_operasional, f.operating_expense) ?? 0;
     const pendapatanOperasional = pick(f.pendapatan_operasional, f.operating_income) ?? 0;
     const labaBersih = pick(f.laba_bersih, f.net_income) ?? 0;
     const ekuitas = pick(f.ekuitas, f.equity) ?? 0;

     const pendaBungaBersih = pendapatanBunga - bebanBunga;
     const nplNet = kreditBermasalah - cadangan;

     return {
          nim: safeDiv(pendaBungaBersih, asetProduktif),
          npl_gross: safeDiv(kreditBermasalah, totalKredit),
          npl_net: safeDiv(nplNet, totalKredit),
          npl_coverage: safeDiv(cadangan, kreditBermasalah),
          car: safeDiv(modal, atmr),
          ldr: safeDiv(totalKredit, danaPihakKetiga),
          casa: safeDiv(giro + tabungan, danaPihakKetiga),
          bopo: safeDiv(bebanOperasional, pendapatanOperasional),
          roa_bank: safeDiv(labaBersih, totalAset),
          roe_bank: safeDiv(labaBersih, ekuitas),
          _basis: {
               pendapatan_bunga: pendapatanBunga,
               beban_bunga: bebanBunga,
               pendapatan_bunga_bersih: pendaBungaBersih,
               aset_produktif: asetProduktif,
               kredit_bermasalah: kreditBermasalah,
               total_kredit: totalKredit,
               cadangan_kerugian: cadangan,
               modal,
               atmr,
               dana_pihak_ketiga: danaPihakKetiga,
               giro,
               tabungan,
               beban_operasional: bebanOperasional,
               pendapatan_operasional: pendapatanOperasional,
               laba_bersih: labaBersih,
               ekuitas
          }
     };
}

/**
 * Klasifikasi satu rasio bank terhadap `BANK_THRESHOLDS`.
 * @returns {'good'|'warning'|'risk'|null}
 */
export function bankRatioLevel(key, value) {
     const v = num(value);
     const th = BANK_THRESHOLDS[key];
     if (v === null || !th) return null;
     if (th.band) {
          const [lo, hi] = th.band;
          if (v >= lo && v <= hi) return 'good';
          const [wlo, whi] = th.warnBand || th.band;
          return v >= wlo && v <= whi ? 'warning' : 'risk';
     }
     if (th.direction === 'lower') {
          if (v <= th.good) return 'good';
          return v <= th.warn ? 'warning' : 'risk';
     }
     // default: higher is better
     if (v >= th.good) return 'good';
     return v >= th.warn ? 'warning' : 'risk';
}

/**
 * Ringkasan template bank: tiap rasio + level + daftar rasio terlemah
 * + TINGKAT NPL (P1–P5) + skor kesehatan komposit.
 * @param {object} f — blok keuangan
 * @returns {{ ratios:object, items:Array, riskCount:number, warningCount:number, worst:Array, npl_tier:object|null, health:object }}
 */
export function bankRatiosSummary(f = {}) {
     const ratios = computeBankRatios(f);
     const rank = { risk: 0, warning: 1, good: 2 };
     const items = BANK_RATIOS.map((meta) => ({
          ...meta,
          value: ratios[meta.key],
          level: bankRatioLevel(meta.key, ratios[meta.key])
     }));
     const worst = items
          .filter((it) => it.level === 'risk' || it.level === 'warning')
          .sort((a, b) => rank[a.level] - rank[b.level]);
     const tier = nplTier(ratios.npl_gross);
     const summary = {
          ratios,
          items,
          riskCount: items.filter((it) => it.level === 'risk').length,
          warningCount: items.filter((it) => it.level === 'warning').length,
          worst,
          npl_tier: tier
     };
     summary.health = bankHealthScore(summary);
     return summary;
}

/** True bila blok keuangan memuat minimal satu field khas bank. */
export function hasBankData(f = {}) {
     return [
          f.pendapatan_bunga,
          f.interest_income,
          f.aset_produktif,
          f.earning_assets,
          f.kredit_bermasalah,
          f.npl,
          f.atmr,
          f.rwa,
          f.car,
          f.dana_pihak_ketiga,
          f.dpk
     ].some((v) => num(v) !== null);
}

export default {
     BANK_RATIOS,
     BANK_RATIO_KEYS,
     BANK_THRESHOLDS,
     BANK_LEVEL_LABEL,
     BANK_SECTORS,
     NPL_TIERS,
     NPL_TIER_LABEL,
     nplTier,
     bankHealthScore,
     computeBankRatios,
     bankRatioLevel,
     bankRatiosSummary,
     hasBankData,
     isBankSector
};
