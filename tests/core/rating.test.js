/**
 * tests/rating.test.js — Pemeringkatan PEFINDO (idAAA … idD).
 * Menjalankan: node --test tests/rating.test.js
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { PEFINDO_SCALE, pefindoRating, gradeIndex, RATING_CATEGORY_LABEL } from '../../src/core/rating.js';

test('PEFINDO_SCALE: urut menurun & mencakup idAAA..idD', () => {
     assert.equal(PEFINDO_SCALE[0].grade, 'idAAA');
     assert.equal(PEFINDO_SCALE[PEFINDO_SCALE.length - 1].grade, 'idD');
     for (let i = 1; i < PEFINDO_SCALE.length; i++) {
          assert.ok(PEFINDO_SCALE[i].min <= PEFINDO_SCALE[i - 1].min, 'min harus menurun');
     }
     assert.equal(gradeIndex('idAAA'), 0);
     assert.equal(gradeIndex('idBBB-'), 9);
});

test('pefindoRating: skor tinggi → investment grade', () => {
     const r = pefindoRating(95, 'LAYAK');
     assert.equal(r.grade, 'idAAA');
     assert.equal(r.category, 'investment');
     assert.equal(r.investment_grade, true);
     assert.equal(r.outlook, 'positif');
});

test('pefindoRating: peta skor → peringkat benar', () => {
     assert.equal(pefindoRating(90).grade, 'idAA+');
     assert.equal(pefindoRating(70).grade, 'idA-');
     assert.equal(pefindoRating(58).grade, 'idBBB-');
     assert.equal(pefindoRating(50).grade, 'idBB');
     assert.equal(pefindoRating(38).grade, 'idB');
     assert.equal(pefindoRating(20).grade, 'idD');
});

test('pefindoRating: keputusan TIDAK_LAYAK membatasi peringkat ≤ idCCC', () => {
     const r = pefindoRating(95, 'TIDAK_LAYAK');
     assert.equal(r.grade, 'idCCC');
     assert.equal(r.capped_by, 'keputusan');
     assert.equal(r.category, 'default_risk');
     assert.equal(r.investment_grade, false);
});

test('pefindoRating: REVIEW sendiri tidak mengubah grade berbasis skor', () => {
     const r = pefindoRating(90, 'REVIEW');
     assert.equal(r.grade, 'idAA+');
     assert.equal(r.capped_by, null);
     assert.ok(r.outlook === 'negatif' || r.outlook === 'stabil');
});

test('pefindoRating: PD tinggi membatasi peringkat', () => {
     const r = pefindoRating(96, 'LAYAK', 0.4);
     assert.equal(r.grade, 'idCCC');
     assert.match(String(r.capped_by), /PD/);
     const r2 = pefindoRating(96, 'LAYAK', 0.15);
     assert.equal(r2.grade, 'idBB-');
});

test('pefindoRating: kategori & label lengkap', () => {
     const r = pefindoRating(80);
     assert.ok(r.category_label === RATING_CATEGORY_LABEL.investment);
     assert.ok(r.label && r.definition);
     assert.ok(r.notch >= 1);
     assert.equal(typeof r.score, 'number');
});

test('pefindoRating: skor 0 → idD', () => {
     const r = pefindoRating(0, 'TIDAK_LAYAK');
     assert.equal(r.grade, 'idD');
     assert.equal(r.category, 'default_risk');
});
