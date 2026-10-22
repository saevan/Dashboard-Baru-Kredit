/**
 * simple/loans.js — Siklus pinjaman untuk dashboard sederhana:
 * pengajuan → penawaran → diterima pemohon → pencairan → pemantauan → keringanan.
 *
 * Semua penilaian memakai mesin MEZS.id:
 *   - syarat pencairan & borrowing base  → core/disbursement.js
 *   - peringatan dini 20 parameter (EWS) → core/ews-monitor.js
 *   - kolektibilitas, CKPN, PPKA, NPL    → core/portfolio.js
 *   - pilihan keringanan (3R)            → core/restructuring.js
 * Modul ini hanya menyimpan status dan menerjemahkan hasilnya ke bahasa awam.
 */

import { analyze } from './analyze.js';
import { applyInterview, INTERVIEW_QUESTIONS } from './form-schema.js';
import { emptyBorrower } from '../core/engine.js';
import { buildConditionsPrecedent, conditionsStatus, disbursementBlocker } from '../core/disbursement.js';
import { evaluateMonitoring, EWS_PARAMS } from '../core/ews-monitor.js';
import { buildPortfolio } from '../core/portfolio.js';
import { proposeRestructuring, restructuringRecord } from '../core/restructuring.js';
import { periodicInstallment } from '../core/debt-service.js';
import { INDUSTRY_BENCHMARK } from '../data/industries.js';
import { rupiah, STATUS } from './translate.js';

/* ------------------------------------------------------------ status ---- */

/**
 * Status mengikuti alur MEZS.id (core/application.js), disederhanakan:
 * diajukan → (perbaikan → diajukan) → ditawarkan → diterima → aktif → lunas,
 * dengan cabang ditolak (oleh bank) dan ditolak_pemohon (penawaran ditolak).
 */
export const LOAN_STATUS = {
     diajukan: { label: 'Pengajuan baru', borrower: 'Pengajuan diterima, sedang diperiksa bank', tone: 'kuning' },
     perbaikan: { label: 'Menunggu perbaikan pemohon', borrower: 'Perlu perbaikan dari Anda', tone: 'kuning' },
     ditawarkan: { label: 'Penawaran dikirim', borrower: 'Ada penawaran untuk Anda', tone: 'kuning' },
     diterima: { label: 'Siap dicairkan', borrower: 'Penawaran diterima, menunggu pencairan', tone: 'kuning' },
     ditolak_pemohon: { label: 'Penawaran ditolak pemohon', borrower: 'Anda menolak penawaran', tone: 'merah' },
     aktif: { label: 'Berjalan', borrower: 'Pinjaman berjalan', tone: 'hijau' },
     ditolak: { label: 'Ditolak', borrower: 'Pengajuan belum dapat disetujui', tone: 'merah' },
     lunas: { label: 'Lunas', borrower: 'Lunas', tone: 'hijau' }
};

/** Linimasa untuk pemohon (tanpa skor atau peringkat, seperti repo asal). */
const STAGES = [
     { key: 'kirim', label: 'Pengajuan dikirim', statuses: [] },
     { key: 'periksa', label: 'Pemeriksaan bank', statuses: ['diajukan', 'perbaikan'] },
     { key: 'tawar', label: 'Penawaran', statuses: ['ditawarkan'] },
     { key: 'cair', label: 'Pencairan', statuses: ['diterima'] },
     { key: 'jalan', label: 'Pinjaman berjalan', statuses: ['aktif', 'lunas'] }
];

export function borrowerTimeline(status) {
     const closed = ['ditolak', 'ditolak_pemohon'].includes(status);
     const idx = closed ? -1 : STAGES.findIndex((s) => s.statuses.includes(status));
     return STAGES.map((s, i) => ({
          label: s.label,
          state: closed ? (i === 0 ? 'done' : 'todo') : i < idx || (status === 'lunas' && i === idx) ? 'done' : i === idx ? 'current' : 'todo'
     }));
}

export const PERIODICITY_OPTIONS = [
     { key: 'harian', label: 'Setiap hari', unit: 'hari' },
     { key: 'mingguan', label: 'Setiap minggu', unit: 'minggu' },
     { key: 'bulanan', label: 'Setiap bulan', unit: 'bulan' }
];
export const periodUnit = (p) => (PERIODICITY_OPTIONS.find((o) => o.key === p) || PERIODICITY_OPTIONS[2]).unit;

export const EWS_PLAIN = {
     NORMAL: { tone: 'hijau', label: 'Sehat', action: 'Lanjutkan pemantauan rutin setiap bulan.' },
     WATCH: { tone: 'kuning', label: 'Perlu dipantau', action: 'Pantau lebih sering dan minta laporan penjualan setiap bulan.' },
     WARNING: { tone: 'kuning', label: 'Waspada', action: 'Hubungi nasabah, minta laporan keuangan terbaru, dan jadwalkan kunjungan.' },
     CRITICAL: { tone: 'merah', label: 'Bermasalah', action: 'Kunjungi usaha segera dan bahas keringanan cicilan. Bila nasabah tidak kooperatif, siapkan penagihan.' }
};

const COLLECTIBILITY_PLAIN = {
     Lancar: 'Lancar',
     'Dalam Perhatian Khusus': 'Perlu perhatian (DPK)',
     'Kurang Lancar': 'Bermasalah — kurang lancar',
     Diragukan: 'Bermasalah — diragukan',
     Macet: 'Bermasalah — macet'
};

const ESCALATE_PLAIN = { 'Manajer Risiko': 'manajer risiko', 'Analis Senior': 'analis senior' };

/* ------------------------------------------------------------ helper ---- */

const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const fmt = (v, d = 2) => Number(v).toLocaleString('id-ID', { maximumFractionDigits: d });

let seq = 0;
const newId = (now) => `pinjaman_${now.getTime().toString(36)}_${(seq++).toString(36)}`;

function requireStatus(record, allowed, what) {
     if (!allowed.includes(record.status)) throw new Error(`${what} tidak bisa dilakukan saat status "${LOAN_STATUS[record.status]?.label || record.status}".`);
}

/**
 * Borrower efektif untuk mesin: wawancara petugas diterapkan, lalu syarat
 * penawaran (jumlah, lama, bunga, periode cicilan) bila sudah ada.
 */
export function effectiveBorrower(record) {
     const b = applyInterview(record.borrower, record.interview || {}, emptyBorrower().bisnis_manajemen);
     const o = record.offer;
     if (!o) return b;
     return { ...b, plafon_diajukan: o.amount, tenor_bulan: o.tenor, bunga_tahunan: o.rate, periode_angsuran: o.periodicity };
}

/** Analisis mesin untuk satu pinjaman (pada syarat penawaran bila ada). */
export function analyzeLoan(record) {
     return analyze(effectiveBorrower(record));
}

/** Cicilan dari hasil mesin: per periode pilihan + setara bulanan. */
export function installmentOf(result) {
     const nl = result.debtService?.new_loan;
     const monthly = nl?.schedule?.find((r) => r.payment > 0)?.payment ?? nl?.monthly_avg ?? null;
     const periodic = result.debtService?.periodic;
     const total = nl?.schedule?.reduce((a, r) => a + (r.payment || 0), 0) ?? null;
     return {
          periodicity: periodic?.periodicity || 'bulanan',
          per_period: periodic?.per_period ?? monthly,
          periods: periodic?.tenor_period ?? null,
          monthly: monthly === null ? null : Math.round(monthly),
          total: total === null ? null : Math.round(total),
          annual_debt_service: Math.round(result.debtService?.total_annual || 0)
     };
}

/* --------------------------------------------------------- siklus ------- */

/** Pemohon mengirim pengajuan (data usaha, angka dari berkas, dokumen, persetujuan). */
export function createLoan({ borrower, documents = [], consent = false, interview = {}, now = new Date() }) {
     if (!consent) throw new Error('Centang persetujuan pemeriksaan data sebelum mengirim.');
     return {
          id: newId(now),
          created_at: now.toISOString(),
          submitted_at: now.toISOString(),
          borrower: structuredClone(borrower),
          documents: structuredClone(documents),
          consent: { accepted: true, at: now.toISOString() },
          interview: { ...interview },
          status: 'diajukan',
          offer: null,
          amount: null,
          conditions: {},
          monitoring: [],
          restructuring: null,
          terms: null,
          history: [{ at: now.toISOString(), by: 'pemohon', text: 'Pengajuan dikirim' }]
     };
}

const logged = (record, by, text, now) => [...(record.history || []), { at: now.toISOString(), by, text }];

/* ------------------------------------------------ pemeriksaan petugas -- */

/**
 * Pemeriksaan mengikuti urutan aplikasi asal (diajukan → terverifikasi →
 * dinilai → keputusan): hasil analisis dan penawaran baru tersedia setelah
 * dokumen diperiksa DAN wawancara lengkap. Mengubah data yang sudah
 * diperiksa membatalkan tahap sesudahnya.
 */
export function reviewState(record) {
     const answered = INTERVIEW_QUESTIONS.filter((q) => Number.isFinite(record.interview?.[q.key]));
     return {
          verified: !!record.review?.verified_at,
          scored: !!record.review?.scored_at,
          answered: answered.length,
          totalQuestions: INTERVIEW_QUESTIONS.length,
          interviewDone: answered.length === INTERVIEW_QUESTIONS.length
     };
}

const resetReview = (record, from = 'verified') =>
     from === 'verified' ? { ...record, review: null } : { ...record, review: record.review ? { ...record.review, scored_at: null, score: null } : null };

/** Petugas: tandai dokumen terverifikasi / belum (membatalkan pemeriksaan yang sudah selesai). */
export function verifyDocument(record, key, verified, now = new Date()) {
     const documents = (record.documents || []).map((d) => (d.key === key ? { ...d, verified: !!verified, verified_at: verified ? now.toISOString() : null } : d));
     return resetReview({ ...record, documents });
}

/** Petugas: koreksi data hasil pemeriksaan (tunggakan SLIK, kas cukup berapa bulan). */
export function setReviewedField(record, path, value) {
     const borrower = structuredClone(record.borrower);
     const keys = path.split('.');
     const last = keys.pop();
     keys.reduce((o, k) => (o[k] ??= {}), borrower)[last] = value;
     return resetReview({ ...record, borrower });
}

/** Petugas: selesai memeriksa data & dokumen → boleh lanjut wawancara. */
export function finishVerification(record, { now = new Date() } = {}) {
     requireStatus(record, ['diajukan'], 'Selesai memeriksa');
     const pending = (record.documents || []).filter((d) => !d.verified).length;
     return { ...record, review: { verified_at: now.toISOString(), scored_at: null, score: null },
          history: logged(record, 'petugas', `Pemeriksaan dokumen selesai${pending ? ` (${pending} berkas belum cocok)` : ''}`, now) };
}

/** Petugas: isi hasil wawancara (skala 1–5); mengubahnya membatalkan hasil yang sudah dihitung. */
export function setInterview(record, key, value) {
     const interview = { ...(record.interview || {}), [key]: value === null || value === '' ? null : Number(value) };
     return resetReview({ ...record, interview }, 'scored');
}

/** Petugas: hitung hasil analisis setelah pemeriksaan & wawancara lengkap. */
export function scoreApplication(record, { now = new Date() } = {}) {
     requireStatus(record, ['diajukan'], 'Hitung hasil');
     const r = reviewState(record);
     if (!r.verified) throw new Error('Selesaikan pemeriksaan dokumen dulu.');
     if (!r.interviewDone) throw new Error(`Wawancara belum lengkap (${r.answered} dari ${r.totalQuestions} pertanyaan).`);
     const result = analyzeLoan(record);
     const score = { finalScore: result.finalScore, grade: result.risk?.pefindo?.grade, decision: result.decision?.decision };
     return { ...record, review: { ...record.review, scored_at: now.toISOString(), score },
          history: logged(record, 'petugas', `Dinilai: ${score.grade} (skor ${score.finalScore})`, now) };
}

/** Petugas: minta perbaikan dengan catatan untuk pemohon. */
export function requestFix(record, { note = '', now = new Date() } = {}) {
     requireStatus(record, ['diajukan'], 'Minta perbaikan');
     const text = String(note).trim().slice(0, 500);
     if (!text) throw new Error('Tulis apa yang perlu diperbaiki pemohon.');
     return { ...record, status: 'perbaikan', fix_note: text, history: logged(record, 'petugas', `Minta perbaikan: ${text}`, now) };
}

/** Pemohon: kirim ulang setelah perbaikan. */
export function resubmit(record, { borrower, documents, now = new Date() }) {
     requireStatus(record, ['perbaikan'], 'Kirim ulang');
     // Berkas yang diganti kehilangan status terverifikasi.
     const old = new Map((record.documents || []).map((d) => [d.key, d]));
     const docs = (documents || record.documents || []).map((d) => {
          const prev = old.get(d.key);
          return prev && prev.sha256 === d.sha256 ? { ...d, verified: prev.verified, verified_at: prev.verified_at } : { ...d, verified: false };
     });
     return { ...record, status: 'diajukan', review: null, borrower: structuredClone(borrower || record.borrower), documents: docs, fix_note: null,
          history: logged(record, 'pemohon', 'Perbaikan dikirim', now) };
}

/** Petugas: kirim penawaran. Cicilan dihitung mesin pada syarat ini. */
export function makeOffer(record, { amount, tenor, rate, periodicity, now = new Date() }) {
     requireStatus(record, ['diajukan'], 'Kirim penawaran');
     if (!reviewState(record).scored) throw new Error('Hitung hasil analisis dulu sebelum mengirim penawaran.');
     if (!(num(amount) > 0)) throw new Error('Jumlah penawaran harus lebih dari 0.');
     if (!(num(tenor) >= 1 && num(tenor) <= 120)) throw new Error('Lama pinjaman 1–120 bulan.');
     if (!(num(rate) >= 0 && num(rate) <= 0.6)) throw new Error('Bunga 0–60% per tahun.');
     const p = PERIODICITY_OPTIONS.some((o) => o.key === periodicity) ? periodicity : 'bulanan';
     const draft = { ...record, offer: { amount: Math.round(num(amount)), tenor: Math.round(num(tenor)), rate: num(rate), periodicity: p } };
     const result = analyzeLoan(draft);
     return {
          ...draft,
          status: 'ditawarkan',
          offer: { ...draft.offer, ...installmentOf(result), decision: result.decision.decision, offered_at: now.toISOString() },
          history: logged(record, 'petugas', `Penawaran ${rupiah(amount)} / ${tenor} bulan dikirim`, now)
     };
}

export function acceptOffer(record, { now = new Date() } = {}) {
     requireStatus(record, ['ditawarkan'], 'Terima penawaran');
     return { ...record, status: 'diterima', amount: record.offer.amount, accepted_at: now.toISOString(), history: logged(record, 'pemohon', 'Penawaran diterima', now) };
}

export function declineOffer(record, { reason = '', now = new Date() } = {}) {
     requireStatus(record, ['ditawarkan'], 'Tolak penawaran');
     return { ...record, status: 'ditolak_pemohon', decline_reason: String(reason).slice(0, 300), history: logged(record, 'pemohon', 'Penawaran ditolak', now) };
}

export function rejectLoan(record, { reason = '', now = new Date() } = {}) {
     requireStatus(record, ['diajukan', 'perbaikan'], 'Tolak pengajuan');
     return { ...record, status: 'ditolak', rejected_at: now.toISOString(), reject_reason: String(reason).slice(0, 300), history: logged(record, 'petugas', 'Pengajuan ditolak', now) };
}

/** Syarat pencairan (mesin) + status centang, dalam bahasa awam. */
export function conditionsView(record) {
     const result = analyzeLoan(record);
     const borrower = effectiveBorrower(record);
     const list = buildConditionsPrecedent({ borrower, decision: result.decision.decision });
     const status = conditionsStatus(list, record.conditions || {});
     const blocker = disbursementBlocker({
          borrower: { ...borrower, conditions_precedent: record.conditions || {} },
          decision: result.decision.decision,
          amount: record.amount
     });
     const bb = list.find((c) => c.code === 'BORROWING_BASE')?.detail || null;
     // Satu-satunya hambatan yang boleh dilewati: nominal di atas borrowing base (pencairan dibatasi, bukan ditolak).
     const onlyBorrowingBase = !!blocker && /^Penarikan melebihi borrowing base/.test(blocker);
     return {
          items: status.items.map((c) => ({ code: c.code, label: c.label, description: c.description, mandatory: c.mandatory, done: c.done })),
          done: status.done,
          total: status.total,
          ready: !blocker,
          canDisburse: !blocker || onlyBorrowingBase,
          blocker: onlyBorrowingBase ? null : blocker,
          firstDrawLimit: bb && bb.availability < record.amount ? bb.availability : null
     };
}

export function toggleCondition(record, code, done, now = new Date()) {
     const conditions = { ...(record.conditions || {}) };
     conditions[code] = { done: !!done, at: now.toISOString() };
     return { ...record, conditions };
}

/**
 * Cairkan pinjaman. Ditolak bila syarat wajib belum lengkap (aturan mesin).
 * Cicilan, lama, dan periode cicilan dicatat dari analisis pada syarat penawaran.
 */
export function disburseLoan(record, { now = new Date() } = {}) {
     requireStatus(record, ['diterima'], 'Pencairan');
     const view = conditionsView(record);
     if (!view.canDisburse) throw new Error(view.blocker);
     const inst = installmentOf(analyzeLoan(record));
     return {
          ...record,
          status: 'aktif',
          disbursed_at: now.toISOString(),
          // Modal kerja di atas borrowing base: penarikan pertama dibatasi (sisanya ditarik bertahap).
          first_draw: view.firstDrawLimit,
          drawn: view.firstDrawLimit ?? record.amount,
          outstanding: view.firstDrawLimit ?? record.amount,
          terms: {
               tenor_bulan: record.offer.tenor,
               rate: record.offer.rate,
               periodicity: inst.periodicity,
               per_period: inst.per_period === null ? null : Math.round(inst.per_period),
               monthly_installment: inst.monthly,
               annual_debt_service: inst.annual_debt_service,
               remaining_months: record.offer.tenor
          },
          history: logged(record, 'petugas', 'Dana dicairkan', now)
     };
}

/** Tarik sisa plafon (setelah sertifikat borrowing base diperbarui petugas). */
export function drawRemaining(record, { now = new Date() } = {}) {
     if (record.status !== 'aktif') throw new Error('Pinjaman belum cair.');
     const rest = Math.max(0, (record.amount || 0) - (record.drawn ?? record.amount ?? 0));
     if (!rest) return record;
     return { ...record, drawn: record.amount, outstanding: (record.outstanding || 0) + rest, last_draw_at: now.toISOString() };
}

/* ------------------------------------------------------ pemantauan ------ */

/** Isian pemantauan sederhana → 20 parameter EWS mesin. */
export function monitoringParams(input = {}, record = {}) {
     const params = { ...(input.extra || {}) };
     const set = (k, v) => {
          if (v !== null && v !== undefined && v !== '') params[k] = v;
     };
     set('P11_days_late', num(input.days_late));
     set('P6_omzet_yoy_pct', num(input.omzet_change_pct));
     set('P10_cash_change_pct', num(input.cash_change_pct));
     set('P12_response_days', num(input.response_days));
     set('P4_ocf', input.ocf || null);
     set('P20_covenant', input.covenant || null);
     // DSCR aktual dari uang bersih usaha setahun ÷ cicilan setahun (bila tidak diisi langsung).
     const cash = num(input.cash_flow_annual);
     const ds = num(record.terms?.annual_debt_service);
     if (params.P1_dscr === undefined && cash !== null && ds) params.P1_dscr = Math.round((cash / ds) * 100) / 100;
     return params;
}

function baselineFor(sector) {
     const roa = INDUSTRY_BENCHMARK.sectors?.[sector]?.benchmarks?.roa;
     return roa ? { benchmark: { roa } } : {};
}

export function addMonitoring(record, input, { now = new Date() } = {}) {
     if (record.status !== 'aktif') throw new Error('Pemantauan hanya untuk pinjaman yang sudah cair.');
     const period = String(input.period || now.toISOString().slice(0, 7));
     const params = monitoringParams(input, record);
     const evaluation = evaluateMonitoring(params, baselineFor(record.borrower.sektor));
     const entry = {
          period,
          note: String(input.note || '').slice(0, 500),
          params,
          cash_flow_annual: num(input.cash_flow_annual),
          outstanding: num(input.outstanding),
          remaining_months: num(input.remaining_months),
          ews_level: evaluation.ews_level,
          collectibility: evaluation.collectibility,
          recommended_action: evaluation.recommended_action,
          escalate_to: evaluation.escalate_to,
          signals: evaluation.signals,
          judgements: evaluation.judgements,
          created_at: now.toISOString()
     };
     const monitoring = [...(record.monitoring || []).filter((m) => m.period !== period), entry].sort((a, b) => a.period.localeCompare(b.period));
     const latest = monitoring.at(-1);
     return {
          ...record,
          monitoring,
          outstanding: latest.outstanding ?? record.outstanding,
          terms: record.terms && latest.remaining_months ? { ...record.terms, remaining_months: latest.remaining_months } : record.terms
     };
}

/** Satu sinyal EWS → kalimat awam. */
export function plainSignal(s) {
     const v = s.value;
     switch (s.code) {
          case 'P1': return v < 1 ? `uang usaha tidak cukup untuk cicilan (hanya ${fmt(v)} kali)` : `uang usaha hanya ${fmt(v)} kali cicilan`;
          case 'P2': return `laba usaha hanya ${fmt(v)} kali bunga`;
          case 'P3': return `harta lancar hanya ${fmt(v)} kali utang jangka pendek`;
          case 'P4': return v === 'negatif_2_periode' ? 'arus kas usaha negatif 2 periode berturut-turut' : 'arus kas usaha negatif';
          case 'P5': return `kas hanya cukup untuk ${fmt(v, 1)} bulan`;
          case 'P6': return `omzet turun ${fmt(-v, 0)}% dari tahun lalu`;
          case 'P7': return `utang naik ${fmt(v, 0)}% dibanding modal`;
          case 'P8': return 'tanda-tanda risiko bangkrut meningkat';
          case 'P9': return 'keuntungan di bawah usaha sejenis';
          case 'P10': return `saldo kas turun ${fmt(-v, 0)}%`;
          case 'P11': return `telat bayar ${fmt(v, 0)} hari`;
          case 'P12': return `lambat merespons (${fmt(v, 0)} hari)`;
          case 'P13': return `${fmt(v, 0)} pengurus kunci berganti`;
          case 'P14': return 'mengubah strategi usaha tanpa tambahan modal';
          case 'P15': return 'ada transaksi rekening yang tidak wajar';
          case 'P16': return `produksi turun ${fmt(-v, 0)}%`;
          case 'P17': return `stok makin lambat terjual (turun ${fmt(-v, 0)}%)`;
          case 'P18': return `tagihan ke pelanggan rata-rata ${fmt(v, 0)} hari`;
          case 'P19': return `pembayaran ke pemasok makin lama (${fmt(v, 0)}%)`;
          case 'P20': return v === 'material' ? 'ada janji (covenant) yang dilanggar berat' : 'ada janji (covenant) yang dilanggar ringan';
          default: return s.param;
     }
}

const SEVERITY_RANK = { CRITICAL: 0, WARNING: 1, WATCH: 2, NORMAL: 3 };

export function monitoringView(entry) {
     if (!entry) return null;
     const level = EWS_PLAIN[entry.ews_level] || EWS_PLAIN.NORMAL;
     const signals = [...(entry.signals || [])].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
     const reasons = signals.map(plainSignal);
     const escalate = entry.escalate_to ? ` Laporkan ke ${ESCALATE_PLAIN[entry.escalate_to] || entry.escalate_to}.` : '';
     return {
          period: entry.period,
          tone: level.tone,
          label: level.label,
          level: entry.ews_level,
          collectibility: COLLECTIBILITY_PLAIN[entry.collectibility] || entry.collectibility,
          sentence: reasons.length ? `${level.label}: ${reasons.slice(0, 3).join(', ')}.` : 'Sehat: tidak ada tanda masalah.',
          reasons,
          action: level.action + escalate,
          note: entry.note || ''
     };
}

/* ------------------------------------------------------- keringanan ----- */

const OPTION_PLAIN = {
     rescheduling: 'Perpanjang lama pinjaman',
     reconditioning: 'Turunkan bunga',
     kombinasi: 'Perpanjang lama + turunkan bunga'
};

/**
 * Pilihan keringanan cicilan (3R, POJK 40) dari kondisi terkini.
 * Bunga tidak diturunkan di bawah titik impas risiko dari analisis awal.
 */
export function restructuringView(record) {
     if (record.status !== 'aktif' || !record.terms) return null;
     const latest = record.monitoring?.at(-1);
     const result = analyzeLoan(record);
     const cash = latest?.cash_flow_annual ?? num(record.borrower.keuangan?.arus_kas_operasional);
     if (!(cash > 0)) return { available: false, sentence: 'Isi uang bersih usaha setahun saat ini untuk menghitung keringanan.' };
     const proposal = proposeRestructuring({
          outstanding: record.outstanding,
          rate: record.terms.rate,
          remainingMonths: record.terms.remaining_months,
          annualCashFlow: cash,
          floorRate: result.risk?.pricing?.breakeven_rate ?? null
     });
     const options = proposal.options.map((o) => ({
          type: o.type,
          name: OPTION_PLAIN[o.type] || o.label,
          tenor: o.tenor_bulan,
          rate: o.rate,
          monthly: o.monthly_installment,
          dscr: o.dscr,
          enough: o.meets_target,
          feasible: o.feasible,
          recommended: o.type === proposal.recommended,
          sentence: `${o.tenor_bulan} bulan, bunga ${fmt(o.rate * 100, 2)}%, cicilan ${rupiah(o.monthly_installment)}/bulan — uang usaha ${fmt(o.dscr)} kali cicilan${o.meets_target ? ' (aman)' : o.feasible ? ' (pas-pasan)' : ' (belum cukup)'}.`
     }));
     return {
          available: true,
          current: { monthly: proposal.current.monthly_installment, dscr: proposal.current.dscr, tenor: proposal.current.tenor_bulan },
          sentence: `Untuk melunasi sisa ${rupiah(record.outstanding)} dalam ${proposal.current.tenor_bulan} bulan, cicilannya ${rupiah(proposal.current.monthly_installment)}/bulan — uang usaha hanya ${fmt(proposal.current.dscr)} kali cicilan.`,
          options,
          needsCommittee: proposal.needs_full_restructuring,
          committeeNote: proposal.needs_full_restructuring ? proposal.full_restructuring_note : null,
          raw: proposal
     };
}

export function applyRestructuring(record, type, { note = '', now = new Date() } = {}) {
     const view = restructuringView(record);
     const option = view?.raw?.options.find((o) => o.type === type);
     if (!option) throw new Error('Pilihan keringanan tidak ditemukan.');
     if (!option.feasible) throw new Error('Pilihan ini belum membuat cicilan terjangkau; perlu keputusan komite.');
     const latest = record.monitoring?.at(-1);
     const before = latest?.collectibility === 'Lancar' ? 'lancar' : 'dpk';
     const rec = restructuringRecord({
          option,
          collectibilityBefore: before,
          termsBefore: { ...record.terms },
          note,
          now
     });
     return {
          ...record,
          restructuring: rec,
          terms: {
               ...record.terms,
               tenor_bulan: option.tenor_bulan,
               remaining_months: option.tenor_bulan,
               rate: option.rate,
               monthly_installment: option.monthly_installment,
               per_period: Math.round(periodicInstallment({ monthlyPayment: option.monthly_installment, periodicity: record.terms.periodicity, tenorBulan: option.tenor_bulan }).per_period),
               annual_debt_service: option.annual_debt_service
          },
          history: logged(record, 'petugas', `Keringanan: ${option.label}`, now)
     };
}

/* ------------------------------------------------------- portofolio ----- */

const FACILITY = { diajukan: 'pipeline', perbaikan: 'pipeline', ditawarkan: 'pipeline', diterima: 'pipeline', aktif: 'aktif', ditolak: 'ditolak', ditolak_pemohon: 'ditolak', lunas: 'lunas' };

function portfolioRow(record) {
     return {
          borrower: {
               ...effectiveBorrower(record),
               id: record.id,
               facility_status: FACILITY[record.status] || 'pipeline',
               outstanding: record.outstanding ?? record.amount,
               restructuring: record.restructuring || undefined
          },
          analysis: analyzeLoan(record),
          monitoring: record.monitoring || []
     };
}

/** Kartu ringkas satu pinjaman untuk daftar petugas. */
export function loanCard(record) {
     const status = LOAN_STATUS[record.status] || LOAN_STATUS.diajukan;
     const mon = monitoringView(record.monitoring?.at(-1));
     let tone = status.tone;
     let headline = status.label;
     let sentence = '';
     if (record.status === 'aktif') {
          tone = mon ? mon.tone : 'hijau';
          headline = mon ? mon.label : 'Belum dipantau';
          sentence = mon ? mon.sentence : 'Catat pemantauan pertama setelah cicilan pertama.';
     } else if (record.status === 'diajukan') {
          const r = reviewState(record);
          if (r.scored) {
               const result = analyzeLoan(record);
               const s = STATUS[result.decision.decision];
               tone = s.tone;
               headline = 'Siap diputuskan';
               sentence = `Hasil analisis: ${s.label.toLowerCase()} (${result.risk.pefindo.grade}). Saran ${rupiah(result.nominal.recommended_nominal)}.`;
          } else {
               headline = 'Belum dinilai';
               sentence = !r.verified ? 'Langkah berikutnya: periksa data & dokumen.' : `Langkah berikutnya: wawancara (${r.answered} dari ${r.totalQuestions} dijawab).`;
          }
     } else if (record.status === 'perbaikan') {
          sentence = `Diminta: ${record.fix_note}`;
     } else if (record.status === 'ditawarkan') {
          sentence = `Ditawarkan ${rupiah(record.offer.amount)} / ${record.offer.tenor} bulan; menunggu jawaban pemohon.`;
     } else if (record.status === 'diterima') {
          sentence = `Diterima pemohon (${rupiah(record.amount)}); lengkapi syarat pencairan.`;
     } else if (record.status === 'ditolak') {
          sentence = record.reject_reason || 'Pengajuan tidak dilanjutkan.';
     } else if (record.status === 'ditolak_pemohon') {
          sentence = record.decline_reason || 'Pemohon tidak melanjutkan.';
     }
     return {
          id: record.id,
          name: record.borrower.nama || 'Tanpa nama',
          status: record.status,
          statusLabel: status.label,
          tone,
          headline,
          sentence,
          amount: record.amount ?? record.offer?.amount ?? record.borrower.plafon_diajukan,
          outstanding: record.status === 'aktif' ? record.outstanding : null,
          monthly: record.terms?.monthly_installment ?? null,
          restructured: !!record.restructuring,
          collectibility: mon?.collectibility || null
     };
}

/** Ringkasan portofolio: mesin core/portfolio.js + kalimat awam. */
export function portfolioView(records = []) {
     const rows = records.map(portfolioRow);
     const p = buildPortfolio({ rows });
     const cards = records.map(loanCard);
     const aktif = cards.filter((c) => c.status === 'aktif');
     const lamps = { hijau: 0, kuning: 0, merah: 0 };
     for (const c of aktif) lamps[c.tone] += 1;
     const pending = cards.filter((c) => ['diajukan', 'perbaikan', 'ditawarkan', 'diterima'].includes(c.status)).length;
     const nplPct = p.npl.gross_ratio * 100;
     return {
          cards,
          lamps,
          pending,
          activeCount: aktif.length,
          exposure: p.totals.exposure,
          sentence: aktif.length
               ? `${aktif.length} pinjaman berjalan senilai ${rupiah(p.totals.exposure)}: ${lamps.hijau} sehat, ${lamps.kuning} perlu perhatian, ${lamps.merah} perlu tindakan segera.`
               : 'Belum ada pinjaman yang berjalan.',
          problemSentence: aktif.length
               ? `${fmt(nplPct, 1)}% dari sisa pinjaman sudah menunggak lebih dari 90 hari (kredit bermasalah/NPL; sehat bila di bawah 5%).`
               : null,
          watchlist: p.watchlist,
          raw: p
     };
}

export { EWS_PARAMS };
