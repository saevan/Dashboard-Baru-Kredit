/**
 * Lapisan layanan (logika UI lama yang dipindahkan) — alur penuh mode lokal:
 * pemohon kirim → lender audit/verifikasi/nilai → penawaran → terima →
 * fasilitas → syarat → cair → pemantauan → 3R; plus impor demo Pak Darto.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as storage from '../src/data/storage.js';
import { loginDemo, logout, analyze, registerBorrower, login } from '../src/services/core.js';
import * as apps from '../src/services/applications.js';
import * as pf from '../src/services/portfolio.js';
import { FINANCIAL_CHECKLIST, COLLATERAL_CHECKLIST, INTERVIEW_QUESTIONS } from '../src/core/audit.js';
import { buildOfferOptions } from '../src/core/offer.js';
import { demoBuSari, seedBuSariApplication } from '../src/services/demo.js';

const fresh = () => storage.clearAll();
const DOC_KEYS = ['identitas', 'legalitas', 'rekening_koran', 'laporan_keuangan', 'slik_ojk', 'agunan'];

function submitBuSari() {
     loginDemo('borrower');
     const draft = apps.blankDraft();
     const sari = demoBuSari();
     draft.borrower = { ...draft.borrower, ...sari, npwp: '', nib: '', agunan: { ...sari.agunan, ketersediaan: 'ada', pemilik: 'Sari', keterangan: 'Ruko Jl. Melati 5' } };
     assert.equal(apps.validateDraftStep(0, draft), null);
     assert.equal(apps.validateDraftStep(1, draft), null);
     apps.saveDraft(draft);
     draft.documents = DOC_KEYS.map((k, i) => ({ id: `doc_${i}`, source_key: k, filename: `${k}.pdf`, verified: 0 }));
     apps.saveDraft(draft);
     assert.equal(apps.submitDraft(draft, { consentChecked: false }).ok, false, 'konsen wajib');
     const res = apps.submitDraft(draft, { consentChecked: true });
     assert.equal(res.ok, true);
     return res.id;
}

function lenderReview(id, score = 0.8) {
     loginDemo('lender');
     for (const d of apps.reviewDetail(id).documents) apps.setDocumentVerified(id, d.id, true);
     for (const c of FINANCIAL_CHECKLIST) apps.setAuditCheck(id, 'financial', c.key, true);
     for (const c of COLLATERAL_CHECKLIST) apps.setAuditCheck(id, 'collateral', c.key, true);
     for (const q of INTERVIEW_QUESTIONS) apps.setAuditScore(id, q.key, score);
     return apps.verifyAndScore(id);
}

test('pemohon: validasi langkah & pesan kesalahan bahasa sederhana', () => {
     fresh();
     const d = apps.blankDraft();
     assert.match(apps.validateDraftStep(0, d), /Nama usaha/);
     d.borrower.nama = 'X';
     assert.match(apps.validateDraftStep(0, d), /Bidang usaha/);
     assert.equal(apps.validateDraftStep(1, { borrower: { ...d.borrower, keuangan: {} } }), 'missing-finance');
     assert.throws(() => apps.saveDraft(d), /pemohon/);
});

test('alur penuh: kirim → audit → verifikasi & nilai otomatis = mesin lama', () => {
     fresh();
     const id = submitBuSari();
     assert.equal(storage.getApplication(id).status, 'submitted');
     assert.ok(storage.getConsentForApplication(id)?.accepted);
     const out = lenderReview(id);
     assert.equal(out.to, 'scored');
     const rec = storage.getApplication(id);
     // Penilaian layanan identik dengan memanggil mesin langsung pada borrower + audit.
     assert.equal(rec.grade, 'idAA');
     assert.equal(Math.round(rec.result.finalScore * 10) / 10, 87.2);
     assert.ok(rec.intake.gate);
     assert.ok(['HIGH', 'MEDIUM', 'LOW'].includes(rec.confidence_level));
});

test('verifikasi tanpa audit lengkap butuh justifikasi', () => {
     fresh();
     const id = submitBuSari();
     loginDemo('lender');
     assert.throws(() => apps.lenderAction(id, 'verify'), /Lembar audit belum lengkap/);
     assert.equal(apps.lenderAction(id, 'verify', { note: 'Wawancara menyusul' }), 'verified');
     assert.equal(storage.getApplication(id).audit_override, true);
});

test('minta perbaikan & tolak wajib catatan; skor wawancara di luar 0–1 ditolak', () => {
     fresh();
     const id = submitBuSari();
     loginDemo('lender');
     assert.throws(() => apps.lenderAction(id, 'request_fix'), /catatan/);
     assert.throws(() => apps.setAuditScore(id, INTERVIEW_QUESTIONS[0].key, 2), /antara 0 dan 1/);
     assert.equal(apps.lenderAction(id, 'request_fix', { note: 'Lengkapi rekening koran' }), 'need_fix');
     loginDemo('borrower');
     const mine = apps.myApplicationList();
     assert.equal(mine[0].status, 'need_fix');
});

test('penawaran → terima → fasilitas → syarat → cair → pemantauan → 3R', () => {
     fresh();
     const id = submitBuSari();
     lenderReview(id);
     const rec = storage.getApplication(id);
     const opts = buildOfferOptions(rec.result, rec.borrower);
     assert.ok(opts.ready);
     const amount = opts.recommended.amount;
     assert.equal(amount, 380_000_000, 'saran plafon kompendium');
     // Mesin lama dapat meminta keputusan manual (DSR/DSCR penawaran); jalur itu wajib beralasan.
     assert.throws(() => apps.lenderAction(id, 'offer', { amount, rate: opts.recommended.rate, basis: 'principal', force: true }));
     apps.lenderAction(id, 'offer', { amount, rate: opts.recommended.rate, basis: 'principal', force: true, overrideReason: 'Kontrak katering kantor terverifikasi' });
     assert.equal(storage.getApplication(id).status, 'offered');

     loginDemo('borrower');
     assert.equal(apps.respondToOffer(id, true), 'accepted');

     loginDemo('lender');
     const fac = apps.prepareFacility(id);
     assert.equal(fac.facility_status, 'pipeline');
     let c = pf.customer(fac.id);
     assert.equal(c.conditions.ready, false);
     assert.throws(() => pf.facilityAction(fac.id, 'disburse', { outstanding: amount }));
     for (const item of c.conditions.items) pf.setCondition(fac.id, item.code, true);
     c = pf.customer(fac.id);
     assert.equal(c.conditions.ready, true);
     // Pencairan pertama dibatasi borrowing base; cairkan sebagian yang diizinkan.
     let disbursed = null;
     for (const amt of [amount, 200_000_000, 100_000_000]) {
          try { disbursed = pf.facilityAction(fac.id, 'disburse', { outstanding: amt }); break; } catch { /* coba lebih kecil */ }
     }
     assert.ok(disbursed, 'pencairan berhasil');
     assert.equal(pf.customer(fac.id).facility.status, 'aktif');

     const prefill = pf.ewsPrefill(c.analysis);
     assert.ok(prefill.P1_dscr > 0);
     const ev = pf.saveMonitoring(fac.id, { ...prefill, P11_days_late: 45 });
     assert.ok(ev.ews_level);
     assert.equal(pf.customer(fac.id).monitoring.length, 1);

     const proposal = pf.proposeRelief(fac.id, { annualCashFlow: 110_000_000 });
     assert.ok(proposal.options.length);
     const opt = proposal.options.find((o) => o.feasible);
     if (opt) {
          pf.applyRelief(fac.id, { type: opt.type, tenor_bulan: opt.tenor_bulan, rate: opt.rate, monthly_installment: opt.monthly_installment, grace_bulan: 0 }, 'uji');
          pf.recordReliefPayment(fac.id, true);
          assert.equal(pf.customer(fac.id).restructuring.consecutive_on_time, 1);
     }
     const home = pf.lenderHome();
     assert.ok(home.portfolio.totals.exposure > 0);
});

test('impor demo Pak Darto (format JSON lama) & analisis manual', () => {
     fresh();
     const payload = JSON.parse(readFileSync(new URL('../data/demo/IMPOR_fasilitas_bakso_darto.json', import.meta.url)));
     pf.importBackup(payload, true);
     const list = pf.customerList();
     assert.ok(list.some((r) => r.borrower.id === 'demo_fasilitas_bakso_darto'));
     const darto = pf.customer('demo_fasilitas_bakso_darto');
     assert.ok(darto.monitoring.length >= 1);

     const { id, result } = pf.saveManualAnalysis({ ...demoBuSari() });
     assert.deepEqual(result.finalScore, analyze(storage.getBorrower(id)).finalScore);
     assert.equal(pf.exportBackup().version, 6);
});

test('daftar akun pemohon baru & masuk', () => {
     fresh();
     registerBorrower({ name: 'Bu Sari', email: 'sari@contoh.id', password: 'rahasia1' });
     assert.equal(storage.loadSession().role, 'borrower');
     logout();
     assert.throws(() => login('sari@contoh.id', 'salah'), /salah/);
     assert.equal(login('sari@contoh.id', 'rahasia1').role, 'borrower');
});

test('data contoh Bu Sari masuk antrean petugas tanpa mengubah sesi', () => {
     fresh();
     loginDemo('lender');
     const id = seedBuSariApplication();
     assert.equal(storage.loadSession().role, 'lender');
     assert.equal(storage.getApplication(id).status, 'submitted');
     assert.ok(apps.lenderQueue().some((r) => r.id === id));
});
