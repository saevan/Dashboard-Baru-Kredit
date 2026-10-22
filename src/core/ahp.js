/**
 * core/ahp.js — Analytical Hierarchy Process (human layer).
 *
 * Rujukan: docs/ARCHITECTURE.md §7A (Hybrid Decision Engine: AHP-SVM),
 * §8.3 (file tree: `ahp.js # AHP weighting (human layer)`), §10.1
 * (LAYER 3: AHP weighting — bobot 6 pilar dari expert judgment).
 *
 * AHP mengubah penilaian berpasangan (pairwise comparison) seorang pakar
 * menjadi BOBOT numerik yang dapat dipertanggungjawabkan, sekaligus mengukur
 * konsistensi penilaian lewat Consistency Ratio (CR). Bila CR < 0.10, penilaian
 * dianggap konsisten (Saaty, 1980).
 *
 * Semua fungsi PURE (tanpa DOM / fetch) agar deterministik & dapat diuji.
 * Tidak ada dependensi eksternal — prioritas dihitung dengan metode
 * row-geometric-mean (aproksimasi eigenvector utama untuk matriks resiprokal).
 */

/** Saaty Random Index (RI) — n = 1..15. */
export const RANDOM_INDEX = {
     1: 0,
     2: 0,
     3: 0.58,
     4: 0.9,
     5: 1.12,
     6: 1.24,
     7: 1.32,
     8: 1.41,
     9: 1.45,
     10: 1.49,
     11: 1.51,
     12: 1.48,
     13: 1.56,
     14: 1.57,
     15: 1.59
};

/** Ambang CR standar Saaty. */
export const CR_THRESHOLD = 0.1;

const num = (v, d = 0) => {
     const n = Number(v);
     return Number.isFinite(n) ? n : d;
};

const round = (v, p = 4) => {
     const f = 10 ** p;
     return Math.round(num(v) * f) / f;
};

/**
 * Normalisasi vektor bobot agar Σ = 1 (mengembalikan nol-bersih bila total 0).
 * @param {number[]} values
 * @returns {number[]}
 */
export function normalizeWeights(values = []) {
     const arr = values.map((v) => Math.max(0, num(v, 0)));
     const total = arr.reduce((a, b) => a + b, 0);
     if (!(total > 0)) return arr.map(() => 0);
     return arr.map((v) => v / total);
}

/**
 * Bangun matriks pairwise RESIPROKAL yang konsisten dari sebuah vektor bobot:
 * a_ij = w_i / w_j. Berguna untuk baseline default / pengujian.
 * @param {number[]} weights
 * @returns {number[][]}
 */
export function buildPairwiseFromWeights(weights = []) {
     const w = normalizeWeights(weights);
     const n = w.length;
     const m = [];
     for (let i = 0; i < n; i++) {
          const row = [];
          for (let j = 0; j < n; j++) {
               if (w[j] === 0) row.push(w[i] === 0 ? 1 : Number.POSITIVE_INFINITY);
               else row.push(round(w[i] / w[j], 6));
          }
          m.push(row);
     }
     return m;
}

/**
 * Validasi matriks pairwise: persegi, elemen > 0, diagonal = 1, resiprokal.
 * @param {number[][]} matrix
 * @returns {{ valid:boolean, reasons:string[], n:number }}
 */
export function validateMatrix(matrix = []) {
     const reasons = [];
     if (!Array.isArray(matrix) || matrix.length === 0) {
          return { valid: false, reasons: ['Matriks kosong.'], n: 0 };
     }
     const n = matrix.length;
     for (let i = 0; i < n; i++) {
          const row = matrix[i];
          if (!Array.isArray(row) || row.length !== n) {
               return { valid: false, reasons: [`Baris ${i} bukan array panjang ${n}.`], n };
          }
          if (Math.abs(num(row[i], 0) - 1) > 1e-6) reasons.push(`Diagonal [${i},${i}] harus 1.`);
          for (let j = 0; j < n; j++) {
               const a = num(row[j], NaN);
               const b = num(matrix[j]?.[i], NaN);
               if (!(num(row[j], NaN) > 0)) reasons.push(`Elemen [${i},${j}] harus > 0.`);
               if (Number.isFinite(a) && Number.isFinite(b) && b !== 0 && Math.abs(a - 1 / b) > 1e-3) {
                    reasons.push(`Tidak resiprokal pada [${i},${j}] vs [${j},${i}].`);
               }
          }
     }
     return { valid: reasons.length === 0, reasons, n };
}

/**
 * Prioritas lokal via row geometric mean, lalu dinormalisasi.
 * @param {number[][]} matrix
 * @returns {number[]}
 */
export function geometricMeanPriority(matrix = []) {
     const n = matrix.length;
     if (n === 0) return [];
     const gm = matrix.map((row) => {
          let product = 1;
          for (const v of row) product *= Math.max(num(v, 0), Number.MIN_VALUE);
          return product ** (1 / n);
     });
     return normalizeWeights(gm);
}

/**
 * Eigenvalue utama (λmax) dari matriks pairwise terhadap vektor bobot.
 * λmax = (1/n) · Σ_i (A·w)_i / w_i
 * @param {number[][]} matrix
 * @param {number[]} weights
 * @returns {number}
 */
export function lambdaMax(matrix = [], weights = []) {
     const n = matrix.length;
     if (n === 0) return 0;
     const w = weights.length === n ? weights : geometricMeanPriority(matrix);
     let sum = 0;
     for (let i = 0; i < n; i++) {
          let aw = 0;
          for (let j = 0; j < n; j++) aw += num(matrix[i][j], 0) * num(w[j], 0);
          const wi = num(w[i], 0);
          sum += wi > 0 ? aw / wi : 0;
     }
     return sum / n;
}

/**
 * Consistency Index (CI) = (λmax − n) / (n − 1).
 * @param {number[][]} matrix
 * @param {number[]} [weights]
 * @returns {number}
 */
export function consistencyIndex(matrix = [], weights = []) {
     const n = matrix.length;
     if (n < 3) return 0;
     return (lambdaMax(matrix, weights) - n) / (n - 1);
}

/**
 * Consistency Ratio (CR) = CI / RI(n). CR < 0.10 → konsisten.
 * Untuk n ≤ 2, RI = 0 sehingga CR = 0.
 * @param {number[][]} matrix
 * @param {number[]} [weights]
 * @param {object} [ri] — tabel RI (default RANDOM_INDEX)
 * @returns {number}
 */
export function consistencyRatio(matrix = [], weights = [], ri = RANDOM_INDEX) {
     const n = matrix.length;
     if (n < 3) return 0;
     const riN = num(ri[n], 0);
     if (riN <= 0) return 0;
     return consistencyIndex(matrix, weights) / riN;
}

/**
 * Hitung bobot AHP lengkap + diagnosis konsistensi.
 *
 * @param {number[][]} matrix — matriks pairwise resiprokal (n×n)
 * @param {object} [options] — { labels, ri, maxCR }
 * @returns {{
 *   n:number, valid:boolean, reasons:string[], weights:number[],
 *   lambda_max:number, ci:number, cr:number, ri:number,
 *   consistent:boolean, max_cr:number, labels:string[]
 * }}
 */
export function ahpWeights(matrix = [], options = {}) {
     const labels = Array.isArray(options.labels) ? options.labels : [];
     const ri = options.ri || RANDOM_INDEX;
     const maxCR = num(options.maxCR, CR_THRESHOLD);
     const check = validateMatrix(matrix);
     const n = check.n;

     if (!check.valid) {
          return {
               n,
               valid: false,
               reasons: check.reasons,
               weights: normalizeWeights(new Array(n).fill(0)),
               lambda_max: 0,
               ci: 0,
               cr: 0,
               ri: num(ri[n], 0),
               consistent: false,
               max_cr: maxCR,
               labels
          };
     }

     const weights = geometricMeanPriority(matrix);
     const lmax = lambdaMax(matrix, weights);
     const ci = n >= 3 ? (lmax - n) / (n - 1) : 0;
     const riN = num(ri[n], 0);
     const cr = n < 3 || riN <= 0 ? 0 : ci / riN;

     return {
          n,
          valid: true,
          reasons: [],
          weights: weights.map((w) => round(w, 6)),
          lambda_max: round(lmax, 6),
          ci: round(ci, 6),
          cr: round(cr, 6),
          ri: riN,
          consistent: cr < maxCR + 1e-9,
          max_cr: maxCR,
          labels
     };
}

/** Ringkas hasil AHP untuk laporan/persistensi. */
export function ahpSummary(result = {}) {
     if (!result || !result.valid) return 'AHP: matriks tidak valid.';
     const pct = result.weights.map((w, i) => `${result.labels?.[i] || `#${i + 1}`} ${(w * 100).toFixed(1)}%`);
     return `AHP: ${pct.join(' · ')} (CR ${result.cr.toFixed(3)} — ${result.consistent ? 'konsisten' : 'TIDAK konsisten'
          })`;
}

export default { ahpWeights, consistencyRatio, consistencyIndex, geometricMeanPriority, RANDOM_INDEX };
