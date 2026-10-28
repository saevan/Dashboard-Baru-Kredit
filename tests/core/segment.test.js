/**
 * tests/segment.test.js — Segmentasi & diferensiasi borrower.
 *
 * Masukan stakeholder: "setiap peminjam harus dibedabedakan".
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyBorrower, SEGMENTS, SEGMENT_LIST, SEGMENT_THRESHOLDS } from '../../src/core/segment.js';
import { runFullAnalysis, emptyBorrower } from '../../src/core/engine.js';

test('segment: daftar segmen lengkap', () => {
     assert.ok(SEGMENT_LIST.length >= 6);
     assert.equal(SEGMENT_LIST.length, Object.keys(SEGMENTS).length);
     assert.equal(SEGMENT_THRESHOLDS.mikroMax, 50_000_000);
});

test('segment: plafon kecil → UMKM mikro (harian)', () => {
     const s = classifyBorrower({ plafon_diajukan: 30_000_000 });
     assert.equal(s.key, 'umkm_mikro');
     assert.equal(s.is_umkm, true);
     assert.equal(s.treatment.daily_cashflow, true);
     assert.equal(s.treatment.cadence, 'harian');
     assert.equal(s.treatment.bank_template, false);
     assert.ok(s.criteria.length >= 1);
});

test('segment: plafon 300 juta → UMKM kecil (harian)', () => {
     const s = classifyBorrower({ plafon_diajukan: 300_000_000 });
     assert.equal(s.key, 'umkm_kecil');
     assert.equal(s.treatment.daily_cashflow, true);
});

test('segment: plafon 1 miliar → UMKM menengah (bulanan, tanpa harian)', () => {
     const s = classifyBorrower({ plafon_diajukan: 1_000_000_000 });
     assert.equal(s.key, 'umkm_menengah');
     assert.equal(s.is_umkm, true);
     assert.equal(s.treatment.daily_cashflow, false);
     assert.equal(s.treatment.cadence, 'bulanan');
});

test('segment: plafon > 5 miliar → korporasi (kuartalan)', () => {
     const s = classifyBorrower({ plafon_diajukan: 6_000_000_000 });
     assert.equal(s.key, 'corporate');
     assert.equal(s.is_umkm, false);
     assert.equal(s.treatment.cadence, 'kuartalan');
});

test('segment: sektor keuangan → lembaga keuangan (template bank, prioritas tertinggi)', () => {
     const s = classifyBorrower({ sektor: 'IDX-FINANCIALS', plafon_diajukan: 30_000_000 });
     assert.equal(s.key, 'financial_institution');
     assert.equal(s.is_financial, true);
     assert.equal(s.treatment.bank_template, true);
     assert.equal(s.treatment.daily_cashflow, false);
});

test('segment: neraca berisi field khas bank → lembaga keuangan', () => {
     const s = classifyBorrower({ keuangan: { npl: 0.03, total_aset: 10_000_000_000 } });
     assert.equal(s.key, 'financial_institution');
});

test('segment: profil startup → startup', () => {
     const s = classifyBorrower({ profil_company: 'startup', plafon_diajukan: 100_000_000 });
     assert.equal(s.key, 'startup');
     assert.equal(s.treatment.daily_cashflow, true);
});

test('segment: ambang batas dapat dikonfigurasi', () => {
     const s = classifyBorrower({ plafon_diajukan: 30_000_000 }, { segment: { mikroMax: 10_000_000 } });
     assert.equal(s.key, 'umkm_kecil');
});

test('segment: target DSCR mengikuti config.nominal', () => {
     const s = classifyBorrower({ plafon_diajukan: 1_000_000 }, { nominal: { dscrTarget: 1.4 } });
     assert.equal(s.treatment.dscr_target, 1.4);
});

test('segment: engine melampirkan segmen borrower', () => {
     const b = emptyBorrower();
     b.plafon_diajukan = 30_000_000;
     b.tenor_bulan = 12;
     const r = runFullAnalysis(b);
     assert.ok(r.segment);
     assert.equal(r.segment.key, 'umkm_mikro');
     assert.equal(r.meta.segment, 'umkm_mikro');
});
