/**
 * core/scoring.js — Skor 6 pilar + skor akhir + risk rating.
 * Pure functions. Rujukan: ARCHITECTURE §3, §3.6.A/B, §3.5.
 */

import { COMPONENT_DEFS, PILLARS } from './config.js';
import { compareRatio } from './benchmark.js';
import { safeDiv } from './ratios.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const num = (v) =>
     v === null || v === undefined || v === ''
          ? null
          : Number.isFinite(Number(v))
               ? Number(v)
               : null;
const round1 = (v) => Math.round(v * 10) / 10;

/** Interpolasi linear piecewise. anchors: [[x,y], ...] terurut naik berdasarkan x. */
export function piecewise(v, anchors) {
     if (!Number.isFinite(v)) return null;
     if (v <= anchors[0][0]) return anchors[0][1];
     for (let i = 1; i < anchors.length; i++) {
          const [x0, y0] = anchors[i - 1];
          const [x1, y1] = anchors[i];
          if (v <= x1) {
               const denom = x1 - x0 || 1;
               return y0 + ((v - x0) / denom) * (y1 - y0);
          }
     }
     return anchors[anchors.length - 1][1];
}

const q01 = (v, fallback = 0.6) => {
     const n = num(v);
     if (n === null) return fallback;
     return clamp(n, 0, 1);
};

// ——— Mapper ambang → skor (0–100) ———

export function scoreDscr(d) {
     const v = num(d);
     if (v === null) return null;
     if (v >= 1.5) return 100;
     return piecewise(v, [[0, 0], [0.5, 10], [0.8, 30], [1.0, 55], [1.2, 75], [1.3, 85], [1.5, 100]]);
}
export function scoreIcr(icr) {
     const v = num(icr);
     if (v === null) return null;
     return piecewise(v, [[0, 0], [1, 40], [1.5, 65], [2, 80], [3, 95], [5, 100]]);
}
export function scoreDti(dti) {
     const v = num(dti);
     if (v === null) return null;
     return piecewise(v, [[0, 100], [0.15, 95], [0.25, 80], [0.35, 60], [0.5, 30], [0.7, 5], [1, 0]]);
}
export function scoreLtv(ltv) {
     const v = num(ltv);
     if (v === null) return null;
     return piecewise(v, [[0, 100], [0.4, 100], [0.6, 92], [0.8, 80], [1.0, 55], [1.2, 25], [1.5, 0]]);
}
export function scoreAltmanZ(z) {
     const v = num(z);
     if (v === null) return null;
     return piecewise(v, [[0, 0], [1.0, 10], [1.81, 30], [2.5, 55], [2.99, 70], [4, 88], [6, 100]]);
}
export function scoreRunway(months) {
     const v = num(months);
     if (v === null) return null;
     return piecewise(v, [[0, 0], [1, 25], [3, 60], [6, 85], [12, 100]]);
}
export function scoreCurrentRatio(cr) {
     const v = num(cr);
     if (v === null) return null;
     if (v >= 2) return 100;
     return piecewise(v, [[0, 0], [0.8, 30], [1.0, 55], [1.2, 72], [1.5, 88], [2.0, 100]]);
}
export function scoreDer(der) {
     const v = num(der);
     if (v === null) return null;
     return piecewise(v, [[0, 100], [0.5, 95], [1.0, 80], [1.5, 60], [2.0, 40], [3.0, 15], [4, 0]]);
}
export function scoreRoaAbs(roa) {
     const v = num(roa);
     if (v === null) return null;
     return piecewise(v, [[-0.1, 0], [0, 40], [0.02, 60], [0.05, 80], [0.1, 95], [0.2, 100]]);
}
export function scoreTrackRecord(years) {
     const v = num(years);
     if (v === null) return null;
     return piecewise(v, [[0, 30], [1, 50], [3, 70], [5, 85], [8, 95], [10, 100]]);
}

const JENIS_AGUNAN_SCORE = {
     tanah_bangunan: 0.9,
     deposito: 0.95,
     kendaraan: 0.6,
     mesin: 0.55,
     persediaan: 0.4,
     piutang: 0.45,
     lainnya: 0.3
};

/** Skor sub-komponen (0–100), dengan fallback 60 (netral) agar tidak NaN. */
export function computeSubScores({ ratios = {}, inputs = {}, benchmarkData, sectorKey, trace = null }) {
     const bm = inputs.bisnis_manajemen || {};
     const ag = inputs.agunan || {};
     const k = inputs.keuangan || {};
     const basis = ratios._basis || {};

     const benchmarkResults = {};
     const benchScore = (ratioKey, value) => {
          const cmp = compareRatio(benchmarkData, sectorKey, ratioKey, value);
          benchmarkResults[ratioKey] = cmp;
          return cmp && cmp.score !== null && cmp.score !== undefined ? cmp.score : null;
     };
     const pick = (a, b) => (a !== null && a !== undefined ? a : b);

     const ltv = safeDiv(basis.plafon, basis.nilai_agunan);
     const trackYears = num(bm.track_record_tahun);

     const sub = {
          // Business Viability (kualitatif)
          model_bisnis: q01(bm.skor_model_bisnis, 0.6) * 100,
          posisi_pasar: q01(bm.posisi_pasar, 0.6) * 100,
          skalabilitas: q01(bm.skalabilitas, 0.6) * 100,
          ketergantungan: q01(bm.ketergantungan, 0.7) * 100,

          // Financial Health
          roa: pick(benchScore('roa', ratios.roa), scoreRoaAbs(ratios.roa)),
          current_ratio: pick(benchScore('current_ratio', ratios.current_ratio), scoreCurrentRatio(ratios.current_ratio)),
          der: pick(benchScore('der', ratios.der), scoreDer(ratios.der)),
          altman_z: scoreAltmanZ(ratios.altman_z),
          tren_keuangan: q01(bm.tren_keuangan, 0.6) * 100,

          // Cash Flow
          dscr: scoreDscr(ratios.dscr),
          icr: pick(benchScore('icr', ratios.icr), scoreIcr(ratios.icr)),
          dti: scoreDti(ratios.dti),
          ocf_positif: q01(bm.ocf_positif ?? (num(k.arus_kas_operasional) > 0 ? 1 : 0.3), 0.5) * 100,
          cash_runway: scoreRunway(bm.cash_runway_bulan),

          // Management
          pengalaman_tim: clamp(
               0.5 * (q01(bm.pengalaman_tim, 0.6) * 100) + 0.5 * (scoreTrackRecord(trackYears) ?? 60),
               0,
               100
          ),
          rekam_jejak_bayar: q01(bm.rekam_jejak_bayar ?? bm.skor_manajemen, 0.6) * 100,
          tata_kelola: q01(bm.tata_kelola, 0.65) * 100,

          // Collateral
          ltv: scoreLtv(ltv),
          jenis_agunan: (JENIS_AGUNAN_SCORE[ag.jenis] ?? 0.4) * 100,
          personal_guarantee: (ag.personal_guarantee ? 0.9 : 0.5) * 100,

          // Industry
          risiko_sektor: q01(bm.skor_industri_risk, 0.6) * 100,
          prospek_industri: q01(bm.prospek_industri, 0.6) * 100,
          sensitivitas_makro: q01(bm.sensitivitas_makro, 0.6) * 100
     };

     if (trace) {
          const put = (key, input, rule, usedDefault = false, source = 'Input model') => {
               trace[key] = { input: input ?? null, rule, used_default: usedDefault, source };
          };
          for (const [key, field, fallback] of [
               ['model_bisnis','skor_model_bisnis',.6], ['posisi_pasar','posisi_pasar',.6],
               ['skalabilitas','skalabilitas',.6], ['ketergantungan','ketergantungan',.7],
               ['tren_keuangan','tren_keuangan',.6], ['tata_kelola','tata_kelola',.65],
               ['risiko_sektor','skor_industri_risk',.6], ['prospek_industri','prospek_industri',.6],
               ['sensitivitas_makro','sensitivitas_makro',.6]
          ]) put(key, num(bm[field]), `Nilai 0–1 × 100; dibatasi ke 0–1. Jika kosong, nilai bawaan ${fallback} × 100.`, num(bm[field]) === null);
          const repayment = bm.rekam_jejak_bayar ?? bm.skor_manajemen;
          put('rekam_jejak_bayar', num(repayment), 'Nilai 0–1 × 100; memakai skor manajemen bila rekam jejak belum diisi; nilai bawaan 0,6 jika keduanya kosong.', num(repayment) === null);
          put('pengalaman_tim', { penilaian_tim: num(bm.pengalaman_tim), tahun_operasi: trackYears },
               '50% × (penilaian tim 0–1 × 100) + 50% × skor lama operasi. Lama operasi: 0/1/3/5/8/10 tahun → 30/50/70/85/95/100, interpolasi linear. Input kosong memakai 60 pada bagian tersebut.', num(bm.pengalaman_tim) === null || trackYears === null);
          put('ocf_positif', { penilaian: num(bm.ocf_positif), ocf: num(k.arus_kas_operasional) },
               'Penilaian OCF 0–1 × 100. Jika belum diisi: OCF > 0 → 100, selain itu → 30. Input penilaian tidak numerik memakai 50.', bm.ocf_positif == null ? num(k.arus_kas_operasional) === null : num(bm.ocf_positif) === null,
               bm.ocf_positif == null ? 'Diturunkan dari arus kas operasi' : 'Input model');
          const ratioRules = {
               dscr: 'DSCR 0/0,5/0,8/1/1,2/1,3/1,5 → skor 0/10/30/55/75/85/100; interpolasi linear, maksimum 100.',
               icr: 'ICR 0/1/1,5/2/3/5 → skor 0/40/65/80/95/100; interpolasi linear.',
               dti: 'DTI 0/0,15/0,25/0,35/0,5/0,7/1 → skor 100/95/80/60/30/5/0; interpolasi linear.',
               ltv: 'LTV 0/0,4/0,6/0,8/1/1,2/1,5 → skor 100/100/92/80/55/25/0; interpolasi linear.',
               altman_z: 'Z 0/1/1,81/2,5/2,99/4/6 → skor 0/10/30/55/70/88/100; interpolasi linear.',
               cash_runway: 'Runway 0/1/3/6/12 bulan → skor 0/25/60/85/100; interpolasi linear.',
               current_ratio: 'Current ratio 0/0,8/1/1,2/1,5/2 → skor 0/30/55/72/88/100; interpolasi linear.',
               der: 'DER 0/0,5/1/1,5/2/3/4 → skor 100/95/80/60/40/15/0; interpolasi linear.',
               roa: 'ROA −0,1/0/0,02/0,05/0,1/0,2 → skor 0/40/60/80/95/100; interpolasi linear.'
          };
          for (const [key, rule] of Object.entries(ratioRules)) {
               const input = key === 'ltv' ? ltv : key === 'cash_runway' ? num(bm.cash_runway_bulan) : num(ratios[key]);
               const cmp = benchmarkResults[key];
               const benchmarkUsed = cmp?.score !== null && cmp?.score !== undefined;
               put(key, input, benchmarkUsed ? `Skor posisi terhadap persentil benchmark sektor; ${cmp.direction === 'lower' ? 'lebih rendah' : 'lebih tinggi'} lebih baik.` : rule,
                    sub[key] == null, benchmarkUsed ? 'Benchmark sektor' : 'Ambang model');
               if (benchmarkUsed) trace[key].benchmark = structuredClone(cmp);
          }
          put('jenis_agunan', ag.jenis, Object.entries(JENIS_AGUNAN_SCORE).map(([kind, value]) => `${kind} → ${value * 100}`).join('; ') + '; jenis tidak dikenal → 40.', JENIS_AGUNAN_SCORE[ag.jenis] === undefined);
          put('personal_guarantee', ag.personal_guarantee == null ? null : !!ag.personal_guarantee, 'Personal guarantee tersedia → 90; tidak tersedia → 50.', ag.personal_guarantee == null);
     }

     // Isi null → 60 (netral) agar skor pilar tetap terhitung.
     for (const key of Object.keys(sub)) {
          if (sub[key] === null || sub[key] === undefined || Number.isNaN(sub[key])) sub[key] = 60;
          if (trace?.[key]) trace[key].score = sub[key];
     }
     return sub;
}

/** Skor 6 pilar (0–100) = Σ (sub-skor × bobot dasar relatif dalam pilar). */
export function scorePillars({ ratios = {}, inputs = {}, benchmarkData, sectorKey }) {
     const sub = computeSubScores({ ratios, inputs, benchmarkData, sectorKey });
     const pillars = {};
     for (const pillar of PILLARS) {
          const comps = COMPONENT_DEFS.filter((c) => c.pillar === pillar);
          let s = 0;
          let w = 0;
          for (const c of comps) {
               s += (sub[c.key] ?? 60) * c.base;
               w += c.base;
          }
          pillars[pillar] = w > 0 ? round1(s / w) : 0;
     }
     return pillars;
}

/** Skor akhir = Σ (skor pilar × bobot pilar). */
export function computeFinalScore(pillarScores, weights) {
     let sum = 0;
     let wsum = 0;
     for (const p of PILLARS) {
          const w = Number((weights && weights[p]) ?? 0);
          const s = Number((pillarScores && pillarScores[p]) ?? 0);
          sum += s * w;
          wsum += w;
     }
     return wsum > 0 ? round1(sum / wsum) : 0;
}

/** Risk rating 1–10 (1 = paling aman, 10 = paling berisiko). */
export function riskRating(score, decision) {
     let r = 10 - Math.round((Number(score) / 100) * 9);
     if (decision === 'TIDAK_LAYAK') r = Math.max(r, 8);
     else if (decision === 'REVIEW') r = Math.max(r, 6);
     return clamp(r, 1, 10);
}

/** Rekomendasi risk-based pricing: rate = base + spread per tingkat rating. */
export function riskBasedPricing(rating, baseRate = 0.12, spreadPerGrade = 0.0075) {
     const r = clamp(Number(rating) || 5, 1, 10);
     const rate = baseRate + (r - 5) * spreadPerGrade;
     return {
          risk_rating: r,
          base_rate: baseRate,
          recommended_rate: Math.max(0.06, Math.min(0.35, rate)),
          spread_per_grade: spreadPerGrade
     };
}
