/**
 * tests/gap.test.js — Golden case PRD §11.4 (ARCHITECTURE §3A.3).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeGap } from '../../src/core/gap.js';

function bench(roaMedian = 0.024) {
     return {
          sectors: {
               TEST: {
                    label: 'Test',
                    benchmarks: {
                         roa: { n: 100, p10: 0.005, p25: 0.015, median: roaMedian, p75: 0.04, p90: 0.06, mean: 0.03, std: 0.01, direction: 'high' }
                    }
               }
          }
     };
}

test('gap: ROA 0.031 vs median 0.024 → gap_pct 29.2', () => {
     const res = computeGap({
          ratios: { roa: 0.031 },
          sectorKey: 'TEST',
          benchmarkData: bench(0.024),
          mainRatios: ['roa'],
          config: { gap: { too_far: -30, mainRatiosMinBreach: 3 } }
     });
     const item = res.items.find((i) => i.rasio === 'roa');
     assert.ok(item, 'item roa harus ada');
     assert.ok(Math.abs(item.gap_pct - 29.2) < 0.05, `gap_pct=${item.gap_pct}`);
     assert.equal(res.verdict, 'acceptable');
});

test('gap: rasio lower-is-better di atas median → gap negatif (DER)', () => {
     const data = {
          sectors: {
               TEST: {
                    label: 'Test',
                    benchmarks: {
                         der: { n: 100, p10: 0.2, p25: 0.35, median: 0.5, p75: 0.8, p90: 1.0, mean: 0.6, std: 0.2, direction: 'low' }
                    }
               }
          }
     };
     const res = computeGap({
          ratios: { der: 0.62 },
          sectorKey: 'TEST',
          benchmarkData: data,
          mainRatios: ['der'],
          config: { gap: { too_far: -30, mainRatiosMinBreach: 3 } }
     });
     const item = res.items.find((i) => i.rasio === 'der');
     assert.ok(item.gap_pct < 0, `gap_pct=${item.gap_pct}`);
     // (0.62-0.50)/0.50 = 24% → dibalik tanda = -24%
     assert.ok(Math.abs(item.gap_pct + 24) < 0.05, `gap_pct=${item.gap_pct}`);
});

test('gap: ≥3 rasio utama < −30% → verdict too_far', () => {
     const data = {
          sectors: {
               TEST: {
                    label: 'Test',
                    benchmarks: {
                         roa: { n: 100, p25: 0.05, median: 0.1, p75: 0.15 },
                         roe: { n: 100, p25: 0.08, median: 0.15, p75: 0.2 },
                         npm: { n: 100, p25: 0.04, median: 0.08, p75: 0.12 }
                    }
               }
          }
     };
     const res = computeGap({
          ratios: { roa: 0.01, roe: 0.02, npm: 0.01 },
          sectorKey: 'TEST',
          benchmarkData: data,
          mainRatios: ['roa', 'roe', 'npm'],
          config: { gap: { too_far: -30, mainRatiosMinBreach: 3 } }
     });
     assert.equal(res.breach_count, 3);
     assert.equal(res.verdict, 'too_far');
});

test('gap: tanpa benchmark → items kosong, tidak error', () => {
     const res = computeGap({
          ratios: { roa: 0.05 },
          sectorKey: 'UNKNOWN',
          benchmarkData: { sectors: {} },
          mainRatios: ['roa'],
          config: { gap: { too_far: -30, mainRatiosMinBreach: 3 } }
     });
     assert.equal(res.items.length, 0);
     assert.equal(res.verdict, 'acceptable');
});
