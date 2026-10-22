/**
 * ui/loans-view.js — Layar "Daftar pinjaman" (portofolio + peringatan dini)
 * dan detail satu pinjaman (keputusan, pencairan, pemantauan, keringanan).
 * Hanya menyusun HTML dari simple/loans.js.
 */

import {
     LOAN_STATUS,
     analyzeLoan,
     conditionsView,
     monitoringView,
     restructuringView,
     portfolioView,
     EWS_PARAMS
} from '../simple/loans.js';
import { toPlain, rupiah } from '../simple/translate.js';

export const esc = (v) =>
     String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const pct = (v, d = 1) => (Number.isFinite(v) ? `${(v * 100).toLocaleString('id-ID', { maximumFractionDigits: d })}%` : '—');
const fullRp = (v) => (Number.isFinite(v) ? `Rp ${Math.round(v).toLocaleString('id-ID')}` : '—');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const periodLabel = (p) => (/^\d{4}-\d{2}$/.test(p) ? `${MONTHS[Number(p.slice(5)) - 1]} ${p.slice(0, 4)}` : p);
const dateLabel = (iso) => (iso ? new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

const TONE_ORDER = { merah: 0, kuning: 1, hijau: 2 };
const STATUS_ORDER = { aktif: 0, disetujui: 1, diajukan: 2, ditolak: 3, lunas: 4 };

/* ---------------------------------------------------------- daftar ------ */

export function renderLoanList(records, { lengkap }) {
     const view = portfolioView(records);
     const cards = [...view.cards].sort((a, b) =>
          (STATUS_ORDER[a.status] - STATUS_ORDER[b.status]) || (TONE_ORDER[a.tone] - TONE_ORDER[b.tone]));
     const hasDarto = records.some((r) => r.demo === 'darto');
     return `
     <section class="panel">
          <div class="panel-head">
               <div><h1>Daftar pinjaman</h1><p class="muted">${esc(view.sentence)}</p></div>
               <div class="head-actions">
                    ${hasDarto ? '' : '<button type="button" class="btn ghost" data-action="demo-darto">Muat contoh Pak Darto</button>'}
                    <button type="button" class="btn primary" data-action="new">Ajukan pinjaman baru</button>
               </div>
          </div>
          <div class="tiles">
               <div class="tile"><p class="kpi-label">Pinjaman berjalan</p><p class="kpi-value">${view.activeCount}</p><p class="kpi-sub">sisa ${esc(rupiah(view.exposure))}</p></div>
               <div class="tile tone-hijau"><p class="kpi-label">Sehat</p><p class="kpi-value">${view.lamps.hijau}</p></div>
               <div class="tile tone-kuning"><p class="kpi-label">Perlu perhatian</p><p class="kpi-value">${view.lamps.kuning}</p></div>
               <div class="tile tone-merah"><p class="kpi-label">Perlu tindakan segera</p><p class="kpi-value">${view.lamps.merah}</p></div>
               <div class="tile"><p class="kpi-label">Menunggu keputusan / pencairan</p><p class="kpi-value">${view.pending}</p></div>
          </div>
          ${view.problemSentence ? `<p class="sentence">${esc(view.problemSentence)}</p>` : ''}
          ${cards.length ? `<ul class="loan-list">${cards.map(loanItem).join('')}</ul>` : '<p class="muted empty">Belum ada pinjaman. Simpan hasil analisis dari formulir, atau muat contoh Pak Darto.</p>'}
          ${lengkap && view.activeCount ? renderPortfolioDetail(view.raw) : ''}
          <div class="backup">
               <p class="muted small">Data tersimpan di browser ini saja. Simpan cadangan secara berkala.</p>
               <button type="button" class="btn ghost" data-action="export"${records.length ? '' : ' disabled'}>Unduh cadangan</button>
               <label class="btn ghost file-btn">Pulihkan dari cadangan<input type="file" accept="application/json,.json" data-import hidden></label>
          </div>
     </section>`;
}

function loanItem(c) {
     return `<li><button type="button" class="loan tone-${c.tone}" data-open="${esc(c.id)}">
          <span class="lamp" aria-hidden="true"></span>
          <span class="loan-main">
               <span class="loan-name">${esc(c.name)}${c.restructured ? ' <span class="tag">Keringanan</span>' : ''}</span>
               <span class="loan-sentence">${esc(c.sentence)}</span>
          </span>
          <span class="loan-side">
               <span class="loan-status">${esc(c.headline)}</span>
               <span class="muted">${c.outstanding !== null ? `sisa ${esc(rupiah(c.outstanding))}` : esc(rupiah(c.amount))}</span>
          </span>
     </button></li>`;
}

function renderPortfolioDetail(p) {
     return `<div class="detail">
          <h2>Rincian portofolio untuk analis</h2>
          <div class="detail-grid">
               <div class="card"><h3>NPL & cadangan</h3><table>
                    <tr><td>NPL gross</td><td>${pct(p.npl.gross_ratio, 2)}</td></tr>
                    <tr><td>NPL net</td><td>${pct(p.npl.net_ratio, 2)}</td></tr>
                    <tr><td>PPKA (POJK 40)</td><td>${fullRp(p.provision.total)}</td></tr>
                    <tr><td>CKPN (PSAK 71)</td><td>${fullRp(p.provision.ckpn_total)}</td></tr>
                    <tr><td>Kekurangan cadangan</td><td>${p.provision.shortfall === null ? '—' : fullRp(p.provision.shortfall)}</td></tr>
               </table></div>
               <div class="card"><h3>Kerugian & modal</h3><table>
                    <tr><td>Expected loss</td><td>${fullRp(p.loss.el_total)}</td></tr>
                    <tr><td>Unexpected loss</td><td>${fullRp(p.loss.ul_total)}</td></tr>
                    <tr><td>ATMR</td><td>${fullRp(p.rwa?.rwa ?? p.rwa?.total_rwa)}</td></tr>
                    <tr><td>Konsentrasi sektor (HHI)</td><td>${p.concentration.hhi.toLocaleString('id-ID')} (${esc(p.concentration.status)})</td></tr>
               </table></div>
          </div>
          <div class="card"><h3>Kolektibilitas & tahap CKPN per fasilitas</h3><table class="wide">
               <thead><tr><th>Nasabah</th><th>Sisa</th><th>Kolektibilitas</th><th>EWS</th><th>Tahap CKPN</th><th>CKPN</th></tr></thead>
               <tbody>${p.facilities.filter((f) => f.status === 'aktif').map((f) => `<tr><td>${esc(f.nama)}</td><td>${fullRp(f.outstanding)}</td><td>${esc(f.collectibility_label)}</td><td>${esc(f.ews_level)}</td><td>${esc(f.ecl_stage)}${f.sicr_triggers?.length ? ` <span class="muted">(${esc(f.sicr_triggers.join('; '))})</span>` : ''}</td><td>${fullRp(f.ecl_amount)}</td></tr>`).join('')}</tbody>
          </table></div>
     </div>`;
}

/* ---------------------------------------------------------- detail ------ */

export function renderLoanDetail(record, { lengkap, ui = {} }) {
     const status = LOAN_STATUS[record.status];
     const body = {
          diajukan: renderDecision,
          disetujui: renderConditions,
          aktif: renderActive,
          ditolak: renderClosed,
          lunas: renderClosed
     }[record.status](record, { lengkap, ui });
     return `
     <section class="panel">
          <div class="panel-head">
               <div><p class="muted"><button type="button" class="link" data-action="list">← Daftar pinjaman</button></p>
                    <h1>${esc(record.borrower.nama)}</h1>
                    <p class="muted">${esc(status.label)} · diajukan ${esc(rupiah(record.borrower.plafon_diajukan))}${record.amount ? ` · disetujui ${esc(rupiah(record.amount))}` : ''}</p></div>
               <div class="head-actions">
                    <button type="button" class="btn ghost" data-action="open-result" data-id="${esc(record.id)}">Kartu hasil analisis</button>
                    <button type="button" class="btn ghost danger" data-action="delete-loan" data-id="${esc(record.id)}">Hapus</button>
               </div>
          </div>
          ${body}
     </section>`;
}

function renderDecision(record) {
     const v = toPlain(analyzeLoan(record));
     const suggested = v.amount.suggested > 0 ? Math.min(v.amount.suggested, v.amount.requested) : v.amount.requested;
     return `
     <div class="status tone-${v.status.tone}">
          <div class="status-main"><span class="lamp" aria-hidden="true"></span>
               <div><p class="status-label">${esc(v.status.label)}</p><p class="status-tone">${esc(v.grade ? `${v.grade.grade} — ${v.grade.label}` : '')}</p></div></div>
     </div>
     <p class="reason">${esc(v.reason)}</p>
     <p class="sentence">${esc(v.amount.sentence)}</p>
     <h2>Keputusan petugas</h2>
     <form class="decide" data-decide="${esc(record.id)}">
          <label class="field"><span class="field-label">Jumlah yang disetujui</span>
               <span class="money"><span class="money-prefix">Rp</span><input type="text" inputmode="numeric" name="amount" value="${esc(Math.round(suggested).toLocaleString('id-ID'))}"></span>
               <span class="field-hint">Bawaan: jumlah aman dari sistem. Keputusan akhir tetap di tangan petugas.</span></label>
          <div class="form-actions">
               <button type="button" class="btn ghost danger" data-action="reject" data-id="${esc(record.id)}">Tolak</button>
               <button type="submit" class="btn primary">Setujui</button>
          </div>
     </form>`;
}

function renderConditions(record) {
     const c = conditionsView(record);
     return `
     <p class="reason">Dana dicairkan setelah semua syarat wajib terpenuhi (${c.done} dari ${c.total} selesai).</p>
     <ul class="fixes">${c.items.map((i) => `<li><label class="check"><input type="checkbox" data-condition="${esc(i.code)}" data-id="${esc(record.id)}"${i.done ? ' checked' : ''}>
          <span><b>${esc(i.label)}</b>${i.mandatory ? '' : ' <span class="muted">(opsional)</span>'}<br><span class="muted small">${esc(i.description)}</span></span></label></li>`).join('')}</ul>
     ${c.firstDrawLimit ? `<p class="note">Pencairan pertama dibatasi <b>${esc(rupiah(c.firstDrawLimit))}</b> sesuai nilai tagihan & stok (borrowing base); sisanya ditarik bertahap.</p>` : ''}
     ${c.blocker ? `<p class="alert">${esc(c.blocker)}</p>` : ''}
     <div class="form-actions"><span></span>
          <button type="button" class="btn primary" data-action="disburse" data-id="${esc(record.id)}"${c.canDisburse ? '' : ' disabled'}>Cairkan dana</button>
     </div>`;
}

function renderClosed(record) {
     return `<p class="reason">${esc(record.status === 'ditolak' ? `Pengajuan ditolak${record.reject_reason ? `: ${record.reject_reason}` : '.'}` : 'Pinjaman sudah lunas.')}</p>`;
}

function renderActive(record, { lengkap, ui }) {
     const last = monitoringView(record.monitoring?.at(-1));
     const tone = last ? last.tone : 'hijau';
     const timeline = [...(record.monitoring || [])].reverse();
     const showRelief = ui.relief || (last && ['WARNING', 'CRITICAL'].includes(last.level));
     return `
     <div class="status tone-${tone}">
          <div class="status-main"><span class="lamp" aria-hidden="true"></span>
               <div><p class="status-label">${esc(last ? last.label : 'Belum dipantau')}</p>
               <p class="status-tone">${esc(last ? `Kolektibilitas: ${last.collectibility}` : 'Catat pemantauan pertama')}</p></div></div>
     </div>
     ${last ? `<p class="reason">${esc(last.sentence)}</p><div class="suggest"><p><b>Yang perlu dilakukan:</b> ${esc(last.action)}</p></div>` : ''}
     ${record.drawn !== undefined && record.drawn < record.amount ? `<div class="note"><p>Baru ditarik <b>${esc(rupiah(record.drawn))}</b> dari plafon ${esc(rupiah(record.amount))} karena batas nilai tagihan & stok (borrowing base).</p>
          <button type="button" class="btn ghost" data-action="draw-rest" data-id="${esc(record.id)}">Tarik sisa ${esc(rupiah(record.amount - record.drawn))}</button></div>` : ''}
     ${record.restructuring ? `<p class="note">Sudah diberi keringanan (${esc(record.restructuring.label)}) pada ${esc(dateLabel(record.restructuring.at))}. Status pinjaman baru bisa naik setelah 3 kali bayar tepat waktu berturut-turut.</p>` : ''}

     <div class="kpis">
          <div class="kpi"><p class="kpi-label">Sisa pinjaman</p><p class="kpi-value">${esc(rupiah(record.outstanding))}</p><p class="kpi-sub">dari ${esc(rupiah(record.amount))}</p></div>
          <div class="kpi"><p class="kpi-label">Cicilan per bulan</p><p class="kpi-value">${esc(rupiah(record.terms?.monthly_installment))}</p><p class="kpi-sub">bunga ${esc(pct(record.terms?.rate, 2))}</p></div>
          <div class="kpi"><p class="kpi-label">Sisa lama pinjaman</p><p class="kpi-value">${esc(record.terms?.remaining_months ?? '—')} bln</p><p class="kpi-sub">cair ${esc(dateLabel(record.disbursed_at))}</p></div>
     </div>

     <h2>Riwayat pemantauan</h2>
     ${timeline.length ? `<ol class="timeline">${timeline.map((m) => {
          const v = monitoringView(m);
          return `<li class="tone-${v.tone}"><span class="lamp" aria-hidden="true"></span><div>
               <p><b>${esc(periodLabel(v.period))} — ${esc(v.label)}</b> <span class="muted">· ${esc(v.collectibility)}</span></p>
               <p>${esc(v.reasons.length ? v.reasons.join(', ') : 'Tidak ada tanda masalah')}.</p>
               ${v.note ? `<p class="muted small">Catatan: ${esc(v.note)}</p>` : ''}
               ${lengkap ? `<p class="muted small">Sinyal: ${esc((m.signals || []).map((s) => `${s.code} ${s.severity}`).join(', ') || '—')} · Tindakan mesin: ${esc(m.recommended_action)}</p>` : ''}
          </div></li>`;
     }).join('')}</ol>` : '<p class="muted">Belum ada catatan pemantauan.</p>'}

     <details class="monitor"${ui.monitorOpen ? ' open' : ''}><summary>Catat pemantauan bulan ini</summary>
          ${renderMonitorForm(record, { lengkap })}
     </details>

     <h2>Keringanan cicilan</h2>
     ${showRelief ? renderRelief(record) : `<p class="muted">Belum diperlukan. <button type="button" class="link" data-action="show-relief" data-id="${esc(record.id)}">Hitung pilihan keringanan</button></p>`}`;
}

const OCF_OPTIONS = [['', '— tidak diisi —'], ['positif', 'Positif (uang masuk > keluar)'], ['negatif_1_periode', 'Negatif 1 periode'], ['negatif_2_periode', 'Negatif 2 periode berturut-turut']];
const COVENANT_OPTIONS = [['', '— tidak diisi —'], ['compliant', 'Semua janji dipatuhi'], ['minor', 'Ada pelanggaran ringan'], ['material', 'Ada pelanggaran berat']];
const SIMPLE_CODES = new Set(['P1', 'P4', 'P6', 'P10', 'P11', 'P12', 'P20']);
const SELECT_LABELS = {
     none: 'Tidak ada', indicated: 'Terindikasi', confirmed: 'Terkonfirmasi',
     normal: 'Normal', suspicious: 'Mencurigakan', sudden_large: 'Penarikan besar mendadak'
};

function renderMonitorForm(record, { lengkap }) {
     const now = new Date();
     const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
     const opt = (list) => list.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('');
     const extra = EWS_PARAMS.filter((p) => !SIMPLE_CODES.has(p.code) || p.code === 'P1');
     return `<form class="form" data-monitor="${esc(record.id)}">
          <div class="field-grid">
               <label class="field"><span class="field-label">Bulan</span><input type="month" name="period" value="${period}" required></label>
               <label class="field"><span class="field-label">Telat bayar (hari)</span><input type="number" min="0" name="days_late" value="0"></label>
               <label class="field"><span class="field-label">Omzet dibanding tahun lalu (%)</span><span class="field-hint">Contoh: -15 bila turun 15%</span><input type="number" name="omzet_change_pct"></label>
               <label class="field"><span class="field-label">Uang bersih usaha setahun saat ini</span><span class="field-hint">Dipakai menghitung kemampuan bayar & keringanan</span>
                    <span class="money"><span class="money-prefix">Rp</span><input type="text" inputmode="numeric" name="cash_flow_annual"></span></label>
               <label class="field"><span class="field-label">Arus kas usaha</span><select name="ocf">${opt(OCF_OPTIONS)}</select></label>
               <label class="field"><span class="field-label">Saldo kas dibanding bulan lalu (%)</span><input type="number" name="cash_change_pct"></label>
               <label class="field"><span class="field-label">Lama nasabah membalas (hari)</span><input type="number" min="0" name="response_days"></label>
               <label class="field"><span class="field-label">Janji dalam perjanjian (covenant)</span><select name="covenant">${opt(COVENANT_OPTIONS)}</select></label>
               <label class="field"><span class="field-label">Sisa pinjaman</span><span class="money"><span class="money-prefix">Rp</span><input type="text" inputmode="numeric" name="outstanding" value="${esc(Math.round(record.outstanding || 0).toLocaleString('id-ID'))}"></span></label>
               <label class="field"><span class="field-label">Sisa lama pinjaman (bulan)</span><input type="number" min="1" name="remaining_months" value="${esc(record.terms?.remaining_months ?? '')}"></label>
          </div>
          <label class="field"><span class="field-label">Catatan kunjungan</span><input type="text" name="note" maxlength="500"></label>
          <details${lengkap ? ' open' : ''}><summary>Parameter lain (lengkap, 20 parameter EWS)</summary>
               <div class="field-grid">${extra.map((p) => p.type === 'select'
                    ? `<label class="field"><span class="field-label">${esc(p.code)} · ${esc(p.label)}</span><select name="x_${esc(p.key)}"><option value="">—</option>${p.options.map((o) => `<option value="${esc(o)}">${esc(SELECT_LABELS[o] || o)}</option>`).join('')}</select></label>`
                    : `<label class="field"><span class="field-label">${esc(p.code)} · ${esc(p.label)}</span><span class="field-hint">Waspada ${esc(p.warning)} · bahaya ${esc(p.critical)}</span><input type="number" step="${p.step}" name="x_${esc(p.key)}"></label>`).join('')}
               </div>
          </details>
          <div class="form-actions"><span></span><button type="submit" class="btn primary">Simpan pemantauan</button></div>
     </form>`;
}

function renderRelief(record) {
     const v = restructuringView(record);
     if (!v) return '';
     if (!v.available) return `<p class="muted">${esc(v.sentence)}</p>`;
     return `<p>${esc(v.sentence)} Pilihan yang dihitung sistem:</p>
     <ul class="options">${v.options.map((o) => `<li class="${o.enough ? 'ok' : o.feasible ? '' : 'fail'}">
          <div><p><b>${esc(o.name)}</b>${o.recommended ? ' <span class="tag">Disarankan</span>' : ''}</p><p>${esc(o.sentence)}</p></div>
          ${o.feasible ? `<button type="button" class="btn ghost" data-action="restructure" data-id="${esc(record.id)}" data-type="${esc(o.type)}">Pakai pilihan ini</button>` : ''}
     </li>`).join('')}</ul>
     ${v.needsCommittee ? `<p class="alert">${esc(v.committeeNote)}</p>` : ''}
     <p class="muted small">Bunga tidak diturunkan di bawah titik impas risiko. Keringanan mengikuti POJK 40 (rescheduling/reconditioning) dan perlu persetujuan pejabat berwenang.</p>`;
}
