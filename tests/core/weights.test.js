/**
 * tests/weights.test.js — Golden case PRD §11.3 (ARCHITECTURE §3A.3).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { adjustWeightsByGap } from '../../src/core/weights.js';

test('weights: ROA +40% → 0.36 ; DER −35% → 0.165 ; normalisasi Σ = 1', () => {
     const base = { roa: 0.30, der: 0.20, current_ratio: 0.30, altman_z: 0.20 };
     const gapItems = [
          { rasio: 'roa', gap_score: 40 },
          { rasio: 'der', gap_score: -35 }
     ];
     const res = adjustWeightsByGap(base, gapItems, 0.5);

     assert.ok(Math.abs(res.adjusted.roa - 0.36) < 1e-9, `roa=${res.adjusted.roa}`);
     assert.ok(Math.abs(res.adjusted.der - 0.165) < 1e-9, `der=${res.adjusted.der}`);
     // Rasio tanpa gap tidak berubah (sebelum normalisasi)
     assert.equal(res.adjusted.current_ratio, 0.30);

     const sum = Object.values(res.normalized).reduce((a, b) => a + b, 0);
     assert.ok(Math.abs(sum - 1) < 1e-9, `Σ normalized = ${sum}`);
});

test('weights: k=0 → bobot tidak berubah', () => {
     const base = { roa: 0.5, der: 0.5 };
     const res = adjustWeightsByGap(base, [{ rasio: 'roa', gap_score: 100 }], 0);
     assert.equal(res.adjusted.roa, 0.5);
     assert.equal(res.adjusted.der, 0.5);
});

test('weights: gap_score +100 → bobot naik 1.5x (k=0.5)', () => {
     const res = adjustWeightsByGap({ roa: 0.4 }, [{ rasio: 'roa', gap_score: 100 }], 0.5);
     assert.ok(Math.abs(res.adjusted.roa - 0.6) < 1e-9);
});

test('weights: gap_score −100 → bobot turun 0.5x (k=0.5)', () => {
     const res = adjustWeightsByGap({ roa: 0.4 }, [{ rasio: 'roa', gap_score: -100 }], 0.5);
     assert.ok(Math.abs(res.adjusted.roa - 0.2) < 1e-9);
});
