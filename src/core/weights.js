/**
 * core/weights.js — Bobot dinamis quanti/quali per profil company + penyesuaian berbasis gap.
 * Pure functions. Rujukan: ARCHITECTURE §3A.3, §3.6.F, §3.6.G.
 *
 * Rumus: bobot_i' = bobot_dasar_i × (1 + k × gap_score_i/100), lalu dinormalisasi Σ = 1.0.
 */

import { PILLARS, ratioToPillar } from './config.js';

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Ambil profil quanti/quali untuk profil company. */
export function resolveProfileWeights(profileKey, profiles) {
     const p = profiles && profiles[profileKey];
     if (!p) {
          return { quanti: 0.5, quali: 0.5, rasio_dominan: [], label: profileKey || '—', key: profileKey };
     }
     return {
          key: profileKey,
          label: p.label || profileKey,
          quanti: num(p.quanti),
          quali: num(p.quali),
          rasio_dominan: p.rasio_dominan || []
     };
}

/**
 * Sesuaikan sekumpulan bobot berdasarkan gap.
 * @param {object} baseWeights — { key: bobot } (Σ bebas, akan dinormalisasi)
 * @param {Array} gapItems — [{ rasio, gap_score }]
 * @param {number} k — faktor sensitivitas (default 0.5)
 * @returns {{ adjusted:object, normalized:object, notes:Array, sum_before_norm:number }}
 */
export function adjustWeightsByGap(baseWeights, gapItems, k = 0.5) {
     const adjusted = { ...baseWeights };
     const notes = [];
     const gapScoreByKey = {};
     for (const it of gapItems || []) {
          if (it && it.rasio) gapScoreByKey[it.rasio] = num(it.gap_score);
     }

     for (const key of Object.keys(adjusted)) {
          if (gapScoreByKey[key] === undefined) continue;
          const from = num(adjusted[key]);
          const gapScore = gapScoreByKey[key];
          const factor = 1 + k * (gapScore / 100);
          const to = from * factor;
          adjusted[key] = to;
          notes.push({ rasio: key, from, to, gap_score: gapScore, gap_pct: gapScore, factor });
     }

     const sum = Object.values(adjusted).reduce((a, b) => a + num(b), 0);
     const normalized = {};
     for (const key of Object.keys(adjusted)) {
          normalized[key] = sum === 0 ? 0 : num(adjusted[key]) / sum;
     }

     return { adjusted, normalized, notes, sum_before_norm: sum };
}

/**
 * Sesuaikan bobot PILAR (6 pilar) berdasarkan gap rasio.
 * Gap per rasio dipetakan ke pilar (rata-rata bila satu pilar punya banyak rasio).
 */
export function adjustPillarWeightsByGap(pillarWeights, gapItems, k = 0.5) {
     const byPillar = {};
     for (const it of gapItems || []) {
          const pillar = ratioToPillar(it.rasio);
          if (!pillar) continue;
          if (!byPillar[pillar]) byPillar[pillar] = [];
          byPillar[pillar].push(num(it.gap_score));
     }
     const gapForPillar = Object.entries(byPillar).map(([pillar, arr]) => ({
          rasio: pillar,
          gap_score: arr.reduce((a, b) => a + b, 0) / arr.length
     }));

     const res = adjustWeightsByGap(pillarWeights, gapForPillar, k);

     // Pastikan semua 6 pilar ada di output.
     for (const p of PILLARS) {
          if (res.adjusted[p] === undefined) res.adjusted[p] = num(pillarWeights[p]);
          if (res.normalized[p] === undefined) res.normalized[p] = 0;
     }
     // Normalisasi ulang bila ada pilar yang tertinggal.
     const sum = PILLARS.reduce((a, p) => a + num(res.normalized[p]), 0);
     if (sum > 0) {
          for (const p of PILLARS) res.normalized[p] = num(res.normalized[p]) / sum;
     }
     return res;
}

/** Total bobot pilar (untuk validasi Pengaturan = 100%). */
export function sumWeights(weights) {
     return Object.values(weights || {}).reduce((a, b) => a + num(b), 0);
}
