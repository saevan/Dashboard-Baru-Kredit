/**
 * tests/confidence.test.js — Model Tingkat Keyakinan Data (core/confidence.js).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
     computeConfidence,
     financialCompleteness,
     confidenceRank,
     CONFIDENCE_LEVEL
} from '../../src/core/confidence.js';
import { REQUIRED_FINANCIAL_FIELDS } from '../../src/core/intake-config.js';

/** Data keuangan lengkap (semua field wajib terisi). */
function fullFinancials() {
     const f = {};
     for (const key of REQUIRED_FINANCIAL_FIELDS) f[key] = 1000;
     f.total_aset = 2000; // liabilities 1000 + equity 1000
     return f;
}

test('financialCompleteness menghitung rasio field terisi', () => {
     assert.equal(financialCompleteness(fullFinancials()), 1);
     assert.equal(financialCompleteness({}), 0);
     const half = {};
     const keys = REQUIRED_FINANCIAL_FIELDS.slice(0, Math.floor(REQUIRED_FINANCIAL_FIELDS.length / 2));
     for (const k of keys) half[k] = 1;
     assert.ok(financialCompleteness(half) > 0 && financialCompleteness(half) < 1);
});

test('data lengkap dan banyak sumber terverifikasi menghasilkan level HIGH', () => {
     const r = computeConfidence({
          verified: [
               'identitas',
               'legalitas',
               'rekening_koran',
               'laporan_keuangan',
               'faktur_pajak',
               'laporan_audited',
               'slik_ojk'
          ],
          financials: fullFinancials()
     });
     assert.equal(r.level, CONFIDENCE_LEVEL.HIGH);
     assert.equal(r.level_label, 'Tinggi');
     assert.equal(r.tone, 'ok');
     assert.ok(r.weight_sum >= 12);
     assert.equal(r.meets_mandatory, true);
     assert.deepEqual(r.mandatory_missing, []);
});

test('sumber wajib saja menghasilkan level MEDIUM', () => {
     const r = computeConfidence({
          verified: ['identitas', 'legalitas', 'rekening_koran', 'laporan_keuangan'],
          financials: fullFinancials()
     });
     assert.equal(r.level, CONFIDENCE_LEVEL.MEDIUM);
     assert.equal(r.verified_count, 4);
     assert.equal(r.meets_mandatory, true);
});

test('sumber wajib yang belum terverifikasi menekan level ke LOW', () => {
     const r = computeConfidence({
          verified: ['rekening_koran', 'laporan_keuangan', 'faktur_pajak', 'laporan_audited', 'slik_ojk', 'agunan'],
          financials: fullFinancials()
     });
     assert.equal(r.level, CONFIDENCE_LEVEL.LOW);
     assert.equal(r.meets_mandatory, false);
     assert.ok(r.mandatory_missing.includes('identitas'));
     assert.ok(r.mandatory_missing.includes('legalitas'));
});

test('tanpa data sama sekali → LOW dengan catatan', () => {
     const r = computeConfidence({});
     assert.equal(r.level, CONFIDENCE_LEVEL.LOW);
     assert.equal(r.verified_count, 0);
     assert.equal(r.completeness, 0);
     assert.ok(r.notes.length >= 1);
});

test('integritas laporan gagal mencegah level HIGH', () => {
     const r = computeConfidence({
          verified: [
               'identitas',
               'legalitas',
               'rekening_koran',
               'laporan_keuangan',
               'faktur_pajak',
               'laporan_audited',
               'slik_ojk'
          ],
          financials: fullFinancials(),
          integrity: { status: 'FAIL' }
     });
     assert.equal(r.level, CONFIDENCE_LEVEL.MEDIUM);
     assert.equal(r.integrity_status, 'FAIL');
     assert.ok(r.notes.some((n) => /integritas/i.test(n)));
});

test('confidenceRank mengurutkan LOW < MEDIUM < HIGH', () => {
     assert.ok(confidenceRank('LOW') < confidenceRank('MEDIUM'));
     assert.ok(confidenceRank('MEDIUM') < confidenceRank('HIGH'));
     assert.equal(confidenceRank('unknown'), -1);
});
