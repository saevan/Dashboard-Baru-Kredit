/**
 * pages/borrower.js — Layar pemohon: Beranda, Ajukan (4 langkah), Pengajuan saya.
 * Logika (simpan, lampiran, isi otomatis, konsen, kirim, respons penawaran)
 * dari services/applications.js = dashboard lama ui/apply.js & borrower-offer.js.
 * Pemohon tidak melihat skor/peringkat, sama seperti dashboard lama.
 */

import { session } from '../../services/core.js';
import * as A from '../../services/applications.js';
import { SAMPLE_REPORT_URL } from '../../services/demo.js';
import { SECTOR_OPTIONS, PROFILE_OPTIONS, COLLATERAL_OPTIONS, PERIOD_OPTIONS, PURPOSE_OPTIONS, FINANCE_FIELDS, DOCUMENT_HINT, parseAmount } from '../../services/labels.js';
import { VERIFICATION_SOURCES, INTAKE_CONFIG } from '../../core/intake-config.js';
import { FILE_ACCEPT } from '../../core/attachments.js';
import { parseImprovementSteps } from '../../core/improvement-note.js';
import { simulate } from '../../services/simulation.js';
import {
     esc, rp, rpShort, date, card, answer, rows, pill, steps, field, options, choices, empty,
     toast, confirmSheet, busy, track, fileBytes, bindDrop, TONE
} from '../ui.js';
import { simulatorHtml, bindSimulator, offerTermsHtml, timelineHtml } from '../widgets.js';

const STATUS_TONE = { draft: '', submitted: 'info', need_fix: 'warn', verified: 'info', scored: 'info', offered: 'ok', accepted: 'ok', declined: '', decided: 'ok', rejected: 'bad' };
const statusPill = (app) => pill(app.view?.label || app.status, STATUS_TONE[app.status] || '');

function nextAction(app) {
     const href = `#/pengajuan/${encodeURIComponent(app.id)}`;
     if (app.status === 'draft') return `<a class="btn btn-primary" href="#/ajukan?id=${encodeURIComponent(app.id)}">Lanjutkan mengisi</a>`;
     if (app.status === 'need_fix') return `<a class="btn btn-primary" href="#/ajukan?id=${encodeURIComponent(app.id)}">Perbaiki sekarang</a>`;
     if (app.status === 'offered') return `<a class="btn btn-primary" href="${href}">Lihat penawaran</a>`;
     return `<a class="btn" href="${href}">Lihat status</a>`;
}

/* ============================================================ BERANDA ==== */

export function home(main) {
     const s = session();
     const apps = A.myApplicationList();
     const latest = apps[0];
     const first = (s?.name || '').split(' ')[0];
     main.innerHTML = `
     <div class="page-head"><div><h1>Halo${first ? `, ${esc(first)}` : ''} 👋</h1><p>Ini ringkasan pinjaman usaha Anda.</p></div></div>
     ${latest
          ? answer({ eyebrow: latest.borrower?.nama || latest.payload?.borrower?.nama || 'Pengajuan terakhir', title: latest.feedback.title, text: latest.feedback.message, tone: latest.feedback.tone, actions: nextAction(latest) + (apps.length > 1 ? '<a class="btn btn-quiet" href="#/pengajuan">Semua pengajuan</a>' : '') })
          : answer({ eyebrow: 'Mulai di sini', title: 'Belum ada pengajuan', text: 'Isi data usaha, kirim laporan keuangan apa adanya, lalu tunggu penawaran dari petugas. Sekitar 10 menit.', actions: '<a class="btn btn-primary" href="#/ajukan">Ajukan pinjaman</a>' })}
     <div class="split" style="margin-top:14px">
          ${card('Hitung perkiraan cicilan', simulatorHtml({ id: 'home' }))}
          <div class="stack">
               ${card('Cara kerjanya', `<ol class="timeline">
                    <li class="${apps.length ? 'done' : 'now'}">Isi data usaha &amp; jumlah pinjaman</li>
                    <li>Kirim laporan keuangan — angkanya dibaca otomatis</li>
                    <li>Petugas memeriksa &amp; menilai</li>
                    <li>Terima atau tolak penawaran</li></ol>`)}
               ${card('Siapkan dokumen ini', `<ul class="doclist">${VERIFICATION_SOURCES.filter((d) => d.mandatory).map((d) => `<li><span>${esc(d.label)}</span><span class="pill warn">Wajib</span></li>`).join('')}</ul>`)}
          </div>
     </div>`;
     bindSimulator(main);
     return { title: 'Beranda' };
}

/* ============================================================= AJUKAN ==== */

const WIZ = ['Usaha & pinjaman', 'Laporan keuangan', 'Jaminan & dokumen', 'Periksa & kirim'];
let wiz = { draft: null, step: 0, error: '', notice: '' };

function loadDraft(id) {
     if (id) {
          const d = A.myApplicationDetail(id);
          if (!d) throw new Error('Pengajuan tidak ditemukan.');
          if (!['draft', 'need_fix'].includes(d.status)) { location.hash = `#/pengajuan/${encodeURIComponent(id)}`; return null; }
          return d.draft;
     }
     const open = A.myApplicationList().find((a) => a.status === 'draft');
     return open ? A.myApplicationDetail(open.id).draft : A.blankDraft();
}

export function apply(main, params, ctx) {
     const wantId = params.id || null;
     if (!wiz.draft || (wantId && wiz.draft.id !== wantId) || (!wantId && params.baru)) {
          const d = params.baru ? A.blankDraft() : loadDraft(wantId);
          if (!d) return {};
          wiz = { draft: d, step: 0, error: '', notice: '' };
          track('apply_start', { resume: !!d.id });
     }
     const step = Math.max(0, Math.min(3, Number(params.langkah || 1) - 1));
     wiz.step = step;
     const d = wiz.draft;
     const fixing = d.status === 'need_fix';
     const lenderNote = fixing ? A.myApplicationDetail(d.id)?.feedback?.note : '';
     const body = [stepUsaha, stepKeuangan, stepJaminan, stepKirim][step](d);
     main.innerHTML = `
     <div class="page-head"><div><h1>${fixing ? 'Perbaiki pengajuan' : 'Ajukan pinjaman'}</h1><p>${d.id ? 'Tersimpan otomatis setiap pindah langkah.' : 'Data tersimpan otomatis setiap pindah langkah.'}</p></div>
          ${d.id && d.status === 'draft' ? '<a class="btn btn-quiet" href="#/ajukan?baru=1">Mulai pengajuan baru</a>' : ''}</div>
     ${steps(WIZ.map((label, i) => ({ label, href: d.id && i < step ? `#/ajukan?${new URLSearchParams({ ...(d.id ? { id: d.id } : {}), langkah: i + 1 })}` : '' })), step)}
     ${lenderNote ? `<div class="callout warn" style="margin-bottom:14px"><strong>Catatan petugas:</strong> ${esc(lenderNote)}</div>` : ''}
     ${wiz.error ? `<div class="callout bad" role="alert" style="margin-bottom:14px" tabindex="-1" data-err>${wiz.error}</div>` : ''}
     ${wiz.notice ? `<div class="callout ok" role="status" style="margin-bottom:14px">${esc(wiz.notice)}</div>` : ''}
     <form data-wiz novalidate>${body}
          <div class="actions" style="margin-top:16px;justify-content:space-between">
               ${step > 0 ? '<button class="btn" type="button" data-back>← Kembali</button>' : '<span></span>'}
               ${step < 3 ? '<button class="btn btn-primary" type="submit">Simpan &amp; lanjut →</button>' : `<button class="btn btn-primary" type="submit" data-send>${fixing ? 'Kirim ulang pengajuan' : 'Kirim pengajuan'}</button>`}
          </div>
     </form>`;
     wiz.notice = '';
     main.querySelector('[data-err]')?.focus();
     bindWizard(main, ctx);
     return { title: WIZ[step], crumbs: [{ label: 'Beranda', href: '#/beranda' }, { label: fixing ? 'Perbaiki pengajuan' : 'Ajukan', href: '#/ajukan' }, { label: WIZ[step] }] };
}

const go = (n) => {
     const q = new URLSearchParams({ ...(wiz.draft.id ? { id: wiz.draft.id } : {}), langkah: n + 1 });
     location.hash = `#/ajukan?${q}`;
};

/* ---- langkah 1 ---- */
function stepUsaha(d) {
     const b = d.borrower;
     return card('Tentang usaha Anda', `<div class="form-grid">
          ${field({ id: 'f-nama', label: 'Nama usaha', control: `<input id="f-nama" name="nama" type="text" autocomplete="organization" value="${esc(b.nama)}" required>` })}
          ${field({ id: 'f-sektor', label: 'Bidang usaha', control: `<select id="f-sektor" name="sektor" required>${options(SECTOR_OPTIONS, b.sektor, 'Pilih bidang usaha')}</select>` })}
          <div class="field span-2"><span class="label">Kondisi usaha</span>${choices('profil_company', PROFILE_OPTIONS, b.profil_company)}</div>
     </div>`) + card('Pinjaman yang dibutuhkan', `<div class="form-grid">
          <div class="field money"><label for="f-plafon">Jumlah pinjaman</label><p class="hint">Contoh: 400 jt, 1,2 M, atau 400000000</p>
               <input id="f-plafon" name="plafon_diajukan" type="text" inputmode="decimal" value="${b.plafon_diajukan ? esc(b.plafon_diajukan.toLocaleString('id-ID')) : ''}" data-money required><p class="echo" data-echo aria-live="polite">${b.plafon_diajukan ? rp(b.plafon_diajukan) : ''}</p></div>
          ${field({ id: 'f-tenor', label: 'Lama pinjaman (bulan)', hint: 'Misalnya 12, 24, atau 36 bulan', control: `<input id="f-tenor" name="tenor_bulan" type="number" inputmode="numeric" min="1" max="120" value="${esc(b.tenor_bulan ?? '')}" required>` })}
          <div class="field span-2"><span class="label">Cicil setiap</span><p class="hint">Pilih yang sesuai arus uang usaha Anda. Kosongkan untuk mengikuti saran sistem.</p>${choices('periode_angsuran', PERIOD_OPTIONS, b.periode_angsuran)}</div>
          <div class="field span-2"><span class="label">Untuk keperluan</span>${choices('jenis_kredit', PURPOSE_OPTIONS, b.jenis_kredit)}</div>
          <div class="field span-2"><label for="f-tujuan">Ceritakan singkat penggunaannya</label><textarea id="f-tujuan" name="tujuan_kredit" maxlength="500" placeholder="Misal: beli bahan baku untuk kontrak katering kantor baru">${esc(b.tujuan_kredit || '')}</textarea></div>
     </div>
     <details class="more"><summary>Data legalitas (opsional)</summary><div class="form-grid" style="margin-top:10px">
          ${field({ id: 'f-npwp', label: 'NPWP', hint: '15 atau 16 digit', control: `<input id="f-npwp" name="npwp" type="text" inputmode="numeric" value="${esc(b.npwp || '')}">` })}
          ${field({ id: 'f-nib', label: 'NIB', hint: '13 digit', control: `<input id="f-nib" name="nib" type="text" inputmode="numeric" value="${esc(b.nib || '')}">` })}
     </div></details>`);
}

/* ---- langkah 2 ---- */
function stepKeuangan(d) {
     const b = d.borrower;
     const doc = d.documents.find((x) => x.source_key === 'laporan_keuangan');
     const cands = doc?.extraction?.candidates || [];
     const applied = b.financial_import?.doc_id === doc?.id ? b.financial_import : null;
     const candList = cands.length > 1
          ? `<div class="callout" style="margin-top:12px"><strong>Laporan berisi ${cands.length} periode.</strong> ${applied ? `Dipakai: ${esc(applied.label || '')}.` : 'Pilih periode yang dipakai:'}
               <div class="actions" style="margin-top:8px">${cands.map((c, i) => `<button class="btn btn-sm${applied?.candidate_index === i ? ' btn-primary' : ''}" type="button" data-cand="${i}">${esc(c.label || `Periode ${i + 1}`)}</button>`).join('')}</div></div>`
          : '';
     const ocr = doc && A.ocrEligible(doc)
          ? `<div class="callout warn" style="margin-top:12px">Angka belum terbaca dari berkas ini (foto / hasil scan). <button class="btn btn-sm" type="button" data-ocr>Baca teks dari gambar</button> <span class="small muted" data-ocr-status aria-live="polite"></span></div>`
          : '';
     return card('Kirim laporan keuangan', `
          <p class="muted">Kirim neraca &amp; laba rugi apa adanya. Kami membaca angkanya; Anda cukup memeriksa di bawah.</p>
          <div class="drop" data-drop>
               <input type="file" accept="${FILE_ACCEPT}" aria-label="Pilih berkas laporan keuangan">
               ${doc ? `<p><span class="check-anim" aria-hidden="true">✓</span> <strong>${esc(doc.filename)}</strong></p><p class="small muted">${esc(doc.extraction?.message || '')}</p>` : '<p><strong>Seret berkas ke sini</strong> atau</p>'}
               <button class="btn${doc ? '' : ' btn-primary'}" type="button" data-pick>${doc ? 'Ganti berkas' : 'Pilih berkas'}</button>
               <p class="small muted" style="margin-top:8px">PDF, Excel, CSV, JPG, PNG · maks. 5 MB</p>
          </div>
          <p class="small" style="margin-top:8px">Belum punya berkas? <button class="btn btn-quiet btn-sm" type="button" data-sample>Coba berkas contoh</button></p>
          ${candList}${ocr}`) + card('Periksa angkanya', `
          <p class="muted small">Angka setahun terakhir dalam rupiah. Yang bertanda <span class="pill warn">wajib</span> harus terisi.</p>
          <div class="form-grid">${FINANCE_FIELDS.map((f) => {
               const v = b.keuangan?.[f.key];
               return `<div class="field money"><label for="k-${f.key}">${esc(f.label)} ${f.min ? '<span class="pill warn">wajib</span>' : ''}</label><p class="hint">${esc(f.hint)}</p>
                    <input id="k-${f.key}" name="k.${f.key}" type="text" inputmode="decimal" value="${v === null || v === undefined ? '' : esc(Number(v).toLocaleString('id-ID'))}" data-money><p class="echo" data-echo>${v === null || v === undefined ? '' : rpShort(v)}</p></div>`;
          }).join('')}</div>`);
}

/* ---- langkah 3 ---- */
function stepJaminan(d) {
     const a = d.borrower.agunan || {};
     const docs = VERIFICATION_SOURCES.filter((s) => s.key !== 'laporan_keuangan');
     return card('Jaminan', `
          <div class="field"><span class="label">Apakah ada jaminan?</span>${choices('ag.ketersediaan', [{ key: 'ada', label: 'Ada jaminan' }, { key: 'tidak_ada', label: 'Tidak ada jaminan' }], a.ketersediaan)}</div>
          <div data-ag-detail ${a.ketersediaan === 'ada' ? '' : 'hidden'}><div class="form-grid">
               ${field({ id: 'ag-jenis', label: 'Jenis jaminan', control: `<select id="ag-jenis" name="ag.jenis">${options(COLLATERAL_OPTIONS, a.jenis, 'Pilih jenis')}</select>` })}
               <div class="field money"><label for="ag-nilai">Perkiraan nilai</label><input id="ag-nilai" name="ag.nilai_agunan" type="text" inputmode="decimal" value="${a.nilai_agunan ? esc(Number(a.nilai_agunan).toLocaleString('id-ID')) : ''}" data-money><p class="echo" data-echo>${a.nilai_agunan ? rpShort(a.nilai_agunan) : ''}</p></div>
               ${field({ id: 'ag-pemilik', label: 'Atas nama', control: `<input id="ag-pemilik" name="ag.pemilik" type="text" value="${esc(a.pemilik || '')}">` })}
               ${field({ id: 'ag-ket', label: 'Lokasi / nomor identitas', hint: 'Misal alamat tanah, nomor BPKB', control: `<input id="ag-ket" name="ag.keterangan" type="text" value="${esc(a.keterangan || '')}">` })}
          </div></div>`) + card('Dokumen pendukung', `
          <p class="muted small">Dokumen wajib membantu pengajuan diproses lebih cepat. Bisa menyusul bila diminta petugas.</p>
          <ul class="list">${docs.map((s) => {
               const doc = d.documents.find((x) => x.source_key === s.key);
               return `<li><div class="main"><strong>${esc(s.label)}</strong> ${s.mandatory ? pill('Wajib', 'warn') : pill('Opsional', 'plain')}
                    <div class="meta">${doc ? `✓ ${esc(doc.filename)}` : esc(DOCUMENT_HINT[s.key] || '')}</div></div>
                    <label class="btn btn-sm">${doc ? 'Ganti' : 'Unggah'}<input type="file" accept="${FILE_ACCEPT}" data-doc="${esc(s.key)}" class="sr-only"></label></li>`;
          }).join('')}</ul>`);
}

/* ---- langkah 4 ---- */
function stepKirim(d) {
     const b = d.borrower;
     const edit = (n) => `<a class="btn btn-quiet btn-sm" href="#/ajukan?${new URLSearchParams({ ...(d.id ? { id: d.id } : {}), langkah: n })}">Ubah</a>`;
     const sim = simulate({ plafon: b.plafon_diajukan, tenor: b.tenor_bulan, bungaPersen: 14, periodicity: b.periode_angsuran || null, policy: false });
     const missingDocs = VERIFICATION_SOURCES.filter((s) => s.mandatory && !d.documents.some((x) => x.source_key === s.key));
     const sector = SECTOR_OPTIONS.find((s) => s.key === b.sektor)?.label || b.sektor;
     const ag = b.agunan || {};
     return card('Usaha & pinjaman', rows([['Nama usaha', esc(b.nama)], ['Bidang', esc(sector)], ['Jumlah', rp(b.plafon_diajukan)], ['Lama', `${esc(b.tenor_bulan)} bulan`], ['Cicil setiap', esc(PERIOD_OPTIONS.find((p) => p.key === b.periode_angsuran)?.label || 'Sesuai saran')]]), { actions: edit(1) })
          + card('Laporan keuangan', rows(FINANCE_FIELDS.filter((f) => f.min).map((f) => [f.label, rp(b.keuangan?.[f.key])])), { actions: edit(2) })
          + card('Jaminan & dokumen', rows([['Jaminan', ag.ketersediaan === 'ada' ? `${esc(COLLATERAL_OPTIONS.find((c) => c.key === ag.jenis)?.label || '')} · ${rp(ag.nilai_agunan)}` : 'Tanpa jaminan'], ['Dokumen terlampir', `${d.documents.length} berkas`]])
               + (missingDocs.length ? `<p class="callout warn small" style="margin-top:8px">Belum dilampirkan: ${missingDocs.map((s) => esc(s.label)).join(', ')}. Anda tetap bisa mengirim; petugas mungkin meminta menyusul.</p>` : ''), { actions: edit(3) })
          + (sim.error ? '' : card('Perkiraan cicilan', `<div class="kpis"><div class="kpi"><b>${rp(sim.periodic.per_period)}</b><span>per ${{ harian: 'hari', mingguan: 'minggu', bulanan: 'bulan' }[sim.periodicity]}</span></div><div class="kpi"><b>${rp(sim.inst.total_payment)}</b><span>total dibayar</span></div></div>
               <p class="small muted" style="margin-top:8px">Perkiraan dengan bunga flat 14% per tahun. Jumlah, bunga, dan cicilan final ditentukan dalam penawaran petugas.</p>`))
          + card('Persetujuan', `<label class="check"><input type="checkbox" name="consent" ${d.consent?.accepted ? 'checked disabled' : ''}><span>${esc(INTAKE_CONFIG.consent.clause)}</span></label>`);
}

/* ---- perilaku ---- */
function collect(form, d) {
     const b = d.borrower;
     const get = (n) => form.elements[n];
     const val = (n) => get(n)?.value;
     if (get('nama')) {
          b.nama = val('nama').trim();
          b.sektor = val('sektor');
          b.profil_company = form.querySelector('[name=profil_company]:checked')?.value || b.profil_company;
          b.plafon_diajukan = parseAmount(val('plafon_diajukan'));
          b.tenor_bulan = val('tenor_bulan') === '' ? null : Number(val('tenor_bulan'));
          b.periode_angsuran = form.querySelector('[name=periode_angsuran]:checked')?.value || b.periode_angsuran || '';
          b.jenis_kredit = form.querySelector('[name=jenis_kredit]:checked')?.value || b.jenis_kredit || '';
          b.tujuan_kredit = val('tujuan_kredit').trim();
          b.npwp = val('npwp').trim();
          b.nib = val('nib').trim();
     }
     if (get('k.penjualan')) {
          for (const f of FINANCE_FIELDS) b.keuangan[f.key] = parseAmount(val(`k.${f.key}`));
     }
     if (form.querySelector('[name="ag.ketersediaan"]')) {
          const ada = form.querySelector('[name="ag.ketersediaan"]:checked')?.value || '';
          b.agunan = { ...(b.agunan || {}), ketersediaan: ada };
          if (ada === 'ada') Object.assign(b.agunan, { jenis: val('ag.jenis'), nilai_agunan: parseAmount(val('ag.nilai_agunan')), pemilik: val('ag.pemilik').trim(), keterangan: val('ag.keterangan').trim() });
          else Object.assign(b.agunan, { jenis: '', nilai_agunan: null });
     }
}

function stepError(step, d, consentChecked) {
     /* Validasi lama: langkah "keuangan & agunan" satu layar. Di sini dipecah:
        langkah 2 hanya angka wajib, langkah 3 aturan yang sama lengkap (angka + agunan). */
     const finOnly = step === 1 && A.MIN_FIN_FIELDS.every((k) => Number.isFinite(d.borrower.keuangan?.[k]));
     const err = finOnly ? null : A.validateDraftStep(step === 2 ? 1 : step, d, { consentChecked });
     if (err === 'missing-finance') {
          const miss = FINANCE_FIELDS.filter((f) => f.min && (d.borrower.keuangan?.[f.key] === null || d.borrower.keuangan?.[f.key] === undefined)).map((f) => f.label.toLowerCase());
          return `Angka wajib belum terisi: <strong>${esc(miss.join(', '))}</strong>. Kirim laporan yang lebih lengkap atau isi sendiri.`;
     }
     return err ? esc(err) : '';
}

function bindWizard(main, ctx) {
     const form = main.querySelector('[data-wiz]');
     const d = wiz.draft;
     const rerender = () => ctx.refresh();
     const persist = () => { collect(form, d); if (d.id || d.borrower.nama) A.saveDraft(d); };

     form.querySelectorAll('[data-money]').forEach((input) => input.addEventListener('input', () => {
          const n = parseAmount(input.value);
          const echo = input.parentElement.querySelector('[data-echo]');
          if (echo) echo.textContent = input.value.trim() === '' ? '' : n === null ? 'Format belum dikenali' : rp(n);
     }));
     form.querySelectorAll('[name="ag.ketersediaan"]').forEach((r) => r.addEventListener('change', () => {
          form.querySelector('[data-ag-detail]').hidden = r.value !== 'ada';
     }));
     main.querySelector('[data-back]')?.addEventListener('click', () => {
          try { persist(); } catch { /* boleh kembali tanpa menyimpan */ }
          wiz.error = '';
          go(wiz.step - 1);
     });

     form.addEventListener('submit', async (e) => {
          e.preventDefault();
          collect(form, d);
          const consent = !!form.elements.consent?.checked;
          const err = stepError(wiz.step, d, consent);
          if (err) { wiz.error = err; track('apply_error', { step: wiz.step + 1 }); return rerender(); }
          wiz.error = '';
          if (wiz.step < 3) {
               const ok = await busy(e.submitter, () => A.saveDraft(d), { fail: 'Belum tersimpan' });
               if (ok === undefined) return;
               track('apply_step', { step: wiz.step + 2 });
               return go(wiz.step + 1);
          }
          const res = A.submitDraft(d, { consentChecked: consent });
          if (!res.ok) { wiz.error = stepError(res.step, d, consent) || esc(res.error); return go(res.step); }
          track('apply_submit');
          const id = res.id;
          wiz = { draft: null, step: 0, error: '', notice: '' };
          toast('Pengajuan terkirim. Petugas akan memeriksanya.');
          location.hash = `#/pengajuan/${encodeURIComponent(id)}`;
     });

     /* Langkah 2: laporan keuangan */
     const upload = async (file, key = 'laporan_keuangan') => {
          collect(form, d);
          if (!d.borrower.nama) { wiz.error = 'Isi nama usaha di langkah 1 terlebih dahulu.'; return rerender(); }
          const status = main.querySelector('[data-drop] p');
          if (status && key === 'laporan_keuangan') status.innerHTML = '<span aria-busy="true">Membaca berkas…</span>';
          try {
               const out = await A.attachDocument(d, key, await fileBytes(file), file.name);
               wiz.notice = out.message || `${file.name} tersimpan.`;
               track('upload', { key, autofill: !!out.applied });
          } catch (err) {
               wiz.error = esc(`Berkas belum tersimpan: ${err.message}`);
          }
          rerender();
     };
     bindDrop(main.querySelector('[data-drop]'), (files) => upload(files[0]));
     main.querySelector('[data-sample]')?.addEventListener('click', async (e) => {
          await busy(e.currentTarget, async () => {
               const res = await fetch(SAMPLE_REPORT_URL);
               if (!res.ok) throw new Error('Berkas contoh tidak tersedia.');
               await upload(new File([await res.arrayBuffer()], 'laporan_keuangan_bu_sari.csv', { type: 'text/csv' }));
          }, { fail: 'Gagal memuat contoh' });
     });
     main.querySelectorAll('[data-cand]').forEach((b) => b.addEventListener('click', () => {
          collect(form, d);
          const doc = d.documents.find((x) => x.source_key === 'laporan_keuangan');
          try { wiz.notice = A.applyExtraction(d, doc.id, Number(b.dataset.cand)); } catch (err) { wiz.error = esc(err.message); }
          rerender();
     }));
     main.querySelector('[data-ocr]')?.addEventListener('click', async (e) => {
          const doc = d.documents.find((x) => x.source_key === 'laporan_keuangan');
          const statusEl = main.querySelector('[data-ocr-status]');
          await busy(e.currentTarget, async () => {
               const { ocrFinancialFile } = await import('../ocr.js');
               const bytes = await A.readAttachment(d.id, doc.id);
               const extraction = await ocrFinancialFile(bytes, doc.filename, (t) => { statusEl.textContent = t; });
               const out = A.applyOcrResult(d, doc.id, extraction);
               wiz.notice = out.message || extraction.message;
               track('ocr', { ok: !!out.applied });
               rerender();
          }, { fail: 'Teks belum terbaca' });
     });

     /* Langkah 3: dokumen pendukung */
     main.querySelectorAll('[data-doc]').forEach((input) => input.addEventListener('change', () => {
          if (input.files.length) upload(input.files[0], input.dataset.doc);
     }));
}

/* ==================================================== PENGAJUAN SAYA ==== */

export function list(main) {
     const apps = A.myApplicationList();
     main.innerHTML = `<div class="page-head"><div><h1>Pengajuan saya</h1><p>${apps.length} pengajuan</p></div><a class="btn btn-primary" href="#/ajukan?baru=1">Ajukan baru</a></div>
     ${apps.length ? card('', `<ul class="list">${apps.map((a) => {
          const b = a.payload?.borrower || a.borrower || {};
          return `<li><div class="main"><a href="#/pengajuan/${encodeURIComponent(a.id)}">${esc(b.nama || 'Tanpa nama')}</a>
               <div class="meta">${rp(a.amount_requested)} · ${esc(b.tenor_bulan || '—')} bulan · diperbarui ${esc(date(a.updated_at || a.created_at))}</div></div>
               ${statusPill(a)}${nextAction(a)}</li>`;
     }).join('')}</ul>`) : card('', empty('Belum ada pengajuan', 'Mulai dengan mengisi data usaha Anda.', '<a class="btn btn-primary" href="#/ajukan">Ajukan pinjaman</a>'))}`;
     return { title: 'Pengajuan saya' };
}

export function detail(main, params, ctx) {
     const app = A.myApplicationDetail(params.id);
     const crumbs = [{ label: 'Pengajuan saya', href: '#/pengajuan' }];
     if (!app) {
          main.innerHTML = card('', empty('Pengajuan tidak ditemukan', '', '<a class="btn" href="#/pengajuan">Kembali</a>'));
          return { title: 'Tidak ditemukan', crumbs: [...crumbs, { label: 'Tidak ditemukan' }] };
     }
     const b = app.draft.borrower;
     const offer = app.offerView;
     const expired = offer?.expires_at && Date.parse(offer.expires_at) <= Date.now();
     const offerCard = offer && ['offered', 'accepted', 'declined'].includes(app.status)
          ? card(app.status === 'offered' ? 'Penawaran untuk Anda' : 'Penawaran', `${offerTermsHtml(offer)}
               ${offer.note ? `<p class="callout" style="margin-top:10px"><strong>Catatan petugas:</strong> ${esc(offer.note)}</p>` : ''}
               ${app.status === 'offered' ? `<p class="small muted" style="margin-top:10px">${expired ? '<strong>Penawaran sudah kedaluwarsa.</strong> Hubungi petugas untuk penawaran baru.' : `Berlaku sampai ${esc(date(offer.expires_at))}.`}</p>
                    <div class="actions" style="margin-top:10px"><button class="btn btn-primary" data-respond="1" ${expired ? 'disabled' : ''}>Terima penawaran</button><button class="btn btn-danger" data-respond="0">Tolak</button></div>` : ''}`)
          : '';
     const note = app.improvement_note ? parseImprovementSteps(app.improvement_note.text) : null;
     const fac = app.facility_summary;
     main.innerHTML = `
     <div class="page-head"><div><h1>${esc(b.nama || 'Pengajuan')}</h1><p>${rp(app.amount_requested)} · ${esc(b.tenor_bulan)} bulan</p></div>${statusPill(app)}</div>
     <div class="split">
          <div class="stack">
               ${answer({ title: app.feedback.title, text: app.feedback.message, tone: app.feedback.tone, body: app.feedback.note ? `<p class="callout ${TONE[app.feedback.tone] || ''}"><strong>Catatan petugas:</strong> ${esc(app.feedback.note)}</p>` : '',
                    actions: app.status === 'need_fix' ? `<a class="btn btn-primary" href="#/ajukan?id=${encodeURIComponent(app.id)}">Perbaiki sekarang</a>` : app.status === 'draft' ? `<a class="btn btn-primary" href="#/ajukan?id=${encodeURIComponent(app.id)}">Lanjutkan mengisi</a> <button class="btn btn-danger" data-delete>Hapus draf</button>` : '' })}
               ${offerCard}
               ${fac ? card('Pencairan', rows([['Status', esc({ pipeline: 'Sedang disiapkan', aktif: 'Sudah dicairkan', lunas: 'Lunas', ditolak: 'Tidak dilanjutkan' }[fac.status] || fac.status)], ['Tanggal cair', esc(date(fac.disbursed_at))]])) : ''}
               ${note ? card('Saran perbaikan dari petugas', note.steps.length ? `<ol>${note.steps.map((s) => `<li><strong>${esc(s.action)}</strong>${s.evidence.length ? `<div class="small muted">Bukti: ${s.evidence.map(esc).join(', ')}</div>` : ''}</li>`).join('')}</ol>${note.closing ? `<p>${esc(note.closing)}</p>` : ''}` : `<p>${esc(note.closing)}</p>`) : ''}
               ${card('Data pengajuan', rows([['Jumlah diajukan', rp(app.amount_requested)], ['Lama', `${esc(b.tenor_bulan)} bulan`], ['Keperluan', esc(b.tujuan_kredit || '—')], ['Dokumen', `${(app.documents || []).length} berkas`], ['Dikirim', esc(date(app.submitted_at))]]))}
          </div>
          ${card('Perjalanan pengajuan', timelineHtml(app))}
     </div>`;
     main.querySelectorAll('[data-respond]').forEach((btn) => btn.addEventListener('click', async () => {
          const accept = btn.dataset.respond === '1';
          const ok = await confirmSheet(accept
               ? { title: 'Terima penawaran ini?', message: `Anda setuju meminjam ${rp(offer.amount)} dengan cicilan ${rp(offer.terms?.installment)} per ${{ harian: 'hari', mingguan: 'minggu' }[offer.terms?.periodicity] || 'bulan'}. Petugas lalu menyiapkan syarat pencairan.`, confirm: 'Ya, terima' }
               : { title: 'Tolak penawaran?', message: 'Pengajuan akan ditutup tanpa pencairan. Tindakan ini tidak bisa dibatalkan.', confirm: 'Ya, tolak', danger: true });
          if (!ok) return;
          await busy(btn, () => A.respondToOffer(app.id, accept), { ok: accept ? 'Penawaran diterima.' : 'Penawaran ditolak.', fail: 'Gagal' });
          track('offer_response', { accept });
          ctx.refresh();
     }));
     main.querySelector('[data-delete]')?.addEventListener('click', async () => {
          if (!(await confirmSheet({ title: 'Hapus draf ini?', message: 'Data yang sudah diisi akan hilang.', confirm: 'Hapus', danger: true }))) return;
          A.deleteDraft(app.id);
          toast('Draf dihapus.');
          location.hash = '#/pengajuan';
     });
     return { title: b.nama || 'Pengajuan', crumbs: [...crumbs, { label: b.nama || 'Detail' }] };
}
