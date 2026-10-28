/**
 * tests/covenant.test.js — Generator & pemeriksa covenant otomatis (W5b).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCovenants, checkCovenants } from '../../src/core/covenant.js';
import { DEFAULT_CONFIG, resolveConfig } from '../../src/core/config.js';

const LAYAK_BERSYARAT = { decision: 'LAYAK_BERSYARAT' };

test('covenant: hanya aktif untuk LAYAK BERSYARAT (default)', () => {
     const besyarat = generateCovenants({ analysis: LAYAK_BERSYARAT });
     assert.equal(besyarat.applicable, true);
     assert.equal(besyarat.decision, 'LAYAK_BERSYARAT');
     assert.match(besyarat.summary, /17 covenant disusun \(7 maintenance, 2 reporting, 3 affirmative, 5 negative\)/);

     const layak = generateCovenants({ analysis: { decision: 'LAYAK' } });
     assert.equal(layak.applicable, false);
     assert.match(layak.summary, /LAYAK BERSYARAT/);

     const review = generateCovenants({ analysis: { decision: 'REVIEW' } });
     assert.equal(review.applicable, false, 'REVIEW tidak diaktifkan secara default');
});

test('covenant: includeForReview=true mengaktifkan covenant untuk REVIEW', () => {
     const cfg = resolveConfig({ covenant: { includeForReview: true } });
     const res = generateCovenants({ analysis: { decision: 'REVIEW' }, config: cfg });
     assert.equal(res.applicable, true);
});

test('covenant: daftar berisi 4 kategori dengan kode unik', () => {
     const res = generateCovenants({ analysis: LAYAK_BERSYARAT });
     assert.deepEqual(res.categories, { maintenance: 7, reporting: 2, affirmative: 3, negative: 5 });
     assert.equal(res.covenants.length, 17);
     assert.ok(res.breach_consequences.some((c) => /mempercepat jatuh tempo/.test(c)));

     const codes = res.covenants.map((c) => c.code);
     assert.equal(new Set(codes).size, codes.length, 'kode covenant harus unik');

     const maintenance = res.covenants.filter((c) => c.category === 'maintenance').map((c) => c.code);
     assert.deepEqual(maintenance, ['DSCR_MIN', 'DER_MAX', 'LTV_MAX', 'ICR_MIN', 'CURRENT_RATIO_MIN', 'OCF_POSITIF', 'AGING_PIUTANG_MAX']);
     assert.ok(codes.includes('NEG_DIVIDEN'));
     assert.ok(codes.includes('LAPORAN_BULANAN'));
});

test('covenant: ambang mengikuti konfigurasi efektif per profil', () => {
     const cfg = resolveConfig(DEFAULT_CONFIG, { profileKey: 'startup' });
     const res = generateCovenants({ analysis: LAYAK_BERSYARAT, config: cfg });

     const byCode = Object.fromEntries(res.covenants.map((c) => [c.code, c]));
     assert.equal(byCode.DSCR_MIN.threshold, 1.25);
     assert.equal(byCode.DER_MAX.threshold, 2.5);
     assert.equal(byCode.LAPORAN_BULANAN.withinDays, 10);
});

test('covenant: checkCovenants compliant bila semua metrik memenuhi', () => {
     const { covenants } = generateCovenants({ analysis: LAYAK_BERSYARAT });
     const res = checkCovenants({
          covenants,
          metrics: { dscr: 1.5, der: 2.0, ltv: 0.7, icr: 3, current_ratio: 1.4, ocf: 100_000_000, aging_piutang_hari: 30 }
     });

     assert.equal(res.status, 'compliant');
     assert.equal(res.breaches, 0);
     assert.equal(res.minors, 0);
     assert.equal(res.ews_p20, 'compliant');
     assert.equal(res.checked, 7);
     assert.ok(res.results.find((r) => r.code === 'LAPORAN_BULANAN').status === 'n/a');
     assert.ok(res.results.find((r) => r.code === 'NEG_AGUNAN').status === 'n/a');
});

test('covenant: warning (dalam toleransi) → status minor', () => {
     const { covenants } = generateCovenants({ analysis: LAYAK_BERSYARAT });
     const res = checkCovenants({
          covenants,
          metrics: { dscr: 1.1, der: 2.0, ltv: 0.7, ocf: 100_000_000, aging_piutang_hari: 30 }
     });
     // dscr 1.10 < 1.15 tapi ≥ 1.035 (toleransi 10%) → warning
     assert.equal(res.minors, 1);
     assert.equal(res.breaches, 0);
     assert.equal(res.status, 'minor');
     assert.equal(res.ews_p20, 'minor');
     const dscr = res.results.find((r) => r.code === 'DSCR_MIN');
     assert.equal(dscr.status, 'warning');
});

test('covenant: pelanggaran di luar toleransi → status material', () => {
     const { covenants } = generateCovenants({ analysis: LAYAK_BERSYARAT });
     const res = checkCovenants({
          covenants,
          metrics: { dscr: 0.9, der: 2.0, ltv: 0.7, ocf: 100_000_000, aging_piutang_hari: 30 }
     });
     assert.equal(res.breaches, 1);
     assert.equal(res.status, 'material');
     assert.equal(res.ews_p20, 'material');
     assert.equal(res.results.find((r) => r.code === 'DSCR_MIN').status, 'breach');
});

test('covenant: OCF negatif & LTV jebol memicu pelanggaran', () => {
     const { covenants } = generateCovenants({ analysis: LAYAK_BERSYARAT });
     const res = checkCovenants({
          covenants,
          metrics: { dscr: 1.5, der: 2.0, ltv: 0.95, ocf: -10_000_000, aging_piutang_hari: 30 }
     });
     const ocf = res.results.find((r) => r.code === 'OCF_POSITIF');
     const ltv = res.results.find((r) => r.code === 'LTV_MAX');
     assert.equal(ocf.status, 'breach', 'OCF negatif langsung breach');
     assert.equal(ltv.status, 'breach', '0,95 > 0,88 batas toleransi');
     assert.equal(res.status, 'material');
});

test('covenant: metrik kosong → unknown, tidak dianggap pelanggaran', () => {
     const { covenants } = generateCovenants({ analysis: LAYAK_BERSYARAT });
     const res = checkCovenants({ covenants, metrics: {} });
     assert.equal(res.breaches, 0);
     assert.equal(res.minors, 0);
     assert.equal(res.status, 'compliant');
     assert.equal(res.checked, 7);
     assert.ok(res.results.filter((r) => r.status === 'unknown').length === 7);
});

test('covenant: asuransi agunan hanya untuk agunan fisik', () => {
     const fisik = generateCovenants({ analysis: LAYAK_BERSYARAT, borrower: { agunan: { jenis: 'tanah_bangunan', nilai_agunan: 1e9 } } });
     assert.ok(fisik.covenants.some((c) => c.code === 'AFF_ASURANSI'));
     const deposito = generateCovenants({ analysis: LAYAK_BERSYARAT, borrower: { agunan: { jenis: 'deposito', nilai_agunan: 1e9 } } });
     assert.ok(!deposito.covenants.some((c) => c.code === 'AFF_ASURANSI'));
     assert.equal(fisik.covenants.find((c) => c.code === 'LAPORAN_AUDITED').withinDays, 120);
});
