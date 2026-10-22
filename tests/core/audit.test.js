/**
 * tests/audit.test.js — Lembar kerja audit lender (3 bagian) + override kualitatif.
 *
 * Memverifikasi: katalog audit, normalisasi, progres/kelengkapan, dan bahwa skor
 * wawancara lender benar-benar menggantikan skor self-declared pemohon saat
 * penilaian dijalankan (`runFullAnalysis`).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
     FINANCIAL_CHECKLIST,
     COLLATERAL_CHECKLIST,
     INTERVIEW_QUESTIONS,
     AUDIT_SECTIONS,
     C_LABEL,
     interviewGroups,
     score01,
     emptyAudit,
     normalizeAudit,
     auditProgress,
     isAuditComplete,
     qualitativeFromAudit,
     applyAuditToBorrower,
     interviewComparison
} from '../../src/core/audit.js';
import { BISNIS_MANAJEMEN_META } from '../../src/core/config.js';
import { BM_PARAM_TO_C } from '../../src/core/parameters.js';
import { runFullAnalysis, emptyBorrower } from '../../src/core/engine.js';

/** Audit lengkap dengan semua centang & skor wawancara. */
function fullAudit(score = 0.9) {
     const a = emptyAudit();
     for (const item of FINANCIAL_CHECKLIST) a.financial.checks[item.key] = true;
     for (const item of COLLATERAL_CHECKLIST) a.collateral.checks[item.key] = true;
     for (const q of INTERVIEW_QUESTIONS) a.interview.scores[q.key] = score;
     return a;
}

function borrowerBase() {
     const b = emptyBorrower();
     b.nama = 'PT Uji Audit';
     b.sektor = 'IDX-BASIC-MATERIALS';
     b.plafon_diajukan = 500_000_000;
     b.tenor_bulan = 36;
     b.bunga_tahunan = 0.14;
     b.keuangan = {
          penjualan: 3_000_000_000,
          hpp: 1_800_000_000,
          ebit: 600_000_000,
          laba_bersih: 300_000_000,
          total_aset: 2_000_000_000,
          aset_lancar: 800_000_000,
          total_liabilitas: 700_000_000,
          liabilitas_jangka_pendek: 400_000_000,
          ekuitas: 1_300_000_000,
          kas: 200_000_000,
          piutang: 300_000_000,
          persediaan: 200_000_000,
          arus_kas_operasional: 350_000_000
     };
     b.bisnis_manajemen = {
          skor_model_bisnis: 0.3,
          posisi_pasar: 0.3,
          skalabilitas: 0.3,
          ketergantungan: 0.4,
          tren_keuangan: 0.3,
          pengalaman_tim: 0.3,
          rekam_jejak_bayar: 0.3,
          tata_kelola: 0.3,
          skor_industri_risk: 0.3,
          prospek_industri: 0.3,
          sensitivitas_makro: 0.5
     };
     b.agunan = { jenis: 'tanah_bangunan', nilai_agunan: 800_000_000, personal_guarantee: false };
     return b;
}

test('audit: tiga bagian terdefinisi', () => {
     assert.equal(AUDIT_SECTIONS.length, 3);
     assert.deepEqual(
          AUDIT_SECTIONS.map((s) => s.key),
          ['financial', 'collateral', 'interview']
     );
     assert.ok(FINANCIAL_CHECKLIST.length >= 5);
     assert.ok(COLLATERAL_CHECKLIST.length >= 4);
});

test('audit: pertanyaan wawancara = parameter 5C berskala skor', () => {
     const expected = Object.entries(BISNIS_MANAJEMEN_META).filter(([, m]) => m.unit === 'skor');
     assert.equal(INTERVIEW_QUESTIONS.length, expected.length);
     assert.ok(INTERVIEW_QUESTIONS.length >= 11);
     for (const q of INTERVIEW_QUESTIONS) {
          assert.equal(q.c, BM_PARAM_TO_C[q.key]);
          assert.ok(C_LABEL[q.c], `5C ${q.c} harus punya label`);
          assert.ok(q.label && q.label.length > 0);
     }
     // Parameter non-skor tidak boleh masuk wawancara.
     assert.ok(!INTERVIEW_QUESTIONS.some((q) => q.key === 'track_record_tahun'));
     assert.ok(!INTERVIEW_QUESTIONS.some((q) => q.key === 'ocf_positif'));
});

test('audit: interviewGroups mengelompokkan menurut 5C', () => {
     const groups = interviewGroups();
     const total = groups.reduce((n, g) => n + g.items.length, 0);
     assert.equal(total, INTERVIEW_QUESTIONS.length);
     assert.ok(groups.every((g) => g.items.every((i) => i.c === g.c)));
});

test('audit: score01 hanya menerima 0–1', () => {
     assert.equal(score01(0), 0);
     assert.equal(score01(0.5), 0.5);
     assert.equal(score01('0.8'), 0.8);
     assert.equal(score01(1), 1);
     assert.equal(score01(1.2), null);
     assert.equal(score01(-0.1), null);
     assert.equal(score01('abc'), null);
     assert.equal(score01(''), null);
     assert.equal(score01(null), null);
});

test('audit: normalizeAudit aman untuk input kosong/parsial', () => {
     const empty = normalizeAudit(null);
     assert.deepEqual(empty, emptyAudit());
     const partial = normalizeAudit({ financial: { checks: { neraca_seimbang: true } } });
     assert.equal(partial.financial.checks.neraca_seimbang, true);
     assert.equal(partial.financial.notes, '');
     assert.deepEqual(partial.collateral.checks, {});
     assert.deepEqual(partial.interview.scores, {});
     // Nilai tak terduga tidak merusak struktur.
     assert.deepEqual(normalizeAudit({ financial: 5 }).financial.checks, {});
});

test('audit: progres & kelengkapan tiga bagian', () => {
     const p0 = auditProgress(null);
     assert.equal(p0.complete, false);
     assert.equal(p0.sections_complete, 0);
     assert.equal(p0.financial.done, 0);
     assert.equal(p0.interview.total, INTERVIEW_QUESTIONS.length);
     assert.equal(isAuditComplete(null), false);

     const onlyFin = emptyAudit();
     for (const item of FINANCIAL_CHECKLIST) onlyFin.financial.checks[item.key] = true;
     const p1 = auditProgress(onlyFin);
     assert.equal(p1.financial.complete, true);
     assert.equal(p1.collateral.complete, false);
     assert.equal(p1.sections_complete, 1);
     assert.equal(p1.complete, false);

     const prog = auditProgress(fullAudit());
     assert.equal(prog.complete, true);
     assert.equal(prog.sections_complete, 3);
     assert.equal(isAuditComplete(fullAudit()), true);
});

test('audit: kelengkapan wawancara menerima skor 0', () => {
     const a = fullAudit(0);
     assert.equal(isAuditComplete(a), true);
     assert.equal(qualitativeFromAudit(a).skor_model_bisnis, 0);
});

test('audit: qualitativeFromAudit hanya mengembalikan nilai valid', () => {
     const a = emptyAudit();
     a.interview.scores.skor_model_bisnis = 0.8;
     a.interview.scores.posisi_pasar = 1.5; // di luar rentang → diabaikan
     a.interview.scores.skalabilitas = 'x'; // bukan angka → diabaikan
     const out = qualitativeFromAudit(a);
     assert.deepEqual(out, { skor_model_bisnis: 0.8 });
});

test('audit: applyAuditToBorrower menimpa skor & tidak memutasi asal', () => {
     const base = borrowerBase();
     const merged = applyAuditToBorrower(base, fullAudit(0.9));
     assert.equal(merged.bisnis_manajemen.skor_model_bisnis, 0.9);
     assert.equal(merged.bisnis_manajemen.sensitivitas_makro, 0.9);
     // Objek asal tidak berubah.
     assert.equal(base.bisnis_manajemen.skor_model_bisnis, 0.3);
     assert.notEqual(merged, base);
     assert.notEqual(merged.bisnis_manajemen, base.bisnis_manajemen);
});

test('audit: tanpa skor wawancara, borrower dikembalikan apa adanya', () => {
     const base = borrowerBase();
     const same = applyAuditToBorrower(base, emptyAudit());
     assert.equal(same, base);
});

test('audit: interviewComparison menandai override', () => {
     const base = borrowerBase();
     const a = emptyAudit();
     a.interview.scores.skor_model_bisnis = 0.9;
     const rows = interviewComparison(base, a);
     const model = rows.find((r) => r.key === 'skor_model_bisnis');
     assert.equal(model.declared, 0.3);
     assert.equal(model.lender, 0.9);
     assert.equal(model.overridden, true);
     const other = rows.find((r) => r.key === 'posisi_pasar');
     assert.equal(other.overridden, false);
     assert.equal(other.lender, null);
});

test('audit: skor wawancara lender menaikkan skor akhir saat penilaian', () => {
     const withoutAudit = runFullAnalysis(borrowerBase());
     const withAudit = runFullAnalysis(applyAuditToBorrower(borrowerBase(), fullAudit(0.9)));
     assert.ok(
          withAudit.finalScore > withoutAudit.finalScore,
          `skor dengan audit (${withAudit.finalScore}) harus > tanpa audit (${withoutAudit.finalScore})`
     );
});
