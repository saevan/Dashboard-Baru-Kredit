/**
 * tests/benchmark-transform.test.js — L2: koreksi UKM, ekor p01/p99 (distress),
 * dan override benchmark manual (F-19) + integrasi engine.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
     ratioDirection,
     transformBench,
     applySmeCorrection,
     hasTails,
     tailBreach,
     isDistress,
     tailFlags,
     applyBenchmarkOverrides,
     getBenchmark
} from '../../src/core/benchmark.js';
import { runFullAnalysis } from '../../src/core/engine.js';

function benchData(roa = {}) {
     return {
          sectors: {
               TEST: {
                    label: 'Test',
                    benchmarks: {
                         roa: {
                              n: 100,
                              p01: 0.001,
                              p10: 0.005,
                              p25: 0.015,
                              median: 0.024,
                              p75: 0.04,
                              p90: 0.06,
                              p99: 0.3,
                              mean: 0.03,
                              std: 0.01,
                              direction: 'high',
                              ...roa
                         },
                         der: {
                              n: 100,
                              p01: 0.1,
                              p10: 0.2,
                              p25: 0.4,
                              median: 0.7,
                              p75: 1.2,
                              p90: 2.0,
                              p99: 4.0,
                              mean: 0.8,
                              std: 0.5,
                              direction: 'low'
                         }
                    }
               }
          }
     };
}

const borrower = {
     nama: 'PT Uji Benchmark',
     sektor: 'TEST',
     profil_company: 'ukm_mapan',
     plafon_diajukan: 1_000_000_000,
     tenor_bulan: 36,
     bunga_tahunan: 0.14,
     keuangan: {
          ebit: 1_200_000_000,
          laba_bersih: 600_000_000,
          penjualan: 5_000_000_000,
          beban_bunga: 90_000_000,
          total_aset: 4_000_000_000,
          aset_lancar: 1_500_000_000,
          liabilitas_jangka_pendek: 1_034_000_000,
          total_liabilitas: 1_534_000_000,
          ekuitas: 2_466_000_000,
          kas: 300_000_000,
          persediaan: 400_000_000,
          piutang: 500_000_000,
          arus_kas_operasional: 700_000_000,
          arrears_days: 0,
          ocf_negatif_periode: 0
     },
     agunan: { nilai_agunan: 1_500_000_000, jenis: 'tanah_bangunan', personal_guarantee: false }
};

// ——— ratioDirection ———

test('benchmark: ratioDirection mengikuti RATIO_META lalu fallback bench.direction', () => {
     assert.equal(ratioDirection('roa'), 'higher');
     assert.equal(ratioDirection('der'), 'lower');
     assert.equal(ratioDirection('tidak_ada', { direction: 'low' }), 'lower');
     assert.equal(ratioDirection('tidak_ada', { direction: 'high' }), 'higher');
});

// ——— transformBench ———

test('benchmark: transformBench (higher) mengalikan kuartil dengan factor', () => {
     const b = { n: 100, p25: 0.1, median: 0.2, p75: 0.4, mean: 0.2, std: 0.1, direction: 'high' };
     const out = transformBench(b, { factor: 0.5, direction: 'higher' });
     assert.equal(out.p25, 0.05);
     assert.equal(out.median, 0.1);
     assert.equal(out.p75, 0.2);
     assert.equal(out.mean, 0.1);
     assert.equal(out.std, 0.1, 'std tidak diskalakan');
     assert.equal(out.n, 100);
     assert.equal(out._sme.mult, 0.5);
     // non-mutasi
     assert.equal(b.median, 0.2);
});

test('benchmark: transformBench (lower) membagi kuartil (batas leverage lebih longgar)', () => {
     const b = { n: 100, p25: 0.4, median: 0.7, p75: 1.2, direction: 'low' };
     const out = transformBench(b, { factor: 0.5, direction: 'lower' });
     assert.equal(out.median, 1.4, '0.7 / 0.5 = 1.4');
     assert.equal(out.p25, 0.8);
     assert.equal(out.p75, 2.4);
});

test('benchmark: transformBench no-op bila factor 1 atau invalid', () => {
     const b = { median: 0.2 };
     assert.equal(transformBench(b, { factor: 1 }), b);
     assert.equal(transformBench(b, { factor: 0 }), b);
     assert.equal(transformBench(null, { factor: 0.5 }), null);
});

// ——— applySmeCorrection ———

test('benchmark: applySmeCorrection nonaktif mengembalikan objek yang sama', () => {
     const data = benchData();
     const out = applySmeCorrection(data, { config: { benchmark: { smeCorrection: { enabled: false } } } });
     assert.equal(out, data);
});

test('benchmark: applySmeCorrection aktif menskalakan seluruh sektor + menandai _sme', () => {
     const data = benchData();
     const out = applySmeCorrection(data, {
          config: { benchmark: { smeCorrection: { enabled: true, factor: 0.78 } } }
     });
     assert.notEqual(out, data);
     assert.equal(out._sme.applied, true);
     assert.equal(out._sme.factor, 0.78);
     const roa = getBenchmark(out, 'TEST', 'roa');
     const der = getBenchmark(out, 'TEST', 'der');
     assert.ok(Math.abs(roa.median - 0.024 * 0.78) < 1e-9, `roa.median=${roa.median}`);
     assert.ok(Math.abs(der.median - 0.7 / 0.78) < 1e-6, `der.median=${der.median}`);
     // data asli tidak berubah
     assert.equal(getBenchmark(data, 'TEST', 'roa').median, 0.024);
});

// ——— ekor p01/p99 + distress ———

test('benchmark: hasTails mendeteksi keberadaan p01/p99', () => {
     assert.equal(hasTails({ p01: 0.1 }), true);
     assert.equal(hasTails({ p99: 0.9 }), true);
     assert.equal(hasTails({ p25: 0.1, median: 0.2, p75: 0.3 }), false);
     assert.equal(hasTails(null), false);
});

test('benchmark: tailBreach higher → di bawah p01 adalah distress', () => {
     const b = { p01: 0.001, p99: 0.3 };
     const breach = tailBreach(0.0005, b, 'higher');
     assert.ok(breach);
     assert.equal(breach.side, 'lower');
     assert.equal(breach.percentile, 'p01');
     assert.ok(Math.abs(breach.threshold - 0.001) < 1e-12);
     assert.equal(tailBreach(0.05, b, 'higher'), null, 'dalam rentang → bukan distress');
});

test('benchmark: tailBreach lower → di atas p99 adalah distress', () => {
     const b = { p01: 0.1, p99: 4.0 };
     const breach = tailBreach(5.0, b, 'lower');
     assert.ok(breach);
     assert.equal(breach.side, 'upper');
     assert.equal(breach.percentile, 'p99');
     assert.equal(tailBreach(0.5, b, 'lower'), null);
});

test('benchmark: isDistress + tailFlags hanya mengumpulkan yang melanggar ekor', () => {
     const data = benchData({ p01: 0.9 }); // paksa ROA borrower di bawah p01
     assert.equal(isDistress(0.15, getBenchmark(data, 'TEST', 'roa'), 'higher'), true);
     const flags = tailFlags(data, 'TEST', { roa: 0.15, der: 0.62 });
     assert.equal(flags.length, 1, 'hanya roa yang melanggar');
     assert.equal(flags[0].rasio, 'roa');
     assert.equal(flags[0].percentile, 'p01');
});

// ——— override benchmark (F-19) ———

test('benchmark: applyBenchmarkOverrides me-merge per-field & membuat sektor/rasio baru', () => {
     const data = benchData();
     const out = applyBenchmarkOverrides(data, {
          TEST: { roa: { median: 0.05, p75: 0.09 } },
          BARU: { nim: { p25: 0.02, median: 0.03, p75: 0.05 } }
     });
     const roa = getBenchmark(out, 'TEST', 'roa');
     assert.equal(roa.median, 0.05);
     assert.equal(roa.p75, 0.09);
     assert.equal(roa._override, true);
     assert.ok(roa.p25 != null, 'field lain dipertahankan');
     const nim = getBenchmark(out, 'BARU', 'nim');
     assert.equal(nim.median, 0.03);
     // non-mutasi
     assert.equal(getBenchmark(data, 'TEST', 'roa').median, 0.024);
     assert.equal(getBenchmark(data, 'BARU', 'nim'), null);
});

test('benchmark: applyBenchmarkOverrides tanpa override mengembalikan objek yang sama', () => {
     const data = benchData();
     assert.equal(applyBenchmarkOverrides(data, null), data);
     assert.equal(applyBenchmarkOverrides(data, {}).sectors.TEST.benchmarks.roa.median, 0.024);
});

// ——— integrasi engine ———

test('engine: config.benchmark.smeCorrection aktif → median benchmark terskalakan', () => {
     const r = runFullAnalysis(borrower, {
          benchmarkData: benchData(),
          config: { benchmark: { smeCorrection: { enabled: true, factor: 0.78 } } }
     });
     assert.equal(r.meta.sme_correction.enabled, true);
     const roa = r.benchmark.items.find((i) => i.rasio === 'roa');
     assert.ok(roa, 'item roa harus ada');
     assert.ok(Math.abs(roa.median - 0.024 * 0.78) < 1e-9, `median=${roa.median}`);
});

test('engine: distress terdeteksi bila rasio di luar ekor p01/p99', () => {
     const r = runFullAnalysis(borrower, { benchmarkData: benchData({ p01: 0.9 }) });
     assert.ok(Array.isArray(r.meta.distress), 'meta.distress harus array');
     const flag = r.meta.distress.find((d) => d.rasio === 'roa');
     assert.ok(flag, 'ROA di bawah p01 → distress');
     assert.equal(flag.percentile, 'p01');
});

test('engine: tanpa sme correction, data benchmark asli dipakai (default aman)', () => {
     const r = runFullAnalysis(borrower, { benchmarkData: benchData() });
     assert.equal(r.meta.sme_correction.enabled, false);
     const roa = r.benchmark.items.find((i) => i.rasio === 'roa');
     assert.ok(Math.abs(roa.median - 0.024) < 1e-12);
});
