/**
 * tests/rating-scale.test.js — Flag scale_mode pada core/rating.js.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
     pefindoRating,
     gradeIndex,
     scaleFor,
     PEFINDO_SCALE,
     NEUTRAL_SCALE,
     RATING_SCALE_MODES
} from '../../src/core/rating.js';

test('default tetap memakai skala PEFINDO plek ketiplek', () => {
     const r = pefindoRating(95, 'LAYAK');
     assert.equal(r.scale_mode, 'pefindo');
     assert.equal(r.grade, 'idAAA');
     assert.equal(r.investment_grade, true);
});

test('notasi PEFINDO sesuai ambang skor', () => {
     assert.equal(pefindoRating(58, 'LAYAK').grade, 'idBBB-');
     assert.equal(pefindoRating(30, 'REVIEW').grade, 'idCCC');
});

test('scale_mode neutral memakai notasi Tier tanpa mengubah urutan', () => {
     const r = pefindoRating(95, 'LAYAK', null, { scaleMode: 'neutral' });
     assert.equal(r.scale_mode, 'neutral');
     assert.equal(r.grade, 'T1');
     assert.equal(r.index, 0);
     assert.equal(scaleFor('neutral'), NEUTRAL_SCALE);
     assert.equal(scaleFor('pefindo'), PEFINDO_SCALE);
});

test('NEUTRAL_SCALE paralel dengan PEFINDO_SCALE', () => {
     assert.equal(NEUTRAL_SCALE.length, PEFINDO_SCALE.length);
     NEUTRAL_SCALE.forEach((g, i) => {
          assert.equal(g.min, PEFINDO_SCALE[i].min);
          assert.equal(g.category, PEFINDO_SCALE[i].category);
     });
});

test('gradeIndex mendukung mode', () => {
     assert.equal(gradeIndex('idAAA'), 0);
     assert.equal(gradeIndex('T1', 'neutral'), 0);
     assert.equal(gradeIndex('tidak-ada'), -1);
});

test('RATING_SCALE_MODES memuat pefindo dan neutral', () => {
     assert.ok(RATING_SCALE_MODES.includes('pefindo'));
     assert.ok(RATING_SCALE_MODES.includes('neutral'));
});
