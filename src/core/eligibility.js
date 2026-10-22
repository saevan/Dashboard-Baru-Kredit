/**
 * core/eligibility.js — Keputusan kelayakan (3 lapis).
 * Lapis 1 hard rules → Lapis 2 threshold skor → Lapis 3 gap benchmark.
 * Pure function. Rujukan: ARCHITECTURE §3A.1, §3.6.C/D.
 *
 * Sejak v2, interpretasi rules menggunakan registry tunggal `evaluateRules()`
 * dari config.js dengan konfigurasi EFEKTIF (hasil `resolveConfig()` per profil),
 * sehingga DSCR/ICR/DTI/LTV/Altman konsisten di seluruh modul (eligibility,
 * stress test, covenant).
 */

import { DEFAULT_CONFIG, DECISION_LABEL, evaluateRules } from './config.js';

const num = (v) =>
     v === null || v === undefined || v === ''
          ? null
          : Number.isFinite(Number(v))
               ? Number(v)
               : null;
const round2 = (v) => Math.round(v * 100) / 100;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const r2 = (v) => Math.round(v * 100) / 100;

function confidenceFor(decision, score) {
     if (decision === 'LAYAK') return r2(clamp(0.8 + ((score - 75) / 25) * 0.19, 0.8, 0.99));
     if (decision === 'LAYAK_BERSYARAT') return r2(clamp(0.69 + ((score - 60) / 14) * 0.15, 0.69, 0.85));
     if (decision === 'REVIEW') return r2(clamp(0.45 + ((score - 45) / 15) * 0.15, 0.45, 0.6));
     return 0.9;
}

/**
 * @param {object} args
 * @param {object} args.ratios — hasil computeRatios
 * @param {number} args.finalScore
 * @param {object} args.gapSummary — hasil computeGap
 * @param {object} [args.extra] — { negative_ocf_periods, arrears_days, ltv, personal_guarantee }
 * @param {object} [args.config] — konfigurasi efektif (per profil) hasil resolveConfig()
 */
/**
 * Stress test sebagai lapis keputusan: borrower yang "sangat rentan" (ketahanan di bawah
 * `config.stress.minSurvivalForAuto`) tidak boleh lolos otomatis — keputusan paling tinggi REVIEW.
 * Tidak menaikkan keputusan; TIDAK_LAYAK dan REVIEW tetap.
 */
export function applyStressCap(decision, stress, config = DEFAULT_CONFIG) {
     const min = num(config.stress?.minSurvivalForAuto) ?? 0.375;
     const survival = num(stress?.survival_rate) ?? 1;
     if (!decision || !stress || !Array.isArray(stress.scenarios) || !stress.scenarios.length) return decision;
     if (survival >= min || !['LAYAK', 'LAYAK_BERSYARAT'].includes(decision.decision)) return { ...decision, stress_capped: false };
     const message = `Stress test: hanya ${stress.passed}/${stress.scenarios.length} skenario tahan (ketahanan ${Math.round(survival * 100)}% < ${Math.round(min * 100)}%) → maksimal REVIEW`;
     return { ...decision, decision: 'REVIEW', decision_label: DECISION_LABEL.REVIEW, stress_capped: true,
          soft_notes: [...(decision.soft_notes || []), { rule: 'stress_survival', message }],
          reasons: [...(decision.reasons || []), `✗ ${message}`], conditions: [] };
}

export function decide({ ratios = {}, finalScore = 0, gapSummary = null, extra = {}, config = DEFAULT_CONFIG }) {
     const t = config.thresholds;
     const zSafe = config.altman?.z_safe ?? 2.99;
     const zDistress = config.altman?.z_distress ?? 1.81;

     const dscr = num(ratios.dscr);
     const icr = num(ratios.icr);
     const dti = num(ratios.dti);
     const dsRatio = num(ratios.ds_ratio);
     const z = num(ratios.altman_z);
     const ltv = num(extra.ltv);
     const negOcf = Number(extra.negative_ocf_periods ?? 0);
     const arrears = Number(extra.arrears_days ?? 0);

     // ——— LAPIS 1 + SOFT OVERRIDES: registry tunggal ———
     const rule = evaluateRules({
          metrics: {
               dscr,
               icr,
               dti,
               ds_ratio: dsRatio,
               ltv,
               altman_z: z,
               negative_ocf_periods: negOcf,
               arrears_days: arrears
          },
          config,
          options: { personal_guarantee: !!extra.personal_guarantee }
     });

     const triggered = rule.triggered.map((d) => ({ rule: d.rule, message: d.message }));
     const softNotes = rule.softNotes.map((d) => ({ rule: d.rule, message: `${d.message} → maksimal REVIEW` }));
     const watched = rule.watched.map((d) => ({ rule: d.rule, message: d.message }));

     // ——— LAPIS 2: SKOR ———
     let decision;
     if (triggered.length > 0) decision = 'TIDAK_LAYAK';
     else if (finalScore >= t.layak) decision = 'LAYAK';
     else if (finalScore >= t.layak_bersyarat) decision = 'LAYAK_BERSYARAT';
     else if (finalScore >= t.review) decision = 'REVIEW';
     else decision = 'TIDAK_LAYAK';

     if (softNotes.length > 0 && (decision === 'LAYAK' || decision === 'LAYAK_BERSYARAT')) {
          decision = 'REVIEW';
     }

     // ——— LAPIS 3: GAP ———
     let gapTooFar = false;
     if (gapSummary) {
          if (typeof gapSummary.verdict === 'string') gapTooFar = gapSummary.verdict === 'too_far';
          else {
               const avg = num(gapSummary.avg_gap_pct) ?? 0;
               const breach = Number(gapSummary.breach_count ?? 0);
               gapTooFar = avg < config.gap.too_far || breach >= config.gap.mainRatiosMinBreach;
          }
     }
     if (gapTooFar && decision !== 'TIDAK_LAYAK') decision = 'TIDAK_LAYAK';

     // ——— ALASAN (explainable) ———
     const reasons = [];
     if (dscr !== null) {
          const basis = ratios._basis?.dscr_basis || 'proxy';
          reasons.push(
               `${dscr >= config.hardRules.dscr_min ? '✓' : '✗'} DSCR ${round2(dscr)}x ` +
               `[${basis}] (min ${config.hardRules.dscr_min}x)`
          );
     }
     if (icr !== null) {
          reasons.push(
               icr >= config.hardRules.icr_min
                    ? `ICR ${round2(icr)}x ✓ EBIT menutup bunga`
                    : `ICR ${round2(icr)}x ✗ EBIT tidak menutup bunga`
          );
     }
     if (dsRatio !== null) {
          reasons.push(
               dsRatio <= config.hardRules.ds_ratio_max
                    ? `Debt Service Ratio ${(dsRatio * 100).toFixed(1)}% ✓ beban utang terkendali`
                    : `Debt Service Ratio ${(dsRatio * 100).toFixed(1)}% ⚠️ di atas ${(config.hardRules.ds_ratio_max * 100).toFixed(0)}%`
          );
     }
     if (z !== null) {
          reasons.push(
               z >= zSafe
                    ? `Altman Z ${round2(z)} ✓ zona aman`
                    : z > zDistress
                         ? `Altman Z ${round2(z)} ⚠️ zona kelabu`
                         : `Altman Z ${round2(z)} ✗ zona distress`
          );
     }
     if (gapSummary && gapSummary.main_items) {
          for (const it of gapSummary.main_items.slice(0, 4)) {
               const sign = it.gap_pct >= 0 ? 'di atas' : 'di bawah';
               const mark = it.gap_pct < -30 ? '⚠️' : it.gap_pct >= 0 ? '✓' : '·';
               reasons.push(
                    `${it.label} ${fmtVal(it.borrower)} ${sign} median industri ${fmtVal(it.median)} (gap ${it.gap_pct}%) ${mark}`
               );
          }
     }
     reasons.push(`Skor akhir ${round2(finalScore)} → ${DECISION_LABEL[decision]}`);
     if (triggered.length) reasons.push(`Hard rule dilanggar: ${triggered.map((x) => x.rule).join(', ')}`);
     if (gapTooFar) reasons.push(`Gap terlalu jauh (rata-rata ${gapSummary ? gapSummary.avg_gap_pct : '—'}%, breach ${gapSummary ? gapSummary.breach_count : '—'}) → TIDAK LAYAK`);

     // ——— SYARAT (bila LAYAK BERSYARAT) ———
     const conditions = [];
     if (decision === 'LAYAK_BERSYARAT') {
          conditions.push('Turunkan plafon ke nominal rekomendasi');
          if (ltv !== null && ltv > 0.6) conditions.push('Tambahkan agunan atau personal guarantee');
          if (dscr !== null && dscr < 1.3) conditions.push('Perpanjang tenor untuk menurunkan cicilan tahunan');
          if (negOcf > 0) conditions.push('Minta proyeksi arus kas operasional yang membaik');
          conditions.push('Aktifkan covenant monitoring (maintenance + reporting)');
          if (conditions.length === 0) conditions.push('Covenant monitoring bulanan');
     }

     return {
          decision,
          decision_label: DECISION_LABEL[decision],
          confidence: triggered.length ? 0.95 : confidenceFor(decision, finalScore),
          score: round2(finalScore),
          hard_rules_triggered: triggered,
          soft_notes: softNotes,
          watched_notes: watched,
          rules_evaluated: rule.evaluated,
          gap_analysis: gapSummary
               ? { avg_gap_pct: gapSummary.avg_gap_pct, verdict: gapSummary.verdict, breach_count: gapSummary.breach_count }
               : null,
          reasons,
          conditions
     };
}

function fmtVal(v) {
     const n = Number(v);
     if (!Number.isFinite(n)) return '—';
     if (Math.abs(n) < 5 && Math.abs(n) > 0) return n.toFixed(4);
     if (Math.abs(n) < 100) return n.toFixed(2);
     return n.toLocaleString('id-ID');
}
