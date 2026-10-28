/**
 * core/what-if.js — Simulator What-If (F-14) + jadwal amortisasi (F-15).
 *
 * Pure function, tanpa dependency runtime tambahan.
 *
 * Rujukan:
 *  - docs/ARCHITECTURE.md §7.2 (9. simulator What-If, 10. rekomendasi plafon
 *    maksimum, 11. jadwal amortisasi).
 *  - docs/PRD_DASHBOARD.md US-4.4 + F-14 + F-15.
 *
 * Strategi: alih-alih menduplikasi rumus engine, skenario dihitung dengan
 * menjalankan ulang `runFullAnalysis` pada salinan borrower yang diubah
 * (plafon/tenor/bunga/skema). Ini menjamin skor, DSCR, keputusan, dan pricing
 * skenario konsisten persis dengan alur analisis normal.
 */

import { DEFAULT_CONFIG, resolveConfig, DECISION_LABEL } from './config.js';
import { runFullAnalysis } from './engine.js';
import { installmentFor } from './debt-service.js';

const num = (v, d = 0) =>
     v === null || v === undefined || v === ''
          ? d
          : Number.isFinite(Number(v))
               ? Number(v)
               : d;

const round2 = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v) * 100) / 100 : null);

/** Pemetaan alias perubahan → nama field borrower. */
const CHANGE_MAP = {
     plafon: 'plafon_diajukan',
     plafon_diajukan: 'plafon_diajukan',
     tenorBulan: 'tenor_bulan',
     tenor_bulan: 'tenor_bulan',
     bungaTahunan: 'bunga_tahunan',
     bunga_tahunan: 'bunga_tahunan',
     skemaAngsuran: 'skema_angsuran',
     skema_angsuran: 'skema_angsuran',
     gracePeriodBulan: 'grace_period_bulan',
     grace_period_bulan: 'grace_period_bulan'
};

/**
 * Terapkan perubahan What-If ke salinan borrower (tanpa memutasi aslinya).
 * Nilai `null`/`undefined`/'' diabaikan → field memakai nilai awal.
 * @param {object} borrower
 * @param {object} changes — { plafon?, tenorBulan?, bungaTahunan?, skemaAngsuran?, gracePeriodBulan? }
 * @returns {object} borrower baru
 */
export function applyWhatIf(borrower = {}, changes = {}) {
     const out = { ...(borrower || {}) };
     for (const [key, target] of Object.entries(CHANGE_MAP)) {
          const v = changes[key];
          if (v === undefined || v === null || v === '') continue;
          out[target] = v;
     }
     return out;
}

/** DSCR efektif dari hasil analisis (riil bila ada, fallback proxy). */
export function dscrOf(result) {
     if (!result || !result.ratios) return null;
     const r = result.ratios;
     return r.dscr_real !== undefined && r.dscr_real !== null ? r.dscr_real : r.dscr ?? null;
}

/** Ringkasan metrik kunci dari hasil analisis (untuk perbandingan What-If). */
export function scenarioSnapshot(result) {
     if (!result) return null;
     const b = result.borrower || {};
     const ratios = result.ratios || {};
     const ds = result.debtService || {};
     return {
          plafon: num(b.plafon_diajukan),
          tenor_bulan: num(b.tenor_bulan),
          bunga_tahunan: num(b.bunga_tahunan),
          skema: b.skema_angsuran || null,
          finalScore: num(result.finalScore),
          decision: (result.decision || {}).decision || null,
          decision_label:
               (result.decision || {}).decision_label ||
               DECISION_LABEL[(result.decision || {}).decision] ||
               (result.decision || {}).decision ||
               null,
          dscr: dscrOf(result),
          dti: ratios.dti ?? null,
          icr: ratios.icr ?? null,
          ds_ratio: ratios.ds_ratio ?? null,
          total_annual_ds: ds.total_annual ?? null,
          monthly_installment: ds.new_loan ? ds.new_loan.monthly_avg ?? null : null,
          peak_monthly: ds.peak_monthly ?? null,
          recommended_nominal: result.nominal ? result.nominal.recommended_nominal ?? null : null,
          recommended_rate: (result.risk || {}).pricing ? (result.risk.pricing.recommended_rate ?? null) : null,
          pd12: (result.risk || {}).pd ? (result.risk.pd.pd12 ?? null) : null
     };
}

/**
 * Bandingkan skenario What-If terhadap baseline.
 * @returns {{ base:object, scenario:object, delta:object, results:{base,scenario} }}
 */
export function compareScenario(borrower = {}, changes = {}, options = {}) {
     const baseRes = runFullAnalysis(borrower, options);
     const scenarioRes = runFullAnalysis(applyWhatIf(borrower, changes), options);
     const base = scenarioSnapshot(baseRes);
     const scenario = scenarioSnapshot(scenarioRes);
     const delta = {
          score: round2(scenario.finalScore - base.finalScore),
          dscr: base.dscr !== null && scenario.dscr !== null ? round2(scenario.dscr - base.dscr) : null,
          dti: base.dti !== null && scenario.dti !== null ? round2(scenario.dti - base.dti) : null,
          icr: base.icr !== null && scenario.icr !== null ? round2(scenario.icr - base.icr) : null,
          total_annual_ds:
               base.total_annual_ds !== null && scenario.total_annual_ds !== null
                    ? Math.round(scenario.total_annual_ds - base.total_annual_ds)
                    : null,
          monthly_installment:
               base.monthly_installment !== null && scenario.monthly_installment !== null
                    ? Math.round(scenario.monthly_installment - base.monthly_installment)
                    : null
     };
     return { base, scenario, delta, results: { base: baseRes, scenario: scenarioRes } };
}

/**
 * Jadwal amortisasi (F-15) dari parameter eksplisit.
 * @returns {{ scheme, principal, tenor_bulan, grace_bulan, schedule, monthly_avg,
 *   first_payment, peak_payment, total_interest, total_payment, balloon, interest_ratio }}
 */
export function amortization({
     principal = 0,
     annualRate = 0,
     tenorBulan = 0,
     scheme = 'annuity',
     graceMonths = 0,
     config = DEFAULT_CONFIG
} = {}) {
     const ds = (config && config.debtService) || {};
     const inst = installmentFor(scheme, principal, annualRate, tenorBulan, {
          graceMonths,
          seasonalityFactor: ds.seasonalityFactor,
          peakMonths: ds.peakMonths
     });
     return {
          scheme,
          principal: inst.principal,
          tenor_bulan: inst.tenor_bulan,
          grace_bulan: inst.grace_bulan,
          schedule: inst.schedule,
          monthly_avg: inst.monthly_avg,
          first_payment: inst.first_payment,
          peak_payment: inst.peak_payment,
          total_interest: inst.total_interest,
          total_payment: inst.total_payment,
          balloon: inst.balloon,
          interest_ratio: inst.total_payment > 0 ? inst.total_interest / inst.total_payment : 0
     };
}

/** Jadwal amortisasi dari borrower + override opsional (plafon/tenor/bunga/skema). */
export function amortizationForBorrower(borrower = {}, overrides = {}, config = DEFAULT_CONFIG) {
     const ds = (config && config.debtService) || {};
     const scheme = overrides.scheme || overrides.skemaAngsuran || borrower.skema_angsuran || ds.defaultScheme || 'annuity';
     const principal = num(overrides.plafon ?? overrides.plafon_diajukan ?? borrower.plafon_diajukan);
     const annualRate = num(overrides.bungaTahunan ?? overrides.bunga_tahunan ?? borrower.bunga_tahunan);
     const tenorBulan = num(overrides.tenorBulan ?? overrides.tenor_bulan ?? borrower.tenor_bulan);
     const graceMonths = num(overrides.graceMonths ?? overrides.grace_period_bulan ?? borrower.grace_period_bulan ?? 0);
     return amortization({ principal, annualRate, tenorBulan, scheme, graceMonths, config });
}

/**
 * Rekomendasi plafon maksimum agar DSCR ≥ target (PRD: target ≥ 1.2).
 * Binary search atas plafon menggunakan DSCR riil dari engine, lalu dibatasi LTV.
 * @returns {{ recommended:number, dscr_based:number, ltv_based:number,
 *   target_dscr:number, binding:string, dscr_at_recommended:number|null }}
 */
export function maxPlafonForDscr(borrower = {}, options = {}) {
     const {
          config = DEFAULT_CONFIG,
          benchmarkData = null,
          profiles = null,
          targetDscr = null,
          iterations = 32
     } = options;

     const cfg = resolveConfig(config, {
          profileKey: borrower.profil_company || null,
          sectorKey: borrower.sektor || null
     });
     const target =
          targetDscr !== null && targetDscr !== undefined
               ? num(targetDscr, cfg.nominal.dscrTarget)
               : num(cfg.nominal.dscrTarget, 1.3);

     const ag = borrower.agunan || {};
     const agunan = num(ag.nilai_agunan);
     const ltvMax = ag.personal_guarantee
          ? num(cfg.hardRules?.ltv_max_with_guarantee, 0.95)
          : num(cfg.hardRules?.ltv_max, 0.75);
     const ltvCap = agunan * ltvMax;
     const requested = num(borrower.plafon_diajukan);

     const runOpts = { config, benchmarkData, profiles };
     const dscrAt = (plafon) => {
          const r = runFullAnalysis({ ...borrower, plafon_diajukan: plafon }, runOpts);
          const d = dscrOf(r);
          return d === null ? Number.NEGATIVE_INFINITY : d;
     };

     const rounding = num(cfg.nominal.rounding, 50000000) || 50000000;

     // Cari batas atas di mana DSCR < target.
     let lo = 0;
     let hi = Math.max(requested, ltvCap, 1_000_000_000);
     let guard = 0;
     while (dscrAt(hi) >= target && guard < 10) {
          hi *= 2;
          guard += 1;
     }

     // Kapasitas DSCR sangat besar (target selalu terpenuhi) → dibatasi LTV.
     if (dscrAt(hi) >= target) {
          const capped = ltvCap > 0 ? ltvCap : hi;
          const recommended = Math.max(0, Math.floor(capped / rounding) * rounding);
          return {
               recommended,
               dscr_based: Math.round(hi),
               ltv_based: Math.round(ltvCap),
               target_dscr: target,
               binding: ltvCap > 0 ? 'ltv' : 'none',
               dscr_at_recommended: dscrAt(recommended > 0 ? recommended : capped)
          };
     }

     for (let i = 0; i < iterations; i += 1) {
          const mid = (lo + hi) / 2;
          if (dscrAt(mid) >= target) lo = mid;
          else hi = mid;
     }
     const dscrBased = lo;
     let final = dscrBased;
     let binding = 'dscr';
     if (ltvCap > 0 && ltvCap < final) {
          final = ltvCap;
          binding = 'ltv';
     }
     const recommended = Math.max(0, Math.floor(final / rounding) * rounding);
     return {
          recommended,
          dscr_based: Math.round(dscrBased),
          ltv_based: Math.round(ltvCap),
          target_dscr: target,
          binding,
          dscr_at_recommended: dscrAt(recommended > 0 ? recommended : final)
     };
}

export default {
     applyWhatIf,
     compareScenario,
     scenarioSnapshot,
     dscrOf,
     amortization,
     amortizationForBorrower,
     maxPlafonForDscr
};
