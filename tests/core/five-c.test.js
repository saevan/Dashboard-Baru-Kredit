/**
 * tests/five-c.test.js — Kerangka 5C + skor tertimbang.
 * Menjalankan: node --test tests/five-c.test.js
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { FIVE_C_DEFS, FIVE_C_KEYS, FIVE_C_WEIGHTS, COMPONENT_TO_C, computeFiveC, fiveCLabel } from '../../src/core/five-c.js';
import { COMPONENT_DEFS } from '../../src/core/config.js';

function closeTo(actual, expected, tol = 1e-9, msg = '') {
     assert.ok(Math.abs(actual - expected) <= tol, `${msg} (${actual} != ${expected})`);
}

test('FIVE_C_DEFS: 5 kategori unik dengan bobot berjumlah 1.0', () => {
     assert.equal(FIVE_C_DEFS.length, 5);
     assert.deepEqual(FIVE_C_KEYS, ['character', 'capacity', 'capital', 'collateral', 'conditions']);
     const sum = FIVE_C_DEFS.reduce((s, c) => s + c.weight, 0);
     closeTo(sum, 1.0, 1e-9, 'Σ bobot');
     for (const c of FIVE_C_DEFS) {
          assert.ok(c.name && c.id && c.ico, 'field dasar lengkap');
          assert.ok(c.desc && c.desc.length > 10, 'desc ada');
          assert.ok(c.weight > 0 && c.weight < 1, 'bobot wajar');
     }
});

test('COMPONENT_TO_C: memetakan SEMUA komponen ke 5C yang sah', () => {
     const valid = new Set(FIVE_C_KEYS);
     for (const def of COMPONENT_DEFS) {
          const c = COMPONENT_TO_C[def.key];
          assert.ok(c && valid.has(c), `komponen ${def.key} belum dipetakan ke 5C`);
     }
});

test('computeFiveC: fallback 60 (netral) menghasilkan weighted 60', () => {
     const res = computeFiveC({ subscores: {} });
     assert.equal(res.items.length, 5);
     for (const it of res.items) closeTo(it.score, 60, 1e-9, `${it.key}`);
     closeTo(res.weighted_score, 60, 1e-9, 'weighted');
     assert.ok(res.weakest && res.strongest);
});

test('computeFiveC: semua 100 → weighted 100; semua 0 → 0', () => {
     const high = {};
     const low = {};
     for (const def of COMPONENT_DEFS) {
          high[def.key] = 100;
          low[def.key] = 0;
     }
     closeTo(computeFiveC({ subscores: high }).weighted_score, 100, 1e-9, 'high');
     closeTo(computeFiveC({ subscores: low }).weighted_score, 0, 1e-9, 'low');
});

test('computeFiveC: bobot efektif per komponen dihormati', () => {
     const subscores = {};
     for (const def of COMPONENT_DEFS) subscores[def.key] = 50;
     // Naikkan hanya komponen Capacity
     const componentWeights = {};
     for (const def of COMPONENT_DEFS) componentWeights[def.key] = COMPONENT_TO_C[def.key] === 'capacity' ? 5 : 0.01;
     componentWeights.dscr = 100; // dscake bobot besar
     const res = computeFiveC({ subscores, componentWeights });
     const capacity = res.items.find((i) => i.key === 'capacity');
     assert.ok(capacity.score >= 50, 'capacity tidak boleh turun di bawah 50');
     assert.ok(res.weighted_score >= 50);
});

test('fiveCLabel: label Indonesia gabungan nama', () => {
     assert.match(fiveCLabel('character'), /Character · Karakter/);
     assert.equal(fiveCLabel('unknown'), 'unknown');
});

test('FIVE_C_WEIGHTS: konsisten dengan definisi', () => {
     for (const c of FIVE_C_DEFS) closeTo(FIVE_C_WEIGHTS[c.key], c.weight, 1e-9, c.key);
});
