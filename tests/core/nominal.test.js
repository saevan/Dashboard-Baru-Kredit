/**
 * tests/nominal.test.js — Golden case PRD §11.1 (ARCHITECTURE §3A.2).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendNominal } from '../../src/core/nominal.js';

test('nominal: golden ARCHITECTURE §3A.2 (binding = plafon_diajukan)', () => {
     const res = recommendNominal({
          ebit: 1_200_000_000,
          bebanBungaLain: 50_000_000,
          dscrTarget: 1.30,
          bungaTahunan: 0.14,
          tenorBulan: 36,
          nilaiAgunan: 1_500_000_000,
          ltvMax: 0.80,
          plafonDiajukan: 1_000_000_000,
          rounding: 50_000_000,
          rangeWidth: 0.05
     });

     assert.equal(res.recommended_nominal, 1_000_000_000);
     assert.deepEqual(res.range_narrow, [950_000_000, 1_050_000_000]);
     assert.equal(res.binding_constraint, 'plafon_diajukan');
     assert.equal(res.dscr_target, 1.30);
     assert.ok(res.dscr_at_recommended > 2.60 && res.dscr_at_recommended < 2.61);
     assert.equal(res.capacity.requested, 1_000_000_000);
     assert.ok(res.capacity.dscr_based > res.capacity.requested); // kapasitas > plafon
     assert.ok(res.capacity.ltv_based === 1_200_000_000);
});

test('nominal: binding = kapasitas_dscr bila kapasitas paling kecil', () => {
     const res = recommendNominal({
          ebit: 300_000_000,
          bebanBungaLain: 0,
          dscrTarget: 1.30,
          bungaTahunan: 0.14,
          tenorBulan: 24,
          nilaiAgunan: 10_000_000_000,
          ltvMax: 0.8,
          plafonDiajukan: 10_000_000_000,
          rounding: 50_000_000
     });
     assert.equal(res.binding_constraint, 'kapasitas_dscr');
     assert.ok(res.recommended_nominal > 0);
     assert.ok(res.recommended_nominal % 50_000_000 === 0);
});

test('nominal: pembulatan ke bawah Rp 50 juta', () => {
     const res = recommendNominal({
          ebit: 2_000_000_000,
          bebanBungaLain: 0,
          dscrTarget: 1.30,
          bungaTahunan: 0.12,
          tenorBulan: 12,
          nilaiAgunan: 1_000_000_000,
          ltvMax: 0.8,
          plafonDiajukan: 1_000_000_000,
          rounding: 50_000_000
     });
     assert.equal(res.recommended_nominal % 50_000_000, 0);
     assert.equal(res.binding_constraint, 'nilai_agunan'); // 800jt < kapasitas & plafon
});
