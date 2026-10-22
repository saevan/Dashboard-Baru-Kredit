import test from 'node:test';
import assert from 'node:assert/strict';

import {
     createLoan,
     makeOffer,
     acceptOffer,
     declineOffer,
     requestFix,
     resubmit,
     verifyDocument,
     borrowerTimeline,
     rejectLoan,
     toggleCondition,
     conditionsView,
     disburseLoan,
     drawRemaining,
     addMonitoring,
     monitoringParams,
     monitoringView,
     plainSignal,
     restructuringView,
     applyRestructuring,
     loanCard,
     portfolioView
} from '../src/simple/loans.js';
import { demoBuSari, demoPakDarto, demoDocuments } from '../src/simple/demo.js';
import { confidenceView, gateView } from '../src/simple/intake.js';
import { analyzeLoan } from '../src/simple/loans.js';

const NOW = new Date('2026-10-01T00:00:00Z');

const submitSari = () => createLoan({ borrower: demoBuSari(), documents: demoDocuments(), consent: true, now: NOW });

function approvedSari(amount = 380_000_000, periodicity = 'bulanan') {
     const offered = makeOffer(submitSari(), { amount, tenor: 36, rate: 0.14, periodicity, now: NOW });
     return acceptOffer(offered, { now: NOW });
}

test('pengajuan baru: wajib persetujuan; kartu petugas berisi ringkasan mesin', () => {
     assert.throws(() => createLoan({ borrower: demoBuSari(), consent: false }), /persetujuan/);
     const loan = submitSari();
     assert.equal(loan.status, 'diajukan');
     const card = loanCard(loan);
     assert.equal(card.headline, 'Pengajuan baru');
     assert.match(card.sentence, /perlu ditinjau \(idAA\)\. Saran Rp 380 jt/);
     assert.deepEqual(borrowerTimeline('diajukan').map((s) => s.state), ['done', 'current', 'todo', 'todo', 'todo']);
});

test('perbaikan: petugas minta, pemohon kirim ulang; berkas diganti = verifikasi hilang', () => {
     let loan = verifyDocument(submitSari(), 'identitas', true, NOW);
     assert.throws(() => requestFix(loan, { note: ' ' }), /Tulis/);
     loan = requestFix(loan, { note: 'Lampirkan rekening koran 6 bulan', now: NOW });
     assert.equal(loan.status, 'perbaikan');
     assert.equal(loanCard(loan).sentence, 'Diminta: Lampirkan rekening koran 6 bulan');
     const docs = loan.documents.map((d) => (d.key === 'rekening_koran' ? { ...d, sha256: 'baru' } : d));
     loan = resubmit(loan, { documents: docs, now: NOW });
     assert.equal(loan.status, 'diajukan');
     assert.equal(loan.documents.find((d) => d.key === 'identitas').verified, true);
     assert.equal(loan.documents.find((d) => d.key === 'rekening_koran').verified, false);
});

test('penawaran: cicilan harian/mingguan/bulanan dari mesin; pemohon menerima atau menolak', () => {
     const harian = makeOffer(submitSari(), { amount: 380_000_000, tenor: 36, rate: 0.14, periodicity: 'harian', now: NOW });
     assert.equal(harian.status, 'ditawarkan');
     assert.equal(harian.offer.periodicity, 'harian');
     assert.equal(harian.offer.periods, 1080);
     assert.ok(Math.abs(harian.offer.per_period * 1080 - harian.offer.monthly * 36) < 50);
     const mingguan = makeOffer(submitSari(), { amount: 380_000_000, tenor: 36, rate: 0.14, periodicity: 'mingguan', now: NOW });
     assert.equal(mingguan.offer.periods, 156);
     assert.equal(mingguan.offer.decision, 'LAYAK');
     assert.throws(() => makeOffer(submitSari(), { amount: 0, tenor: 36, rate: 0.14 }));
     assert.equal(acceptOffer(harian).status, 'diterima');
     assert.equal(declineOffer(harian, { reason: 'Bunga terlalu tinggi' }).status, 'ditolak_pemohon');
     assert.throws(() => acceptOffer(submitSari()), /tidak bisa/);
});

test('keyakinan data & gerbang keputusan dari dokumen terverifikasi', () => {
     let loan = submitSari();
     assert.equal(confidenceView(loan).level, 'LOW');
     for (const d of loan.documents) loan = verifyDocument(loan, d.key, true, NOW);
     const conf = confidenceView(loan);
     assert.equal(conf.level, 'MEDIUM');
     assert.equal(gateView(analyzeLoan(loan), conf).pass, true);
});

test('penolakan menyimpan alasan', () => {
     const loan = submitSari();
     const rejected = rejectLoan(loan, { reason: 'Data belum lengkap', now: NOW });
     assert.equal(rejected.status, 'ditolak');
     assert.equal(loanCard(rejected).sentence, 'Data belum lengkap');
});

test('pencairan ditolak bila syarat wajib belum lengkap', () => {
     const loan = approvedSari();
     const view = conditionsView(loan);
     assert.equal(view.done, 0);
     assert.ok(view.items.some((i) => i.code === 'BORROWING_BASE'));
     assert.throws(() => disburseLoan(loan), /Syarat penarikan belum terpenuhi/);
});

test('modal kerja di atas borrowing base: pencairan pertama dibatasi Rp 165 jt', () => {
     let loan = approvedSari();
     for (const c of conditionsView(loan).items) loan = toggleCondition(loan, c.code, true, NOW);
     const view = conditionsView(loan);
     assert.equal(view.firstDrawLimit, 165_000_000);
     loan = disburseLoan(loan, { now: NOW });
     assert.equal(loan.status, 'aktif');
     assert.equal(loan.drawn, 165_000_000);
     assert.equal(loan.outstanding, 165_000_000);
     assert.equal(loan.terms.tenor_bulan, 36);
     assert.equal(loan.terms.periodicity, 'bulanan');
     assert.ok(loan.terms.monthly_installment > 12_900_000 && loan.terms.monthly_installment < 13_100_000);
     loan = drawRemaining(loan, { now: NOW });
     assert.equal(loan.outstanding, 380_000_000);
});

test('pemantauan: DSCR dihitung dari uang bersih usaha ÷ cicilan setahun', () => {
     const record = { terms: { annual_debt_service: 100_000_000 } };
     assert.deepEqual(monitoringParams({ cash_flow_annual: 150_000_000, days_late: '3', ocf: 'positif' }, record),
          { P1_dscr: 1.5, P11_days_late: 3, P4_ocf: 'positif' });
     // P1 yang diisi langsung (tampilan lengkap) tidak ditimpa.
     assert.equal(monitoringParams({ cash_flow_annual: 150_000_000, extra: { P1_dscr: 0.9 } }, record).P1_dscr, 0.9);
});

test('Pak Darto: Mei sehat → Juli waspada → September bermasalah (kompendium)', () => {
     const loan = demoPakDarto();
     const views = loan.monitoring.map(monitoringView);
     assert.deepEqual(views.map((v) => [v.period, v.label, v.tone]), [
          ['2026-05', 'Sehat', 'hijau'],
          ['2026-07', 'Waspada', 'kuning'],
          ['2026-09', 'Bermasalah', 'merah']
     ]);
     assert.equal(views[2].collectibility, 'Perlu perhatian (DPK)');
     assert.match(views[2].sentence, /telat bayar 45 hari/);
     assert.match(views[2].action, /keringanan cicilan.*manajer risiko/);
     assert.equal(loan.outstanding, 203_500_000);
     assert.equal(loan.terms.remaining_months, 17);
});

test('Pak Darto: keringanan = perpanjang 33 bulan, cicilan Rp 7,47 jt, DSCR 1,23', () => {
     const loan = demoPakDarto();
     const v = restructuringView(loan);
     const best = v.options.find((o) => o.recommended);
     assert.equal(best.type, 'rescheduling');
     assert.equal(best.tenor, 33);
     assert.equal(best.monthly, 7_465_199);
     assert.equal(best.dscr, 1.23);
     assert.equal(v.options.find((o) => o.type === 'reconditioning').enough, false);
     const after = applyRestructuring(loan, 'rescheduling', { now: NOW });
     assert.equal(after.terms.monthly_installment, 7_465_199);
     assert.equal(after.restructuring.type, 'rescheduling');
     assert.throws(() => applyRestructuring(loan, 'reconditioning'), /komite/);
});

test('portofolio: lampu, NPL, dan masa tunggu restrukturisasi dari mesin', () => {
     const darto = applyRestructuring(demoPakDarto(), 'rescheduling', { now: NOW });
     const pending = submitSari();
     const p = portfolioView([darto, pending]);
     assert.equal(p.activeCount, 1);
     assert.equal(p.pending, 1);
     assert.deepEqual(p.lamps, { hijau: 0, kuning: 0, merah: 1 });
     assert.equal(p.exposure, 203_500_000);
     assert.equal(p.raw.npl.gross_ratio, 0); // 45 hari = DPK, belum NPL
     assert.equal(p.raw.restructured.length, 1);
     assert.match(p.sentence, /1 pinjaman berjalan senilai Rp 204 jt/);
});

test('sinyal EWS → kalimat awam', () => {
     assert.equal(plainSignal({ code: 'P1', value: 0.78 }), 'uang usaha tidak cukup untuk cicilan (hanya 0,78 kali)');
     assert.equal(plainSignal({ code: 'P6', value: -32 }), 'omzet turun 32% dari tahun lalu');
     assert.equal(plainSignal({ code: 'P20', value: 'material' }), 'ada janji (covenant) yang dilanggar berat');
});

test('pemantauan hanya untuk pinjaman yang sudah cair', () => {
     assert.throws(() => addMonitoring(approvedSari(), { period: '2026-10' }), /sudah cair/);
});
