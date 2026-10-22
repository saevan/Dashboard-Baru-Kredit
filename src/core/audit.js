/**
 * core/audit.js — Lembar kerja AUDIT LENDER (mode lokal).
 *
 * Melengkapi alur intake: setelah pemohon MENGIRIM pengajuan, lender tidak
 * langsung menilai, tetapi mengerjakan tiga langkah audit (workpaper):
 *   1. Audit Laporan Keuangan — memastikan angka laporan benar & konsisten
 *      (dibantu `checkStatementIntegrity` + checklist due-diligence).
 *   2. Verifikasi Agunan — memastikan agunan benar-benar ADA & sah.
 *   3. Wawancara & Penilaian Kualitatif — lender menilai parameter kualitatif
 *      (0–1) berbasis wawancara; bila diisi, skor lender MENGGANTIKAN skor
 *      self-declared pemohon saat penilaian dijalankan.
 *
 * Modul ini PURE (tanpa DOM / storage) agar mudah diuji dan dipakai ulang.
 * Data audit disimpan sebagai field `audit` pada record pengajuan lokal.
 *
 * Kunci kualitatif yang dipakai di sini sengaja dibatasi pada entri
 * `BISNIS_MANAJEMEN_META` yang `unit: 'skor'` — tepat sama dengan yang dibaca
 * `core/scoring.js`, sehingga override benar-benar mengalir ke skor akhir.
 */

import { BISNIS_MANAJEMEN_META } from './config.js';
import { BM_PARAM_TO_C } from './parameters.js';
import { automaticAudit } from './audit-automation.js';

/** Label singkat 5C untuk penandaan pertanyaan wawancara. */
export const C_LABEL = {
     character: 'Character',
     capacity: 'Capacity',
     capital: 'Capital',
     collateral: 'Collateral',
     conditions: 'Conditions'
};

/** Metadata tiga bagian audit. */
export const AUDIT_SECTIONS = [
     {
          key: 'financial',
          title: 'Audit Laporan Keuangan',
          hint: 'Pastikan angka laporan benar, seimbang, dan konsisten.'
     },
     {
          key: 'collateral',
          title: 'Verifikasi Agunan',
          hint: 'Pastikan agunan benar-benar ada, sah, dan bebas sengketa.'
     },
     {
          key: 'interview',
          title: 'Wawancara & Penilaian Kualitatif',
          hint: 'Nilai parameter kualitatif berdasarkan wawancara dengan pemilik.'
     }
];

/** Checklist due-diligence laporan keuangan (harus semua tercentang). */
export const FINANCIAL_CHECKLIST = [
     { key: 'neraca_seimbang', label: 'Neraca seimbang (Total Aset = Liabilitas + Ekuitas)' },
     { key: 'angka_wajar', label: 'Struktur angka konsisten (komponen tidak melebihi total)' },
     { key: 'arus_kas_cocok', label: 'Arus kas operasional cocok dengan laba & mutasi kas' },
     { key: 'penjualan_terverifikasi', label: 'Penjualan didukung rekening koran / faktur / SPT' },
     { key: 'utang_lengkap', label: 'Seluruh utang & kewajiban tercatat lengkap (termasuk SLIK)' },
     { key: 'konsisten_periode', label: 'Konsisten dengan periode / laporan sebelumnya' }
];

/** Checklist verifikasi agunan (harus semua tercentang). */
export const COLLATERAL_CHECKLIST = [
     { key: 'ada_fisik', label: 'Agunan benar-benar ada dan dikuasai pemilik' },
     { key: 'bukti_kepemilikan', label: 'Bukti kepemilikan sah (sertifikat/BPKB) atas nama pemilik' },
     { key: 'bebas_sengketa', label: 'Tidak sedang dijaminkan / diikat pihak lain' },
     { key: 'nilai_wajar', label: 'Nilai taksiran wajar dan LTV dalam batas kebijakan' },
     { key: 'asuransi', label: 'Agunan diasuransikan (bila relevan)' }
];

/**
 * Pertanyaan wawancara kualitatif — diturunkan otomatis dari parameter
 * Bisnis & Manajemen yang berskala skor (0–1) dan ditandai 5C.
 */
export const INTERVIEW_QUESTIONS = Object.entries(BISNIS_MANAJEMEN_META)
     .filter(([, meta]) => meta.unit === 'skor')
     .map(([key, meta]) => ({
          key,
          label: meta.label,
          group: meta.group,
          c: BM_PARAM_TO_C[key] || 'capacity',
          help: meta.help || ''
     }));

/** Pertanyaan wawancara dikelompokkan menurut 5C (urut sesuai AUDIT definisi). */
export function interviewGroups() {
     const order = ['character', 'capacity', 'capital', 'conditions', 'collateral'];
     return order
          .map((c) => ({
               c,
               label: C_LABEL[c] || c,
               items: INTERVIEW_QUESTIONS.filter((q) => q.c === c)
          }))
          .filter((g) => g.items.length > 0);
}

function isChecked(v) {
     return v === true || v === 1;
}

/** Skor 0–1 yang valid, atau `null` bila kosong / di luar rentang. */
export function score01(v) {
     if (v === null || v === undefined || v === '') return null;
     if (typeof v !== 'number' && typeof v !== 'string') return null;
     const clean = typeof v === 'string' ? v.trim().replace(',', '.') : v;
     if (clean === '') return null;
     const n = Number(clean);
     if (!Number.isFinite(n)) return null;
     if (n < 0 || n > 1) return null;
     return n;
}

export const AUDIT_SCORE_OPTIONS = [
     { value: 0, label: 'Sangat lemah — 0/100' },
     { value: 0.25, label: 'Lemah — 25/100' },
     { value: 0.5, label: 'Cukup — 50/100' },
     { value: 0.75, label: 'Kuat — 75/100' },
     { value: 1, label: 'Sangat kuat — 100/100' }
];

/** Invalid stored scores must never silently fall back to borrower/default values. */
export function assertValidAuditScores(raw) {
     const scores = raw?.interview?.scores || {};
     const invalid = INTERVIEW_QUESTIONS.filter(q => scores[q.key] !== undefined && scores[q.key] !== null && scores[q.key] !== '' && score01(scores[q.key]) === null);
     if (invalid.length) throw new Error(`Perbaiki penilaian audit yang tidak valid: ${invalid.map(q => q.label).join(', ')}. Masukkan angka antara 0 dan 1, misalnya 0,63.`);
}

/** Struktur audit kosong. */
export function emptyAudit() {
     return {
          financial: { checks: {}, notes: '', done_at: null },
          collateral: { checks: {}, notes: '', done_at: null },
          interview: { scores: {}, notes: '', done_at: null },
          completed_at: null
     };
}

/** Bentuk apa pun → struktur audit yang aman dipakai UI. */
export function normalizeAudit(raw) {
     const r = raw && typeof raw === 'object' ? raw : {};
     const fin = r.financial && typeof r.financial === 'object' ? r.financial : {};
     const col = r.collateral && typeof r.collateral === 'object' ? r.collateral : {};
     const itv = r.interview && typeof r.interview === 'object' ? r.interview : {};
     return {
          financial: {
               checks: { ...(fin.checks || {}) },
               notes: typeof fin.notes === 'string' ? fin.notes : '',
               done_at: fin.done_at || null
          },
          collateral: {
               checks: { ...(col.checks || {}) },
               notes: typeof col.notes === 'string' ? col.notes : '',
               done_at: col.done_at || null
          },
          interview: {
               scores: { ...(itv.scores || {}) },
               notes: typeof itv.notes === 'string' ? itv.notes : '',
               done_at: itv.done_at || null
          },
          completed_at: r.completed_at || null
     };
}

/**
 * Progres tiap bagian audit.
 * @returns {{financial:object, collateral:object, interview:object, sections_complete:number, complete:boolean}}
 */
export function auditProgress(raw, context = null) {
     const a = normalizeAudit(raw);
     if (context) for (const check of automaticAudit(context.borrower, context.documents).checks) a.financial.checks[check.key] = check.passed === true;
     const checklist = (list, values) => {
          const total = list.length;
          const done = list.filter((i) => isChecked(values[i.key])).length;
          return { done, total, complete: total > 0 && done === total };
     };
     const financial = checklist(FINANCIAL_CHECKLIST, a.financial.checks);
     const collateral = checklist(COLLATERAL_CHECKLIST, a.collateral.checks);
     const total = INTERVIEW_QUESTIONS.length;
     const done = INTERVIEW_QUESTIONS.filter((q) => score01(a.interview.scores[q.key]) !== null).length;
     const interview = { done, total, complete: total > 0 && done === total };
     const sections_complete = [financial, collateral, interview].filter((s) => s.complete).length;
     return {
          financial,
          collateral,
          interview,
          sections_complete,
          complete: financial.complete && collateral.complete && interview.complete
     };
}

/** Apakah ketiga bagian audit sudah lengkap. */
export function isAuditComplete(raw, context = null) {
     return auditProgress(raw, context).complete;
}

/** Skor kualitatif dari hasil wawancara lender (hanya nilai valid 0–1). */
export function qualitativeFromAudit(raw) {
     const a = normalizeAudit(raw);
     const out = {};
     for (const q of INTERVIEW_QUESTIONS) {
          const v = score01(a.interview.scores[q.key]);
          if (v !== null) out[q.key] = v;
     }
     return out;
}

/**
 * Terapkan skor wawancara lender ke borrower TANPA memutasi objek asal.
 * Hanya menimpa nilai parameter kualitatif berskala skor; parameter lain
 * (mis. track_record_tahun, cash_runway_bulan) dibiarkan apa adanya.
 */
export function applyAuditToBorrower(borrower = {}, raw = null) {
     assertValidAuditScores(raw);
     const scores = qualitativeFromAudit(raw);
     if (!Object.keys(scores).length) return borrower;
     const b = { ...(borrower || {}) };
     const bm = { ...(b.bisnis_manajemen || {}) };
     for (const [key, value] of Object.entries(scores)) bm[key] = value;
     b.bisnis_manajemen = bm;
     return b;
}

/** Changed evidence invalidates the dependent human confirmations, while preserving notes. */
export function auditAfterInputChange(raw, previous = {}, next = {}, previousDocs = [], nextDocs = []) {
     const audit = normalizeAudit(raw);
     previous = previous || {};
     next = next || {};
     previousDocs = Array.isArray(previousDocs) ? previousDocs : [];
     nextDocs = Array.isArray(nextDocs) ? nextDocs : [];
     const changedSources = nextDocs.filter(doc => !previousDocs.some(old => old.id === doc.id && old.sha256 === doc.sha256)).map(doc => doc.source_key);
     const financialChanged = JSON.stringify(previous.keuangan || {}) !== JSON.stringify(next.keuangan || {}) || changedSources.some(s => s !== 'agunan');
     const collateralChanged = JSON.stringify(previous.agunan || {}) !== JSON.stringify(next.agunan || {}) || changedSources.includes('agunan');
     if (financialChanged) audit.financial = { ...audit.financial, checks: {}, done_at: null };
     if (collateralChanged) audit.collateral = { ...audit.collateral, checks: {}, done_at: null };
     if (financialChanged || collateralChanged) audit.completed_at = null;
     return audit;
}

/**
 * Ringkasan perbandingan skor pemohon vs skor wawancara lender.
 * @returns {Array<{key:string,label:string,c:string,declared:number|null,lender:number|null,overridden:boolean}>}
 */
export function interviewComparison(borrower = {}, raw = null) {
     const bm = (borrower && borrower.bisnis_manajemen) || {};
     const a = normalizeAudit(raw);
     return INTERVIEW_QUESTIONS.map((q) => {
          const declared = score01(bm[q.key]);
          const lender = score01(a.interview.scores[q.key]);
          return {
               key: q.key,
               label: q.label,
               c: q.c,
               declared,
               lender,
               overridden: lender !== null
          };
     });
}

export default {
     AUDIT_SECTIONS,
     FINANCIAL_CHECKLIST,
     COLLATERAL_CHECKLIST,
     INTERVIEW_QUESTIONS,
     C_LABEL,
     interviewGroups,
     score01,
     emptyAudit,
     normalizeAudit,
     auditProgress,
     isAuditComplete,
     qualitativeFromAudit,
     applyAuditToBorrower,
     interviewComparison
};
