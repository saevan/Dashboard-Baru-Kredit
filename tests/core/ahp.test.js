/**
 * tests/ahp.test.js — AHP weighting (human layer) + consistency ratio.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
     ahpWeights,
     consistencyRatio,
     consistencyIndex,
     normalizeWeights,
     buildPairwiseFromWeights,
     geometricMeanPriority,
     validateMatrix,
     RANDOM_INDEX
} from '../../src/core/ahp.js';
import { runFullAnalysis, emptyBorrower } from '../../src/core/engine.js';
import { PILLARS } from '../../src/core/config.js';

const consistent3 = [
     [1, 2, 2],
     [1 / 2, 1, 1],
     [1 / 2, 1, 1]
];

const inconsistent3 = [
     [1, 9, 1 / 9],
     [1 / 9, 1, 9],
     [9, 1 / 9, 1]
];

test('ahp: matriks konsisten → bobot tepat & CR ≈ 0', () => {
     const res = ahpWeights(consistent3);
     assert.equal(res.valid, true);
     assert.ok(Math.abs(res.weights[0] - 0.5) < 1e-6);
     assert.ok(Math.abs(res.weights[1] - 0.25) < 1e-6);
     assert.ok(Math.abs(res.weights[2] - 0.25) < 1e-6);
     assert.ok(res.cr < 1e-6);
     assert.equal(res.consistent, true);
     assert.ok(Math.abs(res.lambda_max - 3) < 1e-6);
});

test('ahp: matriks siklik tidak konsisten → CR > 0.10 & consistent=false', () => {
     const res = ahpWeights(inconsistent3);
     assert.equal(res.valid, true);
     assert.ok(res.cr > 0.1);
     assert.equal(res.consistent, false);
});

test('ahp: RANDOM_INDEX Saaty memuat nilai baku', () => {
     assert.equal(RANDOM_INDEX[3], 0.58);
     assert.equal(RANDOM_INDEX[4], 0.9);
     assert.equal(RANDOM_INDEX[6], 1.24);
});

test('ahp: normalizeWeights menjumlah 1 & aman saat total 0', () => {
     const w = normalizeWeights([2, 3, 5]);
     assert.ok(Math.abs(w.reduce((a, b) => a + b, 0) - 1) < 1e-9);
     const zero = normalizeWeights([0, 0, 0]);
     assert.deepEqual(zero, [0, 0, 0]);
});

test('ahp: buildPairwiseFromWeights round-trip konsisten', () => {
     const weights = [0.4, 0.3, 0.2, 0.1];
     const matrix = buildPairwiseFromWeights(weights);
     const res = ahpWeights(matrix);
     for (let i = 0; i < weights.length; i++) {
          assert.ok(Math.abs(res.weights[i] - weights[i]) < 1e-4, `w[${i}]`);
     }
     assert.ok(res.cr < 1e-4);
});

test('ahp: validateMatrix menolak matriks non-resiprokal', () => {
     const bad = validateMatrix([
          [1, 2],
          [3, 1]
     ]);
     assert.equal(bad.valid, false);
     assert.ok(bad.reasons.some((r) => r.toLowerCase().includes('resiprokal')));
});

test('ahp: consistencyIndex/consistencyRatio n<3 = 0', () => {
     assert.equal(consistencyIndex([[1, 2], [1 / 2, 1]]), 0);
     assert.equal(consistencyRatio([[1, 2], [1 / 2, 1]]), 0);
});

test('ahp: geometricMeanPriority konsisten dengan bobot asal', () => {
     const w = geometricMeanPriority(consistent3);
     assert.ok(Math.abs(w[0] - 0.5) < 1e-6);
});

test('engine: config.ahp.enabled menurunkan bobot pilar dari pairwise & terekspos', () => {
     const weights = [0.30, 0.25, 0.20, 0.10, 0.10, 0.05];
     const b = emptyBorrower();
     Object.assign(b, {
          nama: 'PT AHP',
          sektor: 'IDX-CONSUMER-NON-CYCLICALS',
          profil_company: 'ukm_mapan',
          plafon_diajukan: 1_000_000_000,
          tenor_bulan: 36,
          bunga_tahunan: 0.14
     });
     b.keuangan = {
          ...b.keuangan,
          penjualan: 6_000_000_000,
          hpp: 4_200_000_000,
          ebit: 400_000_000,
          laba_bersih: 200_000_000,
          beban_bunga: 80_000_000,
          total_aset: 5_000_000_000,
          aset_lancar: 2_000_000_000,
          liabilitas_jangka_pendek: 1_000_000_000,
          total_liabilitas: 2_000_000_000,
          ekuitas: 3_000_000_000,
          kas: 500_000_000,
          piutang: 700_000_000,
          persediaan: 800_000_000,
          arus_kas_operasional: 500_000_000
     };
     const config = { ahp: { enabled: true, pairwise: buildPairwiseFromWeights(weights), enforceConsistency: true } };
     const res = runFullAnalysis(b, { config });
     assert.ok(res.weights.ahp);
     assert.equal(res.weights.ahp.valid, true);
     PILLARS.forEach((p, i) => {
          assert.ok(Math.abs(res.weights.pillar_effective[p] - weights[i]) < 1e-3, `${p}`);
     });
     assert.ok(res.meta.snapshot.ahp);
});
