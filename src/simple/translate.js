/**
 * simple/translate.js — Penerjemah hasil mesin MEZS.id ke bahasa sehari-hari.
 *
 * Pure function: menerima hasil runFullAnalysis() apa adanya dan TIDAK
 * menghitung ulang skor, keputusan, plafon, atau bunga. Yang dilakukan hanya:
 *   - memilih kata (status, label peringkat, bintang per pilar),
 *   - menyusun kalimat dari angka yang sudah dihitung mesin.
 * Rujukan: docs/PRD_DASHBOARD_SEDERHANA.md.
 */

import { gradeIndex } from '../core/rating.js';

/* ------------------------------------------------------------ format ---- */

/** Rupiah ringkas gaya lisan: Rp 380 jt, Rp 1,2 M, Rp 526 rb. */
export function rupiah(value) {
     if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
     const n = Number(value);
     const abs = Math.abs(n);
     const fmt = (v, d) => v.toLocaleString('id-ID', { maximumFractionDigits: d });
     if (abs >= 1e9) return `Rp ${fmt(n / 1e9, 2)} M`;
     if (abs >= 1e6) return `Rp ${fmt(n / 1e6, abs >= 1e8 ? 0 : 1)} jt`;
     if (abs >= 1e3) return `Rp ${fmt(n / 1e3, 0)} rb`;
     return `Rp ${fmt(n, 0)}`;
}

const percent = (ratio, digits = 0) =>
     `${(Number(ratio) * 100).toLocaleString('id-ID', { maximumFractionDigits: digits })}%`;

const times = (value, digits = 1) => `${Number(value).toLocaleString('id-ID', { maximumFractionDigits: digits })} kali`;

const finite = (v) => v !== null && v !== undefined && Number.isFinite(Number(v));

/* ------------------------------------------------------------ status ---- */

export const STATUS = {
     LAYAK: { key: 'layak', tone: 'hijau', label: 'Layak dibiayai' },
     LAYAK_BERSYARAT: { key: 'bersyarat', tone: 'kuning', label: 'Layak dengan syarat' },
     REVIEW: { key: 'review', tone: 'kuning', label: 'Perlu ditinjau' },
     TIDAK_LAYAK: { key: 'tidak', tone: 'merah', label: 'Belum layak' }
};

export const TONE_WORD = { hijau: 'aman', kuning: 'perlu perhatian', merah: 'berisiko' };

/* ----------------------------------------------------------- peringkat -- */

/**
 * Kelompok peringkat gaya PEFINDO → label awam. Urutan mengikuti tangga
 * PEFINDO_SCALE (index 0 = idAAA … index 17 = idD).
 */
export const GRADE_GROUPS = [
     { from: 0, to: 0, label: 'Sangat baik', meaning: 'Kemampuan bayar sangat kuat, risiko gagal bayar sangat rendah' },
     { from: 1, to: 3, label: 'Sangat baik', meaning: 'Kemampuan bayar kuat, risiko gagal bayar rendah' },
     { from: 4, to: 6, label: 'Baik', meaning: 'Kemampuan bayar baik, sedikit peka terhadap kondisi sulit' },
     { from: 7, to: 9, label: 'Cukup', meaning: 'Masih layak dibiayai, perlu dipantau' },
     { from: 10, to: 12, label: 'Kurang', meaning: 'Kemampuan bayar lemah, butuh perbaikan atau jaminan tambahan' },
     { from: 13, to: 17, label: 'Berisiko tinggi', meaning: 'Besar kemungkinan kesulitan membayar' }
];

export const GRADE_DISCLAIMER = 'Peringkat model internal MEZS.id, bukan rating resmi PEFINDO.';

export function gradeInfo(pefindo) {
     if (!pefindo || !pefindo.grade) return null;
     const idx = finite(pefindo.index) ? pefindo.index : gradeIndex(pefindo.grade, pefindo.scale_mode);
     const group = GRADE_GROUPS.find((g) => idx >= g.from && idx <= g.to) || GRADE_GROUPS.at(-1);
     return {
          grade: pefindo.grade,
          label: group.label,
          meaning: group.meaning,
          investment: !!pefindo.investment_grade,
          disclaimer: GRADE_DISCLAIMER
     };
}

/* ------------------------------------------------------------- pilar ---- */

export const PILLAR_PLAIN = {
     cash_flow: 'Kemampuan bayar',
     financial_health: 'Kesehatan keuangan',
     business_viability: 'Prospek usaha',
     management: 'Pengelolaan usaha',
     collateral: 'Jaminan',
     industry_risk: 'Kondisi industri'
};

const PILLAR_ORDER = ['cash_flow', 'financial_health', 'business_viability', 'management', 'collateral', 'industry_risk'];

/** Skor 0–100 per pilar → bintang 1–5 (90+ = 5, 75+ = 4, 60+ = 3, 45+ = 2). */
export function starsFor(score) {
     if (!finite(score)) return 0;
     if (score >= 90) return 5;
     if (score >= 75) return 4;
     if (score >= 60) return 3;
     if (score >= 45) return 2;
     return 1;
}

export const STAR_WORD = { 5: 'Sangat baik', 4: 'Baik', 3: 'Cukup', 2: 'Kurang', 1: 'Lemah', 0: 'Belum dinilai' };

function plainPillars(result) {
     const byKey = new Map((result.pillars || []).map((p) => [p.key, p]));
     return PILLAR_ORDER.filter((k) => byKey.has(k)).map((k) => {
          const score = byKey.get(k).score;
          const stars = starsFor(score);
          return { key: k, name: PILLAR_PLAIN[k], stars, word: STAR_WORD[stars], score };
     });
}

/* ------------------------------------------------------------ alasan ---- */

/** Satu aturan kebijakan (rules_evaluated) → kalimat awam. */
export function plainRule(rule) {
     const v = rule.value;
     const l = rule.limit;
     switch (rule.key) {
          case 'dscr_min':
               return `uang masuk usaha baru ${times(v, 2)} cicilan, padahal minimal ${times(l, 2)}`;
          case 'icr_min':
               return `laba usaha belum cukup menutup bunga (${times(v, 2)}, minimal ${times(l, 2)})`;
          case 'ds_ratio_max':
               return `cicilan akan memakai ${percent(v)} uang usaha (batas aman ${percent(l)})`;
          case 'dti_max':
               return `cicilan setahun setara ${percent(v)} omzet (batas aman ${percent(l)})`;
          case 'ltv_max':
               return `pinjaman setara ${percent(v)} nilai jaminan (batas ${percent(l)})`;
          case 'altman_z_distress':
               return 'tanda-tanda risiko bangkrut tergolong tinggi';
          case 'negative_ocf_periods':
               return `arus kas usaha negatif ${v} periode berturut-turut`;
          case 'arrears_days_max':
               return `ada tunggakan ${v} hari (batas ${l} hari)`;
          default:
               return String(rule.rule || rule.key).toLowerCase();
     }
}

function reasonSentence(result) {
     const d = result.decision || {};
     const violated = (d.rules_evaluated || []).filter((r) => r.violated);
     const hard = violated.filter((r) => r.enforcement === 'hard');
     const soft = violated.filter((r) => r.enforcement !== 'hard');
     const strong = (result.finalScore ?? 0) >= 75;

     if (d.decision === 'TIDAK_LAYAK') {
          if (hard.length) return `Belum bisa dibiayai karena ${hard.map(plainRule).join('; ')}.`;
          if (d.gap_analysis?.verdict === 'too_far') {
               return 'Belum bisa dibiayai karena kinerja keuangan jauh di bawah usaha sejenis.';
          }
          return 'Belum bisa dibiayai karena nilai keseluruhan usaha masih di bawah batas minimal.';
     }
     if (d.stress_capped) {
          return 'Usaha cukup baik, tetapi belum tahan di cukup banyak kondisi sulit yang diuji, sehingga perlu ditinjau petugas.';
     }
     if (soft.length) {
          const opener = strong ? 'Usaha sehat dan menguntungkan, tetapi' : 'Usaha cukup baik, tetapi';
          return `${opener} ${soft.map(plainRule).join('; ')}.`;
     }
     if (d.decision === 'LAYAK') return 'Usaha sehat dan sanggup membayar cicilan dengan aman.';
     if (d.decision === 'LAYAK_BERSYARAT') {
          return 'Usaha sanggup membayar, dengan syarat janji tertentu ditepati (misalnya laporan rutin).';
     }
     return 'Nilai usaha berada di batas tengah, sehingga perlu ditinjau petugas.';
}

/* ----------------------------------------------------------- cicilan ---- */

function monthlyInstallment(result) {
     const nl = result.debtService?.new_loan;
     if (!nl) return null;
     // Cicilan bulan pertama setelah masa tenggang (anuitas & flat: tetap per bulan).
     const first = nl.schedule?.find((r) => r.payment > 0);
     return first?.payment ?? nl.monthly_avg ?? null;
}

function installmentView(result) {
     const monthly = monthlyInstallment(result);
     const daily = result.daily_cashflow?.applicable ? result.daily_cashflow.daily?.debt_service_set_aside : null;
     return {
          monthly,
          daily: finite(daily) ? daily : null,
          tenor: result.borrower?.tenor_bulan ?? null,
          rate: result.risk?.pricing?.recommended_rate ?? null
     };
}

/* ------------------------------------------------------- uji sulit ------ */

const SCENARIO_PLAIN = {
     S1: 'omzet turun 20%',
     S2: 'omzet turun 35%',
     S3: 'harga bahan naik 15%',
     S4: 'biaya impor/kurs naik 10%',
     S5: 'banyak pelanggan telat bayar',
     S6: 'omzet turun 20% dan untung menipis',
     S7: 'bunga naik 3%',
     S8: 'nilai jaminan turun 20%'
};

export function stressView(stress) {
     if (!stress || !Array.isArray(stress.scenarios) || !stress.scenarios.length) return null;
     const total = stress.scenarios.length;
     const passed = stress.scenarios.filter((s) => s.survives).length;
     const firstFail = stress.scenarios.find((s) => !s.survives);
     const items = stress.scenarios.map((s) => ({
          id: s.id,
          text: SCENARIO_PLAIN[s.id] || s.label,
          survives: !!s.survives
     }));
     const caution = firstFail
          ? `Jika ${SCENARIO_PLAIN[firstFail.id] || firstFail.label.toLowerCase()}, usaha akan kesulitan membayar cicilan.`
          : null;
     return {
          passed,
          total,
          summary: `Usaha tetap sanggup membayar di ${passed} dari ${total} kondisi sulit yang diuji.`,
          caution,
          items
     };
}

/* --------------------------------------------------------- perbaikan ---- */

/**
 * Daftar hal yang bisa dilakukan pemohon. Hanya berbasis bukti dari hasil
 * mesin; tidak pernah menjanjikan persetujuan.
 */
function fixesFor(result, atSuggested) {
     const fixes = [];
     const add = (key, text) => {
          if (!fixes.some((f) => f.key === key)) fixes.push({ key, text });
     };
     const requested = Number(result.borrower?.plafon_diajukan) || 0;
     const suggested = Number(result.nominal?.recommended_nominal) || 0;
     const violated = (result.decision?.rules_evaluated || []).filter((r) => r.violated);

     if (atSuggested && suggested > 0 && suggested < requested) {
          const nowOk = ['LAYAK', 'LAYAK_BERSYARAT'].includes(atSuggested.decision?.decision);
          add('amount', nowOk
               ? `Ajukan ${rupiah(suggested)} (bukan ${rupiah(requested)}) agar sesuai kemampuan bayar — pada jumlah ini hasilnya ${STATUS[atSuggested.decision.decision].label.toLowerCase()}.`
               : `Pertimbangkan jumlah ${rupiah(suggested)} yang sesuai kemampuan bayar usaha.`);
     }
     for (const r of violated) {
          if (r.key === 'ltv_max') add('collateral', 'Tambah jaminan atau kurangi jumlah pinjaman agar nilai jaminan mencukupi.');
          if (r.key === 'arrears_days_max') add('arrears', 'Selesaikan tunggakan yang ada dan lampirkan bukti pelunasannya.');
          if (r.key === 'negative_ocf_periods') add('cashflow', 'Jelaskan penyebab arus kas negatif dan rencana perbaikannya, disertai bukti.');
          if (r.key === 'icr_min' || r.key === 'altman_z_distress') {
               add('performance', 'Siapkan rencana perbaikan biaya, penagihan piutang, atau tambahan modal yang bisa dibuktikan.');
          }
          if (['dscr_min', 'ds_ratio_max', 'dti_max'].includes(r.key) && !fixes.some((f) => f.key === 'amount')) {
               add('tenor', 'Perpanjang lama pinjaman atau kurangi jumlahnya agar cicilan lebih ringan.');
          }
     }
     if (result.nominal?.binding_code === 'ltv_based' && !(suggested > 0)) {
          add('collateral', 'Tambahkan jaminan (misalnya tanah, bangunan, kendaraan, atau deposito) beserta perkiraan nilainya.');
     }
     const integrity = result.integrity?.status;
     if (integrity && integrity !== 'ok') {
          add('statement', 'Periksa kembali laporan keuangan: total aset harus sama dengan utang ditambah modal.');
     }
     const runway = result.score_details?.cash_runway;
     if (runway && runway.used_default) add('runway', 'Isi berapa bulan usaha bisa bertahan dengan kas yang ada (cadangan kas).');
     return fixes;
}

/* ----------------------------------------------------------- jumlah ----- */

function amountView(result, atSuggested) {
     const requested = Number(result.borrower?.plafon_diajukan) || 0;
     const suggested = Number(result.nominal?.recommended_nominal) || 0;
     const binding = result.nominal?.binding_code;
     const because = {
          dscr_based: 'kemampuan bayar dari uang masuk usaha',
          ltv_based: 'nilai jaminan',
          requested: 'jumlah yang diajukan'
     }[binding] || 'kemampuan bayar';
     let sentence;
     if (suggested <= 0 && binding === 'ltv_based') {
          sentence = 'Jumlah aman belum bisa dihitung karena belum ada jaminan yang dinilai.';
     } else if (suggested <= 0) sentence = 'Saat ini belum ada jumlah pinjaman yang aman untuk usaha ini.';
     else if (suggested < requested) sentence = `Jumlah yang aman dipinjam ${rupiah(suggested)}, dibatasi oleh ${because}.`;
     else sentence = `Jumlah yang diajukan (${rupiah(requested)}) masih dalam batas aman.`;
     return {
          requested,
          suggested,
          sentence,
          suggestedInstallment: atSuggested ? installmentView(atSuggested) : null,
          suggestedStatus: atSuggested ? STATUS[atSuggested.decision?.decision] || null : null
     };
}

/* ------------------------------------------------------------- utama ---- */

/**
 * Hasil mesin → model tampilan sederhana.
 * @param {object} result — keluaran runFullAnalysis()
 * @param {object|null} atSuggested — analisis ulang pada jumlah saran (opsional)
 */
export function toPlain(result, atSuggested = null) {
     if (!result) return null;
     const status = STATUS[result.decision?.decision] || STATUS.REVIEW;
     const stress = stressView(result.stress);
     return {
          name: result.borrower?.nama || 'Tanpa nama',
          status,
          grade: gradeInfo(result.risk?.pefindo),
          reason: reasonSentence(result),
          amount: amountView(result, atSuggested),
          installment: installmentView(result),
          pillars: plainPillars(result),
          stress,
          fixes: fixesFor(result, atSuggested),
          footnote: 'Hasil ini bahan pertimbangan; keputusan akhir oleh bank.',
          // Angka asli untuk uji "hasil tetap sama" & tampilan Lengkap.
          source: {
               decision: result.decision?.decision,
               finalScore: result.finalScore,
               grade: result.risk?.pefindo?.grade,
               recommended_nominal: result.nominal?.recommended_nominal,
               recommended_rate: result.risk?.pricing?.recommended_rate
          }
     };
}

/** Kamus singkat: angka utama mesin → kalimat awam (untuk tooltip & detail). */
export function plainMetrics(result) {
     const r = result.ratios || {};
     const out = [];
     const push = (key, term, text) => out.push({ key, term, text });
     if (finite(r.dscr)) push('dscr', 'DSCR', `Uang masuk usaha cukup untuk ${times(r.dscr)} cicilan setahun.`);
     if (finite(r.ds_ratio)) push('ds_ratio', 'Rasio cicilan', `${percent(r.ds_ratio)} uang usaha habis untuk cicilan.`);
     if (finite(r.current_ratio)) push('current_ratio', 'Current ratio', `Uang siap pakai ${times(r.current_ratio)} utang jangka pendek.`);
     if (finite(r.der)) push('der', 'DER', `Utang setara ${percent(r.der)} modal sendiri.`);
     const ltv = result.extra?.ltv;
     if (finite(ltv) && ltv > 0) push('ltv', 'LTV', `Jaminan bernilai ${times(1 / ltv)} pinjaman.`);
     if (finite(r.altman_z)) {
          const zone = r.altman_z > 2.99 ? 'rendah' : r.altman_z >= 1.81 ? 'sedang' : 'tinggi';
          push('altman_z', 'Altman Z', `Risiko bangkrut: ${zone}.`);
     }
     const pd = result.risk?.pd?.pd_12m;
     if (finite(pd)) {
          const perThousand = Math.max(1, Math.round(pd * 1000));
          push('pd', 'PD 12 bulan', `Sekitar ${perThousand} dari 1.000 usaha serupa gagal bayar dalam setahun.`);
     }
     return out;
}

export default { toPlain, plainMetrics, gradeInfo, starsFor, stressView, rupiah };
