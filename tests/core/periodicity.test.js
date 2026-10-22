/**
 * tests/periodicity.test.js — Periodisitas cicilan (bulanan/mingguan/harian).
 *
 * Menguji: daftar & label kanonik, normalisasi, saran otomatis per segmen,
 * konversi ekuivalen bulanan, serta resolusi periodisitas di computeDebtService
 * (eksplisit, otomatis dari segmen, default, dan override).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
     PERIODICITIES,
     PERIODICITY_LABELS,
     PERIODS_PER_YEAR,
     PERIODS_PER_MONTH,
     normalizePeriodicity,
     suggestPeriodicity,
     periodicInstallment,
     computeDebtService
} from '../../src/core/debt-service.js';
import { classifyBorrower } from '../../src/core/segment.js';

function closeTo(actual, expected, relTol = 1e-9, msg = '') {
     const tol = Math.abs(expected) * relTol + 1e-6;
     assert.ok(Math.abs(actual - expected) <= tol, `${msg} — diharapkan ≈ ${expected}, diperoleh ${actual}`);
}

const BASE = {
     tenor_bulan: 12,
     bunga_tahunan: 0.12,
     skema_angsuran: 'annuity',
     utang_eksisting: []
};

test('periodicity: daftar, label, dan konvensi periode kanonik', () => {
     assert.deepEqual(PERIODICITIES, ['bulanan', 'mingguan', 'harian']);
     assert.equal(PERIODICITY_LABELS.bulanan, 'Bulanan');
     assert.equal(PERIODICITY_LABELS.mingguan, 'Mingguan');
     assert.equal(PERIODICITY_LABELS.harian, 'Harian');
     assert.equal(PERIODS_PER_YEAR.bulanan, 12);
     assert.equal(PERIODS_PER_YEAR.mingguan, 52);
     assert.equal(PERIODS_PER_YEAR.harian, 360);
     assert.equal(PERIODS_PER_MONTH.bulanan, 1);
     assert.equal(PERIODS_PER_MONTH.harian, 30);
     closeTo(PERIODS_PER_MONTH.mingguan, 52 / 12, 1e-12, 'periode minggu per bulan');
});

test('periodicity: normalizePeriodicity fallback bulanan', () => {
     assert.equal(normalizePeriodicity('HARIAN'), 'harian');
     assert.equal(normalizePeriodicity(' Mingguan '), 'mingguan');
     assert.equal(normalizePeriodicity(''), 'bulanan');
     assert.equal(normalizePeriodicity(null), 'bulanan');
     assert.equal(normalizePeriodicity(undefined), 'bulanan');
     assert.equal(normalizePeriodicity('tahunan'), 'bulanan');
});

test('periodicity: suggestPeriodicity → harian untuk UMKM mikro/kecil', () => {
     assert.equal(suggestPeriodicity('umkm_mikro'), 'harian');
     assert.equal(suggestPeriodicity('umkm_kecil'), 'harian');
     assert.equal(suggestPeriodicity('umkm_menengah'), 'bulanan');
     assert.equal(suggestPeriodicity('corporate'), 'bulanan');
     assert.equal(suggestPeriodicity(''), 'bulanan');
});

test('periodicity: periodicInstallment mengonversi angsuran bulanan', () => {
     const h = periodicInstallment({ monthlyPayment: 3_000_000, periodicity: 'harian', tenorBulan: 12 });
     assert.equal(h.periodicity, 'harian');
     assert.equal(h.periods_per_month, 30);
     assert.equal(h.periods_per_year, 360);
     closeTo(h.per_period, 100_000, 1e-9, 'angsuran harian = bulanan / 30');
     closeTo(h.monthly_equivalent, 3_000_000, 1e-9, 'ekuivalen bulanan tidak berubah');
     assert.equal(h.tenor_period, 360, '12 bulan × 30 = 360 periode');

     const w = periodicInstallment({ monthlyPayment: 2_600_000, periodicity: 'mingguan', tenorBulan: 12 });
     closeTo(w.per_period, 600_000, 1e-9, 'angsuran mingguan = bulanan × 12/52');
     assert.equal(w.tenor_period, 52);

     const b = periodicInstallment({ monthlyPayment: 2_000_000, periodicity: 'bulanan', tenorBulan: 12 });
     closeTo(b.per_period, 2_000_000, 1e-9, 'bulanan → per_period = bulanan');
     assert.equal(b.tenor_period, 12);
});

test('periodicity: computeDebtService — eksplisit harian terpasang di hasil', () => {
     const ds = computeDebtService({ borrower: { ...BASE, plafon_diajukan: 30_000_000, periode_angsuran: 'harian' } });
     assert.equal(ds.periode_angsuran, 'harian');
     assert.equal(ds.periodicity_label, 'Harian');
     assert.equal(ds.periodic.periodicity, 'harian');
     assert.equal(ds.periodic.periods_per_month, 30);
});

test('periodicity: computeDebtService — kosong = otomatis mengikuti segmen', () => {
     const mikro = { ...BASE, plafon_diajukan: 20_000_000, periode_angsuran: '' };
     assert.equal(classifyBorrower(mikro).key, 'umkm_mikro');
     assert.equal(computeDebtService({ borrower: mikro }).periode_angsuran, 'harian');

     const korp = { ...BASE, tenor_bulan: 24, plafon_diajukan: 8_000_000_000, periode_angsuran: '' };
     assert.equal(classifyBorrower(korp).key, 'corporate');
     assert.equal(computeDebtService({ borrower: korp }).periode_angsuran, 'bulanan');
});

test('periodicity: computeDebtService — undefined → default bulanan (kompatibel uji lama)', () => {
     const b = { ...BASE, tenor_bulan: 36, bunga_tahunan: 0.14, plafon_diajukan: 1_000_000_000 };
     assert.equal(computeDebtService({ borrower: b }).periode_angsuran, 'bulanan');
});

test('periodicity: overrides.periodicity menang atas nilai borrower', () => {
     const b = { ...BASE, plafon_diajukan: 1_000_000_000, periode_angsuran: 'bulanan' };
     const ds = computeDebtService({ borrower: b, overrides: { periodicity: 'mingguan' } });
     assert.equal(ds.periode_angsuran, 'mingguan');
     assert.equal(ds.periodicity_label, 'Mingguan');
});
