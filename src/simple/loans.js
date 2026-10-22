/**
 * simple/loans.js — Siklus pinjaman untuk dashboard sederhana:
 * pengajuan → disetujui (menunggu pencairan) → berjalan → pemantauan → keringanan.
 *
 * Semua penilaian memakai mesin MEZS.id:
 *   - syarat pencairan & borrowing base  → core/disbursement.js
 *   - peringatan dini 20 parameter (EWS) → core/ews-monitor.js
 *   - kolektibilitas, CKPN, PPKA, NPL    → core/portfolio.js
 *   - pilihan keringanan (3R)            → core/restructuring.js
 * Modul ini hanya menyimpan status dan menerjemahkan hasilnya ke bahasa awam.
 */

import { analyze } from './analyze.js';
import { applyInterview } from './form-schema.js';
import { emptyBorrower } from '../core/engine.js';
import { buildConditionsPrecedent, conditionsStatus, disbursementBlocker } from '../core/disbursement.js';
import { evaluateMonitoring, EWS_PARAMS } from '../core/ews-monitor.js';
import { buildPortfolio } from '../core/portfolio.js';
import { proposeRestructuring, restructuringRecord } from '../core/restructuring.js';
import { INDUSTRY_BENCHMARK } from '../data/industries.js';
import { rupiah, STATUS } from './translate.js';

/* ------------------------------------------------------------ status ---- */

export const LOAN_STATUS = {
     diajukan: { label: 'Menunggu keputusan', tone: 'kuning' },
     disetujui: { label: 'Menunggu pencairan', tone: 'kuning' },
     aktif: { label: 'Berjalan', tone: 'hijau' },
     ditolak: { label: 'Ditolak', tone: 'merah' },
     lunas: { label: 'Lunas', tone: 'hijau' }
};

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

/** Borrower efektif (wawancara diterapkan) pada jumlah tertentu. */
export function effectiveBorrower(record, amount = null) {
     const b = applyInterview(record.borrower, record.interview || {}, emptyBorrower().bisnis_manajemen);
     return amount ? { ...b, plafon_diajukan: amount } : b;
}

/** Analisis mesin untuk satu pinjaman (pada jumlah disetujui bila ada). */
export function analyzeLoan(record) {
     return analyze(effectiveBorrower(record, record.amount || null));
}

/* --------------------------------------------------------- siklus ------- */

export function createLoan({ borrower, interview = {}, now = new Date() }) {
     return {
          id: newId(now),
          created_at: now.toISOString(),
          borrower: structuredClone(borrower),
          interview: { ...interview },
          status: 'diajukan',
          amount: null,
          conditions: {},
          monitoring: [],
          restructuring: null,
          terms: null
     };
}

export function approveLoan(record, { amount, now = new Date() }) {
     if (!(num(amount) > 0)) throw new Error('Jumlah yang disetujui harus lebih dari 0.');
     return { ...record, status: 'disetujui', amount: Math.round(num(amount)), approved_at: now.toISOString() };
}

export function rejectLoan(record, { reason = '', now = new Date() } = {}) {
     return { ...record, status: 'ditolak', rejected_at: now.toISOString(), reject_reason: String(reason).slice(0, 300) };
}

/** Syarat pencairan (mesin) + status centang, dalam bahasa awam. */
export function conditionsView(record) {
     const result = analyzeLoan(record);
     const borrower = effectiveBorrower(record, record.amount);
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
 * Cicilan & lama pinjaman dicatat dari analisis pada jumlah disetujui.
 */
export function disburseLoan(record, { now = new Date() } = {}) {
     const view = conditionsView(record);
     if (!view.canDisburse) throw new Error(view.blocker);
     const result = analyzeLoan(record);
     const nl = result.debtService?.new_loan;
     const monthly = nl?.schedule?.find((r) => r.payment > 0)?.payment ?? nl?.monthly_avg ?? null;
     return {
          ...record,
          status: 'aktif',
          disbursed_at: now.toISOString(),
          // Modal kerja di atas borrowing base: penarikan pertama dibatasi (sisanya ditarik bertahap).
          first_draw: view.firstDrawLimit,
          drawn: view.firstDrawLimit ?? record.amount,
          outstanding: view.firstDrawLimit ?? record.amount,
          terms: {
               tenor_bulan: result.borrower.tenor_bulan,
               rate: result.borrower.bunga_tahunan,
               monthly_installment: monthly === null ? null : Math.round(monthly),
               annual_debt_service: Math.round(result.debtService?.total_annual || 0),
               remaining_months: result.borrower.tenor_bulan
          }
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
               annual_debt_service: option.annual_debt_service
          }
     };
}

/* ------------------------------------------------------- portofolio ----- */

function portfolioRow(record) {
     const facility = { pengajuan: 'pipeline', diajukan: 'pipeline', disetujui: 'pipeline', aktif: 'aktif', ditolak: 'ditolak', lunas: 'lunas' }[record.status];
     return {
          borrower: {
               ...effectiveBorrower(record, record.amount),
               id: record.id,
               facility_status: facility,
               outstanding: record.outstanding ?? record.amount,
               restructuring: record.restructuring || undefined
          },
          analysis: analyzeLoan(record),
          monitoring: record.monitoring || []
     };
}

/** Kartu ringkas satu pinjaman untuk daftar. */
export function loanCard(record) {
     const status = LOAN_STATUS[record.status] || LOAN_STATUS.diajukan;
     const mon = monitoringView(record.monitoring?.at(-1));
     const result = record.status === 'diajukan' ? analyzeLoan(record) : null;
     let tone = status.tone;
     let headline = status.label;
     let sentence = '';
     if (record.status === 'aktif') {
          tone = mon ? mon.tone : 'hijau';
          headline = mon ? mon.label : 'Belum dipantau';
          sentence = mon ? mon.sentence : 'Catat pemantauan pertama setelah cicilan bulan pertama.';
     } else if (result) {
          const s = STATUS[result.decision.decision];
          tone = s.tone;
          sentence = `Hasil analisis: ${s.label.toLowerCase()} (${result.risk.pefindo.grade}). Saran ${rupiah(result.nominal.recommended_nominal)}.`;
     } else if (record.status === 'disetujui') {
          sentence = `Disetujui ${rupiah(record.amount)}; lengkapi syarat pencairan.`;
     } else if (record.status === 'ditolak') {
          sentence = record.reject_reason || 'Pengajuan tidak dilanjutkan.';
     }
     return {
          id: record.id,
          name: record.borrower.nama || 'Tanpa nama',
          status: record.status,
          statusLabel: status.label,
          tone,
          headline,
          sentence,
          amount: record.amount ?? record.borrower.plafon_diajukan,
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
     const pending = cards.filter((c) => c.status === 'diajukan' || c.status === 'disetujui').length;
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
