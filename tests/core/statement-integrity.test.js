/**
 * tests/statement-integrity.test.js — Validasi integritas laporan keuangan.
 *
 * Masukan stakeholder: "tambahin fitur, kalau ada laporan keuangannya ga beres,
 * misalnya ga balance".
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
     checkStatementIntegrity,
     INTEGRITY_SEVERITY,
     INTEGRITY_TOLERANCE_PCT
} from '../../src/core/statement-integrity.js';
import { runFullAnalysis, emptyBorrower } from '../../src/core/engine.js';

const balanced = {
     total_aset: 5_000_000_000,
     aset_lancar: 2_000_000_000,
     kas: 500_000_000,
     piutang: 700_000_000,
     persediaan: 800_000_000,
     liabilitas_jangka_pendek: 1_000_000_000,
     total_liabilitas: 2_000_000_000,
     ekuitas: 3_000_000_000,
     penjualan: 6_000_000_000
};

test('integrity: neraca seimbang → status ok & is_balanced true', () => {
     const res = checkStatementIntegrity(balanced);
     assert.equal(res.status, 'ok');
     assert.equal(res.is_balanced, true);
     assert.equal(res.balanced, true);
     assert.equal(res.difference, 0);
     assert.equal(res.totals.liabilities_plus_equity, 5_000_000_000);
     assert.equal(res.issues.length, 0);
});

test('integrity: neraca tidak seimbang → critical, status invalid', () => {
     const res = checkStatementIntegrity({ ...balanced, total_aset: 6_000_000_000 });
     assert.equal(res.status, 'invalid');
     assert.equal(res.is_balanced, false);
     // aset 6M vs liab+eq 5M → selisih 1M (≈16.7%)
     assert.equal(res.difference, 1_000_000_000);
     const issue = res.issues.find((i) => i.code === 'not_balanced');
     assert.ok(issue, 'harus ada temuan not_balanced');
     assert.equal(issue.severity, INTEGRITY_SEVERITY.CRITICAL);
     assert.match(res.summary, /TIDAK SEIMBANG/i);
});

test('integrity: selisih kecil di bawah toleransi tetap ok', () => {
     // selisih 10 juta (0,2%) ≤ toleransi default 1% dari 5 M (50 juta)
     const res = checkStatementIntegrity({ ...balanced, ekuitas: 2_990_000_000 });
     assert.equal(res.status, 'ok');
     assert.equal(res.is_balanced, true);
     assert.ok(Math.abs(res.difference) <= res.tolerance_amount);
     assert.equal(res.tolerance_pct, INTEGRITY_TOLERANCE_PCT);
});

test('integrity: toleransi bisa dikonfigurasi', () => {
     const f = { ...balanced, ekuitas: 2_900_000_000 }; // selisih 100jt (2%)
     assert.equal(checkStatementIntegrity(f, { tolerancePct: 1 }).status, 'invalid');
     assert.equal(checkStatementIntegrity(f, { tolerancePct: 5 }).status, 'ok');
});

test('integrity: data inti belum lengkap → insufficient', () => {
     const res = checkStatementIntegrity({ total_aset: 1_000_000_000 });
     assert.equal(res.status, 'insufficient');
     assert.equal(res.is_balanced, null);
     assert.ok(res.issues.some((i) => i.code === 'incomplete'));
});

test('integrity: aset lancar melebihi total aset → critical', () => {
     const res = checkStatementIntegrity({
          total_aset: 1_000_000_000,
          aset_lancar: 2_000_000_000,
          total_liabilitas: 0,
          ekuitas: 1_000_000_000
     });
     assert.equal(res.status, 'invalid');
     assert.ok(res.issues.some((i) => i.code === 'current_assets_exceed_total'));
});

test('integrity: komponen aset lancar melebihi aset lancar → warning', () => {
     const res = checkStatementIntegrity({
          ...balanced,
          aset_lancar: 1_000_000_000,
          kas: 300_000_000,
          piutang: 300_000_000,
          persediaan: 500_000_000 // total 1.1M > 1.0M aset lancar
     });
     assert.equal(res.status, 'warning');
     assert.ok(res.issues.some((i) => i.code === 'asset_parts_exceed_current'));
});

test('integrity: nilai ekuitas negatif → warning', () => {
     const res = checkStatementIntegrity({
          total_aset: 1_000_000_000,
          total_liabilitas: 2_000_000_000,
          ekuitas: -1_000_000_000
     });
     assert.notEqual(res.status, 'ok');
     assert.ok(res.issues.some((i) => i.code === 'negative_ekuitas'));
});

test('integrity: engine melampirkan hasil pemeriksaan', () => {
     const b = emptyBorrower();
     Object.assign(b.keuangan, balanced);
     b.plafon_diajukan = 500_000_000;
     b.tenor_bulan = 36;
     const r = runFullAnalysis(b);
     assert.ok(r.integrity, 'blok integrity tersedia');
     assert.equal(r.integrity.status, 'ok');
     assert.equal(r.meta.integrity_status, 'ok');
});
