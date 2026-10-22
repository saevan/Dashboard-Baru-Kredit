/**
 * ui/app.js — Dashboard Kredit Sederhana (MEZS.id), dua peran:
 *   PEMOHON  : ajukan pinjaman (data usaha, kirim berkas laporan, dokumen),
 *              pantau status, jawab penawaran.
 *   PETUGAS  : periksa pengajuan (dokumen, wawancara, hasil analisis),
 *              kirim penawaran / minta perbaikan / tolak, cairkan, pantau,
 *              beri keringanan, lihat portofolio.
 * Semua angka dari mesin src/core lewat src/simple; layar ini hanya
 * menyusun tampilan dan menyimpan status (localStorage, mode lokal).
 */

import { emptyBorrower } from '../simple/analyze.js';
import { parseAmount, validateApplicationStep } from '../simple/form-schema.js';
import { demoBuSari, demoPakDarto, demoDocuments, SAMPLE_REPORT_URL } from '../simple/demo.js';
import { readDocument, pickCandidate, applyCandidate, MAX_FILE_BYTES } from '../simple/intake.js';
import {
     createLoan,
     resubmit,
     verifyDocument,
     setInterview,
     requestFix,
     makeOffer,
     acceptOffer,
     declineOffer,
     rejectLoan,
     toggleCondition,
     disburseLoan,
     drawRemaining,
     addMonitoring,
     applyRestructuring,
     effectiveBorrower
} from '../simple/loans.js';
import { rupiah } from '../simple/translate.js';
import { renderApplyForm, renderMyApplications, renderMyApplication, APPLY_STEPS } from './borrower-view.js';
import { renderQueue, renderLenderDetail } from './lender-view.js';
import { renderLoanList } from './loans-view.js';
import { simOutput } from './result-view.js';
import { esc } from './html.js';

const STORE_KEY = 'mezs-sederhana-v2';
const LOANS_KEY = 'mezs-sederhana-pinjaman';

/** Di dalam frame (mis. Artifact claude.ai) dialog, cetak, dan unduhan diblokir host. */
const FRAMED = (() => {
     try {
          return window.self !== window.top;
     } catch {
          return true;
     }
})();

/** Formulir kosong: lama usaha & cadangan kas tidak diisi diam-diam (mesin menilai netral). */
function blankBorrower() {
     const b = emptyBorrower();
     b.bisnis_manajemen.track_record_tahun = null;
     b.bisnis_manajemen.cash_runway_bulan = null;
     b.periode_angsuran = 'bulanan';
     b.skema_angsuran = 'annuity';
     b.agunan = { jenis: null, nilai_agunan: 0, personal_guarantee: false };
     return b;
}

const blankDraft = () => ({ step: 0, borrower: blankBorrower(), documents: [], consent: false, editingId: null, fixNote: null });

/* ------------------------------------------------------------ state ----- */

const state = {
     role: 'pemohon',
     view: 'apply',
     mode: 'sederhana',
     loans: [],
     loanId: null,
     draft: blankDraft(),
     errors: [],
     ui: {},
     sim: null,
     confirm: null,
     backupText: null,
     notice: ''
};

/** Berkas laporan terakhir (di memori saja) untuk OCR. */
let lastReport = null;

function load() {
     try {
          const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
          if (saved) {
               state.role = saved.role === 'petugas' ? 'petugas' : 'pemohon';
               state.mode = saved.mode === 'lengkap' ? 'lengkap' : 'sederhana';
               if (saved.draft?.borrower) state.draft = { ...blankDraft(), ...saved.draft };
          }
          const loans = JSON.parse(localStorage.getItem(LOANS_KEY) || '[]');
          // Data versi lama (tanpa status alur baru) tidak dibawa.
          if (Array.isArray(loans)) state.loans = loans.filter((l) => l && l.history);
     } catch {
          /* penyimpanan tidak tersedia — mulai kosong */
     }
     state.view = state.role === 'petugas' ? 'queue' : 'apply';
}

function save() {
     try {
          localStorage.setItem(STORE_KEY, JSON.stringify({ role: state.role, mode: state.mode, draft: state.draft }));
          localStorage.setItem(LOANS_KEY, JSON.stringify(state.loans));
     } catch {
          /* abaikan */
     }
}

/* ---------------------------------------------------------- helpers ----- */

const root = () => document.getElementById('app');
const findLoan = (id) => state.loans.find((l) => l.id === id) || null;

function setPath(obj, path, value) {
     const keys = path.split('.');
     const last = keys.pop();
     const target = keys.reduce((o, k) => (o[k] ??= {}), obj);
     target[last] = value;
}

function updateLoan(id, fn) {
     const i = state.loans.findIndex((l) => l.id === id);
     if (i < 0) return false;
     try {
          state.loans[i] = fn(state.loans[i]);
          save();
          return true;
     } catch (err) {
          state.notice = err.message;
          return false;
     }
}

function openLoan(id) {
     state.loanId = id;
     state.ui = {};
     state.confirm = null;
     state.view = state.role === 'petugas' ? 'detail' : 'my-detail';
     const loan = findLoan(id);
     if (state.role === 'petugas' && loan) {
          const base = effectiveBorrower(loan);
          state.sim = { amount: base.plafon_diajukan, tenor: base.tenor_bulan, rate: base.bunga_tahunan ?? 0.14, base };
     }
     window.scrollTo({ top: 0 });
}

/* ------------------------------------------------------------ render ---- */

const NAV = {
     pemohon: [['apply', 'Ajukan pinjaman'], ['my', 'Pengajuan saya']],
     petugas: [['queue', 'Pengajuan masuk'], ['portfolio', 'Portofolio']]
};
const NAV_OF = { apply: 'apply', my: 'my', 'my-detail': 'my', queue: 'queue', detail: 'queue', portfolio: 'portfolio' };

function renderChrome() {
     document.documentElement.dataset.mode = state.mode;
     document.querySelectorAll('[data-role]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.role === state.role)));
     document.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode)));
     const modeSwitch = document.querySelector('.mode-switch');
     if (modeSwitch) modeSwitch.hidden = state.role !== 'petugas';
     const nav = document.getElementById('nav');
     if (nav) {
          let current = NAV_OF[state.view];
          if (state.view === 'detail' && ['aktif', 'lunas'].includes(findLoan(state.loanId)?.status)) current = 'portfolio';
          nav.innerHTML = NAV[state.role].map(([key, text]) => {
               const badge = key === 'my' ? state.loans.filter((l) => ['perbaikan', 'ditawarkan'].includes(l.status)).length
                    : key === 'queue' ? state.loans.filter((l) => ['diajukan', 'diterima'].includes(l.status)).length : 0;
               return `<button type="button" data-nav="${key}"${key === current ? ' aria-current="page"' : ''}>${esc(text)}${badge ? ` <span class="badge">${badge}</span>` : ''}</button>`;
          }).join('');
     }
}

function render() {
     renderChrome();
     const lengkap = state.mode === 'lengkap' && state.role === 'petugas';
     const loan = findLoan(state.loanId);
     let html;
     try {
          if (state.view === 'apply') html = renderApplyForm(state.draft, { errors: state.errors, ui: state.ui });
          else if (state.view === 'my') html = renderMyApplications(state.loans);
          else if (state.view === 'my-detail' && loan) html = renderMyApplication(loan);
          else if (state.view === 'queue') html = renderQueue(state.loans);
          else if (state.view === 'portfolio') html = renderLoanList(state.loans, { lengkap });
          else if (state.view === 'detail' && loan) html = renderLenderDetail(loan, { lengkap, ui: state.ui, sim: state.sim });
          else html = state.role === 'petugas' ? renderQueue(state.loans) : renderMyApplications(state.loans);
     } catch (err) {
          html = `<section class="panel"><p class="alert" role="alert">Terjadi kesalahan saat menampilkan halaman: ${esc(err.message)}</p></section>`;
     }
     root().innerHTML = (state.notice ? `<div class="toast" role="status">${esc(state.notice)}</div>` : '') + renderConfirm() + renderBackupText() + html;
     state.notice = '';
}

/* ------------------------------------------------- konfirmasi di halaman */

const CONFIRM_TEXT = {
     'delete-loan': { message: 'Hapus pinjaman ini dari daftar? Tindakan ini tidak bisa dibatalkan.', yes: 'Ya, hapus' },
     reject: { message: 'Tolak pengajuan ini? Tulis alasannya; pemohon akan membacanya.', yes: 'Tolak pengajuan', reason: true },
     'decline-offer': { message: 'Tolak penawaran ini? Anda bisa mengajukan lagi nanti.', yes: 'Tolak penawaran', reason: true },
     'accept-offer': { message: 'Terima penawaran ini? Bank akan menyiapkan pencairan.', yes: 'Ya, terima' },
     'draw-rest': { message: 'Sertifikat borrowing base terbaru sudah diperiksa dan cukup untuk menarik sisa plafon?', yes: 'Ya, tarik sisa plafon' },
     restructure: { message: 'Terapkan keringanan ini? Cicilan dan lama pinjaman akan diperbarui.', yes: 'Ya, terapkan' }
};

function renderConfirm() {
     const c = state.confirm;
     if (!c) return '';
     const t = CONFIRM_TEXT[c.action];
     return `<div class="confirm" role="alertdialog" aria-labelledby="confirm-msg">
          <p id="confirm-msg"><b>${esc(t.message)}</b></p>
          ${t.reason ? '<label class="field" for="confirm-reason"><span class="field-label">Alasan</span><input type="text" id="confirm-reason" maxlength="300"></label>' : ''}
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
     const reason = c.reason || '';
     if (c.action === 'delete-loan') {
          state.loans = state.loans.filter((l) => l.id !== c.id);
          save();
          state.view = state.role === 'petugas' ? 'queue' : 'my';
          state.notice = 'Pinjaman dihapus.';
     } else if (c.action === 'reject') {
          if (updateLoan(c.id, (l) => rejectLoan(l, { reason }))) state.notice = 'Pengajuan ditolak. Pemohon akan melihat alasannya.';
     } else if (c.action === 'decline-offer') {
          if (updateLoan(c.id, (l) => declineOffer(l, { reason }))) state.notice = 'Penawaran ditolak.';
     } else if (c.action === 'accept-offer') {
          if (updateLoan(c.id, (l) => acceptOffer(l))) state.notice = 'Penawaran diterima. Bank akan menyiapkan pencairan.';
     } else if (c.action === 'draw-rest') {
          updateLoan(c.id, (l) => drawRemaining(l));
     } else if (c.action === 'restructure') {
          if (updateLoan(c.id, (l) => applyRestructuring(l, c.type))) state.notice = 'Keringanan cicilan diterapkan.';
     }
}

/* ------------------------------------------------------ berkas laporan -- */

function replaceDoc(doc) {
     state.draft.documents = [...(state.draft.documents || []).filter((d) => d.key !== doc.key), doc];
}

/** Terapkan kandidat angka yang jelas (satu periode / tahun terbaru). */
function autoApply(doc) {
     const idx = pickCandidate(doc.extraction?.candidates || []);
     if (idx !== null) state.draft.borrower = applyCandidate(state.draft.borrower, doc, idx);
     return idx;
}

async function readUpload(bytes, filename, key) {
     if (bytes.length > MAX_FILE_BYTES) throw new Error('Ukuran berkas maksimal 5 MB.');
     const doc = await readDocument(bytes, filename, key);
     replaceDoc(doc);
     if (key === 'laporan_keuangan') {
          lastReport = { bytes, filename: doc.filename };
          const n = doc.extraction?.candidates?.length || 0;
          const idx = autoApply(doc);
          state.ui = { ...state.ui, ocrReady: !n, reading: null };
          state.notice = n
               ? idx !== null ? `Angka dari ${doc.filename} sudah terisi. Periksa ringkasannya.` : 'Berkas berisi beberapa periode. Pilih yang dipakai.'
               : '';
     } else {
          state.notice = `${doc.filename} dilampirkan.`;
     }
     save();
}

async function handleUpload(input) {
     const file = input.files?.[0];
     if (!file) return;
     const key = input.dataset.upload;
     state.ui = { ...state.ui, reading: key === 'laporan_keuangan' ? `Membaca ${file.name}…` : null };
     render();
     try {
          await readUpload(new Uint8Array(await file.arrayBuffer()), file.name, key);
     } catch (err) {
          state.ui = { ...state.ui, reading: null };
          state.notice = `Berkas tidak bisa dipakai: ${err.message}`;
     }
     render();
}

async function loadSampleReport() {
     state.ui = { ...state.ui, reading: 'Membaca laporan contoh…' };
     render();
     try {
          const res = await fetch(SAMPLE_REPORT_URL);
          if (!res.ok) throw new Error('berkas contoh tidak ditemukan');
          await readUpload(new Uint8Array(await res.arrayBuffer()), SAMPLE_REPORT_URL.split('/').pop(), 'laporan_keuangan');
     } catch (err) {
          state.ui = { ...state.ui, reading: null };
          state.notice = `Laporan contoh gagal dibaca: ${err.message}`;
     }
     render();
}

async function runOcr() {
     const doc = state.draft.documents.find((d) => d.key === 'laporan_keuangan');
     if (!doc || !lastReport) {
          state.notice = 'Pilih ulang berkas fotonya, lalu tekan baca lagi.';
          return render();
     }
     try {
          const { ocrFinancialFile } = await import('./ocr.js');
          const extraction = await ocrFinancialFile(lastReport.bytes, lastReport.filename, (text) => {
               state.ui = { ...state.ui, reading: text };
               const el = root().querySelector('.reading');
               if (el) el.textContent = text;
               else render();
          });
          const updated = { ...doc, extraction };
          replaceDoc(updated);
          if (extraction.candidates.length) autoApply(updated);
          state.ui = { ...state.ui, reading: null, ocrReady: !extraction.candidates.length };
          state.notice = extraction.message;
     } catch (err) {
          state.ui = { ...state.ui, reading: null };
          state.notice = `OCR gagal: ${err.message} Isi angka sendiri di bagian bawah.`;
     }
     save();
     render();
}

/* ------------------------------------------------------------- input ---- */

let simTimer = null;
function onSimInput(t) {
     if (!state.sim) return;
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
          if (out) out.innerHTML = simOutput(state.sim);
     }, 120);
}

function onInput(e) {
     const t = e.target;
     if (t.dataset.sim) return onSimInput(t);
     if (!t.closest('[data-apply-form]')) return undefined;
     const b = state.draft.borrower;
     if (t.dataset.amount) {
          const n = parseAmount(t.value);
          setPath(b, t.dataset.amount, n);
          const echo = root().querySelector(`[data-echo="${CSS.escape(t.dataset.amount)}"]`);
          if (echo) echo.textContent = Number.isFinite(n) && n !== 0 ? `= ${rupiah(n)}` : t.value.trim() ? 'Angka belum terbaca' : '';
     } else if (t.dataset.number) {
          setPath(b, t.dataset.number, t.value === '' ? null : Number(t.value));
     } else if (t.dataset.path && t.type !== 'radio') {
          setPath(b, t.dataset.path, t.value);
     } else {
          return undefined;
     }
     save();
     return undefined;
}

function onChange(e) {
     const t = e.target;
     if (t.matches('[data-import]')) return importBackup(t.files?.[0]);
     if (t.dataset.upload) return handleUpload(t);
     const id = t.dataset.id;
     if (t.dataset.condition) {
          updateLoan(id, (l) => toggleCondition(l, t.dataset.condition, t.checked));
          return render();
     }
     if (t.dataset.verify) {
          updateLoan(id, (l) => verifyDocument(l, t.dataset.verify, t.checked));
          return render();
     }
     if (t.dataset.lenderInterview) {
          updateLoan(id, (l) => setInterview(l, t.dataset.lenderInterview, t.value));
          refreshSimBase();
          return render();
     }
     if (t.dataset.lenderNumber) {
          updateLoan(id, (l) => {
               const borrower = structuredClone(l.borrower);
               setPath(borrower, t.dataset.lenderNumber, t.value === '' ? null : Number(t.value));
               return { ...l, borrower };
          });
          refreshSimBase();
          return render();
     }
     if (t.dataset.sim) return undefined;
     if (!t.closest('[data-apply-form]')) return undefined;
     const b = state.draft.borrower;
     if (t.dataset.path && t.type === 'radio') setPath(b, t.dataset.path, t.value);
     else if (t.dataset.bool) setPath(b, t.dataset.bool, t.checked);
     else if (t.hasAttribute('data-consent')) state.draft.consent = t.checked;
     else if (t.hasAttribute('data-collateral')) {
          b.agunan = { ...(b.agunan || {}), jenis: t.value || null };
          if (!t.value) b.agunan.nilai_agunan = 0;
          save();
          return render();
     } else return undefined;
     save();
     return undefined;
}

function refreshSimBase() {
     const loan = findLoan(state.loanId);
     if (loan && state.sim) state.sim.base = effectiveBorrower(loan);
}

/* ------------------------------------------------------------- klik ----- */

function onClick(e) {
     const el = e.target.closest('button');
     if (!el) return undefined;
     if (el.dataset.role) {
          state.role = el.dataset.role;
          state.view = state.role === 'petugas' ? 'queue' : 'apply';
          state.confirm = null;
          save();
          return render();
     }
     if (el.dataset.mode) {
          state.mode = el.dataset.mode;
          save();
          return render();
     }
     if (el.dataset.nav) {
          state.view = el.dataset.nav;
          state.confirm = null;
          state.errors = [];
          return render();
     }
     if (el.dataset.open) {
          openLoan(el.dataset.open);
          return render();
     }
     if (el.dataset.goto !== undefined) {
          state.draft.step = Number(el.dataset.goto);
          state.errors = [];
          return render();
     }
     const id = el.dataset.id;
     switch (el.dataset.action) {
          /* --- pemohon --- */
          case 'demo-apply': {
               const b = demoBuSari();
               b.keuangan = blankBorrower().keuangan;
               state.draft = { ...blankDraft(), borrower: b, documents: demoDocuments() };
               state.errors = [];
               save();
               return loadSampleReport();
          }
          case 'sample-report':
               return loadSampleReport();
          case 'ocr':
               return runOcr();
          case 'pick-candidate': {
               const doc = state.draft.documents.find((d) => d.key === 'laporan_keuangan');
               if (doc) state.draft.borrower = applyCandidate(state.draft.borrower, doc, Number(el.dataset.index));
               save();
               return render();
          }
          case 'back':
               state.draft.step = Math.max(0, state.draft.step - 1);
               state.errors = [];
               return render();
          case 'new-apply':
               state.draft = blankDraft();
               state.view = 'apply';
               state.errors = [];
               save();
               return render();
          case 'my-list':
               state.view = 'my';
               return render();
          case 'fix-edit': {
               const loan = findLoan(id);
               if (!loan) return undefined;
               state.draft = { step: 0, borrower: structuredClone(loan.borrower), documents: structuredClone(loan.documents || []), consent: true, editingId: loan.id, fixNote: loan.fix_note };
               state.view = 'apply';
               save();
               return render();
          }
          /* --- petugas --- */
          case 'queue':
               state.view = 'queue';
               return render();
          case 'portfolio':
               state.view = 'portfolio';
               return render();
          case 'demo-sari-submitted': {
               const loan = createLoan({ borrower: { ...demoBuSari(), financial_import: { filename: 'laporan_keuangan_bu_sari.csv', label: 'Satu periode laporan · Rupiah' } }, documents: demoDocuments(), consent: true,
                    interview: { model: 4, pasar: 4, pengalaman: 4, bayar: 4, kelola: 4, tren: 4, industri: 4 } });
               loan.demo = 'sari';
               loan.history.push({ at: loan.created_at, by: 'petugas', text: 'Contoh: wawancara sudah diisi (semua "Baik")' });
               state.loans.push(loan);
               save();
               openLoan(loan.id);
               return render();
          }
          case 'demo-darto': {
               const loan = { ...demoPakDarto(), demo: 'darto' };
               state.loans.push(loan);
               save();
               openLoan(loan.id);
               return render();
          }
          case 'detail':
               state.ui = { ...state.ui, detailOpen: !state.ui.detailOpen };
               return render();
          case 'disburse':
               if (updateLoan(id, (l) => disburseLoan(l))) state.notice = 'Dana dicairkan. Pinjaman kini dipantau setiap bulan.';
               return render();
          case 'show-relief':
               state.ui = { ...state.ui, relief: true };
               return render();
          /* --- bersama --- */
          case 'export':
               return exportBackup();
          case 'backup-close':
               state.backupText = null;
               return render();
          case 'delete-loan':
          case 'reject':
          case 'decline-offer':
          case 'accept-offer':
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
          default:
               return undefined;
     }
}

/* ------------------------------------------------------------ kirim ----- */

function formValues(form) {
     return Object.fromEntries(new FormData(form).entries());
}

function submitApplication() {
     const d = state.draft;
     const errs = validateApplicationStep(d.step, d);
     state.errors = errs;
     if (errs.length) return render();
     if (d.step < APPLY_STEPS.length - 1) {
          d.step += 1;
          save();
          window.scrollTo({ top: 0 });
          return render();
     }
     for (let i = 0; i < APPLY_STEPS.length; i += 1) {
          const stepErrs = validateApplicationStep(i, d);
          if (stepErrs.length) {
               d.step = i;
               state.errors = stepErrs;
               return render();
          }
     }
     try {
          let id = d.editingId;
          if (id) {
               updateLoan(id, (l) => resubmit(l, { borrower: d.borrower, documents: d.documents }));
               state.notice = 'Perbaikan terkirim. Bank akan memeriksa ulang pengajuan Anda.';
          } else {
               const loan = createLoan({ borrower: d.borrower, documents: d.documents, consent: d.consent });
               state.loans.push(loan);
               id = loan.id;
               state.notice = 'Pengajuan terkirim. Pantau prosesnya di halaman ini.';
          }
          state.draft = blankDraft();
          save();
          openLoan(id);
     } catch (err) {
          state.errors = [err.message];
     }
     return render();
}

function onSubmit(e) {
     const form = e.target;
     e.preventDefault();
     if (form.matches('[data-apply-form]')) return submitApplication();
     const v = formValues(form);
     if (form.matches('[data-offer]')) {
          const ok = updateLoan(form.dataset.offer, (l) => makeOffer(l, {
               amount: parseAmount(v.amount),
               tenor: Number(v.tenor),
               rate: Number(String(v.rate).replace(',', '.')) / 100,
               periodicity: v.periodicity
          }));
          if (ok) state.notice = 'Penawaran terkirim ke pemohon.';
          state.view = 'queue';
          return render();
     }
     if (form.matches('[data-fix]')) {
          if (updateLoan(form.dataset.fix, (l) => requestFix(l, { note: v.note }))) {
               state.notice = 'Permintaan perbaikan terkirim ke pemohon.';
               state.view = 'queue';
          }
          return render();
     }
     if (form.matches('[data-monitor]')) {
          const extra = {};
          for (const [k, val] of Object.entries(v)) {
               if (k.startsWith('x_') && val !== '') extra[k.slice(2)] = Number.isFinite(Number(val)) ? Number(val) : val;
          }
          updateLoan(form.dataset.monitor, (l) => addMonitoring(l, {
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
          }));
          state.ui = {};
          return render();
     }
     return undefined;
}

/* ---------------------------------------------------------- cadangan ---- */

function exportBackup() {
     const text = JSON.stringify({ app: 'mezs-sederhana', version: 2, exported_at: new Date().toISOString(), loans: state.loans }, null, 2);
     if (FRAMED) {
          // Unduhan diblokir di dalam frame: salin ke papan klip, atau tampilkan teks untuk disalin manual.
          state.backupText = text;
          if (!navigator.clipboard) return render();
          navigator.clipboard.writeText(text).then(() => {
               state.notice = 'Cadangan disalin. Tempel ke berkas teks dan simpan sebagai .json.';
               state.backupText = null;
               render();
          }).catch(() => {
               render();
               root().querySelector('#backup-text')?.select();
          });
          return undefined;
     }
     const link = document.createElement('a');
     link.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
     link.download = `cadangan-pinjaman-${new Date().toISOString().slice(0, 10)}.json`;
     link.click();
     setTimeout(() => URL.revokeObjectURL(link.href), 1000);
     return undefined;
}

/** Pulihkan cadangan: digabung per id (yang dari file menimpa yang sama). */
async function importBackup(file) {
     if (!file) return;
     try {
          const data = JSON.parse(await file.text());
          const loans = Array.isArray(data?.loans) ? data.loans : null;
          if (!loans || !loans.every((l) => l && typeof l.id === 'string' && l.borrower && l.status && l.history)) throw new Error('Berkas bukan cadangan daftar pinjaman versi ini.');
          const byId = new Map(state.loans.map((l) => [l.id, l]));
          for (const l of loans) byId.set(l.id, l);
          state.loans = [...byId.values()];
          save();
          state.notice = `${loans.length} pinjaman dipulihkan dari cadangan.`;
     } catch (err) {
          state.notice = `Gagal memulihkan: ${err.message}`;
     }
     render();
}

export function start() {
     load();
     document.addEventListener('input', onInput);
     document.addEventListener('change', onChange);
     document.addEventListener('click', onClick);
     document.addEventListener('submit', onSubmit);
     render();
}

