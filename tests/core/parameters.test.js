/**
 * tests/parameters.test.js — Panduan penjelasan parameter + tag 5C.
 * Menjalankan: node --test tests/parameters.test.js
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
     PARAMETER_GUIDE,
     PARAMETER_GROUPS,
     PARAMETER_BY_KEY,
     BM_PARAM_TO_C,
     RATIO_TO_C,
     groupedParameterGuide
} from '../../src/core/parameters.js';
import { BISNIS_MANAJEMEN_META, RATIO_META } from '../../src/core/config.js';
import { FIVE_C_KEYS } from '../../src/core/five-c.js';

const VALID = new Set(FIVE_C_KEYS);

test('PARAMETER_GUIDE: setiap entri punya key/label/help/c5 yang sah', () => {
     assert.ok(PARAMETER_GUIDE.length > 20, 'panduan mencakup banyak parameter');
     const seen = new Set();
     for (const p of PARAMETER_GUIDE) {
          assert.ok(p.key, 'key ada');
          assert.ok(!seen.has(p.key), `key duplikat: ${p.key}`);
          seen.add(p.key);
          assert.ok(p.label, `label ada (${p.key})`);
          assert.ok(VALID.has(p.c5), `tag 5C sah (${p.key} = ${p.c5})`);
          assert.ok((p.help || '').length > 10, `help bermakna (${p.key})`);
     }
});

test('BM_PARAM_TO_C: memetakan SEMUA parameter kualitatif', () => {
     for (const key of Object.keys(BISNIS_MANAJEMEN_META)) {
          assert.ok(VALID.has(BM_PARAM_TO_C[key]), `parameter ${key} belum dipetakan`);
     }
});

test('RATIO_TO_C: memetakan SEMUA rasio benchmark', () => {
     for (const key of Object.keys(RATIO_META)) {
          assert.ok(VALID.has(RATIO_TO_C[key]), `rasio ${key} belum dipetakan`);
     }
});

test('groupedParameterGuide: 5 kelompok (tiap C) dengan judul & parameter', () => {
     const groups = groupedParameterGuide();
     assert.equal(groups.length, 5);
     for (const g of groups) {
          assert.ok(VALID.has(g.key));
          assert.ok(g.title && g.title.length > 5, `judul kelompok ${g.key}`);
          assert.ok(g.params.length > 0, `kelompok ${g.key} tidak boleh kosong`);
     }
});

test('PARAMETER_GROUPS & PARAMETER_BY_KEY konsisten', () => {
     for (const k of FIVE_C_KEYS) assert.ok(PARAMETER_GROUPS[k], `judul ${k}`);
     for (const p of PARAMETER_GUIDE) assert.equal(PARAMETER_BY_KEY[p.key], p);
});
