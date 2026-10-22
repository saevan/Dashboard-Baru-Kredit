/**
 * ui/borrower-view.js — Layar PEMOHON (borrower).
 * Pemohon hanya mengisi data usaha, mengirim berkas, dan menjawab penawaran.
 * Sesuai aplikasi asal, pemohon tidak melihat skor atau peringkat.
 */

import {
     SECTOR_OPTIONS,
     PROFILE_OPTIONS,
     COLLATERAL_OPTIONS,
     PURPOSE_OPTIONS
} from '../simple/form-schema.js';
import {
     FILE_ACCEPT,
     SUPPORTING_DOCUMENTS,
     DOCUMENTS,
     CONSENT_CLAUSE,
     candidateView,
     financeStatus
} from '../simple/intake.js';
import { FINANCE_FIELDS } from '../simple/form-schema.js';
import { LOAN_STATUS, PERIODICITY_OPTIONS, periodUnit, borrowerTimeline, conditionsView, monitoringView } from '../simple/loans.js';
import { rupiah } from '../simple/translate.js';
import { esc, options, amountField, pct, dateLabel, timelineHtml } from './html.js';

export const APPLY_STEPS = ['Usaha & pinjaman', 'Laporan keuangan', 'Jaminan & dokumen', 'Periksa & kirim'];

const label = (list, key) => list.find((o) => o.key === key)?.label || '—';

/* ------------------------------------------------------------ formulir -- */

function stepUsaha(d) {
     const b = d.borrower;
     return `
     <fieldset class="group"><legend>Tentang usaha</legend>
          <label class="field" for="f-nama"><span class="field-label">Nama usaha <b class="req">*</b></span>
               <input id="f-nama" type="text" data-path="nama" value="${esc(b.nama)}" placeholder="contoh: Katering Dapur Sari"></label>
          <label class="field" for="f-sektor"><span class="field-label">Bidang usaha <b class="req">*</b></span>
               <select id="f-sektor" data-path="sektor"><option value="">— pilih —</option>${options(SECTOR_OPTIONS, b.sektor)}</select></label>
          <fieldset class="field"><legend class="field-label">Kondisi usaha</legend>
               <div class="choice-grid">${PROFILE_OPTIONS.map((p) => `
                    <label class="choice"><input type="radio" name="profil" data-path="profil_company" value="${p.key}"${b.profil_company === p.key ? ' checked' : ''}><span>${esc(p.label)}</span></label>`).join('')}
               </div></fieldset>
          <label class="field" for="f-lama"><span class="field-label">Sudah berjalan berapa tahun?</span>
               <input id="f-lama" type="number" min="0" max="100" data-number="bisnis_manajemen.track_record_tahun" value="${esc(b.bisnis_manajemen?.track_record_tahun ?? '')}"></label>
     </fieldset>
     <fieldset class="group"><legend>Pinjaman yang diajukan</legend>
          ${amountField({ id: 'f-plafon', path: 'plafon_diajukan', label: 'Jumlah pinjaman', required: true, value: b.plafon_diajukan })}
          <label class="field" for="f-tenor"><span class="field-label">Lama pinjaman (bulan) <b class="req">*</b></span>
               <input id="f-tenor" type="number" min="1" max="120" data-number="tenor_bulan" value="${esc(b.tenor_bulan ?? '')}"></label>
          <fieldset class="field"><legend class="field-label">Cicil setiap</legend>
               <span class="field-hint">Pilih yang paling cocok dengan pola uang masuk usaha Anda</span>
               <div class="choice-grid three">${PERIODICITY_OPTIONS.map((p) => `
                    <label class="choice"><input type="radio" name="periode" data-path="periode_angsuran" value="${p.key}"${(b.periode_angsuran || 'bulanan') === p.key ? ' checked' : ''}><span>${esc(p.label)}</span></label>`).join('')}
               </div></fieldset>
          <label class="field" for="f-jenis"><span class="field-label">Untuk apa pinjamannya?</span>
               <select id="f-jenis" data-path="jenis_kredit"><option value="">— pilih —</option>${options(PURPOSE_OPTIONS, b.jenis_kredit)}</select></label>
          <label class="field" for="f-tujuan"><span class="field-label">Ceritakan singkat rencana penggunaannya</span>
               <input id="f-tujuan" type="text" maxlength="300" data-path="tujuan_kredit" value="${esc(b.tujuan_kredit || '')}"></label>
     </fieldset>`;
}

function stepLaporan(d, ui) {
     const b = d.borrower;
     const doc = (d.documents || []).find((x) => x.key === 'laporan_keuangan');
     const ext = doc?.extraction;
     const fin = financeStatus(b.keuangan || {});
     const imported = b.financial_import;
     const candidates = ext?.candidates || [];
     const chosen = imported && doc && imported.sha256 === doc.sha256 ? imported.candidate_index : null;
     const view = chosen !== null && candidates[chosen] ? candidateView(candidates[chosen]) : null;
     const canOcr = doc && !candidates.length && /\.(pdf|png|jpe?g)$/i.test(doc.filename) && ui.ocrReady;
     return `
     <p class="note">Kirim laporan keuangan 1 tahun terakhir apa adanya: PDF, Excel, CSV, atau foto. Sistem membaca angkanya; Anda tidak perlu mengetik ulang.</p>
     <div class="upload">
          <label class="btn primary file-btn" for="fin-file">${doc ? 'Ganti berkas laporan' : 'Pilih berkas laporan'}<input id="fin-file" type="file" accept="${esc(FILE_ACCEPT)}" data-upload="laporan_keuangan" hidden></label>
          <button type="button" class="btn ghost" data-action="sample-report">Pakai contoh laporan Bu Sari</button>
          <span class="muted small">PDF, PNG, JPG, XLSX, atau CSV · maksimal 5 MB</span>
     </div>
     ${ui.reading ? `<p class="reading" role="status">${esc(ui.reading)}</p>` : ''}
     ${doc ? `<p class="small"><b>Berkas:</b> ${esc(doc.filename)} · ${doc.size < 1024 ? `${esc(doc.size)} byte` : `${esc(Math.round(doc.size / 1024))} KB`}${doc.example ? ' (contoh)' : ''}</p>` : ''}
     ${ext && !candidates.length ? `<p class="alert">${esc(ext.message)}</p>` : ''}
     ${canOcr ? '<button type="button" class="btn ghost" data-action="ocr">Baca foto / hasil scan (OCR)</button>' : ''}
     ${candidates.length > 1 ? `<div class="pick"><p class="small">Berkas berisi ${candidates.length} periode. Pilih yang dipakai:</p>
          ${candidates.map((c, i) => `<button type="button" class="btn ${i === chosen ? 'primary' : 'ghost'}" data-action="pick-candidate" data-index="${i}">${esc(c.label)}</button>`).join(' ')}</div>` : ''}
     ${view ? `<h3 class="sub">Angka yang terbaca dari laporan (${esc(view.label)})</h3>
          ${view.warnings.length ? `<p class="alert">${esc(view.warnings.join(' '))}</p>` : ''}
          <div class="table-wrap"><table class="wide"><tbody>${view.rows.map((r) => `<tr><td>${esc(r.label)}</td><td class="num">${esc(rupiah(r.value))}</td></tr>`).join('')}</tbody></table></div>` : ''}
     <p class="${fin.complete ? 'ok-text' : ''}">${fin.complete ? '✓ Semua 9 angka utama sudah ada.' : `${fin.filled} dari ${fin.total} angka utama sudah ada.${fin.missing.length ? ` Belum ada: ${esc(fin.missing.join(', '))}.` : ''}`}</p>
     ${fin.integrity !== 'insufficient' ? `<p class="small ${fin.integrity === 'ok' ? 'muted' : 'warn-text'}">${esc(fin.integritySentence)}</p>` : ''}
     <details class="manual"><summary>${fin.complete ? 'Koreksi angka bila ada yang salah' : 'Isi sendiri angka yang belum terbaca'}</summary>
          <p class="small muted">Isi dari laporan keuangan. Angka yang tidak diketahui biarkan kosong, jangan ditebak.</p>
          <div class="field-grid">${FINANCE_FIELDS.map((f) => amountField({ id: `k-${f.key}`, path: `keuangan.${f.key}`, label: f.label, hint: f.hint, required: f.required, value: b.keuangan?.[f.key] })).join('')}</div>
     </details>`;
}

function stepJaminan(d) {
     const ag = d.borrower.agunan || {};
     const docs = d.documents || [];
     const missing = DOCUMENTS.filter((m) => m.mandatory && !docs.some((x) => x.key === m.key));
     return `
     <fieldset class="group"><legend>Jaminan</legend>
          <label class="field" for="f-agunan"><span class="field-label">Jenis jaminan</span>
               <select id="f-agunan" data-collateral><option value=""${!ag.jenis ? ' selected' : ''}>Tanpa jaminan</option>${options(COLLATERAL_OPTIONS, ag.jenis)}</select></label>
          ${ag.jenis ? amountField({ id: 'f-nilai-agunan', path: 'agunan.nilai_agunan', label: 'Perkiraan nilai jaminan', hint: 'Harga pasar saat ini; bank akan menilai ulang', required: true, value: ag.nilai_agunan }) : '<p class="muted small">Tanpa jaminan, bank menilai dari kemampuan bayar saja dan jumlah yang bisa disetujui biasanya lebih kecil.</p>'}
          <label class="check"><input type="checkbox" data-bool="agunan.personal_guarantee"${ag.personal_guarantee ? ' checked' : ''}><span>Saya bersedia menjadi penjamin pribadi</span></label>
     </fieldset>
     <fieldset class="group"><legend>Dokumen pendukung</legend>
          <p class="small muted">Lampirkan foto atau PDF. Dokumen bertanda wajib diperiksa bank sebelum keputusan.</p>
          <ul class="doc-list">${SUPPORTING_DOCUMENTS.map((m) => {
               const doc = docs.find((x) => x.key === m.key);
               return `<li><div><b>${esc(m.label)}</b>${m.mandatory ? ' <span class="tag">wajib</span>' : ''}
                    ${doc ? `<p class="small ok-text">✓ ${esc(doc.filename)}</p>` : '<p class="small muted">Belum dilampirkan</p>'}</div>
                    <label class="btn ghost file-btn" for="doc-${m.key}">${doc ? 'Ganti' : 'Lampirkan'}<input id="doc-${m.key}" type="file" accept="${esc(FILE_ACCEPT)}" data-upload="${m.key}" hidden></label></li>`;
          }).join('')}</ul>
          ${missing.length ? `<p class="warn-text small">${missing.length} dokumen wajib belum ada: ${esc(missing.map((m) => m.label).join(', '))}. Anda tetap bisa mengirim, tetapi bank akan meminta dokumen ini.</p>` : ''}
     </fieldset>`;
}

function stepKirim(d) {
     const b = d.borrower;
     const fin = financeStatus(b.keuangan || {});
     const rows = [
          ['Nama usaha', b.nama],
          ['Bidang usaha', label(SECTOR_OPTIONS, b.sektor)],
          ['Jumlah pinjaman', rupiah(b.plafon_diajukan)],
          ['Lama pinjaman', `${b.tenor_bulan} bulan`],
          ['Cicil setiap', periodUnit(b.periode_angsuran || 'bulanan')],
          ['Laporan keuangan', `${fin.filled}/${fin.total} angka utama${b.financial_import ? ` · dari ${b.financial_import.filename}` : ''}`],
          ['Jaminan', b.agunan?.jenis ? `${label(COLLATERAL_OPTIONS, b.agunan.jenis)} · ${rupiah(b.agunan.nilai_agunan)}` : 'Tanpa jaminan'],
          ['Dokumen dilampirkan', `${(d.documents || []).length} berkas`]
     ];
     return `
     <dl class="summary">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
     <p class="note">Bunga akhir dan besar cicilan ditentukan bank dalam penawaran. Anda bisa menerima atau menolak penawaran itu.</p>
     <label class="check consent"><input type="checkbox" data-consent${d.consent ? ' checked' : ''}><span>${esc(CONSENT_CLAUSE)}</span></label>`;
}

const STEP_RENDER = [stepUsaha, stepLaporan, stepJaminan, stepKirim];

export function renderApplyForm(d, { errors = [], ui = {} } = {}) {
     const s = d.step || 0;
     const last = s === APPLY_STEPS.length - 1;
     return `
     <section class="panel">
          <div class="panel-head">
               <div><h1>${d.editingId ? 'Perbaiki pengajuan' : 'Ajukan pinjaman'}</h1><p class="muted">Langkah ${s + 1} dari ${APPLY_STEPS.length}: <b>${APPLY_STEPS[s]}</b></p></div>
               ${d.editingId ? '' : '<button type="button" class="btn ghost" data-action="demo-apply">Isi contoh Bu Sari</button>'}
          </div>
          ${d.editingId && d.fixNote ? `<div class="callout"><p><b>Catatan dari bank:</b> ${esc(d.fixNote)}</p></div>` : ''}
          <ol class="progress" aria-label="Kemajuan formulir">${APPLY_STEPS.map((name, i) => `
               <li class="${i < s ? 'done' : i === s ? 'now' : ''}"><button type="button" data-goto="${i}"${i > s ? ' disabled' : ''}><span class="dot">${i + 1}</span><span class="progress-name">${name}</span></button></li>`).join('')}
          </ol>
          <form class="form" data-apply-form novalidate>
               ${STEP_RENDER[s](d, ui)}
               ${errors.length ? `<div class="alert" role="alert">${errors.map((e) => `<p>${esc(e)}</p>`).join('')}</div>` : ''}
               <div class="form-actions">
                    ${s > 0 ? '<button type="button" class="btn ghost" data-action="back">Kembali</button>' : '<span></span>'}
                    <button type="submit" class="btn primary">${last ? (d.editingId ? 'Kirim perbaikan' : 'Kirim pengajuan') : 'Lanjut'}</button>
               </div>
          </form>
     </section>`;
}

/* ---------------------------------------------------- pengajuan saya ---- */

export function renderMyApplications(loans) {
     const mine = [...loans].sort((a, b) => String(b.submitted_at || b.created_at).localeCompare(String(a.submitted_at || a.created_at)));
     return `
     <section class="panel">
          <div class="panel-head">
               <div><h1>Pengajuan saya</h1><p class="muted">Pantau proses pengajuan dan jawab penawaran dari bank.</p></div>
               <button type="button" class="btn primary" data-action="new-apply">Ajukan pinjaman baru</button>
          </div>
          ${mine.length ? `<ul class="loan-list">${mine.map((l) => {
               const st = LOAN_STATUS[l.status];
               const needsMe = ['perbaikan', 'ditawarkan'].includes(l.status);
               return `<li><button type="button" class="loan tone-${needsMe ? 'kuning' : st.tone}" data-open="${esc(l.id)}">
                    <span class="lamp" aria-hidden="true"></span>
                    <span class="loan-main"><span class="loan-name">${esc(l.borrower.nama)}</span>
                         <span class="loan-sentence">${esc(st.borrower)}${needsMe ? ' — perlu tindakan Anda' : ''}</span></span>
                    <span class="loan-side"><span class="loan-status">${esc(rupiah(l.offer?.amount ?? l.borrower.plafon_diajukan))}</span><span class="muted">dikirim ${esc(dateLabel(l.submitted_at || l.created_at))}</span></span>
               </button></li>`;
          }).join('')}</ul>` : '<p class="muted empty">Belum ada pengajuan. Mulai dari "Ajukan pinjaman baru".</p>'}
     </section>`;
}

export function renderMyApplication(record) {
     const st = LOAN_STATUS[record.status];
     return `
     <section class="panel">
          <div class="panel-head">
               <div><p class="muted"><button type="button" class="link" data-action="my-list">← Pengajuan saya</button></p>
                    <h1>${esc(record.borrower.nama)}</h1><p class="muted">${esc(st.borrower)}</p></div>
          </div>
          ${timelineHtml(borrowerTimeline(record.status))}
          ${borrowerBody(record)}
          <details class="history"><summary>Riwayat</summary><ul class="plain-list">${(record.history || []).slice().reverse().map((h) => `<li><span class="muted">${esc(dateLabel(h.at))} · ${h.by === 'pemohon' ? 'Anda' : 'Bank'}:</span> ${esc(h.text)}</li>`).join('')}</ul></details>
     </section>`;
}

function offerCard(o) {
     const unit = periodUnit(o.periodicity);
     return `<div class="offer">
          <h2>Penawaran dari bank</h2>
          <dl class="summary">
               <div><dt>Jumlah pinjaman</dt><dd><b>${esc(rupiah(o.amount))}</b></dd></div>
               <div><dt>Lama pinjaman</dt><dd>${esc(o.tenor)} bulan</dd></div>
               <div><dt>Bunga</dt><dd>${esc(pct(o.rate, 2))} per tahun</dd></div>
               <div><dt>Cicilan</dt><dd><b>${esc(rupiah(o.per_period))} setiap ${esc(unit)}</b>${o.periods ? ` · ${esc(o.periods.toLocaleString('id-ID'))} kali` : ''}</dd></div>
               ${unit === 'bulan' ? '' : `<div><dt>Setara per bulan</dt><dd>${esc(rupiah(o.monthly))}</dd></div>`}
               <div><dt>Total yang dibayar</dt><dd>${esc(rupiah(o.total))}</dd></div>
          </dl>
     </div>`;
}

function borrowerBody(record) {
     switch (record.status) {
          case 'diajukan':
               return '<p class="reason">Bank sedang memeriksa data dan dokumen Anda. Anda akan mendapat penawaran atau permintaan perbaikan di halaman ini.</p>';
          case 'perbaikan':
               return `<div class="callout"><p><b>Yang perlu diperbaiki:</b> ${esc(record.fix_note)}</p></div>
                    <button type="button" class="btn primary" data-action="fix-edit" data-id="${esc(record.id)}">Perbaiki pengajuan</button>`;
          case 'ditawarkan':
               return `${offerCard(record.offer)}
                    <div class="form-actions"><button type="button" class="btn ghost danger" data-action="decline-offer" data-id="${esc(record.id)}">Tolak penawaran</button>
                    <button type="button" class="btn primary" data-action="accept-offer" data-id="${esc(record.id)}">Terima penawaran</button></div>`;
          case 'diterima': {
               const c = conditionsView(record);
               return `${offerCard(record.offer)}<p class="reason">Penawaran sudah Anda terima. Bank sedang menyiapkan pencairan (${c.done} dari ${c.total} syarat selesai).</p>
                    <ul class="plain-list">${c.items.map((i) => `<li>${i.done ? '✓' : '○'} ${esc(i.label)}</li>`).join('')}</ul>`;
          }
          case 'aktif': {
               const mon = monitoringView(record.monitoring?.at(-1));
               const t = record.terms || {};
               const unit = periodUnit(t.periodicity);
               return `<div class="kpis">
                    <div class="kpi"><p class="kpi-label">Sisa pinjaman</p><p class="kpi-value">${esc(rupiah(record.outstanding))}</p><p class="kpi-sub">dari ${esc(rupiah(record.amount))}</p></div>
                    <div class="kpi"><p class="kpi-label">Cicilan per ${esc(unit)}</p><p class="kpi-value">${esc(rupiah(t.per_period ?? t.monthly_installment))}</p><p class="kpi-sub">bunga ${esc(pct(t.rate, 2))}/tahun</p></div>
                    <div class="kpi"><p class="kpi-label">Sisa lama pinjaman</p><p class="kpi-value">${esc(t.remaining_months ?? '—')} bln</p><p class="kpi-sub">cair ${esc(dateLabel(record.disbursed_at))}</p></div>
               </div>
               <p class="reason">Status pembayaran: <b>${esc(mon ? mon.collectibility : 'Lancar')}</b>.</p>
               ${record.restructuring ? `<p class="note">Cicilan Anda sudah diringankan (${esc(record.restructuring.label)}).</p>` : ''}`;
          }
          case 'ditolak':
               return `<p class="reason">Pengajuan belum dapat disetujui.${record.reject_reason ? ` Alasan: ${esc(record.reject_reason)}` : ''}</p>`;
          case 'ditolak_pemohon':
               return '<p class="reason">Anda menolak penawaran. Anda bisa mengajukan lagi kapan saja.</p>';
          default:
               return '';
     }
}

