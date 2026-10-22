/**
 * tests/documents.test.js — metadata dokumen pendukung (Tab Dokumen).
 *
 * Rujukan: docs/PRD_DASHBOARD.md (Tab: Dokumen), src/data/storage.js (offline-first).
 * Memverifikasi penyimpanan, filter per borrower, hapus, dan round-trip import/export.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
     loadDocuments,
     getDocumentsForBorrower,
     addDocument,
     deleteDocument,
     exportAll,
     importAll,
     clearAll
} from '../../src/data/storage.js';

test('addDocument menyimpan metadata + id unik', () => {
     clearAll();
     const rec = addDocument('bwr_1', {
          nama: 'Laporan Keuangan 2024',
          jenis: 'Laporan Keuangan',
          tanggal: '2024-12-31'
     });
     assert.ok(rec.id, 'id dokumen harus terbentuk');
     assert.equal(rec.borrower_id, 'bwr_1');
     assert.equal(rec.nama, 'Laporan Keuangan 2024');
     assert.equal(loadDocuments().length, 1);
});

test('getDocumentsForBorrower memfilter per borrower', () => {
     clearAll();
     addDocument('bwr_1', { nama: 'A' });
     addDocument('bwr_2', { nama: 'B' });
     addDocument('bwr_1', { nama: 'C' });
     assert.equal(getDocumentsForBorrower('bwr_1').length, 2);
     assert.equal(getDocumentsForBorrower('bwr_2').length, 1);
     assert.deepEqual(
          getDocumentsForBorrower('bwr_1').map((d) => d.nama),
          ['A', 'C']
     );
});

test('deleteDocument hanya menghapus id terkait', () => {
     clearAll();
     const a = addDocument('bwr_1', { nama: 'A' });
     addDocument('bwr_1', { nama: 'B' });
     deleteDocument(a.id);
     const left = getDocumentsForBorrower('bwr_1');
     assert.equal(left.length, 1);
     assert.equal(left[0].nama, 'B');
});

test('exportAll/importAll (replace) membawa dokumen', () => {
     clearAll();
     addDocument('bwr_1', { nama: 'A' });
     const payload = exportAll();
     assert.equal(payload.version, 6);
     assert.equal(payload.documents.length, 1);
     clearAll();
     assert.equal(loadDocuments().length, 0);
     importAll(payload, { merge: false });
     assert.equal(getDocumentsForBorrower('bwr_1').length, 1);
});

test('importAll (merge) tidak menduplikasi id dokumen yang sama', () => {
     clearAll();
     const rec = addDocument('bwr_1', { nama: 'A' });
     importAll({ documents: [rec] }, { merge: true });
     assert.equal(loadDocuments().length, 1);
});
