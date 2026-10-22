import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { readDocument, pickCandidate, applyCandidate, candidateView, financeStatus } from '../src/simple/intake.js';
import { analyze } from '../src/simple/analyze.js';
import { validateApplicationStep } from '../src/simple/form-schema.js';
import { demoBuSari } from '../src/simple/demo.js';

const bytes = (name) => new Uint8Array(readFileSync(new URL(`../data/contoh/${name}`, import.meta.url)));

function blankSari() {
     const b = demoBuSari();
     for (const k of Object.keys(b.keuangan)) b.keuangan[k] = null;
     return b;
}

test('laporan CSV Bu Sari dibaca → angka sama → skor 87,2 seperti kompendium', async () => {
     const doc = await readDocument(bytes('laporan_keuangan_bu_sari.csv'), 'laporan_keuangan_bu_sari.csv', 'laporan_keuangan');
     assert.equal(doc.extraction.status, 'ready');
     const idx = pickCandidate(doc.extraction.candidates);
     assert.equal(idx, 0);
     const b = applyCandidate(blankSari(), doc, idx);
     assert.equal(b.keuangan.penjualan, 2_400_000_000);
     assert.equal(b.financial_import.filename, 'laporan_keuangan_bu_sari.csv');
     assert.ok(financeStatus(b.keuangan).complete);
     assert.deepEqual(validateApplicationStep(1, { borrower: b }), []);
     assert.equal(analyze(b).finalScore, 87.2);
});

test('laporan PDF & Excel dua periode: otomatis memakai tahun terbaru', async () => {
     for (const name of ['laporan_keuangan_cv_fiktif.pdf', 'laporan_keuangan_cv_fiktif.xlsx']) {
          const doc = await readDocument(bytes(name), name, 'laporan_keuangan');
          assert.equal(doc.extraction.candidates.length, 2, name);
          const idx = pickCandidate(doc.extraction.candidates);
          assert.equal(doc.extraction.candidates[idx].period, 2025, name);
          const view = candidateView(doc.extraction.candidates[idx]);
          assert.deepEqual(view.missing, [], name);
     }
});

test('ganti berkas laporan: angka dari berkas lama tidak tertinggal', async () => {
     const pdf = await readDocument(bytes('laporan_keuangan_cv_fiktif.pdf'), 'laporan_keuangan_cv_fiktif.pdf', 'laporan_keuangan');
     let b = applyCandidate(blankSari(), pdf, pickCandidate(pdf.extraction.candidates));
     assert.equal(b.keuangan.hpp, 1_600_000_000);
     const csv = await readDocument(bytes('laporan_keuangan_bu_sari.csv'), 'laporan_keuangan_bu_sari.csv', 'laporan_keuangan');
     b = applyCandidate(b, csv, 0);
     assert.equal(b.keuangan.hpp, null);
     assert.equal(b.keuangan.depresiasi, null);
     assert.equal(b.keuangan.penjualan, 2_400_000_000);
     assert.equal(analyze(b).finalScore, 87.2);
});

test('berkas tidak sesuai format ditolak dengan pesan jelas', async () => {
     await assert.rejects(readDocument(new TextEncoder().encode('bukan pdf'), 'palsu.pdf', 'identitas'), /tidak sesuai/);
     await assert.rejects(readDocument(new Uint8Array([1, 2, 3]), 'catatan.docx', 'identitas'), /Format/);
});

test('formulir pemohon: wajib nama, bidang, jumlah, lama, laporan lengkap, persetujuan', () => {
     const draft = { borrower: blankSari(), consent: false };
     draft.borrower.nama = '';
     assert.equal(validateApplicationStep(0, draft).length, 1);
     assert.match(validateApplicationStep(1, draft)[0], /belum terbaca/);
     assert.match(validateApplicationStep(3, draft)[0], /persetujuan/);
});
