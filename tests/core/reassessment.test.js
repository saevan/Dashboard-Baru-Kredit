import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reopenAssessment } from '../../src/core/reassessment.js';
import { canTransition } from '../../src/core/application.js';

const scored = () => ({ status: 'scored', borrower: { keuangan: { penjualan: 100 } }, audit: { interview: { scores: { posisi_pasar: .75 } } }, documents: [{ id: 'd', verified: true }], result: { finalScore: 80, meta: { snapshot: { config_version: 'v1' } } }, grade: 'idA', confidence_level: 'HIGH', intake: { gate: { pass: true } } });
test('reassessment archives independent inputs/results and clears the active grade and gate', () => {
     const rec = scored();
     const patch = reopenAssessment(rec, { note: 'Sensitivity', at: '2026-10-16T00:00:00Z', actor: 'analyst' });
     assert.equal(patch.status, 'verified');
     assert.equal(patch.result, null);
     assert.equal(patch.grade, null);
     assert.equal(patch.intake, null);
     assert.equal(patch.gate_pass, null);
     assert.equal(rec.status, 'scored');
     rec.borrower.keuangan.penjualan = 999;
     rec.audit.interview.scores.posisi_pasar = 0;
     rec.result.finalScore = 0;
     assert.equal(patch.analysis_history[0].borrower.keuangan.penjualan, 100);
     assert.equal(patch.analysis_history[0].audit.interview.scores.posisi_pasar, .75);
     assert.equal(patch.analysis_history[0].result.finalScore, 80);
     const next = reopenAssessment({ ...scored(), analysis_history: patch.analysis_history });
     assert.equal(next.analysis_history.length, 2);
     assert.equal(next.analysis_history[1].revision, 2);
});
test('only an uncommitted scored application can be reopened', () => {
     for (const status of ['draft', 'submitted', 'need_fix', 'verified', 'offered', 'accepted', 'declined', 'decided', 'rejected']) {
          assert.equal(canTransition(status, 'reassess'), false);
          assert.throws(() => reopenAssessment({ ...scored(), status }));
     }
     for (const patch of [{ borrower_id: 'facility' }, { analysis_id: 'analysis' }, { offer: {} }, { decided_at: 'today' }, { result: null }]) assert.throws(() => reopenAssessment({ ...scored(), ...patch }));
});
