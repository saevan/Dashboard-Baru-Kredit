/**
 * tests/ratios.test.js — Rasio keuangan + Altman Z + guard pembagi 0.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { safeDiv, altmanZ, altmanZone, computeRatios, annuityPayment } from '../../src/core/ratios.js';

test('safeDiv: pembagi 0 / non-angka → null (bukan Infinity)', () => {
     assert.equal(safeDiv(1, 0), null);
     assert.equal(safeDiv(1, 'x'), null);
     assert.equal(safeDiv(10, 2), 5);
});

test('annuityPayment: r=0 → principal/n', () => {
     assert.equal(annuityPayment(1_200_000, 0, 12), 100_000);
});

test('altmanZ: X1..X5 terhitung', () => {
     const z = altmanZ({
          total_aset: 4_000_000_000,
          aset_lancar: 1_500_000_000,
          liabilitas_jangka_pendek: 1_034_000_000,
          ebit: 1_200_000_000,
          ekuitas: 2_466_000_000,
          total_liabilitas: 1_534_000_000,
          penjualan: 5_000_000_000,
          laba_bersih: 600_000_000
     });
     assert.ok(Number.isFinite(z));
     assert.ok(z > 0);
});

test('altmanZone: klasifikasi safe/gray/distress', () => {
     assert.equal(altmanZone(3.5), 'safe');
     assert.equal(altmanZone(2.2), 'gray');
     assert.equal(altmanZone(1.2), 'distress');
     assert.equal(altmanZone(null), null);
});

test('computeRatios: DSCR dengan pokok + bunga', () => {
     const r = computeRatios(
          { ebit: 1_200_000_000, beban_bunga: 90_000_000, total_aset: 4e9, ekuitas: 2.4e9, total_liabilitas: 1.6e9 },
          { plafon: 1_000_000_000, tenorBulan: 36, bungaTahunan: 0.14, nilaiAgunan: 1_500_000_000 }
     );
     // pokok tahunan = 1e9*12/36 = 333.33jt
     const expected = 1_200_000_000 / (90_000_000 + 1_000_000_000 * 12 / 36);
     assert.ok(Math.abs(r.dscr - expected) < 1e-6, `dscr=${r.dscr}`);
     assert.ok(Number.isFinite(r.icr));
});

test('computeRatios: ekuitas 0 → der null (tidak Infinity)', () => {
     const r = computeRatios({ ebit: 1e9, ekuitas: 0, total_liabilitas: 1e9, total_aset: 1e9 });
     assert.equal(r.der, null);
});

test('computeRatios: kasus bangkrut → dscr negatif terdeteksi', () => {
     const r = computeRatios(
          { ebit: -100_000_000, total_aset: 1e9, ekuitas: 1e9 },
          { plafon: 1e9, tenorBulan: 36, bungaTahunan: 0.14 }
     );
     assert.ok(r.dscr !== null && r.dscr < 0);
});
