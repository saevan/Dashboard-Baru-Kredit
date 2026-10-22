/**
 * tests/application.test.js — State machine pengajuan & gate (core/application.js).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
     applyApplicationAction,
     canTransition,
     actionsFor,
     isTerminal,
     stageOf,
     timeline,
     borrowerStatusView,
     gateDecision
} from '../../src/core/application.js';

test('transisi sah mengubah status', () => {
     assert.equal(applyApplicationAction('draft', 'submit'), 'submitted');
     assert.equal(applyApplicationAction('submitted', 'verify'), 'verified');
     assert.equal(applyApplicationAction('verified', 'score'), 'scored');
     assert.equal(applyApplicationAction('scored', 'decide'), 'decided');
});

test('transisi tidak sah melempar dengan kode invalid_transition', () => {
     assert.throws(() => applyApplicationAction('draft', 'approve'), (err) => {
          assert.equal(err.code, 'invalid_transition');
          return true;
     });
});

test('canTransition dan actionsFor konsisten', () => {
     assert.equal(canTransition('submitted', 'request_fix'), true);
     assert.equal(canTransition('decided', 'submit'), false);
     assert.deepEqual(actionsFor('draft'), ['submit']);
     assert.equal(isTerminal('decided'), true);
     assert.equal(isTerminal('submitted'), false);
});

test('stageOf & timeline menandai progres', () => {
     const t = timeline('submitted');
     assert.equal(t[0].state, 'current');
     assert.equal(t[1].state, 'todo');
     const done = timeline('decided');
     assert.ok(done.every((s) => s.state === 'done'));
     assert.equal(stageOf('need_fix'), 'verification');
     assert.equal(stageOf('scored'), 'review');
});

test('borrowerStatusView tidak memuat istilah penilaian/grade', () => {
     for (const status of [
          'draft',
          'submitted',
          'need_fix',
          'verified',
          'scored',
          'offered',
          'accepted',
          'declined',
          'decided',
          'rejected'
     ]) {
          const v = borrowerStatusView(status);
          assert.equal(typeof v.label, 'string');
          assert.ok(v.label.length > 0);
          assert.ok(!/peringkat|grade|rating|idAAA|skor/i.test(v.label), `label bocor untuk ${status}: ${v.label}`);
          assert.ok(Array.isArray(v.timeline));
     }
});

test('gateDecision lulus saat grade & keyakinan memadai', () => {
     const g = gateDecision({ gradeIndex: 5, confidenceLevel: 'HIGH' });
     assert.equal(g.pass, true);
     assert.equal(g.grade_ok, true);
     assert.equal(g.confidence_ok, true);
     assert.equal(g.requires_manual, false);
});

test('gateDecision menolak bila grade di bawah ambang', () => {
     const g = gateDecision({ gradeIndex: 12, confidenceLevel: 'HIGH' });
     assert.equal(g.pass, false);
     assert.equal(g.grade_ok, false);
     assert.ok(g.reasons.some((r) => r.code === 'grade'));
});

test('gateDecision menolak bila keyakinan rendah', () => {
     const g = gateDecision({ gradeIndex: 5, confidenceLevel: 'LOW' });
     assert.equal(g.pass, false);
     assert.equal(g.confidence_ok, false);
     assert.ok(g.reasons.some((r) => r.code === 'confidence'));
});

test('gateDecision menandai auto_reject untuk grade terburuk', () => {
     const g = gateDecision({ gradeIndex: 17, confidenceLevel: 'HIGH' });
     assert.equal(g.auto_reject, true);
     assert.equal(g.pass, false);
     assert.equal(g.requires_manual, false);
});

test('alur penawaran: scored → offered → accepted/declined', () => {
     assert.equal(applyApplicationAction('scored', 'offer'), 'offered');
     assert.equal(applyApplicationAction('offered', 'accept_offer'), 'accepted');
     assert.equal(applyApplicationAction('offered', 'decline_offer'), 'declined');
     assert.equal(canTransition('scored', 'offer'), true);
     assert.equal(canTransition('offered', 'accept_offer'), true);
     assert.equal(canTransition('offered', 'decide'), false);
});

test('accepted & declined bersifat terminal', () => {
     assert.equal(isTerminal('accepted'), true);
     assert.equal(isTerminal('declined'), true);
     assert.deepEqual(actionsFor('accepted'), []);
     assert.deepEqual(actionsFor('declined'), []);
     assert.throws(() => applyApplicationAction('accepted', 'submit'));
});

test('stageOf memetakan offered/accepted/declined', () => {
     assert.equal(stageOf('offered'), 'offer');
     assert.equal(stageOf('accepted'), 'decision');
     assert.equal(stageOf('declined'), 'decision');
});

test('borrowerStatusView menandai needs_borrower saat offered', () => {
     const v = borrowerStatusView('offered');
     assert.equal(v.needs_borrower, true);
     assert.equal(v.terminal, false);
     assert.equal(borrowerStatusView('accepted').needs_borrower, false);
     assert.equal(borrowerStatusView('accepted').terminal, true);
     assert.equal(borrowerStatusView('declined').terminal, true);
});
