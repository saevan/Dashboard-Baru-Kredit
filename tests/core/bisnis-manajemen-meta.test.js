/**
 * tests/bisnis-manajemen-meta.test.js — Penjelasan parameter Bisnis & Manajemen.
 *
 * Memastikan metadata label + penjelasan (help) lengkap dan konsisten sehingga
 * wizard (langkah 3) dan layar detail selalu menampilkan penjelasan parameter.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { BISNIS_MANAJEMEN_META, BISNIS_MANAJEMEN_GROUPS, SCORE_SCALE_GUIDE, COMPONENT_DEFS } from '../../src/core/config.js';

const EXPECTED_KEYS = [
     'skor_model_bisnis',
     'posisi_pasar',
     'skalabilitas',
     'ketergantungan',
     'tren_keuangan',
     'pengalaman_tim',
     'rekam_jejak_bayar',
     'tata_kelola',
     'track_record_tahun',
     'cash_runway_bulan',
     'ocf_positif',
     'skor_industri_risk',
     'prospek_industri',
     'sensitivitas_makro'
];

const VALID_UNITS = new Set(['skor', 'tahun', 'bulan', 'bool']);
const GROUPS = ['viability', 'management', 'industry'];

test('bisnis-manajemen: metadata memuat tepat seluruh parameter yang diharapkan', () => {
     assert.deepEqual(Object.keys(BISNIS_MANAJEMEN_META).sort(), [...EXPECTED_KEYS].sort());
});

test('bisnis-manajemen: setiap parameter punya label, help, group & unit valid', () => {
     for (const [k, m] of Object.entries(BISNIS_MANAJEMEN_META)) {
          assert.ok(typeof m.label === 'string' && m.label.length > 0, `${k}.label terisi`);
          assert.ok(typeof m.help === 'string' && m.help.length >= 20, `${k}.help memadai (≥20 karakter)`);
          assert.ok(BISNIS_MANAJEMEN_GROUPS[m.group], `${k}.group dikenali (${m.group})`);
          assert.ok(VALID_UNITS.has(m.unit), `${k}.unit valid (${m.unit})`);
     }
});

test('bisnis-manajemen: grup menaungi minimal satu parameter & judul terisi', () => {
     assert.deepEqual(Object.keys(BISNIS_MANAJEMEN_GROUPS).sort(), [...GROUPS].sort());
     for (const g of GROUPS) {
          const n = Object.values(BISNIS_MANAJEMEN_META).filter((m) => m.group === g).length;
          assert.ok(n > 0, `grup ${g} menaungi ${n} parameter`);
          assert.ok(typeof BISNIS_MANAJEMEN_GROUPS[g] === 'string' && BISNIS_MANAJEMEN_GROUPS[g].length > 0);
     }
});

test('bisnis-manajemen: SCORE_SCALE_GUIDE 5 band 0–1 berurutan', () => {
     assert.equal(SCORE_SCALE_GUIDE.length, 5);
     for (const g of SCORE_SCALE_GUIDE) {
          assert.ok(g.range && g.label && g.note, 'band lengkap (range/label/note)');
     }
     assert.match(SCORE_SCALE_GUIDE[0].range, /^0,00/);
     assert.match(SCORE_SCALE_GUIDE[4].range, /1,00$/);
});

test('bisnis-manajemen: komponen kualitatif pilar tercakup di meta', () => {
     const mapper = {
          model_bisnis: 'skor_model_bisnis',
          posisi_pasar: 'posisi_pasar',
          skalabilitas: 'skalabilitas',
          ketergantungan: 'ketergantungan',
          tren_keuangan: 'tren_keuangan',
          ocf_positif: 'ocf_positif',
          risiko_sektor: 'skor_industri_risk',
          prospek_industri: 'prospek_industri',
          sensitivitas_makro: 'sensitivitas_makro',
          pengalaman_tim: 'pengalaman_tim',
          rekam_jejak_bayar: 'rekam_jejak_bayar',
          tata_kelola: 'tata_kelola'
     };
     for (const c of COMPONENT_DEFS.filter((d) => d.qualitative)) {
          const bmKey = mapper[c.key];
          if (bmKey) assert.ok(BISNIS_MANAJEMEN_META[bmKey], `komponen ${c.key} → parameter ${bmKey} ada di meta`);
     }
});
