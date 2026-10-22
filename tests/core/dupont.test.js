/**
 * tests/dupont.test.js — DuPont 5-komponen (ARCHITECTURE §3.2).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dupont } from '../../src/core/ratios.js';
import { runFullAnalysis, emptyBorrower } from '../../src/core/engine.js';

const fin = {
     penjualan: 6_000_000_000,
     ebit: 400_000_000,
     beban_bunga: 80_000_000,
     laba_bersih: 200_000_000,
     total_aset: 5_000_000_000,
     ekuitas: 3_000_000_000
};

test('dupont: 5 komponen terhitung benar', () => {
     const d = dupont(fin);
     assert.equal(d.ebt, 320_000_000);
     assert.ok(Math.abs(d.tax_burden - 0.625) < 1e-9);
     assert.ok(Math.abs(d.interest_burden - 0.8) < 1e-9);
     assert.ok(Math.abs(d.operating_margin - 400 / 6000) < 1e-9);
     assert.ok(Math.abs(d.asset_turnover - 1.2) < 1e-9);
     assert.ok(Math.abs(d.equity_multiplier - 5 / 3) < 1e-9);
});

test('dupont: produk komponen = ROE (rekonsiliasi)', () => {
     const d = dupont(fin);
     assert.ok(Math.abs(d.computed_roe - d.roe) < 1e-9);
     assert.ok(Math.abs(d.reconciliation_gap) < 1e-9);
});

test('dupont: ekuitas 0 → komponen leverage/ROE null (bukan Infinity)', () => {
     const d = dupont({ ...fin, ekuitas: 0 });
     assert.equal(d.equity_multiplier, null);
     assert.equal(d.roe, null);
     assert.equal(d.computed_roe, null);
     assert.equal(d.reconciliation_gap, null);
});

test('dupont: EBIT − bunga ≤ 0 → tax/interest burden null & computed null', () => {
     const d = dupont({ ...fin, ebit: 50_000_000, beban_bunga: 80_000_000 });
     assert.ok(d.ebt < 0);
     assert.equal(d.tax_burden, null);
     assert.equal(d.interest_burden, null);
     assert.equal(d.computed_roe, null);
});

test('engine: hasil analisis mengekspos DuPont (top-level & ratios.dupont)', () => {
     const b = emptyBorrower();
     Object.assign(b, { nama: 'PT DuPont', sektor: 'IDX-CONSUMER-NON-CYCLICALS', profil_company: 'ukm_mapan', plafon_diajukan: 1_000_000_000, tenor_bulan: 36, bunga_tahunan: 0.14 });
     b.keuangan = { ...b.keuangan, ...fin, hpp: 4_200_000_000, aset_lancar: 2_000_000_000, liabilitas_jangka_pendek: 1_000_000_000, total_liabilitas: 2_000_000_000, kas: 500_000_000, piutang: 700_000_000, persediaan: 800_000_000, arus_kas_operasional: 500_000_000 };
     const res = runFullAnalysis(b);
     assert.ok(res.dupont);
     assert.ok(Math.abs(res.dupont.computed_roe - res.ratios.roe) < 1e-9);
     assert.equal(res.dupont.equity_multiplier, res.ratios.dupont.equity_multiplier);
});
