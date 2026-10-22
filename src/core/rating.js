/**
 * core/rating.js — Pemeringkatan kredit skala **PEFINDO** (idAAA … idD).
 *
 * PEFINDO (PT Pemeringkat Efek Indonesia) memakai skala huruf dengan sufiks
 * `id` (mis. idAAA, idAA+, idBBB-, idD). Modul ini memetakan skor akhir model
 * (0–100) dan risiko (decision/PD) ke peringkat PEFINDO, lengkap dengan
 * kategori (investment/speculative), outlook, dan definisi singkat.
 *
 * Referensi skala: idAAA (terbaik) → idD (gagal bayar). "Investment grade"
 * mencakup idAAA s.d. idBBB-.
 */

/** Label kategori peringkat. */
export const RATING_CATEGORY_LABEL = {
     investment: 'Investment Grade',
     speculative: 'Non-Investment (Spekulatif)',
     default_risk: 'Risiko Gagal Bayar'
};

/**
 * Tangga peringkat PEFINDO, terurut dari terbaik → terburuk.
 * - min      : ambang skor minimum (0–100) untuk peringkat ini
 * - grade    : notasi PEFINDO
 * - category : 'investment' | 'speculative' | 'default_risk'
 * - label    : deskripsi kemampuan bayar
 */
export const PEFINDO_SCALE = [
     { min: 92, grade: 'idAAA', category: 'investment', label: 'Kemampuan bayar sangat superior' },
     { min: 88, grade: 'idAA+', category: 'investment', label: 'Kemampuan bayar sangat kuat' },
     { min: 84, grade: 'idAA', category: 'investment', label: 'Kemampuan bayar sangat kuat' },
     { min: 80, grade: 'idAA-', category: 'investment', label: 'Kemampuan bayar sangat kuat' },
     { min: 76, grade: 'idA+', category: 'investment', label: 'Kemampuan bayar kuat' },
     { min: 72, grade: 'idA', category: 'investment', label: 'Kemampuan bayar kuat' },
     { min: 68, grade: 'idA-', category: 'investment', label: 'Kemampuan bayar kuat' },
     { min: 64, grade: 'idBBB+', category: 'investment', label: 'Kemampuan bayar memadai' },
     { min: 60, grade: 'idBBB', category: 'investment', label: 'Kemampuan bayar memadai' },
     { min: 56, grade: 'idBBB-', category: 'investment', label: 'Kemampuan bayar memadai' },
     { min: 52, grade: 'idBB+', category: 'speculative', label: 'Kemampuan bayar rentan terhadap kondisi memburuk' },
     { min: 48, grade: 'idBB', category: 'speculative', label: 'Kemampuan bayar rentan terhadap kondisi memburuk' },
     { min: 44, grade: 'idBB-', category: 'speculative', label: 'Kemampuan bayar rentan terhadap kondisi memburuk' },
     { min: 40, grade: 'idB+', category: 'speculative', label: 'Kemampuan bayar lemah; bergantung kondisi bisnis' },
     { min: 36, grade: 'idB', category: 'speculative', label: 'Kemampuan bayar lemah; bergantung kondisi bisnis' },
     { min: 32, grade: 'idB-', category: 'speculative', label: 'Kemampuan bayar lemah; bergantung kondisi bisnis' },
     { min: 25, grade: 'idCCC', category: 'default_risk', label: 'Saat ini rentan; sangat bergantung kondisi menguntungkan' },
     { min: 0, grade: 'idD', category: 'default_risk', label: 'Gagal bayar atas kewajiban finansial' }
];

/** Mode skala yang didukung. `pefindo` (default) memakai notasi idAAA…idD. */
export const RATING_SCALE_MODES = ['pefindo', 'neutral'];

/**
 * Skala netral — placeholder untuk masa depan saat produk belum publik.
 * Ambang, urutan, dan kategori identik dengan PEFINDO; hanya notasi yang
 * diganti `T1`…`T18` (Tier) agar tidak mengklaim sertifikasi pihak ketiga.
 */
export const NEUTRAL_SCALE = PEFINDO_SCALE.map((g, i) => ({
     min: g.min,
     grade: `T${i + 1}`,
     category: g.category,
     label: g.label
}));

/** Ambil tangga skala sesuai mode (default `pefindo`). */
export function scaleFor(mode) {
     return String(mode) === 'neutral' ? NEUTRAL_SCALE : PEFINDO_SCALE;
}

/** Definisi singkat per kategori. */
export const RATING_CATEGORY_DEFINITION = {
     investment: 'Kemampuan memenuhi kewajiban finansial kuat; risiko gagal bayar relatif rendah.',
     speculative: 'Kemampuan memenuhi kewajiban rentan terhadap kondisi bisnis/ekonomi yang memburuk.',
     default_risk: 'Kemampuan memenuhi kewajiban sangat bergantung pada kondisi yang menguntungkan; risiko gagal bayar tinggi.'
};

/** Batas indeks (0 = terbaik) berdasarkan keputusan — memburuk bila melebihi. */
const MAX_INDEX_BY_DECISION = {
     TIDAK_LAYAK: 16 // idCCC; REVIEW is a workflow status, not a default-risk rating.
};

function num(v, d = 0) {
     if (v === null || v === undefined || v === '') return d;
     const n = Number(v);
     return Number.isFinite(n) ? n : d;
}

/** Indeks (0 = terbaik) sebuah notasi peringkat; -1 bila tidak dikenal. */
export function gradeIndex(grade, mode = 'pefindo') {
     return scaleFor(mode).findIndex((g) => g.grade === grade);
}

/** Perkiraan outlook dari skor & keputusan. */
function outlookFor(score, decision) {
     const s = num(score, 0);
     if (decision === 'TIDAK_LAYAK') return 'negatif';
     if (decision === 'REVIEW') return s >= 55 ? 'stabil' : 'negatif';
     if (decision === 'LAYAK_BERSYARAT') return 'stabil';
     if (decision === 'LAYAK') return s >= 80 ? 'positif' : 'stabil';
     return 'stabil';
}

/**
 * Tentukan peringkat dari skor akhir, keputusan, dan (opsional) PD.
 *
 * @param {number} score     Skor akhir 0–100.
 * @param {string} [decision] 'LAYAK' | 'LAYAK_BERSYARAT' | 'REVIEW' | 'TIDAK_LAYAK'.
 * @param {number} [pd]      Probability of Default (fraksi 0–1). Bila ada, membatasi peringkat.
 * @param {{ scaleMode?: string }} [options] `scaleMode` = 'pefindo' (default) | 'neutral'.
 * @returns {{
 *   grade: string, notch: number, index: number, category: string,
 *   category_label: string, label: string, outlook: string,
 *   score: number, pd: (number|null), investment_grade: boolean,
 *   scale_mode: string, capped_by: (string|null), definition: string
 * }}
 */
export function pefindoRating(score, decision = 'LAYAK', pd = null, options = {}) {
     const s = num(score, 0);
     const mode = String(options.scaleMode || 'pefindo');
     const scale = scaleFor(mode);

     let idx = scale.findIndex((g) => s >= g.min);
     if (idx < 0) idx = scale.length - 1;
     const scoreEntry = scale[idx];
     const scoreUpper = idx > 0 ? scale[idx - 1].min : null;
     const caps = [];
     let cappedBy = null;

     // Batas atas karena keputusan (decision floors).
     const dCap = MAX_INDEX_BY_DECISION[decision];
     if (dCap !== undefined && idx < dCap) {
          idx = dCap;
          cappedBy = 'keputusan';
          caps.push({ source: 'keputusan', value: decision, grade: scale[dCap].grade });
     }

     // Batas atas karena Probability of Default.
     const pdv = pd === null || pd === undefined || pd === '' ? null : num(pd, null);
     if (pdv !== null) {
          let pdCap = null;
          if (pdv >= 0.35) pdCap = 16; // idCCC
          else if (pdv >= 0.20) pdCap = 14; // idB
          else if (pdv >= 0.12) pdCap = 12; // idBB-
          if (pdCap !== null && idx < pdCap) {
               idx = pdCap;
               cappedBy = cappedBy ? `${cappedBy}+PD` : 'PD';
               caps.push({ source: 'PD', value: pdv, threshold: pdv >= .35 ? .35 : pdv >= .20 ? .20 : .12, grade: scale[pdCap].grade });
          }
     }

     const entry = scale[idx];
     return {
          grade: entry.grade,
          score_band: { grade: scoreEntry.grade, min: scoreEntry.min, max_exclusive: scoreUpper },
          caps,
          scale_mode: mode,
          notch: idx + 1,
          index: idx,
          category: entry.category,
          category_label: RATING_CATEGORY_LABEL[entry.category] || entry.category,
          label: entry.label,
          outlook: outlookFor(s, decision),
          score: s,
          pd: pdv,
          investment_grade: entry.category === 'investment',
          capped_by: cappedBy,
          definition: RATING_CATEGORY_DEFINITION[entry.category] || ''
     };
}

export default {
     PEFINDO_SCALE,
     NEUTRAL_SCALE,
     RATING_SCALE_MODES,
     RATING_CATEGORY_LABEL,
     scaleFor,
     pefindoRating,
     gradeIndex
};
