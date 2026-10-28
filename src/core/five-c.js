/**
 * core/five-c.js — Kerangka 5C (Character, Capacity, Capital, Collateral, Conditions).
 *
 * Memetakan tiap komponen penilaian (`COMPONENT_DEFS`) ke salah satu dari 5C,
 * memberi bobot tiap C, lalu menghitung **skor 5C tertimbang**. Selaras dengan
 * docs/SYNC_WITH_MATERIALS.md §3 dan layar referensi `#/architecture`.
 *
 * Pemetaan 5C → pilar engine (5 pilar; business_viability melekat ke Capacity):
 *   • Character  → management
 *   • Capacity   → cash_flow + business_viability
 *   • Capital    → financial_health
 *   • Collateral → collateral
 *   • Conditions → industry_risk
 */

import { COMPONENT_DEFS } from './config.js';

/**
 * Definisi 5C + bobot default. Σ bobot = 1.0.
 * Bobot diturunkan dari bobot pilar agar koheren dengan skor akhir.
 * - key    : kunci internal
 * - name   : nama Inggris (dipakai materi)
 * - id     : ekuivalen Indonesia
 * - weight : bobot default C (0–1)
 * - desc   : penjelasan bahasa awam
 */
export const FIVE_C_DEFS = [
     {
          key: 'character', name: 'Character', id: 'Karakter', ico: '🧭', q: 'Willingness to pay', weight: 0.15,
          desc: 'Kemauan & integritas borrower membayar — dinilai dari rekam jejak pembayaran, tata kelola, serta pengalaman tim manajemen.'
     },
     {
          key: 'capacity', name: 'Capacity', id: 'Kapasitas', ico: '⚙️', q: 'Ability to service debt', weight: 0.45,
          desc: 'Kemampuan menghasilkan arus kas untuk membayar utang — kekokohan model bisnis, DSCR/ICR/DTI, arus kas operasional, dan cash runway.'
     },
     {
          key: 'capital', name: 'Capital', id: 'Modal', ico: '🏦', q: 'Skin in the game', weight: 0.25,
          desc: 'Buffer ekuitas & kekuatan neraca borrower — profitabilitas, likuiditas, solvabilitas, dan Altman Z-Score.'
     },
     {
          key: 'collateral', name: 'Collateral', id: 'Agunan', ico: '🏠', q: 'Loss Given Default', weight: 0.10,
          desc: 'Agunan tangible penyerap kerugian saat gagal bayar — Loan-to-Value (LTV), jenis/likuiditas agunan, dan personal guarantee.'
     },
     {
          key: 'conditions', name: 'Conditions', id: 'Kondisi', ico: '🌐', q: 'Macro reality', weight: 0.05,
          desc: 'Konteks makro & sektor di luar kendali borrower — risiko inheren sektor, prospek industri, dan sensitivitas makro.'
     }
];

/** Urutan kunci 5C. */
export const FIVE_C_KEYS = FIVE_C_DEFS.map((c) => c.key);

/** Bobot default tiap C (objek key → bobot). */
export const FIVE_C_WEIGHTS = Object.fromEntries(FIVE_C_DEFS.map((c) => [c.key, c.weight]));

/**
 * Pemetaan tiap komponen (`COMPONENT_DEFS[].key`) ke salah satu 5C.
 * Inilah "tag 5C" untuk setiap pertanyaan/parameter penilaian.
 */
export const COMPONENT_TO_C = {
     // ——— Capacity — kemampuan menjalankan bisnis & membayar utang ———
     model_bisnis: 'capacity',
     posisi_pasar: 'capacity',
     skalabilitas: 'capacity',
     ketergantungan: 'capacity',
     dscr: 'capacity',
     icr: 'capacity',
     dti: 'capacity',
     ocf_positif: 'capacity',
     cash_runway: 'capacity',

     // ——— Capital — kekuatan neraca ———
     roa: 'capital',
     current_ratio: 'capital',
     der: 'capital',
     altman_z: 'capital',
     tren_keuangan: 'capital',

     // ——— Character — kemauan bayar & manajemen ———
     pengalaman_tim: 'character',
     rekam_jejak_bayar: 'character',
     tata_kelola: 'character',

     // ——— Collateral — agunan ———
     ltv: 'collateral',
     jenis_agunan: 'collateral',
     personal_guarantee: 'collateral',

     // ——— Conditions — makro & sektor ———
     risiko_sektor: 'conditions',
     prospek_industri: 'conditions',
     sensitivitas_makro: 'conditions'
};

const C_BY_KEY = Object.fromEntries(FIVE_C_DEFS.map((c) => [c.key, c]));

function num(v, d = 0) {
     if (v === null || v === undefined || v === '') return d;
     const n = Number(v);
     return Number.isFinite(n) ? n : d;
}

function round1(v) {
     return Math.round(Number(v) * 10) / 10;
}

/** Ambang warna hasil: ≥70 baik, ≥50 perhatian, sisanya berisiko. */
export function toneForScore(score) {
     const s = num(score, 0);
     if (s >= 70) return 'good';
     if (s >= 50) return 'warning';
     return 'risk';
}

/** Label kualitatif untuk skor 0–100. */
export function labelForScore(score) {
     const s = num(score, 0);
     if (s >= 80) return 'Sangat Kuat';
     if (s >= 70) return 'Kuat';
     if (s >= 60) return 'Memadai';
     if (s >= 50) return 'Cukup';
     if (s >= 40) return 'Lemah';
     return 'Sangat Lemah';
}

/**
 * Skor 5C tertimbang.
 *
 * @param {object}   p
 * @param {object}   p.subscores         Keluaran `computeSubScores()` (key → 0–100).
 * @param {object}   [p.componentWeights] Bobot efektif per komponen (key → bobot). Bila kosong, pakai `base`.
 * @param {object}   [p.weights]          Bobot per C (menimpa default).
 * @returns {{
 *   weights: Object, items: Array, weighted_score: number,
 *   weakest: string, strongest: string, tone: string
 * }}
 */
export function computeFiveC({ subscores = {}, componentWeights = null, weights = FIVE_C_WEIGHTS } = {}) {
     const w = { ...FIVE_C_WEIGHTS, ...(weights || {}) };
     const useEff = componentWeights && typeof componentWeights === 'object';

     const items = FIVE_C_DEFS.map((c) => {
          const comps = COMPONENT_DEFS.filter((d) => COMPONENT_TO_C[d.key] === c.key);
          let s = 0;
          let wsum = 0;
          for (const d of comps) {
               const cw = num(useEff ? componentWeights[d.key] : null, d.base);
               const sub = num(subscores[d.key], 60);
               s += sub * cw;
               wsum += cw;
          }
          const score = wsum > 0 ? round1(s / wsum) : 0;
          return {
               key: c.key,
               name: c.name,
               id: c.id,
               ico: c.ico,
               q: c.q,
               pillar: c.pillar || null,
               weight: num(w[c.key], c.weight),
               score,
               tone: toneForScore(score),
               label: labelForScore(score),
               desc: c.desc,
               components: comps.map((d) => ({
                    key: d.key,
                    label: d.label,
                    score: round1(num(subscores[d.key], 60))
               }))
          };
     });

     let total = 0;
     let wsum = 0;
     for (const it of items) {
          total += it.score * it.weight;
          wsum += it.weight;
     }
     const weighted = wsum > 0 ? round1(total / wsum) : 0;
     const sorted = [...items].sort((a, b) => a.score - b.score);

     return {
          weights: Object.fromEntries(items.map((it) => [it.key, it.weight])),
          items,
          weighted_score: weighted,
          weakest: sorted.length ? sorted[0].key : null,
          strongest: sorted.length ? sorted[sorted.length - 1].key : null,
          tone: toneForScore(weighted)
     };
}

/** Nama tampilan (Indonesia) untuk sebuah kunci 5C. */
export function fiveCLabel(key) {
     const c = C_BY_KEY[key];
     return c ? `${c.name} · ${c.id}` : String(key || '');
}

export default { FIVE_C_DEFS, FIVE_C_KEYS, FIVE_C_WEIGHTS, COMPONENT_TO_C, computeFiveC, fiveCLabel };
