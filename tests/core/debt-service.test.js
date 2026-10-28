/**
 * tests/debt-service.test.js — Skema angsuran, utang eksisting, DSCR/DTI/ICR riil.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
     installmentFor,
     existingDebtService,
     computeDebtService,
     realDscr,
     INSTALLMENT_SCHEMES,
     SCHEME_LABELS
} from '../../src/core/debt-service.js';

/** Toleransi relatif + absolut kecil (aman untuk besaran rupiah float64). */
function closeTo(actual, expected, relTol = 1e-6, msg = '') {
     const tol = Math.abs(expected) * relTol + 1e-6;
     assert.ok(
          Math.abs(actual - expected) <= tol,
          `${msg} — diharapkan ≈ ${expected}, diperoleh ${actual} (tol ${tol})`
     );
}

test('debt-service: skema anuitas — cicilan tetap & pokok terlunasi penuh', () => {
     const r = installmentFor('annuity', 120_000_000, 0.12, 12);
     assert.equal(r.scheme, 'annuity');
     assert.equal(r.schedule.length, 12);
     closeTo(r.schedule[0].payment, r.schedule[11].payment, 1e-6, 'anuitas harus rata');
     const pokok = r.schedule.reduce((s, x) => s + x.principal, 0);
     closeTo(pokok, 120_000_000, 1e-6, 'pokok harus terlunasi penuh');
     closeTo(r.total_payment, r.schedule[0].payment * 12, 1e-6, 'total = 12 × cicilan');
     assert.ok(r.total_interest > 0);
     assert.equal(r.balloon, 0);
});

test('debt-service: skema flat — bunga tetap atas pokok awal', () => {
     const r = installmentFor('flat', 120_000_000, 0.12, 12);
     closeTo(r.schedule[0].interest, 1_200_000, 1e-9, 'bunga bulan 1');
     closeTo(r.schedule[5].interest, 1_200_000, 1e-9, 'bunga bulan 6 tetap');
     closeTo(r.total_interest, 14_400_000, 1e-9, 'total bunga flat');
     closeTo(r.schedule[0].principal, 10_000_000, 1e-9, 'pokok per bulan rata');
});

test('debt-service: skema bullet — bunga saja + balloon di akhir', () => {
     const r = installmentFor('bullet', 100_000_000, 0.12, 12);
     assert.equal(r.balloon, 100_000_000);
     assert.equal(r.schedule[0].principal, 0);
     assert.equal(r.schedule[10].principal, 0);
     assert.equal(r.schedule[11].principal, 100_000_000);
     closeTo(r.schedule[0].interest, 1_000_000, 1e-9, 'bunga bullet bulan 1');
     assert.ok(r.schedule[11].payment > r.schedule[0].payment);
});

test('debt-service: skema musiman memuncak di bulan ramai & tetap melunasi pokok', () => {
     const r = installmentFor('musiman', 120_000_000, 0.12, 24, {
          peakMonths: [3, 4, 5, 9, 10],
          seasonalityFactor: 1.15
     });
     assert.equal(r.schedule.length, 24);
     assert.ok(r.peak_payment > r.first_payment, 'puncak harus > cicilan bulan biasa');
     assert.equal(r.seasonality_factor, 1.15);
     const pokok = r.schedule.reduce((s, x) => s + x.principal, 0);
     closeTo(pokok, 120_000_000, 1e-6, 'pokok musiman tetap terlunasi');
});

test('debt-service: grace period menunda pokok (interest-only)', () => {
     const r = installmentFor('annuity', 120_000_000, 0.12, 24, { graceMonths: 6 });
     assert.equal(r.grace_bulan, 6);
     for (let i = 0; i < 6; i += 1) {
          assert.equal(r.schedule[i].principal, 0, `bulan ${i + 1} harus interest-only`);
     }
     assert.ok(r.schedule[6].principal > 0, 'pokok mulai dibayar setelah grace');
});

test('debt-service: pokok 0 / tenor 0 menghasilkan jadwal kosong', () => {
     const r = installmentFor('annuity', 0, 0.12, 12);
     assert.deepEqual(r.schedule, []);
     assert.equal(r.monthly_avg, 0);
     assert.equal(r.total_payment, 0);
     assert.equal(r.first_payment, 0);
});

test('debt-service: label tersedia untuk setiap skema', () => {
     assert.deepEqual(INSTALLMENT_SCHEMES, ['annuity', 'flat', 'bullet', 'musiman']);
     for (const scheme of INSTALLMENT_SCHEMES) {
          assert.ok(SCHEME_LABELS[scheme], `label ${scheme} harus ada`);
     }
});

test('debt-service: utang eksisting memakai angsuran bila diberikan', () => {
     const r = existingDebtService({ nama: 'KUR', outstanding: 50_000_000, angsuran_bulanan: 5_000_000 });
     assert.equal(r.nama, 'KUR');
     assert.equal(r.monthly_payment, 5_000_000);
     assert.equal(r.annual, 60_000_000);
     assert.equal(r.source, 'angsuran_diberikan');
});

test('debt-service: utang eksisting dihitung dari sisa pokok bila angsuran kosong', () => {
     const r = existingDebtService({
          outstanding: 60_000_000,
          bunga_tahunan: 0.12,
          tenor_bulan_sisa: 12,
          skema: 'annuity'
     });
     assert.equal(r.source, 'dihitung_dari_sisa_pokok');
     assert.ok(r.monthly_payment > 5_000_000 && r.monthly_payment < 6_500_000);
     assert.ok(r.annual > 0);
});

test('debt-service: alias usang `tenor_sisa_bulan` tetap dihitung (backward-compat)', () => {
     const r = existingDebtService({
          outstanding: 60_000_000,
          bunga_tahunan: 0.12,
          tenor_sisa_bulan: 12,
          skema: 'annuity'
     });
     assert.equal(r.source, 'dihitung_dari_sisa_pokok');
     assert.ok(r.annual > 0, 'alias usang harus dihitung, bukan diabaikan');
});

test('debt-service: computeDebtService menggabungkan kredit baru + utang eksisting', () => {
     const borrower = {
          plafon_diajukan: 100_000_000,
          tenor_bulan: 24,
          bunga_tahunan: 0.12,
          skema_angsuran: 'annuity',
          utang_eksisting: [
               { nama: 'KUR', outstanding: 50_000_000, angsuran_bulanan: 5_000_000 },
               { nama: 'Leasing', outstanding: 30_000_000, angsuran_bulanan: 2_500_000 }
          ]
     };
     const ds = computeDebtService({ borrower });
     assert.equal(ds.scheme, 'annuity');
     assert.equal(ds.existing_count, 2);
     assert.equal(ds.existing_monthly, 7_500_000);
     assert.equal(ds.existing_annual, 90_000_000);
     closeTo(ds.total_annual, ds.new_loan.annual + 90_000_000, 1e-9, 'total DS tahunan');
     closeTo(ds.peak_monthly, ds.new_loan.peak_payment + 7_500_000, 1e-9, 'puncak bulanan');
     assert.equal(ds.schedule_combined.length, 24);
     closeTo(
          ds.schedule_combined[0].payment,
          ds.new_loan.schedule[0].payment + 7_500_000,
          1e-9,
          'angsuran gabungan bulan 1'
     );
});

test('debt-service: overrides mengubah skema/plafon tanpa memutasi borrower', () => {
     const borrower = { plafon_diajukan: 100_000_000, tenor_bulan: 24, bunga_tahunan: 0.12 };
     const ds = computeDebtService({
          borrower,
          overrides: { scheme: 'bullet', plafon: 200_000_000 }
     });
     assert.equal(ds.scheme, 'bullet');
     assert.equal(ds.scheme_label, SCHEME_LABELS.bullet);
     assert.equal(ds.new_loan.principal, 200_000_000);
     assert.equal(ds.new_loan.balloon, 200_000_000);
     assert.equal(ds.existing_count, 0);
     assert.equal(borrower.plafon_diajukan, 100_000_000, 'borrower tidak boleh dimutasi');
});

test('debt-service: realDscr memakai OCF → EBITDA → EBIT sesuai basis config', () => {
     const ocf = realDscr({
          ocf: 700_000_000,
          ebitda: 900_000_000,
          ebit: 800_000_000,
          penjualan: 5_000_000_000,
          debtService: { total_annual: 140_000_000, total_interest_year1: 20_000_000 }
     });
     assert.equal(ocf.basis, 'ocf');
     closeTo(ocf.dscr_real, 5, 1e-9, 'DSCR berbasis OCF');
     assert.equal(ocf.numerator, 700_000_000);

     const ebitda = realDscr({
          ocf: 0,
          ebitda: 900_000_000,
          ebit: 800_000_000,
          debtService: { total_annual: 300_000_000 }
     });
     assert.equal(ebitda.basis, 'ebitda');
     closeTo(ebitda.dscr_real, 3, 1e-9, 'DSCR berbasis EBITDA');

     const ebitOnly = realDscr({
          ocf: null,
          ebitda: null,
          ebit: 600_000_000,
          debtService: { total_annual: 300_000_000 }
     });
     assert.equal(ebitOnly.basis, 'ebit');
     closeTo(ebitOnly.dscr_real, 2, 1e-9, 'DSCR berbasis EBIT');
});

test('debt-service: realDscr mengembalikan null bila tidak ada data sumber', () => {
     const r = realDscr({});
     assert.equal(r.basis, null);
     assert.equal(r.dscr_real, null);
     assert.equal(r.annual_debt_service, 0);
});

test('debt-service: realDscr menghitung DTI, ICR, dan ds_ratio', () => {
     const r = realDscr({
          ocf: 700_000_000,
          ebit: 800_000_000,
          penjualan: 4_000_000_000,
          debtService: { total_annual: 200_000_000, total_interest_year1: 40_000_000 }
     });
     closeTo(r.dti_real, 0.05, 1e-9, 'DTI');
     closeTo(r.icr_real, 20, 1e-9, 'ICR');
     closeTo(r.ds_ratio, 200 / 700, 1e-9, 'DS ratio');
});
