/**
 * core/gap.js — Gap analysis borrower vs benchmark industri.
 * Pure functions. Rujukan: ARCHITECTURE §3A.3, §3.6.G.
 *
 * Catatan tanda: gap disesuaikan ke arah "favourability" —
 * untuk rasio lower-is-better (DER/DAR/...), nilai di ATAS median = gap NEGATIF (buruk),
 * konsisten dengan contoh ARCHITECTURE §3A.1 ("DER 0.62 vs median 0.50 → gap −24%").
 */

import { RATIO_META, MAIN_RATIOS } from './config.js';
import { getBenchmark } from './benchmark.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round1 = (v) => (v === null || v === undefined ? null : Math.round(v * 10) / 10);

/**
 * Hitung gap untuk seluruh rasio yang tersedia benchmark-nya.
 * @param {object} args
 * @param {object} args.ratios — hasil computeRatios()
 * @param {string} args.sectorKey
 * @param {object} args.benchmarkData
 * @param {string[]} [args.mainRatios]
 * @param {object} [args.config]
 */
export function computeGap({ ratios, sectorKey, benchmarkData, mainRatios = MAIN_RATIOS, config = null }) {
     const g = (config && config.gap) || {};
     const tooFar = Number.isFinite(g.too_far) ? g.too_far : -30;
     const minBreach = Number.isFinite(g.mainRatiosMinBreach) ? g.mainRatiosMinBreach : 3;

     const items = [];
     const ratioKeys = Object.keys(RATIO_META).filter((k) => k !== 'ltd_to_equity' && k !== 'debt_to_capital');

     for (const key of ratioKeys) {
          const v = ratios ? ratios[key] : null;
          if (v === null || v === undefined || !Number.isFinite(Number(v))) continue;
          const bench = getBenchmark(benchmarkData, sectorKey, key);
          if (!bench) continue;
          const median = Number(bench.median);
          if (!Number.isFinite(median) || median === 0) continue;

          const direction = (RATIO_META[key] && RATIO_META[key].direction) || 'higher';
          const rawPct = ((Number(v) - median) / Math.abs(median)) * 100;
          const gapPct = direction === 'lower' ? -rawPct : rawPct;

          items.push({
               rasio: key,
               label: (RATIO_META[key] && RATIO_META[key].label) || key,
               borrower: Number(v),
               median,
               p25: bench.p25,
               p75: bench.p75,
               direction,
               raw_gap_pct: round1(rawPct),
               gap_pct: round1(gapPct),
               gap_score: round1(clamp(gapPct, -100, 100)),
               is_main: mainRatios.includes(key)
          });
     }

     const mainItems = items.filter((i) => i.is_main);
     const pool = mainItems.length ? mainItems : items;
     const avgGapPct = pool.length
          ? pool.reduce((a, b) => a + b.gap_pct, 0) / pool.length
          : 0;
     const breachCount = mainItems.filter((i) => i.gap_pct < tooFar).length;
     const verdict = avgGapPct < tooFar || breachCount >= minBreach ? 'too_far' : 'acceptable';

     return {
          items,
          main_items: mainItems,
          avg_gap_pct: round1(avgGapPct),
          breach_count: breachCount,
          verdict,
          threshold: { too_far: tooFar, mainRatiosMinBreach: minBreach }
     };
}

/** Ringkasan gap untuk ditampilkan di UI. */
export function gapSummaryText(gapSummary) {
     if (!gapSummary) return '—';
     if (gapSummary.verdict === 'too_far') {
          return `Gap terlalu jauh (rata-rata ${gapSummary.avg_gap_pct}%, ${gapSummary.breach_count} rasio utama < −30%) → TIDAK LAYAK`;
     }
     return `Gap wajar (rata-rata ${gapSummary.avg_gap_pct}%)`;
}
