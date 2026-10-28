import { test } from 'node:test';
import assert from 'node:assert/strict';
import { updateWork, workAttention, matchesWork } from '../../src/core/work-items.js';
import { queueRows, selectQueue } from '../../src/core/workflow.js';
import { reviewGaps } from '../../src/core/review-summary.js';
import { saveWorkItem, loadWorkItems } from '../../src/data/work-items.js';
import { clearAll, saveSession, exportAll, importAll } from '../../src/data/storage.js';
const options = { kind: 'application', members: [{ id: 'a', name: 'Analis' }], actor: { name: 'Admin' }, now: '2026-10-15T12:00:00Z' };

test('penugasan memvalidasi anggota, tanggal, konflik versi, dan mempertahankan histori', () => {
     const first = updateWork({}, { version: 0, assignee_id: 'a', due_date: '2026-10-16', note: 'Hubungi pemohon' }, options);
     assert.equal(first.history.length, 1); assert.equal(first.assignee_name, 'Analis');
     assert.throws(() => updateWork(first, { version: 0 }, options), /sudah berubah/);
     assert.throws(() => updateWork({}, { version: 0, assignee_id: 'viewer' }, options), /penanggung jawab/);
     assert.throws(() => updateWork({}, { version: 0, due_date: '2026-02-30' }, options), /Tanggal/);
     const second = updateWork(first, { version: 1, assignee_id: '', note: 'Dikembalikan untuk alokasi ulang' }, options);
     assert.equal(second.history.length, 2); assert.equal(second.history[0].assignee_name, 'Analis');
});

test('penutupan kasus monitoring membutuhkan hasil dan hambatan terselesaikan; pengajuan tidak dapat ditutup manual', () => {
     const opts = { ...options, kind: 'monitoring' };
     assert.throws(() => updateWork({}, { version: 0, status: 'resolved' }, opts), /Catatan hasil/);
     assert.throws(() => updateWork({}, { version: 0, status: 'resolved', note: 'Selesai', blocker: 'Masih menunggu' }, opts), /Hapus hambatan/);
     assert.throws(() => updateWork({}, { version: 0, status: 'resolved', note: 'Selesai' }, options), /Status/);
     const done = updateWork({}, { version: 0, status: 'resolved', note: 'Dokumen diterima, review selesai' }, opts);
     assert.equal(workAttention(done), 'closed');
     const reopened = updateWork(done, { version: 1, status: 'open', note: 'Perlu pengecekan ulang' }, opts);
     assert.equal(reopened.resolved_at, null); assert.equal(reopened.history.length, 2);
});

test('prioritas dan filter pekerjaan tidak menghidupkan kembali pengajuan selesai', () => {
     const work = { 'application:a': { assignee_id: 'u', due_date: '2000-01-01', blocker: 'Data kurang' } };
     const rows = queueRows([{ id: 'a', status: 'submitted' }, { id: 'b', status: 'submitted', created_at: '1999-01-01' }, { id: 'c', status: 'rejected' }], [], Date.now(), work);
     assert.equal(selectQueue(rows, { sort: 'priority' }).items[0].id, 'a');
     assert.equal(selectQueue(rows, { work: 'mine', actorId: 'u' }).total, 1);
     assert.equal(selectQueue(rows, { work: 'unassigned' }).total, 1);
     assert.equal(matchesWork(work['application:a'], 'overdue', 'u', true), false);
});

test('penugasan lokal tersimpan, masuk backup, dan tidak menerima sesi pemohon', () => {
     clearAll(); saveSession({ id: 'usr_admin', name: 'Admin', role: 'lender' });
     saveWorkItem('application', 'a', { version: 0, assignee_id: 'usr_admin', due_date: '2026-11-01', note: 'Audit' });
     const backup = exportAll(); assert.equal(backup.work_items['application:a'].version, 1);
     clearAll(); assert.deepEqual(loadWorkItems(), {});
     importAll(backup, { merge: false }); assert.equal(loadWorkItems()['application:a'].note, 'Audit');
     saveSession({ id: 'p', role: 'borrower' });
     assert.throws(() => saveWorkItem('application', 'a', { version: 1 }), /lender/); clearAll();
});

test('ringkasan membedakan bukti kurang, audit, gate, dan penawaran kedaluwarsa', () => {
     const gaps = reviewGaps({ local: true, status: 'submitted', documents: [] });
     assert.ok(gaps.some((f) => f.section === 'evidence')); assert.ok(gaps.some((f) => f.section === 'audit'));
     assert.ok(reviewGaps({ local: true, status: 'scored', result: { decision: { decision: 'TIDAK_LAYAK' } } }).some((f) => f.label.includes('tidak layak')));
     assert.ok(reviewGaps({ status: 'offered', offer: { expires_at: '2000-01-01' } }).some((f) => f.label.includes('kedaluwarsa')));
});
