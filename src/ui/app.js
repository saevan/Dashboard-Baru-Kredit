/**
 * ui/app.js — Dashboard Kredit Sederhana (MEZS.id).
 * Formulir 5 langkah → kartu hasil (+ simulasi) → daftar pinjaman →
 * pencairan → pemantauan → keringanan. Semua angka dari mesin src/core
 * (lewat src/simple); layar ini hanya menyusun tampilan dan menyimpan status.
 */

import { analyze, analyzeWithSuggestion, emptyBorrower } from '../simple/analyze.js';
import { toPlain, plainMetrics, rupiah, TONE_WORD, PILLAR_PLAIN } from '../simple/translate.js';
import {
     SECTOR_OPTIONS,
     PROFILE_OPTIONS,
     COLLATERAL_OPTIONS,
     SCHEME_OPTIONS,
     FINANCE_FIELDS,
     INTERVIEW_QUESTIONS,
     INTERVIEW_SCALE,
     applyInterview,
     PURPOSE_OPTIONS,
     scoreToInterview,
     parseAmount,
     validateStep
} from '../simple/form-schema.js';
import { demoBuSari, demoPakDarto } from '../simple/demo.js';
import {
     createLoan,
     approveLoan,
     rejectLoan,
     toggleCondition,
     disburseLoan,
     addMonitoring,
     applyRestructuring,
     drawRemaining,
     effectiveBorrower
} from '../simple/loans.js';
import { renderLoanList, renderLoanDetail } from './loans-view.js';
import { borrowingBase } from '../core/disbursement.js';

/** Formulir kosong: lama usaha & cadangan kas tidak diisi diam-diam (mesin menilai netral). */
function blankBorrower() {
     const b = emptyBorrower();
     b.bisnis_manajemen.track_record_tahun = null;
     b.bisnis_manajemen.cash_runway_bulan = null;
     return b;
}

const STEPS = ['Data usaha', 'Pinjaman', 'Laporan keuangan', 'Jaminan', 'Penilaian petugas'];
const STORE_KEY = 'mezs-sederhana';
const LOANS_KEY = 'mezs-sederhana-pinjaman';

/* ------------------------------------------------------------ state ----- */

const state = {
     view: 'form',
     step: 0,
     mode: 'sederhana',
     borrower: blankBorrower(),
     interview: {},
     errors: [],
     analysis: null,
     detailOpen: false,
     loans: [],
     loanId: null,
     resultLoanId: null,
     ui: {},
     sim: { amount: 0, tenor: 36, rate: 0.14 },
     confirm: null,
     backupText: null,
     analyzedBorrower: null
};

function load() {
     try {
          const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
          const loans = JSON.parse(localStorage.getItem(LOANS_KEY) || '[]');
          if (Array.isArray(loans)) state.loans = loans;
          if (saved && saved.borrower) {
               state.borrower = saved.borrower;
               state.interview = saved.interview || {};
               state.mode = saved.mode === 'lengkap' ? 'lengkap' : 'sederhana';
          }
     } catch {
          /* penyimpanan tidak tersedia — mulai dari formulir kosong */
     }
}

function save() {
     try {
          localStorage.setItem(STORE_KEY, JSON.stringify({ borrower: state.borrower, interview: state.interview, mode: state.mode }));
          localStorage.setItem(LOANS_KEY, JSON.stringify(state.loans));
     } catch {
          /* abaikan */
     }
}

/* ---------------------------------------------------------- helpers ----- */

const esc = (v) =>
     String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const fmtInput = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString('id-ID') : '');
const pct = (v, d = 1) => (Number.isFinite(v) ? `${(v * 100).toLocaleString('id-ID', { maximumFractionDigits: d })}%` : '—');
const num = (v, d = 2) => (Number.isFinite(v) ? v.toLocaleString('id-ID', { maximumFractionDigits: d }) : '—');
const fullRp = (v) => (Number.isFinite(v) ? `Rp ${Math.round(v).toLocaleString('id-ID')}` : '—');

function getPath(obj, path) {
     return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function setPath(obj, path, value) {
     const keys = path.split('.');
     const last = keys.pop();
     const target = keys.reduce((o, k) => (o[k] ??= {}), obj);
     target[last] = value;
}

const options = (list, selected) =>
     list.map((o) => `<option value="${esc(o.key)}"${o.key === selected ? ' selected' : ''}>${esc(o.label)}</option>`).join('');

function amountField(path, label, hint = '', required = false) {
     const value = getPath(state.borrower, path);
     return `<label class="field">
          <span class="field-label">${esc(label)}${required ? ' <b class="req" aria-label="wajib">*</b>' : ''}</span>
          ${hint ? `<span class="field-hint">${esc(hint)}</span>` : ''}
          <span class="money"><span class="money-prefix">Rp</span><input type="text" inputmode="numeric" data-amount="${esc(path)}" value="${esc(fmtInput(value))}" placeholder="contoh: 400.000.000"></span>
          <span class="field-echo" data-echo="${esc(path)}">${Number.isFinite(value) && value !== 0 ? `= ${esc(rupiah(value))}` : ''}</span>
     </label>`;
}

/* ------------------------------------------------------------- form ----- */

function stepDataUsaha() {
     const b = state.borrower;
     return `
     <label class="field"><span class="field-label">Nama usaha <b class="req">*</b></span>
          <input type="text" data-path="nama" value="${esc(b.nama)}" placeholder="contoh: Katering Dapur Sari"></label>
     <label class="field"><span class="field-label">Bidang usaha <b class="req">*</b></span>
          <select data-path="sektor"><option value="">— pilih —</option>${options(SECTOR_OPTIONS, b.sektor)}</select></label>
     <fieldset class="field"><legend class="field-label">Kondisi usaha</legend>
          <div class="choice-grid">${PROFILE_OPTIONS.map((p) => `
               <label class="choice"><input type="radio" name="profil" data-path="profil_company" value="${p.key}"${b.profil_company === p.key ? ' checked' : ''}><span>${esc(p.label)}</span></label>`).join('')}
          </div></fieldset>
     <label class="field"><span class="field-label">Sudah berjalan berapa tahun?</span>
          <span class="field-hint">Opsional — bila kosong, dinilai netral</span>
          <input type="number" min="0" max="100" data-number="bisnis_manajemen.track_record_tahun" value="${esc(b.bisnis_manajemen?.track_record_tahun ?? '')}"></label>`;
}

function stepPinjaman() {
     const b = state.borrower;
     return `
     ${amountField('plafon_diajukan', 'Jumlah pinjaman yang diajukan', '', true)}
     <label class="field"><span class="field-label">Untuk apa pinjamannya?</span>
          <select data-path="jenis_kredit"><option value="">— pilih —</option>${options(PURPOSE_OPTIONS, b.jenis_kredit)}</select></label>
     <label class="field"><span class="field-label">Lama pinjaman (bulan) <b class="req">*</b></span>
          <input type="number" min="1" max="120" data-number="tenor_bulan" value="${esc(b.tenor_bulan ?? '')}"></label>
     <label class="field"><span class="field-label">Cara mencicil</span>
          <select data-path="skema_angsuran">${options(SCHEME_OPTIONS, b.skema_angsuran)}</select></label>
     <label class="field"><span class="field-label">Perkiraan bunga per tahun (%)</span>
          <span class="field-hint">Bunga akhir dihitung ulang oleh sistem sesuai risiko</span>
          <input type="number" min="0" max="60" step="0.1" data-percent="bunga_tahunan" value="${esc(Number.isFinite(b.bunga_tahunan) ? Math.round(b.bunga_tahunan * 1000) / 10 : '')}"></label>`;
}

function stepKeuangan() {
     const b = state.borrower;
     return `
     <p class="note">Isi dari laporan keuangan 1 tahun terakhir. Tanda <b class="req">*</b> wajib diisi. Angka yang tidak diketahui biarkan kosong, jangan ditebak.</p>
     <div class="field-grid">${FINANCE_FIELDS.map((f) => amountField(`keuangan.${f.key}`, f.label, f.hint, f.required)).join('')}</div>
     <div class="field-grid">
          <label class="field"><span class="field-label">Kas cukup untuk berapa bulan?</span>
               <span class="field-hint">Opsional — cadangan kas bila usaha berhenti</span>
               <input type="number" min="0" max="120" data-number="bisnis_manajemen.cash_runway_bulan" value="${esc(b.bisnis_manajemen?.cash_runway_bulan ?? '')}"></label>
          <label class="field"><span class="field-label">Tunggakan pinjaman saat ini (hari)</span>
               <span class="field-hint">Isi 0 bila tidak ada</span>
               <input type="number" min="0" max="3650" data-number="keuangan.arrears_days" value="${esc(b.keuangan?.arrears_days ?? 0)}"></label>
     </div>`;
}

function stepJaminan() {
     const ag = state.borrower.agunan || {};
     const none = !ag.jenis;
     return `
     <label class="field"><span class="field-label">Jenis jaminan</span>
          <select data-collateral><option value=""${none ? ' selected' : ''}>Tanpa jaminan</option>${options(COLLATERAL_OPTIONS, ag.jenis)}</select></label>
     ${none ? '<p class="note">Tanpa jaminan, sistem belum bisa menghitung jumlah pinjaman yang aman.</p>' : amountField('agunan.nilai_agunan', 'Perkiraan nilai jaminan', 'Harga pasar saat ini', true)}
     <label class="check"><input type="checkbox" data-bool="agunan.personal_guarantee"${ag.personal_guarantee ? ' checked' : ''}>
          <span>Pemilik bersedia menjadi penjamin pribadi</span></label>`;
}

function stepWawancara() {
     return `
     <p class="note">Diisi petugas setelah wawancara. Pertanyaan yang belum dinilai memakai nilai bawaan sistem (setara "Cukup" ke "Baik").</p>
     ${INTERVIEW_QUESTIONS.map((q) => {
          const current = state.interview[q.key] ?? null;
          return `<fieldset class="field"><legend class="field-label">${esc(q.label)}</legend>
               <div class="scale">
                    <label class="scale-opt"><input type="radio" name="iv-${q.key}" data-interview="${q.key}" value=""${current === null ? ' checked' : ''}><span>Belum dinilai</span></label>
                    ${INTERVIEW_SCALE.map((s) => `<label class="scale-opt"><input type="radio" name="iv-${q.key}" data-interview="${q.key}" value="${s.value}"${current === s.value ? ' checked' : ''}><span>${esc(s.label)}</span></label>`).join('')}
               </div></fieldset>`;
     }).join('')}`;
}

const STEP_RENDER = [stepDataUsaha, stepPinjaman, stepKeuangan, stepJaminan, stepWawancara];

function renderForm() {
     const s = state.step;
     const last = s === STEPS.length - 1;
     return `
     <section class="panel">
          <div class="panel-head">
               <div><h1>Ajukan pinjaman</h1><p class="muted">Langkah ${s + 1} dari ${STEPS.length}: <b>${STEPS[s]}</b></p></div>
               <button type="button" class="btn ghost" data-action="demo">Isi contoh Bu Sari</button>
          </div>
          <ol class="progress" aria-label="Kemajuan formulir">${STEPS.map((name, i) => `
               <li class="${i < s ? 'done' : i === s ? 'now' : ''}"><button type="button" data-goto="${i}"${i > s ? ' disabled' : ''}><span class="dot">${i + 1}</span><span class="progress-name">${name}</span></button></li>`).join('')}
          </ol>
          <form class="form" data-form novalidate>
               ${STEP_RENDER[s]()}
               ${state.errors.length ? `<div class="alert" role="alert">${state.errors.map((e) => `<p>${esc(e)}</p>`).join('')}</div>` : ''}
               <div class="form-actions">
                    ${s > 0 ? '<button type="button" class="btn ghost" data-action="back">Kembali</button>' : '<span></span>'}
                    <button type="submit" class="btn primary">${last ? 'Lihat hasil' : 'Lanjut'}</button>
               </div>
          </form>
     </section>`;
}

/* ----------------------------------------------------------- hasil ------ */

function stars(n) {
     return `<span class="stars" aria-label="${n} dari 5 bintang">${'★'.repeat(n)}<span class="stars-off">${'★'.repeat(5 - n)}</span></span>`;
}

function renderResult() {
     const { result, atSuggested } = state.analysis;
     const v = toPlain(result, atSuggested);
     const lengkap = state.mode === 'lengkap';
     const open = lengkap || state.detailOpen;
     const inst = v.installment;
     const sug = v.amount;
     const showSuggestion = sug.suggested > 0 && sug.suggested < sug.requested && sug.suggestedInstallment;

     return `
     <section class="panel result">
          <div class="panel-head">
               <div><p class="muted">Hasil analisis</p><h1>${esc(v.name)}</h1></div>
               <div class="head-actions">
                    ${state.resultLoanId
                         ? `<button type="button" class="btn ghost" data-open="${esc(state.resultLoanId)}">← Kembali ke pinjaman</button>`
                         : `<button type="button" class="btn ghost" data-action="edit">Ubah data</button>
                    <button type="button" class="btn primary" data-action="save-loan">Simpan ke daftar pinjaman</button>`}
                    ${FRAMED ? '' : '<button type="button" class="btn ghost" data-action="print">Cetak</button>'}
               </div>
          </div>

          <div class="status tone-${v.status.tone}" role="status">
               <div class="status-main">
                    <span class="lamp" aria-hidden="true"></span>
                    <div><p class="status-label">${esc(v.status.label)}</p><p class="status-tone">Lampu ${v.status.tone} — ${TONE_WORD[v.status.tone]}</p></div>
               </div>
               ${v.grade ? `<div class="grade">
                    <p class="grade-line"><span class="grade-code">${esc(v.grade.grade)}</span> — <b>${esc(v.grade.label)}</b></p>
                    <p class="grade-meaning">${esc(v.grade.meaning)}</p>
               </div>` : ''}
          </div>
          <p class="reason">${esc(v.reason)}</p>

          <div class="kpis">
               <div class="kpi"><p class="kpi-label">Jumlah yang aman dipinjam</p><p class="kpi-value">${esc(sug.suggested > 0 ? rupiah(sug.suggested) : '—')}</p><p class="kpi-sub">Diajukan ${esc(rupiah(sug.requested))}</p></div>
               <div class="kpi"><p class="kpi-label">Cicilan per bulan</p><p class="kpi-value">${esc(rupiah(inst.monthly))}</p><p class="kpi-sub">${esc(inst.tenor)} bulan, untuk ${esc(rupiah(sug.requested))}</p></div>
               ${inst.daily ? `<div class="kpi"><p class="kpi-label">Sisihkan per hari kerja</p><p class="kpi-value">${esc(rupiah(inst.daily))}</p><p class="kpi-sub">agar cicilan selalu siap</p></div>` : ''}
          </div>
          <p class="sentence">${esc(sug.sentence)}</p>
          ${showSuggestion ? `<div class="suggest">
               <p><b>Saran:</b> pinjam <b>${esc(rupiah(sug.suggested))}</b> selama ${esc(sug.suggestedInstallment.tenor)} bulan. Cicilan sekitar <b>${esc(rupiah(sug.suggestedInstallment.monthly))} per bulan</b>${sug.suggestedInstallment.daily ? `, atau sisihkan <b>${esc(rupiah(sug.suggestedInstallment.daily))} per hari</b>` : ''}.</p>
               ${sug.suggestedStatus ? `<p>Pada jumlah ini hasilnya: <span class="pill tone-${sug.suggestedStatus.tone}">${esc(sug.suggestedStatus.label)}</span></p>` : ''}
          </div>` : ''}

          ${renderSimulator()}

          <h2>Nilai per bagian</h2>
          <ul class="pillars">${v.pillars.map((p) => `
               <li><span class="pillar-name">${esc(p.name)}${lengkap ? ` <span class="tech">${esc(num(p.score, 1))}</span>` : ''}</span>${stars(p.stars)}<span class="pillar-word">${esc(p.word)}</span></li>`).join('')}
          </ul>

          ${v.stress ? `<h2>Perlu diingat</h2>
          <div class="callout">
               ${v.stress.caution ? `<p><b>${esc(v.stress.caution)}</b></p>` : ''}
               <p>${esc(v.stress.summary)}</p>
               <details><summary>Lihat kondisi yang diuji</summary>
                    <ul class="stress">${v.stress.items.map((s) => `<li class="${s.survives ? 'ok' : 'fail'}"><span>${s.survives ? '✓ Tahan' : '✕ Belum tahan'}</span> jika ${esc(s.text)}</li>`).join('')}</ul>
               </details>
          </div>` : ''}

          <h2>Apa yang perlu diperbaiki</h2>
          ${v.fixes.length ? `<ul class="fixes">${v.fixes.map((f) => `<li><label class="check"><input type="checkbox"><span>${esc(f.text)}</span></label></li>`).join('')}</ul>` : '<p class="muted">Tidak ada yang perlu diperbaiki dari data yang diisi.</p>'}

          ${v.grade ? `<p class="disclaimer">${esc(v.grade.disclaimer)} ${esc(v.footnote)}</p>` : `<p class="disclaimer">${esc(v.footnote)}</p>`}

          ${lengkap ? '' : `<button type="button" class="btn ghost wide" data-action="detail" aria-expanded="${open}">${open ? 'Sembunyikan detail' : 'Lihat detail perhitungan'}</button>`}
          ${open ? renderDetail(result) : ''}
     </section>`;
}

/* ---------------------------------------------- simulasi "bagaimana jika" */

function renderSimulator() {
     const sim = state.sim;
     return `<h2>Coba: bagaimana jika?</h2>
     <div class="sim">
          <p class="muted">Ubah jumlah, lama, atau bunga — hasilnya dihitung ulang oleh mesin yang sama.</p>
          <div class="field-grid">
               <label class="field"><span class="field-label">Jumlah pinjaman</span>
                    <span class="money"><span class="money-prefix">Rp</span><input type="text" inputmode="numeric" data-sim="amount" value="${esc(fmtInput(sim.amount))}"></span></label>
               <label class="field"><span class="field-label">Lama pinjaman: <output data-sim-tenor>${esc(sim.tenor)} bulan</output></span>
                    <input type="range" min="6" max="120" step="6" data-sim="tenor" value="${esc(sim.tenor)}"></label>
               <label class="field"><span class="field-label">Bunga per tahun (%)</span>
                    <input type="number" min="0" max="60" step="0.5" data-sim="rate" value="${esc(Math.round(sim.rate * 1000) / 10)}"></label>
          </div>
          <div class="sim-out" data-sim-out aria-live="polite">${simOutput()}</div>
     </div>`;
}

function simOutput() {
     const { amount, tenor, rate } = state.sim;
     if (!(amount > 0) || !(tenor > 0)) return '<p class="muted">Isi jumlah dan lama pinjaman.</p>';
     const result = analyze({ ...state.analyzedBorrower, plafon_diajukan: amount, tenor_bulan: tenor, bunga_tahunan: rate });
     const v = toPlain(result);
     const dscr = result.ratios?.dscr;
     return `<p><span class="pill tone-${v.status.tone}">${esc(v.status.label)}</span> ${v.grade ? `<b>${esc(v.grade.grade)}</b> — ${esc(v.grade.label)}` : ''}</p>
          <p>Cicilan <b>${esc(rupiah(v.installment.monthly))}/bulan</b>${Number.isFinite(dscr) ? ` · uang usaha ${esc(num(dscr, 2))} kali cicilan` : ''}${v.installment.daily ? ` · sisihkan ${esc(rupiah(v.installment.daily))}/hari` : ''}.</p>
          <p class="muted">${esc(v.reason)}</p>`;
}

/* -------------------------------------------- detail (tampilan lengkap) - */

function row(cells) {
     return `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
}

function renderDetail(r) {
     const credit = r.credit || {};
     const pricing = r.risk?.pricing || {};
     const bu = pricing.build_up || {};
     const bb = borrowingBase(state.borrower.keuangan || {});
     const metrics = plainMetrics(r);
     const ratioRows = [
          ['DSCR', num(r.ratios.dscr), 'Uang usaha ÷ cicilan setahun'],
          ['Rasio cicilan', pct(r.ratios.ds_ratio), 'Cicilan ÷ uang usaha'],
          ['ICR', num(r.ratios.icr), 'Laba usaha ÷ bunga'],
          ['DTI', pct(r.ratios.dti), 'Cicilan ÷ omzet'],
          ['Current ratio', num(r.ratios.current_ratio), 'Harta lancar ÷ utang jangka pendek'],
          ['Quick ratio', num(r.ratios.quick_ratio), 'Tanpa stok'],
          ['DER', num(r.ratios.der), 'Utang ÷ modal sendiri'],
          ['ROA / ROE / NPM', `${pct(r.ratios.roa)} · ${pct(r.ratios.roe)} · ${pct(r.ratios.npm)}`, 'Untung dibanding harta, modal, omzet'],
          ['LTV', pct(r.extra?.ltv), 'Pinjaman ÷ nilai jaminan'],
          ['Altman Z', num(r.ratios.altman_z), 'Risiko bangkrut (> 2,99 aman)']
     ];
     return `
     <div class="detail">
          <h2>Rincian untuk analis</h2>
          <div class="detail-grid">
               <div class="card"><h3>Skor & peringkat</h3><table>
                    ${row(['Skor akhir', `<b>${num(r.finalScore, 1)}</b> / 100`])}
                    ${row(['Peringkat', `${esc(r.risk?.pefindo?.grade)} (${esc(r.risk?.pefindo?.category_label || '')})`])}
                    ${row(['Keputusan mesin', esc(r.decision?.decision)])}
                    ${row(['Keyakinan keputusan', num(r.decision?.confidence)])}
                    ${row(['Segmen', esc(r.segment?.label)])}
               </table></div>
               <div class="card"><h3>Risiko kredit</h3><table>
                    ${row(['PD 12 bulan', pct(credit.pd?.pd_12m, 2)])}
                    ${row(['PD seumur fasilitas', pct(credit.pd?.pd_lifetime, 2)])}
                    ${row(['LGD', pct(credit.lgd?.lgd)])}
                    ${row(['EAD', fullRp(credit.ead?.ead)])}
                    ${row(['Expected loss / tahun', fullRp(credit.loss?.el_amount)])}
                    ${row(['Unexpected loss', fullRp(credit.loss?.ul_amount)])}
               </table></div>
               <div class="card"><h3>Bunga berbasis risiko</h3><table>
                    ${row(['Biaya dana', pct(bu.funding_cost, 2)])}
                    ${row(['Expected loss', pct(bu.expected_loss, 2)])}
                    ${row(['Biaya operasional', pct(bu.opex, 2)])}
                    ${row(['Biaya modal', pct(bu.capital_charge, 2)])}
                    ${row(['Margin', pct(bu.target_margin, 2)])}
                    ${row(['Premi tenor', pct(bu.tenor_spread, 2)])}
                    ${row(['<b>Bunga disarankan</b>', `<b>${pct(pricing.recommended_rate, 2)}</b>`])}
                    ${row(['Titik impas', pct(pricing.breakeven_rate, 2)])}
                    ${row(['RAROC', `${num(pricing.raroc)}x ${pricing.meets_hurdle ? '✓' : '✕'} (hurdle ${pct(pricing.raroc_hurdle, 0)})`])}
               </table></div>
               <div class="card"><h3>Modal regulasi & pencairan</h3><table>
                    ${row(['Kelas eksposur', esc(credit.rwa?.exposure_class_label)])}
                    ${row(['ATMR', fullRp(credit.rwa?.rwa)])}
                    ${row(['Modal + buffer', fullRp(credit.rwa?.capital_with_buffer)])}
                    ${row(['Batas tarik awal (borrowing base)', bb ? fullRp(bb.availability) : 'Perlu data tagihan & stok'])}
               </table></div>
          </div>

          <div class="card"><h3>Rasio keuangan</h3><table class="wide">
               <thead><tr><th>Rasio</th><th>Nilai</th><th>Artinya</th></tr></thead>
               <tbody>${ratioRows.map(([a, b, c]) => row([esc(a), esc(b), `<span class="muted">${esc(c)}</span>`])).join('')}</tbody>
          </table>
          <ul class="plain-list">${metrics.map((m) => `<li><b>${esc(m.term)}:</b> ${esc(m.text)}</li>`).join('')}</ul></div>

          <div class="card"><h3>Skor per pilar & bobot</h3><table class="wide">
               <thead><tr><th>Pilar</th><th>Skor</th><th>Bobot</th><th>Kontribusi</th></tr></thead>
               <tbody>${(r.pillars || []).map((p) => row([`${esc(PILLAR_PLAIN[p.key] || p.label)} <span class="muted">${esc(p.label)}</span>`, num(p.score, 1), pct(p.weight, 0), num(p.score * p.weight, 1)])).join('')}</tbody>
          </table></div>

          <div class="card"><h3>Aturan kebijakan</h3>
               <ul class="rules">${(r.decision?.rules_evaluated || []).map((x) => `<li class="${x.violated ? 'fail' : 'ok'}">${esc(x.message)} <span class="muted">(${x.enforcement === 'hard' ? 'wajib' : 'lunak'})</span></li>`).join('')}</ul>
               ${r.decision?.stress_capped ? '<p class="muted">Keputusan dibatasi REVIEW karena hasil uji kondisi sulit "sangat rentan".</p>' : ''}
          </div>

          <div class="card"><h3>Uji kondisi sulit (DSCR)</h3><table class="wide">
               <thead><tr><th>Skenario</th><th>DSCR</th><th>Hasil</th></tr></thead>
               <tbody>${row(['Dasar', num(r.stress?.base?.dscr), ''])}${(r.stress?.scenarios || []).map((s) => row([esc(s.label), num(s.dscr), s.survives ? '✓ tahan' : '✕'])).join('')}</tbody>
          </table><p class="muted">${esc(r.stress?.recommendation || '')}</p></div>

          <div class="card"><h3>Syarat (covenant) yang disarankan</h3>
               <ul class="plain-list">${(r.covenant?.covenants || []).map((c) => `<li><b>${esc(c.label)}:</b> ${esc(c.description)}</li>`).join('')}</ul>
          </div>
          <p class="muted small">Mesin v${esc(r.meta?.engine_version)} · konfigurasi ${esc(r.meta?.config_version)} (${esc(r.meta?.config_hash)})</p>
     </div>`;
}

/* ------------------------------------------------------------ render ---- */

const root = () => document.getElementById('app');

/** Di dalam frame (mis. Artifact claude.ai) dialog, cetak, dan unduhan diblokir host. */
const FRAMED = (() => {
     try {
          return window.self !== window.top;
     } catch {
          return true;
     }
})();
const findLoan = (id) => state.loans.find((l) => l.id === id) || null;

function render() {
     document.documentElement.dataset.mode = state.mode;
     document.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode)));
     const section = state.view === 'pinjaman' || state.view === 'pinjaman-detail' ? 'pinjaman' : 'ajukan';
     document.querySelectorAll('[data-nav]').forEach((b) => {
          if (b.dataset.nav === section) b.setAttribute('aria-current', 'page');
          else b.removeAttribute('aria-current');
     });
     const lengkap = state.mode === 'lengkap';
     let html;
     try {
          if (state.view === 'hasil' && state.analysis) html = renderResult();
          else if (state.view === 'pinjaman') html = renderLoanList(state.loans, { lengkap });
          else if (state.view === 'pinjaman-detail' && findLoan(state.loanId)) html = renderLoanDetail(findLoan(state.loanId), { lengkap, ui: state.ui });
          else html = renderForm();
     } catch (err) {
          html = `<section class="panel"><p class="alert" role="alert">Terjadi kesalahan saat menampilkan halaman: ${esc(err.message)}</p></section>`;
     }
     root().innerHTML = (state.notice ? `<div class="toast" role="status">${esc(state.notice)}</div>` : '') + renderConfirm() + renderBackupText() + html;
     state.notice = '';
}

/** Konfirmasi di halaman (pengganti confirm/prompt yang diblokir di dalam frame). */
const CONFIRM_TEXT = {
     'delete-loan': { message: 'Hapus pinjaman ini dari daftar? Tindakan ini tidak bisa dibatalkan.', yes: 'Ya, hapus' },
     reject: { message: 'Tolak pengajuan ini? Tulis alasannya; pemohon akan membacanya.', yes: 'Tolak pengajuan', reason: true },
     'draw-rest': { message: 'Sertifikat borrowing base terbaru sudah diperiksa dan cukup untuk menarik sisa plafon?', yes: 'Ya, tarik sisa plafon' },
     restructure: { message: 'Terapkan keringanan ini? Cicilan dan lama pinjaman akan diperbarui.', yes: 'Ya, terapkan' }
};

function renderConfirm() {
     const c = state.confirm;
     if (!c) return '';
     const t = CONFIRM_TEXT[c.action];
     return `<div class="confirm" role="alertdialog" aria-labelledby="confirm-msg">
          <p id="confirm-msg"><b>${esc(t.message)}</b></p>
          ${t.reason ? '<label class="field"><span class="field-label">Alasan</span><input type="text" id="confirm-reason" maxlength="300"></label>' : ''}
          <div class="confirm-actions">
               <button type="button" class="btn ghost" data-action="confirm-no">Batal</button>
               <button type="button" class="btn primary" data-action="confirm-yes">${esc(t.yes)}</button>
          </div>
     </div>`;
}

function renderBackupText() {
     if (state.backupText === null) return '';
     return `<div class="confirm"><p><b>Salin teks cadangan ini</b> dan simpan sebagai berkas <code>.json</code>. Untuk memulihkan, pilih berkas itu lewat "Pulihkan dari cadangan".</p>
          <textarea class="backup-text" id="backup-text" readonly>${esc(state.backupText)}</textarea>
          <div class="confirm-actions"><button type="button" class="btn ghost" data-action="backup-close">Tutup</button></div></div>`;
}

function runConfirmed() {
     const c = state.confirm;
     state.confirm = null;
     if (!c) return;
     if (c.action === 'delete-loan') {
          state.loans = state.loans.filter((l) => l.id !== c.id);
          save();
          state.view = 'pinjaman';
          state.notice = 'Pinjaman dihapus.';
     } else if (c.action === 'reject') {
          updateLoan(c.id, (l) => rejectLoan(l, { reason: c.reason || '' }));
     } else if (c.action === 'draw-rest') {
          updateLoan(c.id, (l) => drawRemaining(l));
     } else if (c.action === 'restructure') {
          updateLoan(c.id, (l) => applyRestructuring(l, c.type));
          if (findLoan(c.id)?.restructuring) state.notice = 'Keringanan cicilan diterapkan.';
     }
}

/* ------------------------------------------------------------ actions --- */

function showAnalysis(borrower, loanId = null) {
     state.analyzedBorrower = borrower;
     state.analysis = analyzeWithSuggestion(borrower);
     state.sim = { amount: borrower.plafon_diajukan, tenor: borrower.tenor_bulan, rate: borrower.bunga_tahunan ?? 0.14 };
     state.resultLoanId = loanId;
     state.view = 'hasil';
     state.detailOpen = false;
     window.scrollTo({ top: 0 });
}

function runAnalysis() {
     showAnalysis(applyInterview(state.borrower, state.interview, emptyBorrower().bisnis_manajemen));
}

function loadDemo() {
     const b = demoBuSari();
     state.borrower = b;
     state.interview = {};
     for (const q of INTERVIEW_QUESTIONS) state.interview[q.key] = scoreToInterview(b.bisnis_manajemen[q.fields[0]]);
     state.errors = [];
     save();
}

function openLoan(id) {
     state.loanId = id;
     state.ui = {};
     state.view = 'pinjaman-detail';
     window.scrollTo({ top: 0 });
}

function updateLoan(id, fn) {
     const i = state.loans.findIndex((l) => l.id === id);
     if (i < 0) return;
     try {
          state.loans[i] = fn(state.loans[i]);
          save();
     } catch (err) {
          state.notice = err.message;
     }
}

function onInput(e) {
     const t = e.target;
     if (t.dataset.sim) return onSimInput(t);
     if (t.closest('[data-monitor], [data-decide]')) return;
     const b = state.borrower;
     if (t.dataset.amount) {
          const n = parseAmount(t.value);
          setPath(b, t.dataset.amount, n);
          const echo = root().querySelector(`[data-echo="${CSS.escape(t.dataset.amount)}"]`);
          if (echo) echo.textContent = Number.isFinite(n) && n !== 0 ? `= ${rupiah(n)}` : t.value.trim() ? 'Angka belum terbaca' : '';
     } else if (t.dataset.number) {
          setPath(b, t.dataset.number, t.value === '' ? null : Number(t.value));
     } else if (t.dataset.percent) {
          setPath(b, t.dataset.percent, t.value === '' ? null : Number(t.value) / 100);
     } else if (t.dataset.path && t.type !== 'radio') {
          setPath(b, t.dataset.path, t.value);
     } else {
          return;
     }
     save();
}

let simTimer = null;
function onSimInput(t) {
     const key = t.dataset.sim;
     if (key === 'amount') state.sim.amount = parseAmount(t.value);
     if (key === 'tenor') {
          state.sim.tenor = Number(t.value);
          const out = root().querySelector('[data-sim-tenor]');
          if (out) out.textContent = `${t.value} bulan`;
     }
     if (key === 'rate') state.sim.rate = t.value === '' ? 0 : Number(t.value) / 100;
     clearTimeout(simTimer);
     simTimer = setTimeout(() => {
          const out = root().querySelector('[data-sim-out]');
          if (out) out.innerHTML = simOutput();
     }, 120);
}

function onChange(e) {
     const t = e.target;
     if (t.matches('[data-import]')) {
          importBackup(t.files?.[0]);
          return undefined;
     }
     if (t.dataset.condition) {
          updateLoan(t.dataset.id, (l) => toggleCondition(l, t.dataset.condition, t.checked));
          return render();
     }
     if (t.dataset.sim || t.closest('[data-monitor], [data-decide]')) return;
     const b = state.borrower;
     if (t.dataset.path && t.type === 'radio') setPath(b, t.dataset.path, t.value);
     else if (t.dataset.bool) setPath(b, t.dataset.bool, t.checked);
     else if (t.dataset.interview) state.interview[t.dataset.interview] = t.value === '' ? null : Number(t.value);
     else if (t.hasAttribute('data-collateral')) {
          b.agunan = { ...(b.agunan || {}), jenis: t.value || null };
          if (!t.value) b.agunan.nilai_agunan = 0;
          save();
          render();
          return;
     } else return;
     save();
}

function onClick(e) {
     const el = e.target.closest('button');
     if (!el) return;
     if (el.dataset.mode) {
          state.mode = el.dataset.mode;
          save();
          return render();
     }
     if (el.dataset.nav || el.dataset.open) state.confirm = null;
     if (el.dataset.nav) {
          state.view = el.dataset.nav === 'pinjaman' ? 'pinjaman' : 'form';
          return render();
     }
     if (el.dataset.open) {
          openLoan(el.dataset.open);
          return render();
     }
     if (el.dataset.goto !== undefined) {
          state.step = Number(el.dataset.goto);
          state.errors = [];
          return render();
     }
     const id = el.dataset.id;
     switch (el.dataset.action) {
          case 'demo':
               loadDemo();
               state.step = STEPS.length - 1;
               return render();
          case 'back':
               state.step = Math.max(0, state.step - 1);
               state.errors = [];
               return render();
          case 'edit':
               state.view = 'form';
               state.step = 0;
               return render();
          case 'detail':
               state.detailOpen = !state.detailOpen;
               return render();
          case 'print':
               return window.print();
          case 'new':
               state.borrower = blankBorrower();
               state.interview = {};
               state.view = 'form';
               state.step = 0;
               state.errors = [];
               save();
               return render();
          case 'save-loan': {
               const loan = createLoan({ borrower: state.borrower, interview: state.interview });
               state.loans.push(loan);
               save();
               state.notice = 'Pengajuan disimpan ke daftar pinjaman.';
               openLoan(loan.id);
               return render();
          }
          case 'list':
               state.view = 'pinjaman';
               return render();
          case 'demo-darto': {
               const loan = { ...demoPakDarto(), demo: 'darto' };
               state.loans.push(loan);
               save();
               openLoan(loan.id);
               return render();
          }
          case 'open-result': {
               const loan = findLoan(id);
               if (loan) showAnalysis(effectiveBorrower(loan), loan.id);
               return render();
          }
          case 'delete-loan':
          case 'reject':
          case 'draw-rest':
          case 'restructure':
               state.confirm = { action: el.dataset.action, id, type: el.dataset.type || null };
               render();
               window.scrollTo({ top: 0 });
               root().querySelector('#confirm-reason, [data-action=confirm-yes]')?.focus();
               return undefined;
          case 'confirm-yes':
               if (state.confirm) state.confirm.reason = root().querySelector('#confirm-reason')?.value || '';
               runConfirmed();
               return render();
          case 'confirm-no':
               state.confirm = null;
               return render();
          case 'backup-close':
               state.backupText = null;
               return render();
          case 'disburse':
               updateLoan(id, (l) => disburseLoan(l));
               if (findLoan(id)?.status === 'aktif') state.notice = 'Dana dicairkan. Pinjaman kini dipantau setiap bulan.';
               return render();
          case 'export': {
               const text = JSON.stringify({ app: 'mezs-sederhana', version: 1, exported_at: new Date().toISOString(), loans: state.loans }, null, 2);
               if (FRAMED) {
                    // Unduhan diblokir di dalam frame: salin ke papan klip, atau tampilkan teks untuk disalin manual.
                    state.backupText = text;
                    navigator.clipboard?.writeText(text).then(() => {
                         state.notice = 'Cadangan disalin. Tempel ke berkas teks dan simpan sebagai .json.';
                         state.backupText = null;
                         render();
                    }).catch(() => {
                         render();
                         root().querySelector('#backup-text')?.select();
                    });
                    if (!navigator.clipboard) render();
                    return undefined;
               }
               const blob = new Blob([text], { type: 'application/json' });
               const link = document.createElement('a');
               link.href = URL.createObjectURL(blob);
               link.download = `cadangan-pinjaman-${new Date().toISOString().slice(0, 10)}.json`;
               link.click();
               setTimeout(() => URL.revokeObjectURL(link.href), 1000);
               return undefined;
          }
          case 'show-relief':
               state.ui = { ...state.ui, relief: true };
               return render();
          default:
     }
     return undefined;
}

/** Pulihkan cadangan: digabung per id (yang dari file menimpa yang sama). */
async function importBackup(file) {
     if (!file) return;
     try {
          const data = JSON.parse(await file.text());
          const loans = Array.isArray(data?.loans) ? data.loans : null;
          if (!loans || !loans.every((l) => l && typeof l.id === 'string' && l.borrower && l.status)) throw new Error('Berkas bukan cadangan daftar pinjaman.');
          const byId = new Map(state.loans.map((l) => [l.id, l]));
          for (const l of loans) byId.set(l.id, l);
          state.loans = [...byId.values()];
          save();
          state.notice = `${loans.length} pinjaman dipulihkan dari cadangan.`;
     } catch (err) {
          state.notice = `Gagal memulihkan: ${err.message}`;
     }
     state.view = 'pinjaman';
     render();
}

function formValues(form) {
     return Object.fromEntries(new FormData(form).entries());
}

function onSubmit(e) {
     const form = e.target;
     if (form.matches('[data-decide]')) {
          e.preventDefault();
          const amount = parseAmount(formValues(form).amount);
          updateLoan(form.dataset.decide, (l) => approveLoan(l, { amount }));
          return render();
     }
     if (form.matches('[data-monitor]')) {
          e.preventDefault();
          const v = formValues(form);
          const extra = {};
          for (const [k, val] of Object.entries(v)) {
               if (k.startsWith('x_') && val !== '') extra[k.slice(2)] = Number.isFinite(Number(val)) ? Number(val) : val;
          }
          const input = {
               period: v.period,
               note: v.note,
               days_late: v.days_late,
               omzet_change_pct: v.omzet_change_pct,
               cash_change_pct: v.cash_change_pct,
               response_days: v.response_days,
               ocf: v.ocf,
               covenant: v.covenant,
               cash_flow_annual: parseAmount(v.cash_flow_annual),
               outstanding: parseAmount(v.outstanding),
               remaining_months: v.remaining_months,
               extra
          };
          updateLoan(form.dataset.monitor, (l) => addMonitoring(l, input));
          state.ui = {};
          return render();
     }
     if (!form.matches('[data-form]')) return undefined;
     e.preventDefault();
     const errs = validateStep(state.step, state.borrower);
     state.errors = errs;
     if (errs.length) return render();
     if (state.step < STEPS.length - 1) {
          state.step += 1;
          return render();
     }
     // Langkah terakhir: periksa semua langkah sebelum menghitung.
     for (let i = 0; i < STEPS.length; i += 1) {
          const stepErrs = validateStep(i, state.borrower);
          if (stepErrs.length) {
               state.step = i;
               state.errors = stepErrs;
               return render();
          }
     }
     runAnalysis();
     return render();
}

export function start() {
     load();
     document.addEventListener('input', onInput);
     document.addEventListener('change', onChange);
     document.addEventListener('click', onClick);
     document.addEventListener('submit', onSubmit);
     render();
}
