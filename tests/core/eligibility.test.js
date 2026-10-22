/**
 * tests/eligibility.test.js — Golden case PRD §11.2 (ARCHITECTURE §3A.1).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { decide } from '../../src/core/eligibility.js';

const okGap = { verdict: 'acceptable', avg_gap_pct: -12.4, breach_count: 0 };

test('eligibility: hard rule DSCR 0.95 → TIDAK_LAYAK (override)', () => {
     const res = decide({
          ratios: { dscr: 0.95, icr: 3.0, der: 0.5, altman_z: 3.5 },
          finalScore: 90,
          gapSummary: okGap,
          extra: { negative_ocf_periods: 0, arrears_days: 0, ltv: 0.5 }
     });
     assert.equal(res.decision, 'TIDAK_LAYAK');
     assert.ok(res.hard_rules_triggered.length >= 1);
     assert.equal(res.hard_rules_triggered[0].rule, 'DSCR minimum');
});

test('eligibility: skor 68.4, avg gap −12.4 → LAYAK_BERSYARAT (confidence 0.78)', () => {
     const res = decide({
          ratios: { dscr: 1.35, icr: 2.1, der: 0.62, current_ratio: 1.45, altman_z: 3.2 },
          finalScore: 68.4,
          gapSummary: okGap,
          extra: { negative_ocf_periods: 0, arrears_days: 0, ltv: 0.6 }
     });
     assert.equal(res.decision, 'LAYAK_BERSYARAT');
     assert.equal(res.confidence, 0.78);
     assert.ok(res.conditions.length >= 1);
});

test('eligibility: gap too_far (avg −35) → TIDAK_LAYAK', () => {
     const res = decide({
          ratios: { dscr: 1.4, icr: 2.5, der: 0.5, altman_z: 3.5 },
          finalScore: 80,
          gapSummary: { verdict: 'too_far', avg_gap_pct: -35, breach_count: 1 },
          extra: { negative_ocf_periods: 0, arrears_days: 0, ltv: 0.5 }
     });
     assert.equal(res.decision, 'TIDAK_LAYAK');
});

test('eligibility: skor ≥75 → LAYAK', () => {
     const res = decide({
          ratios: { dscr: 1.6, icr: 3, der: 0.4, current_ratio: 1.8, altman_z: 4 },
          finalScore: 80,
          gapSummary: okGap,
          extra: { negative_ocf_periods: 0, arrears_days: 0, ltv: 0.5 }
     });
     assert.equal(res.decision, 'LAYAK');
     assert.equal(res.hard_rules_triggered.length, 0);
});

test('eligibility: skor <45 → TIDAK_LAYAK', () => {
     const res = decide({
          ratios: { dscr: 1.2, icr: 1.5, der: 1.5, altman_z: 2.2 },
          finalScore: 40,
          gapSummary: okGap,
          extra: { negative_ocf_periods: 0, arrears_days: 0, ltv: 0.7 }
     });
     assert.equal(res.decision, 'TIDAK_LAYAK');
});

test('eligibility: rasio null/absen TIDAK memicu hard rule (null-safe)', () => {
     const res = decide({
          ratios: { dscr: null, icr: null },
          finalScore: 80,
          gapSummary: okGap,
          extra: { negative_ocf_periods: 0, arrears_days: 0, ltv: 0.5 }
     });
     assert.equal(res.hard_rules_triggered.length, 0);
     assert.equal(res.decision, 'LAYAK');
});
