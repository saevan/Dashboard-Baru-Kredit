/**
 * ui/lender-view.js — Layar PETUGAS BANK (lender): antrian pengajuan dan
 * pemeriksaan satu pengajuan (data & dokumen, wawancara, hasil analisis,
 * keputusan). Pinjaman yang sudah diterima/berjalan memakai ui/loans-view.js.
 */

import { analyzeWithSuggestion } from '../simple/analyze.js';
import {
     LOAN_STATUS,
     PERIODICITY_OPTIONS,
     periodUnit,
     effectiveBorrower,
     loanCard,
     reviewState
} from '../simple/loans.js';
import { DOCUMENTS, confidenceView, gateView, financeStatus, financeLabel } from '../simple/intake.js';
import {
     SECTOR_OPTIONS,
     PROFILE_OPTIONS,
     COLLATERAL_OPTIONS,
     PURPOSE_OPTIONS,
     INTERVIEW_QUESTIONS,
     INTERVIEW_SCALE
} from '../simple/form-schema.js';
import { toPlain, rupiah } from '../simple/translate.js';
import { renderResultCard } from './result-view.js';
import { renderConditions, renderActive, loanItem } from './loans-view.js';
import { esc, options, fmtInput, pct, dateLabel } from './html.js';

const label = (list, key) => list.find((o) => o.key === key)?.label || '—';

/* ---------------------------------------------------------- antrian ----- */

const QUEUE_GROUPS = [
     { title: 'Perlu diperiksa', statuses: ['diajukan'] },
     { title: 'Siap dicairkan', statuses: ['diterima'] },
     { title: 'Menunggu pemohon', statuses: ['perbaikan', 'ditawarkan'] },
     { title: 'Selesai tanpa pencairan', statuses: ['ditolak', 'ditolak_pemohon'] }
];

export function renderQueue(loans) {
     const cards = loans.map(loanCard);
     const hasSari = loans.some((l) => l.demo === 'sari');
     const pending = cards.filter((c) => ['diajukan', 'diterima'].includes(c.status)).length;
     return `
     <section class="panel">
          <div class="panel-head">
               <div><h1>Pengajuan masuk</h1><p class="muted">${pending ? `${pending} pengajuan menunggu tindakan Anda.` : 'Tidak ada pengajuan yang menunggu tindakan.'}</p></div>
               <div class="head-actions">${hasSari ? '' : '<button type="button" class="btn ghost" data-action="demo-sari-submitted">Muat contoh pengajuan Bu Sari</button>'}</div>
          </div>
          ${QUEUE_GROUPS.map((g) => {
               const items = cards.filter((c) => g.statuses.includes(c.status));
               if (!items.length) return '';
               return `<h2>${esc(g.title)} <span class="count">${items.length}</span></h2><ul class="loan-list">${items.map(loanItem).join('')}</ul>`;
          }).join('') || '<p class="muted empty">Belum ada pengajuan. Pengajuan dari pemohon akan muncul di sini.</p>'}
     </section>`;
}

/* ----------------------------------------------------------- detail ----- */

export function renderLenderDetail(record, { lengkap, ui = {}, sim = null }) {
     const st = LOAN_STATUS[record.status];
     let body;
     if (record.status === 'diajukan') body = renderReview(record, { lengkap, ui, sim });
     else if (record.status === 'diterima') body = renderConditions(record);
     else if (record.status === 'aktif') body = renderActive(record, { lengkap, ui });
     else body = renderClosedOrWaiting(record, { lengkap, ui });
     return `
     <section class="panel">
          <div class="panel-head">
               <div><p class="muted"><button type="button" class="link" data-action="${['aktif', 'lunas'].includes(record.status) ? 'portfolio' : 'queue'}">← ${['aktif', 'lunas'].includes(record.status) ? 'Portofolio' : 'Pengajuan masuk'}</button></p>
                    <h1>${esc(record.borrower.nama)}</h1>
                    <p class="muted">${esc(st.label)} · diajukan ${esc(rupiah(record.borrower.plafon_diajukan))} · ${esc(dateLabel(record.submitted_at || record.created_at))}${record.offer ? ` · ditawarkan ${esc(rupiah(record.offer.amount))}` : ''}</p></div>
               <div class="head-actions"><button type="button" class="btn ghost danger" data-action="delete-loan" data-id="${esc(record.id)}">Hapus</button></div>
          </div>
          ${body}
          <details class="history"><summary>Riwayat</summary><ul class="plain-list">${(record.history || []).slice().reverse().map((h) => `<li><span class="muted">${esc(dateLabel(h.at))} · ${esc(h.by)}:</span> ${esc(h.text)}</li>`).join('')}</ul></details>
     </section>`;
}

function renderClosedOrWaiting(record, { lengkap, ui }) {
     const lines = {
          perbaikan: `Menunggu pemohon memperbaiki: ${record.fix_note}`,
          ditawarkan: `Penawaran ${rupiah(record.offer?.amount)} / ${record.offer?.tenor} bulan, cicilan ${rupiah(record.offer?.per_period)} per ${periodUnit(record.offer?.periodicity)}. Menunggu jawaban pemohon.`,
          ditolak: `Pengajuan ditolak${record.reject_reason ? `: ${record.reject_reason}` : '.'}`,
          ditolak_pemohon: `Pemohon menolak penawaran${record.decline_reason ? `: ${record.decline_reason}` : '.'}`,
          lunas: 'Pinjaman sudah lunas.'
     };
     if (!record.review?.scored_at && !record.offer) return `<p class="reason">${esc(lines[record.status] || '')}</p>`;
     const { result, atSuggested } = analyzeWithSuggestion(effectiveBorrower(record));
     return `<p class="reason">${esc(lines[record.status] || '')}</p>
          <details class="result-box"${ui.resultOpen ? ' open' : ''}><summary>Lihat hasil analisis</summary>
               ${renderResultCard({ result, atSuggested, lengkap, detailOpen: ui.detailOpen, sim: null, keuangan: record.borrower.keuangan })}
          </details>`;
}

/** Langkah terkunci sampai langkah sebelumnya selesai. */
const locked = (text) => `<p class="locked">🔒 ${esc(text)}</p>`;

/**
 * Pemeriksaan pengajuan baru, bertahap seperti aplikasi asal:
 * 1 data & dokumen → 2 wawancara → 3 hasil analisis → 4 keputusan.
 * Hasil dan penawaran baru muncul setelah petugas menilai.
 */
function renderReview(record, { lengkap, ui, sim }) {
     const b = record.borrower;
     const k = b.keuangan || {};
     const fin = financeStatus(k);
     const conf = confidenceView(record);
     const r = reviewState(record);
     const docs = record.documents || [];
     const id = esc(record.id);
     const finKeys = Object.keys(k).filter((key) => Number.isFinite(k[key]) && !['beban_bunga_lain', 'arrears_days', 'ocf_negatif_periode'].includes(key));
     const pendingDocs = docs.filter((d) => !d.verified).length;
     const stepState = (done, current) => (done ? 'done' : current ? 'current' : 'todo');

     let resultHtml = locked('Hasil muncul setelah dokumen diperiksa dan wawancara lengkap.');
     let decisionHtml = '';
     let v = null;
     if (r.scored) {
          const { result, atSuggested } = analyzeWithSuggestion(effectiveBorrower(record));
          v = toPlain(result, atSuggested);
          const gate = gateView(result, conf);
          const sugAmount = v.amount.suggested > 0 ? Math.min(v.amount.suggested, v.amount.requested) : v.amount.requested;
          const rate = result.risk?.pricing?.recommended_rate ?? b.bunga_tahunan ?? 0.14;
          resultHtml = `${renderResultCard({ result, atSuggested, lengkap, detailOpen: ui.detailOpen, sim, keuangan: k })}
               <p class="pill-line"><span class="pill tone-${gate.pass ? 'hijau' : gate.autoReject ? 'merah' : 'kuning'}">${gate.pass ? 'Lolos gerbang' : 'Keputusan manual'}</span> ${esc(gate.sentence)}</p>`;
          decisionHtml = `<form class="card form" data-offer="${id}">
               <h3>Kirim penawaran</h3>
               <div class="field-grid">
                    <label class="field" for="o-amount"><span class="field-label">Jumlah</span>
                         <span class="money"><span class="money-prefix">Rp</span><input id="o-amount" name="amount" type="text" inputmode="numeric" value="${esc(fmtInput(sugAmount))}"></span>
                         <span class="field-hint">Bawaan: jumlah aman dari sistem</span></label>
                    <label class="field" for="o-tenor"><span class="field-label">Lama (bulan)</span><input id="o-tenor" name="tenor" type="number" min="1" max="120" value="${esc(b.tenor_bulan)}"></label>
                    <label class="field" for="o-rate"><span class="field-label">Bunga per tahun (%)</span><input id="o-rate" name="rate" type="number" min="0" max="60" step="0.01" value="${esc(Math.round(rate * 10000) / 100)}">
                         <span class="field-hint">Bawaan: bunga berbasis risiko ${esc(pct(rate, 2))}</span></label>
                    <label class="field" for="o-period"><span class="field-label">Cicil setiap</span><select id="o-period" name="periodicity">${options(PERIODICITY_OPTIONS, b.periode_angsuran || 'bulanan')}</select>
                         <span class="field-hint">Pilihan pemohon: ${esc(periodUnit(b.periode_angsuran))}</span></label>
               </div>
               <button type="submit" class="btn primary">Kirim penawaran ke pemohon</button>
          </form>`;
     }

     return `
     <ol class="steps review-steps">
          <li class="step-${stepState(r.verified, !r.verified)}"><span class="dot" aria-hidden="true"></span><span>Periksa data & dokumen</span></li>
          <li class="step-${stepState(r.verified && r.interviewDone && r.scored, r.verified && !r.scored)}"><span class="dot" aria-hidden="true"></span><span>Wawancara</span></li>
          <li class="step-${stepState(r.scored, false)}"><span class="dot" aria-hidden="true"></span><span>Hasil analisis</span></li>
          <li class="step-${stepState(false, r.scored)}"><span class="dot" aria-hidden="true"></span><span>Keputusan</span></li>
     </ol>

     <h2>1. Periksa data & dokumen</h2>
     <dl class="summary">
          <div><dt>Bidang usaha</dt><dd>${esc(label(SECTOR_OPTIONS, b.sektor))}</dd></div>
          <div><dt>Kondisi usaha</dt><dd>${esc(label(PROFILE_OPTIONS, b.profil_company))}${b.bisnis_manajemen?.track_record_tahun != null ? ` · ${esc(b.bisnis_manajemen.track_record_tahun)} tahun` : ''}</dd></div>
          <div><dt>Pinjaman diajukan</dt><dd>${esc(rupiah(b.plafon_diajukan))} · ${esc(b.tenor_bulan)} bulan · cicil setiap ${esc(periodUnit(b.periode_angsuran))}</dd></div>
          <div><dt>Keperluan</dt><dd>${esc(label(PURPOSE_OPTIONS, b.jenis_kredit))}${b.tujuan_kredit ? ` — ${esc(b.tujuan_kredit)}` : ''}</dd></div>
          <div><dt>Jaminan</dt><dd>${b.agunan?.jenis ? `${esc(label(COLLATERAL_OPTIONS, b.agunan.jenis))} · ${esc(rupiah(b.agunan.nilai_agunan))}` : 'Tanpa jaminan'}${b.agunan?.personal_guarantee ? ' · penjamin pribadi' : ''}</dd></div>
     </dl>

     <h3 class="sub">Angka keuangan${b.financial_import ? ` <span class="muted small">dari ${esc(b.financial_import.filename)} (${esc(b.financial_import.label)})</span>` : ' <span class="muted small">diisi manual oleh pemohon</span>'}</h3>
     <div class="table-wrap"><table class="wide"><tbody>${finKeys.map((key) => `<tr><td>${esc(financeLabel(key))}</td><td class="num">${esc(rupiah(k[key]))}</td></tr>`).join('')}</tbody></table></div>
     <p class="small ${fin.integrity === 'ok' ? 'muted' : 'warn-text'}">${esc(fin.complete ? fin.integritySentence : `Belum lengkap: ${fin.missing.join(', ')}.`)}</p>

     <h3 class="sub">Dokumen</h3>
     <p class="small muted">Cocokkan berkas dengan dokumen asli, lalu centang yang sudah benar.</p>
     <ul class="doc-list">${DOCUMENTS.map((m) => {
          const doc = docs.find((x) => x.key === m.key);
          return `<li><label class="check"><input type="checkbox" data-verify="${esc(m.key)}" data-id="${id}"${doc?.verified ? ' checked' : ''}${doc ? '' : ' disabled'}>
               <span><b>${esc(m.label)}</b>${m.mandatory ? ' <span class="tag">wajib</span>' : ''}<br><span class="small ${doc ? 'muted' : 'warn-text'}">${doc ? `${esc(doc.filename)}${doc.example ? ' (contoh)' : ''}` : 'Tidak dilampirkan'}</span></span></label></li>`;
     }).join('')}</ul>
     <p class="pill-line"><span class="pill tone-${conf.tone}">Keyakinan data: ${esc(conf.label)}</span> ${esc(conf.sentence)}</p>
     <div class="field-grid">
          <label class="field" for="l-arrears"><span class="field-label">Tunggakan di bank lain (hari)</span><span class="field-hint">Dari hasil SLIK OJK; 0 bila tidak ada</span>
               <input id="l-arrears" type="number" min="0" data-lender-number="keuangan.arrears_days" data-id="${id}" value="${esc(k.arrears_days ?? 0)}"></label>
          <label class="field" for="l-runway"><span class="field-label">Kas cukup untuk berapa bulan?</span><span class="field-hint">Dari rekening koran; kosong = dinilai netral</span>
               <input id="l-runway" type="number" min="0" data-lender-number="bisnis_manajemen.cash_runway_bulan" data-id="${id}" value="${esc(b.bisnis_manajemen?.cash_runway_bulan ?? '')}"></label>
     </div>
     ${r.verified
          ? '<p class="ok-text">✓ Pemeriksaan selesai. Mengubah centang atau angka di atas akan membuka ulang pemeriksaan.</p>'
          : `<div class="step-actions">${pendingDocs ? `<p class="warn-text small">${pendingDocs} berkas belum dicentang; keyakinan data ikut turun.</p>` : ''}
               <button type="button" class="btn primary" data-action="finish-verify" data-id="${id}">Selesai memeriksa, lanjut wawancara</button></div>`}

     <h2>2. Wawancara</h2>
     ${!r.verified ? locked('Selesaikan pemeriksaan data & dokumen dulu.') : `
     <p class="small muted">Nilai setelah berbincang dengan pemilik usaha. Semua pertanyaan wajib dijawab. (${r.answered} dari ${r.totalQuestions} dijawab)</p>
     <div class="interview">${INTERVIEW_QUESTIONS.map((q) => {
          const current = record.interview?.[q.key] ?? null;
          return `<fieldset class="field"><legend class="field-label">${esc(q.label)}${current === null ? ' <span class="warn-text small">belum dijawab</span>' : ''}</legend><div class="scale">
               ${INTERVIEW_SCALE.map((sc) => `<label class="scale-opt"><input type="radio" name="iv-${q.key}" data-lender-interview="${q.key}" data-id="${id}" value="${sc.value}"${current === sc.value ? ' checked' : ''}><span>${esc(sc.label)}</span></label>`).join('')}
          </div></fieldset>`;
     }).join('')}</div>
     ${r.scored
          ? '<p class="ok-text">✓ Hasil sudah dihitung. Mengubah jawaban akan menghitung ulang.</p>'
          : `<div class="step-actions"><button type="button" class="btn primary" data-action="score" data-id="${id}"${r.interviewDone ? '' : ' disabled'}>Hitung hasil analisis</button>
               ${r.interviewDone ? '' : `<p class="muted small">Jawab ${r.totalQuestions - r.answered} pertanyaan lagi.</p>`}</div>`}`}

     <h2>3. Hasil analisis</h2>
     ${resultHtml}

     <h2>4. Keputusan</h2>
     ${decisionHtml ? '' : locked('Penawaran bisa dikirim setelah hasil analisis dihitung. Permintaan perbaikan dan penolakan bisa kapan saja.')}
     <div class="decisions">
          ${decisionHtml}
          <form class="card form" data-fix="${id}">
               <h3>Minta perbaikan</h3>
               <label class="field" for="fix-note"><span class="field-label">Pesan untuk pemohon</span>
                    <textarea id="fix-note" name="note" rows="4" maxlength="500">${esc(defaultFixNote(record, v))}</textarea></label>
               <button type="submit" class="btn ghost">Kirim permintaan perbaikan</button>
          </form>
     </div>
     <p><button type="button" class="btn ghost danger" data-action="reject" data-id="${id}">Tolak pengajuan</button></p>`;
}

/** Usulan pesan perbaikan: dokumen wajib yang kurang + angka keuangan yang kosong. */
function defaultFixNote(record, v) {
     const docs = record.documents || [];
     const missingDocs = DOCUMENTS.filter((m) => m.mandatory && !docs.some((d) => d.key === m.key)).map((m) => m.label);
     const fin = financeStatus(record.borrower.keuangan || {});
     const parts = [];
     if (missingDocs.length) parts.push(`Lampirkan ${missingDocs.join(', ')}.`);
     if (fin.missing.length) parts.push(`Lengkapi angka laporan: ${fin.missing.join(', ')}.`);
     if (!parts.length && v?.fixes[0]) parts.push(v.fixes[0].text);
     return parts.join(' ');
}

