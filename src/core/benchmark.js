/**
 * core/benchmark.js — Lookup benchmark industri + skor relatif vs kuartil.
 * Pure functions. Rujukan: ARCHITECTURE §4.3, §3.6.E.
 */

import { RATIO_META } from './config.js';

/** Daftar sektor [{ key, label }]. */
export function listSectors(benchmarkData) {
     const sectors = (benchmarkData && benchmarkData.sectors) || {};
     return Object.entries(sectors).map(([key, v]) => ({
          key,
          label: (v && v.label) || key
     }));
}

/** Ambil benchmark satu rasio pada satu sektor. */
export function getBenchmark(benchmarkData, sectorKey, ratioKey) {
     const sec = benchmarkData && benchmarkData.sectors && benchmarkData.sectors[sectorKey];
     if (!sec || !sec.benchmarks) return null;
     return sec.benchmarks[ratioKey] || null;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const num = (v) =>
     v === null || v === undefined || v === ''
          ? null
          : Number.isFinite(Number(v))
               ? Number(v)
               : null;

/**
 * Skor 0–100 posisi nilai vs kuartil benchmark.
 * Skala (ARCHITECTURE §4.3 / §3.6.E):
 *   ≥ p75 → 100 · ≥ median → 75–100 · ≥ p25 → 50–75 · < p25 → 0–50
 * @param {number} value
 * @param {object} bench — { p10,p25,median,p75,p90,... }
 * @param {'higher'|'lower'} direction
 */
export function scoreRatioVsBenchmark(value, bench, direction = 'higher') {
     const v = num(value);
     if (v === null || !bench) return null;
     const lower = direction === 'lower';

     // Ubah ke skala "makin tinggi makin baik" dengan menegasikan bila lower-is-better.
     const x = lower ? -v : v;
     const p25 = lower ? -num(bench.p75) : num(bench.p25);
     const median = lower ? -num(bench.median) : num(bench.median);
     const p75 = lower ? -num(bench.p25) : num(bench.p75);

     if (p25 === null || median === null || p75 === null) return null;

     if (x >= p75) return 100;
     if (x >= median) {
          const denom = p75 - median;
          return denom <= 0 ? 100 : 75 + 25 * ((x - median) / denom);
     }
     if (x >= p25) {
          const denom = median - p25;
          return denom <= 0 ? 75 : 50 + 25 * ((x - p25) / denom);
     }
     // di bawah p25 → 0..50 (linear, dibatasi)
     const base = p25 <= 0 ? 50 : 50 * (x / p25);
     return clamp(base, 0, 50);
}

/** Level posisi vs benchmark. */
export function benchmarkLevel(value, bench, direction = 'higher') {
     const v = num(value);
     if (v === null || !bench) return null;
     const p25 = num(bench.p25);
     const median = num(bench.median);
     const p75 = num(bench.p75);
     if (p25 === null || median === null || p75 === null) return null;
     if (direction === 'lower') {
          if (v <= p25) return 'above_p75';
          if (v <= median) return 'above_median';
          if (v <= p75) return 'above_p25';
          return 'below_p25';
     }
     if (v >= p75) return 'above_p75';
     if (v >= median) return 'above_median';
     if (v >= p25) return 'above_p25';
     return 'below_p25';
}

/**
 * Bandingkan satu rasio: skor + level + nilai kuartil.
 * @returns {{ rasio, label, value, direction, p25, median, p75, score, level }|null}
 */
export function compareRatio(benchmarkData, sectorKey, ratioKey, value, directionOverride) {
     const bench = getBenchmark(benchmarkData, sectorKey, ratioKey);
     if (!bench) return null;
     const meta = RATIO_META[ratioKey] || {};
     const direction =
          directionOverride || meta.direction || (bench.direction === 'low' ? 'lower' : 'higher');
     const score = scoreRatioVsBenchmark(value, bench, direction);
     const level = benchmarkLevel(value, bench, direction);
     return {
          rasio: ratioKey,
          label: meta.label || ratioKey,
          value: num(value),
          direction,
          p10: num(bench.p10),
          p25: num(bench.p25),
          median: num(bench.median),
          p75: num(bench.p75),
          p90: num(bench.p90),
          mean: num(bench.mean),
          n: bench.n,
          score,
          level
     };
}

// =====================================================================
// Transformasi benchmark (L2)
//  - koreksi UKM (SME correction) atas benchmark emiten besar
//  - persentil ekor p01/p99 untuk deteksi distress
//  - override benchmark manual (F-19)
// =====================================================================

const round6 = (v) => Math.round(v * 1e6) / 1e6;
const round1 = (v) => Math.round(v * 10) / 10;

/** Statistik yang ikut diskalakan saat koreksi UKM. */
const SCALE_KEYS = ['p01', 'p10', 'p25', 'median', 'p75', 'p90', 'p99', 'mean'];

/** Arah "makin baik" satu rasio (RATIO_META menang, lalu bench.direction). */
export function ratioDirection(ratioKey, bench = null) {
     const meta = RATIO_META[ratioKey] || {};
     if (meta.direction) return meta.direction;
     return bench && bench.direction === 'low' ? 'lower' : 'higher';
}

/**
 * Terapkan faktor koreksi UKM ke satu entri benchmark.
 * higher-is-better: ambang × factor (bar diturunkan → lebih adil untuk UKM).
 * lower-is-better : ambang ÷ factor (batas leverage dinaikkan → lebih longgar).
 * Tidak memutasi input; n/std/direction dipertahankan.
 */
export function transformBench(bench, { factor = 1, direction = 'higher' } = {}) {
     const f = num(factor);
     if (!bench || f === null || f <= 0 || f === 1) return bench;
     const mult = direction === 'lower' ? 1 / f : f;
     const out = { ...bench };
     for (const k of SCALE_KEYS) {
          const v = num(bench[k]);
          if (v !== null) out[k] = round6(v * mult);
     }
     out._sme = { factor: f, direction, mult: round6(mult) };
     return out;
}

/**
 * Terapkan koreksi UKM ke seluruh benchmarkData (deep, non-mutasi).
 * Bila nonaktif → mengembalikan objek input apa adanya (nol biaya).
 */
export function applySmeCorrection(benchmarkData, { config = null, enabled = null } = {}) {
     const cfg = (config && config.benchmark && config.benchmark.smeCorrection) || {};
     const on = enabled === null ? !!cfg.enabled : !!enabled;
     if (!on || !benchmarkData || !benchmarkData.sectors) return benchmarkData;
     const factor = num(cfg.factor) ?? 0.78;
     const sectors = {};
     for (const [sk, sec] of Object.entries(benchmarkData.sectors)) {
          const src = (sec && sec.benchmarks) || {};
          const benchmarks = {};
          for (const [rk, bench] of Object.entries(src)) {
               benchmarks[rk] = transformBench(bench, { factor, direction: ratioDirection(rk, bench) });
          }
          sectors[sk] = { ...sec, benchmarks };
     }
     return { ...benchmarkData, sectors, _sme: { applied: true, factor } };
}

/** Apakah entri benchmark menyimpan persentil ekor (p01/p99)? */
export function hasTails(bench) {
     return !!bench && (num(bench.p01) !== null || num(bench.p99) !== null);
}

/**
 * Deteksi pelanggaran ekor = sinyal distress.
 * higher-is-better: nilai < p01. lower-is-better: nilai > p99.
 * @returns {{side, percentile, threshold, value, deviation_pct}|null}
 */
export function tailBreach(value, bench, direction = 'higher') {
     const v = num(value);
     if (v === null || !bench) return null;
     const p01 = num(bench.p01);
     const p99 = num(bench.p99);
     const mk = (side, percentile, threshold) => ({
          side,
          percentile,
          threshold,
          value: v,
          deviation_pct: threshold === 0 ? null : round1(((v - threshold) / Math.abs(threshold)) * 100)
     });
     if (direction === 'lower') {
          if (p99 !== null && v > p99) return mk('upper', 'p99', p99);
          return null;
     }
     if (p01 !== null && v < p01) return mk('lower', 'p01', p01);
     return null;
}

/** true bila nilai berada di luar ekor p01/p99. */
export function isDistress(value, bench, direction = 'higher') {
     return tailBreach(value, bench, direction) !== null;
}

/**
 * Kumpulkan sinyal distress untuk seluruh rasio yang punya ekor p01/p99.
 * @returns {Array<{rasio,label,value,direction,side,percentile,threshold,deviation_pct}>}
 */
export function tailFlags(benchmarkData, sectorKey, ratios = {}, ratioKeys = null) {
     const keys = ratioKeys || Object.keys(RATIO_META);
     const out = [];
     for (const rk of keys) {
          const bench = getBenchmark(benchmarkData, sectorKey, rk);
          if (!hasTails(bench)) continue;
          const direction = ratioDirection(rk, bench);
          const breach = tailBreach(ratios ? ratios[rk] : null, bench, direction);
          if (!breach) continue;
          out.push({ rasio: rk, label: (RATIO_META[rk] && RATIO_META[rk].label) || rk, direction, ...breach });
     }
     return out;
}

/** Statistik yang boleh dioverride manual per rasio. */
const OVERRIDE_KEYS = ['p01', 'p10', 'p25', 'median', 'p75', 'p90', 'p99', 'mean'];

/**
 * Gabungkan override benchmark manual (F-19) di atas data benchmark.
 * overrides: { [sectorKey]: { [ratioKey]: { p25, median, p75, ... } } }
 * Sektor/rasio baru boleh dibuat; entri yang ada di-merge per-field (non-mutasi).
 */
export function applyBenchmarkOverrides(benchmarkData, overrides) {
     if (!overrides || typeof overrides !== 'object' || !benchmarkData || !benchmarkData.sectors) {
          return benchmarkData;
     }
     const sectors = { ...benchmarkData.sectors };
     for (const [sk, ratioMap] of Object.entries(overrides)) {
          if (!ratioMap || typeof ratioMap !== 'object') continue;
          const base = sectors[sk] || { industry_code: sk, label: sk, benchmarks: {} };
          const benchmarks = { ...(base.benchmarks || {}) };
          for (const [rk, patch] of Object.entries(ratioMap)) {
               if (!patch || typeof patch !== 'object') continue;
               const next = { ...(benchmarks[rk] || {}), _override: true };
               for (const k of OVERRIDE_KEYS) {
                    const v = num(patch[k]);
                    if (v !== null) next[k] = v;
               }
               if (patch.direction === 'high' || patch.direction === 'low') next.direction = patch.direction;
               benchmarks[rk] = next;
          }
          sectors[sk] = { ...base, benchmarks };
     }
     return { ...benchmarkData, sectors };
}

/** Label manusia untuk level. */
export const LEVEL_LABEL = {
     above_p75: 'Di atas p75 (kuartil atas)',
     above_median: 'Di atas median',
     above_p25: 'Di antara p25–median',
     below_p25: 'Di bawah p25 (kuartil bawah)'
};
