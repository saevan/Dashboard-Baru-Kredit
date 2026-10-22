/**
 * tests/daily-cashflow.test.js — Analisis arus kas harian (khusus UMKM).
 *
 * Masukan stakeholder: "umkm kalau bisa cuma perhari".
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDailyCashflow, DAILY_CASHFLOW_DEFAULTS } from '../../src/core/daily-cashflow.js';
import { classifyBorrower } from '../../src/core/segment.js';
import { runFullAnalysis, emptyBorrower } from '../../src/core/engine.js';

const umkm = classifyBorrower({ plafon_diajukan: 30_000_000 });
const corporate = classifyBorrower({ plafon_diajukan: 6_000_000_000 });

const borrower = {
     keuangan: {
          penjualan: 600_000_000,
          arus_kas_operasional: 120_000_000
     }
};

test('daily: default assumption tersedia', () => {
     assert.equal(DAILY_CASHFLOW_DEFAULTS.workingDaysPerMonth, 26);
});

test('daily: segmen UMKM → applicable & status sehat', () => {
     const d = buildDailyCashflow(borrower, {}, { segment: umkm, annualDs: 60_000_000 });
     assert.equal(d.applicable, true);
     assert.equal(d.period, 'harian');
     assert.equal(d.status, 'sehat');
     // 26 hari kerja × 12 = 312 hari/tahun
     assert.equal(d.assumptions.working_days_per_year, 312);
     // omzet harian = 600jt / 312
     assert.ok(Math.abs(d.daily.revenue - 600_000_000 / 312) < 0.01);
     // coverage = 120jt / 60jt = 2x
     assert.ok(Math.abs(d.coverage_ratio - 2) < 1e-9);
     assert.equal(d.weekly_weights.length, 7);
});

test('daily: arus kas tidak cukup → defisit', () => {
     const d = buildDailyCashflow(
          { keuangan: { penjualan: 600_000_000, arus_kas_operasional: 30_000_000 } },
          {},
          { segment: umkm, annualDs: 60_000_000 }
     );
     assert.equal(d.status, 'defisit');
     assert.ok(d.daily.net < 0);
     assert.ok(d.notes.some((n) => /TIDAK cukup/i.test(n)));
});

test('daily: coverage tipis → ketat', () => {
     const d = buildDailyCashflow(
          { keuangan: { penjualan: 600_000_000, arus_kas_operasional: 66_000_000 } },
          {},
          { segment: umkm, annualDs: 60_000_000 }
     );
     assert.equal(d.status, 'ketat');
});

test('daily: tanpa debt service → tidak_ada_data', () => {
     const d = buildDailyCashflow(borrower, {}, { segment: umkm, annualDs: 0 });
     assert.equal(d.status, 'tidak_ada_data');
});

test('daily: segmen non-UMKM → tidak relevan', () => {
     const d = buildDailyCashflow(borrower, {}, { segment: corporate, annualDs: 60_000_000 });
     assert.equal(d.applicable, false);
     assert.equal(d.status, 'tidak_relevan');
});

test('daily: asumsi dapat dikonfigurasi', () => {
     const d = buildDailyCashflow(borrower, {}, {
          segment: umkm,
          annualDs: 60_000_000,
          config: { dailyCashflow: { workingDaysPerMonth: 20 } }
     });
     assert.equal(d.assumptions.working_days_per_month, 20);
     assert.equal(d.assumptions.working_days_per_year, 240);
});

test('daily: engine menghitung arus kas harian untuk UMKM', () => {
     const b = emptyBorrower();
     b.plafon_diajukan = 30_000_000;
     b.tenor_bulan = 12;
     Object.assign(b.keuangan, {
          penjualan: 600_000_000,
          arus_kas_operasional: 120_000_000,
          total_aset: 500_000_000,
          total_liabilitas: 200_000_000,
          ekuitas: 300_000_000
     });
     const r = runFullAnalysis(b);
     assert.ok(r.daily_cashflow);
     assert.equal(r.daily_cashflow.applicable, true);
     assert.equal(r.daily_cashflow.period, 'harian');
});
