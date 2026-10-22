/**
 * pages/lender.js — Layar petugas: Beranda tugas, antrean Pengajuan, dan
 * peninjauan bertahap satu pengajuan:
 *   1 Dokumen · 2 Audit keuangan · 3 Agunan · 4 Wawancara · 5 Hasil & keputusan
 * Aturan (verifikasi wajib audit lengkap atau justifikasi, nilai otomatis,
 * gerbang penawaran, keputusan manual beralasan) = dashboard lama.
 */

import * as A from '../../services/applications.js';
import * as P from '../../services/portfolio.js';
import { session } from '../../services/core.js';
import { seedBuSariApplication, importDartoDemo, DARTO_DEMO_URL } from '../../services/demo.js';
import { APPLICATION_STATUS_LABEL } from '../../core/intake-config.js';
import { FINANCIAL_CHECKLIST, COLLATERAL_CHECKLIST, AUDIT_SCORE_OPTIONS, interviewGroups, auditProgress, applyAuditToBorrower, score01 } from '../../core/audit.js';
import { automaticAudit } from '../../core/audit-automation.js';
import { buildOfferOptions, assessOffer, offerEligibility } from '../../core/offer.js';
import { priorityReasons } from '../../core/dashboard-insights.js';
import { WORK_FOCUS, workFocus } from '../../core/workflow.js';
import { SECTOR_OPTIONS, FINANCE_FIELDS, COLLATERAL_OPTIONS } from '../../services/labels.js';
import { esc, rp, rpShort, pct, date, card, answer, rows, pill, kpi, steps, empty, toast, confirmSheet, busy, track } from '../ui.js';
import { offerTermsHtml, timelineHtml } from '../widgets.js';
import { resultSummary, analystDetail } from '../result.js';

const STATUS_TONE = { submitted: 'info', need_fix: 'warn', verified: 'info', scored: 'warn', offered: 'info', accepted: 'ok', declined: '', decided: 'ok', rejected: 'bad' };
const statusPill = (s) => pill(APPLICATION_STATUS_LABEL[s] || s, STATUS_TONE[s] || '');
const nameOf = (a) => (a.payload?.borrower || a.borrower || {}).nama || a.id;

/** Tautan tugas mesin lama (#/applications, #/borrower) → rute baru. */
const taskHref = (row) => row.task.href.replace('#/applications/', '#/pengajuan/').replace('#/borrower/', '#/nasabah/');

function taskRow(row) {
     const reasons = priorityReasons(row).filter((r) => !r.startsWith('Belum ada penanggung'));
     return `<li><div class="main"><a href="${esc(taskHref(row))}">${esc(nameOf(row))}</a>
          <div class="meta">${rp(row.amount_requested ?? row.payload?.borrower?.plafon_diajukan)} · ${row.age_days === null ? '' : `${row.age_days} hari di tahap ini`}${reasons.length ? ` · <strong>${esc(reasons.join(' · '))}</strong>` : ''}</div></div>
          ${statusPill(row.status)}${row.task.label === 'Siapkan fasilitas'
               ? `<button class="btn btn-sm btn-primary" data-prepare-row="${esc(row.id)}">Siapkan fasilitas</button>`
               : `<a class="btn btn-sm${row.task.owner === 'lender' ? ' btn-primary' : ''}" href="${esc(taskHref(row))}">${esc(row.task.label)}</a>`}</li>`;
}

/* ============================================================ BERANDA ==== */

export function home(main, params, ctx) {
     const s = session();
     const focus = WORK_FOCUS.some((f) => f.key === params.fokus) ? params.fokus : '';
     const h = P.lenderHome({ focus, actorId: s?.user_id || s?.id || '' });
     const risk = h.risk;
     const first = (s?.name || '').split(' ')[0];
     const isEmpty = !h.tasks.length && !h.portfolio.totals?.count && !risk.total;
     main.innerHTML = `
     <div class="page-head"><div><h1>Halo${first ? `, ${esc(first)}` : ''}</h1><p>${h.lenderCount ? `Ada <strong>${h.lenderCount}</strong> pengajuan menunggu tindakan Anda.` : 'Tidak ada pengajuan yang menunggu Anda.'}${risk.risk_count ? ` ${risk.risk_count} pinjaman perlu perhatian.` : ''}</p></div></div>
     ${isEmpty ? answer({ eyebrow: 'Mulai', title: 'Belum ada data', text: 'Coba dengan data contoh: satu pengajuan baru (Bu Sari) dan satu pinjaman berjalan yang memburuk (Pak Darto).', actions: '<button class="btn btn-primary" data-seed>Muat data contoh</button>' }) : ''}
     <nav class="kpis" aria-label="Fokus pekerjaan" style="margin:14px 0">
          ${h.focusCounts.map((f) => `<a class="kpi" href="#/beranda${focus === f.key ? '' : `?fokus=${f.key}`}"${focus === f.key ? ' aria-current="page" style="outline:2px solid var(--accent)"' : ''}><b>${f.count}</b><span>${esc(f.label)}</span></a>`).join('')}
     </nav>
     <div class="split">
          ${card(focus ? `${WORK_FOCUS.find((f) => f.key === focus).label}` : 'Kerjakan berikutnya', h.queue.items.length ? `<ul class="list">${h.queue.items.map(taskRow).join('')}</ul>` : empty('Tidak ada tugas di sini', focus ? 'Pilih fokus lain atau lihat semua pengajuan.' : 'Semua pengajuan sudah ditangani.'), { sub: `${h.queue.total} tugas · diurutkan menurut prioritas`, actions: '<a class="btn btn-quiet btn-sm" href="#/pengajuan">Semua pengajuan →</a>' })}
          <div class="stack">
               ${card('Kesehatan pinjaman', `<div class="kpis" style="grid-template-columns:1fr 1fr">
                    ${kpi('Sisa pinjaman beredar', rpShort(h.portfolio.totals?.exposure || 0), '#/portofolio')}
                    ${kpi('Kredit bermasalah (NPL)', h.portfolio.totals?.exposure ? pct(h.portfolio.npl?.gross_ratio, 2) : '—', '#/portofolio')}
                    ${kpi('Perlu perhatian', `${risk.risk_count}`, '#/nasabah?filter=risiko')}
                    ${kpi('Pemantauan ≤ 30 hari', risk.coverage === null ? '—' : pct(risk.coverage, 0), '#/pemantauan')}</div>
                    ${risk.overdue ? `<div class="actions" style="margin-top:10px"><a class="btn btn-primary btn-sm" href="#/pemantauan">Isi pemantauan bulanan (${risk.overdue})</a></div>` : ''}
                    ${risk.items.filter((f) => f.level !== 'NORMAL' || !f.fresh).slice(0, 4).map((f) => `<p class="small" style="margin:10px 0 0"><a href="#/nasabah/${encodeURIComponent(f.id)}">${esc(f.nama)}</a> — ${esc(f.monitoring_status)} · ${esc(f.collectibility_label || f.collectibility)}</p>`).join('')}`)}
          </div>
     </div>`;
     main.querySelector('[data-seed]')?.addEventListener('click', (e) => seedDemo(e.currentTarget, ctx));
     bindPrepareRows(main);
     return { title: 'Beranda' };
}

export async function seedDemo(btn, ctx) {
     await busy(btn, async () => {
          seedBuSariApplication();
          const res = await fetch(DARTO_DEMO_URL);
          if (res.ok) importDartoDemo(await res.json());
     }, { ok: 'Data contoh dimuat: pengajuan Bu Sari & pinjaman Pak Darto.', fail: 'Gagal memuat contoh' });
     track('seed_demo');
     ctx.refresh();
}

/* ============================================================ ANTREAN ==== */

const FILTERS = [
     { key: '', label: 'Perlu tindakan saya' },
     { key: 'semua', label: 'Semua' },
     { key: 'pemohon', label: 'Menunggu pemohon' },
     { key: 'arsip', label: 'Selesai' }
];

export function queue(main, params) {
     const all = A.lenderQueue();
     const f = FILTERS.some((x) => x.key === params.filter) ? params.filter || '' : '';
     const q = (params.q || '').toLowerCase();
     const pick = (r) => (f === '' ? r.task.owner === 'lender' : f === 'pemohon' ? r.task.owner === 'borrower' : f === 'arsip' ? r.task.owner === 'none' : true);
     const rowsList = all.filter(pick).filter((r) => !q || nameOf(r).toLowerCase().includes(q))
          .sort((a, b) => (b.age_days ?? -1) - (a.age_days ?? -1));
     main.innerHTML = `
     <div class="page-head"><div><h1>Pengajuan</h1><p>${all.filter((r) => r.task.owner === 'lender').length} menunggu Anda · ${all.length} total</p></div></div>
     <nav class="tabs" aria-label="Saring pengajuan">${FILTERS.map((x) => `<a href="#/pengajuan${x.key ? `?filter=${x.key}` : ''}"${x.key === f ? ' aria-current="page"' : ''}>${esc(x.label)} (${all.filter((r) => (x.key === '' ? r.task.owner === 'lender' : x.key === 'pemohon' ? r.task.owner === 'borrower' : x.key === 'arsip' ? r.task.owner === 'none' : true)).length})</a>`).join('')}</nav>
     ${card('', rowsList.length ? `<ul class="list">${rowsList.map(taskRow).join('')}</ul>` : empty('Tidak ada pengajuan', f === '' ? 'Semua pengajuan sudah Anda tangani.' : '', all.length ? '' : '<p class="small">Pengajuan dari pemohon akan muncul di sini. Atau muat data contoh dari Beranda.</p>'))}`;
     bindPrepareRows(main);
     return { title: 'Pengajuan' };
}

/** "Siapkan fasilitas" langsung dari daftar, lalu buka syarat pencairannya. */
function bindPrepareRows(main) {
     main.querySelectorAll('[data-prepare-row]').forEach((btn) => btn.addEventListener('click', async () => {
          const fac = await busy(btn, () => A.prepareFacility(btn.dataset.prepareRow), { ok: 'Fasilitas disiapkan. Lengkapi syarat pencairan.', fail: 'Gagal' });
          if (fac) location.hash = `#/nasabah/${encodeURIComponent(fac.id)}?bagian=fasilitas`;
     }));
}

/* ======================================================== PENINJAUAN ==== */

const EDITABLE = ['submitted', 'need_fix', 'verified'];
const SECTIONS = [
     { key: 'docs', label: 'Dokumen' },
     { key: 'financial', label: 'Audit keuangan' },
     { key: 'collateral', label: 'Agunan' },
     { key: 'interview', label: 'Wawancara' }
];

/** Pengajuan berikutnya yang menunggu petugas (untuk tombol "Berikutnya"). */
function nextTaskHref(currentId) {
     const next = A.lenderQueue().filter((r) => r.task.owner === 'lender' && r.id !== currentId)
          .sort((a, b) => (b.age_days ?? -1) - (a.age_days ?? -1))[0];
     return next ? { href: taskHref(next), name: nameOf(next) } : null;
}

function progressOf(d) {
     const prog = auditProgress(d.audit, { borrower: d.borrower, documents: d.documents });
     const docsDone = d.documents.filter((x) => x.verified).length;
     return {
          prog,
          counts: {
               docs: [docsDone, d.documents.length],
               financial: [prog.financial.done, prog.financial.total],
               collateral: [prog.collateral.done, prog.collateral.total],
               interview: [prog.interview.done, prog.interview.total]
          }
     };
}

/**
 * Satu halaman kerja: seluruh lembar audit dalam satu layar (tanpa pindah
 * halaman), tombol "tandai semua" per bagian, progres langsung, dan bilah aksi
 * yang selalu terlihat. Setelah dinilai, halaman yang sama menampilkan hasil
 * & keputusan di atas, lembar audit (terkunci) di bawah.
 */
export function review(main, params, ctx) {
     const d = A.reviewDetail(params.id);
     const crumbs = [{ label: 'Pengajuan', href: '#/pengajuan' }];
     if (!d) {
          main.innerHTML = card('', empty('Pengajuan tidak ditemukan', '', '<a class="btn" href="#/pengajuan">Kembali</a>'));
          return { title: 'Tidak ditemukan', crumbs: [...crumbs, { label: 'Tidak ditemukan' }] };
     }
     const b = d.borrower;
     const ctxAudit = { borrower: b, documents: d.documents };
     const { prog, counts } = progressOf(d);
     const locked = !EDITABLE.includes(d.status);
     const sector = SECTOR_OPTIONS.find((s) => s.key === b.sektor)?.label || b.sektor;
     const next = nextTaskHref(d.id);
     const sheet = [stepDocs, stepFinancial, stepCollateral, stepInterview].map((fn, i) =>
          `<section id="sec-${SECTIONS[i].key}" data-sec="${SECTIONS[i].key}" class="stack">${fn(d, { prog, locked, ctxAudit })}</section>`).join('');
     const jump = `<nav class="jump" aria-label="Bagian lembar kerja">${SECTIONS.map((x) => `<button type="button" class="btn btn-sm" data-jump="${x.key}">${esc(x.label)} <span class="num" data-count="${x.key}">${counts[x.key][0]}/${counts[x.key][1]}</span></button>`).join('')}</nav>`;
     const body = locked
          ? `${stepResult(d, { prog })}<details class="card more" style="margin-top:14px"><summary>Lembar audit (terkunci)</summary><div style="margin-top:12px">${sheet}</div></details>`
          : `${d.status === 'need_fix' ? `<div class="callout warn" style="margin-bottom:14px"><strong>Menunggu perbaikan dari pemohon.</strong> ${esc(d.events.at(-1)?.note || '')}</div>` : ''}${jump}<div class="stack">${sheet}</div>
               <div class="actionbar" role="region" aria-label="Aksi pengajuan">
                    <div class="actionbar-in"><span data-total aria-live="polite"></span>
                    <div class="actions">${d.status !== 'need_fix' ? '<button class="btn btn-primary" data-act="verify">Verifikasi &amp; hitung</button>' : ''}
                    ${d.status === 'submitted' ? '<button class="btn" data-act="request_fix">Minta perbaikan</button>' : ''}<button class="btn btn-danger" data-act="reject">Tolak</button></div></div></div>`;
     main.innerHTML = `
     <div class="page-head"><div><h1>${esc(b.nama || d.id)}</h1><p>${esc(sector || '')} · diajukan ${rp(d.amount_requested)} / ${esc(b.tenor_bulan)} bulan · masuk ${esc(date(d.submitted_at))}</p></div>
          <div class="actions">${statusPill(d.status)}${next ? `<a class="btn btn-sm" href="${esc(next.href)}" title="${esc(next.name)}">Berikutnya →</a>` : ''}</div></div>
     <div class="split"><div data-main-col>${body}</div>
          <aside class="stack">
               ${card('Perjalanan', timelineHtml(d), { level: 3 })}
               ${d.events.length ? card('Catatan riwayat', `<ul class="list small">${d.events.slice(-6).reverse().map((e) => `<li><div class="main">${esc(APPLICATION_STATUS_LABEL[e.to] || e.action)}${e.note ? `<div class="meta">${esc(e.note)}</div>` : ''}</div><span class="meta">${esc(date(e.at))}</span></li>`).join('')}</ul>`, { level: 3 }) : ''}
          </aside></div>`;
     bindReview(main, d, ctx);
     paintProgress(main, d.id);
     return { title: b.nama || 'Tinjau', crumbs: [...crumbs, { label: b.nama || d.id }] };
}

/** Perbarui hitungan progres & tombol tanpa memuat ulang halaman (posisi gulir tetap). */
function paintProgress(main, id) {
     const d = A.reviewDetail(id);
     if (!d) return;
     const { prog, counts } = progressOf(d);
     for (const [k, [done, total]] of Object.entries(counts)) {
          const el = main.querySelector(`[data-count="${k}"]`);
          if (el) { el.textContent = `${done}/${total}`; el.closest('button')?.classList.toggle('is-done', total > 0 && done === total); }
     }
     const all = Object.values(counts).reduce((a, [x, y]) => [a[0] + x, a[1] + y], [0, 0]);
     const total = main.querySelector('[data-total]');
     if (total) total.innerHTML = prog.complete && counts.docs[0] === counts.docs[1]
          ? `<strong>Semua ${all[1]} butir selesai</strong> — siap dinilai`
          : `<strong>${all[0]}/${all[1]}</strong> butir selesai${prog.complete ? '' : ' · audit belum lengkap perlu justifikasi'}`;
}

/* ---- 1 Dokumen ---- */
function stepDocs(d, { locked }) {
     const b = d.borrower;
     const auto = automaticAudit(b, d.documents);
     return card('Periksa dokumen', `${bulk('docs', locked || !d.documents.length, 'Tandai semua terverifikasi')}<p class="muted small">Buka setiap berkas, cocokkan dengan aslinya, lalu tandai terverifikasi. Dokumen terverifikasi menaikkan keyakinan data.</p>
          ${d.documents.length ? `<ul class="list">${d.documents.map((doc) => `<li><div class="main"><strong>${esc(A.VERIFICATION_SOURCES.find((s) => s.key === doc.source_key)?.label || doc.source_key)}</strong>
               <div class="meta">${esc(doc.filename)}${doc.example ? ' · contoh tanpa isi berkas' : ''}${doc.extraction?.message ? ` · ${esc(doc.extraction.message)}` : ''}</div></div>
               ${doc.has_file ? `<button class="btn btn-sm btn-quiet" data-open="${esc(doc.id)}">Buka</button>` : ''}
               <label class="check" style="border:0;padding:0"><input type="checkbox" data-verify="${esc(doc.id)}" ${doc.verified ? 'checked' : ''} ${locked ? 'disabled' : ''}><span>Terverifikasi</span></label></li>`).join('')}</ul>` : empty('Belum ada dokumen', 'Minta pemohon melampirkan dokumen lewat tombol "Minta perbaikan".')}
          ${auto.missing_files.length ? `<p class="callout warn small">Berkas wajib belum ada: ${auto.missing_files.map(esc).join(', ')}.</p>` : ''}`)
          + card('Data dari pemohon', rows([['Jumlah diajukan', rp(b.plafon_diajukan)], ['Lama', `${esc(b.tenor_bulan)} bulan`], ['Cicil setiap', esc(b.periode_angsuran || 'Sesuai saran')], ['Keperluan', esc(b.tujuan_kredit || '—')], ['NPWP / NIB', `${esc(b.npwp || '—')} / ${esc(b.nib || '—')}`], ['Persetujuan pemeriksaan', d.consent?.accepted ? `Ya, ${esc(date(d.consent.accepted_at))}` : 'Belum']])
               + `<details class="more"><summary>Angka laporan keuangan</summary>${rows(FINANCE_FIELDS.map((f) => [f.label, rp(b.keuangan?.[f.key])]))}</details>`);
}

const bulk = (key, disabled, label) => (disabled ? '' : `<div class="actions end" style="margin:-4px 0 6px"><button type="button" class="btn btn-sm" data-bulk="${key}">✓ ${esc(label)}</button></div>`);

/* ---- 2 Audit keuangan ---- */
function checklist(section, list, d, locked, autoMap = {}) {
     return list.map((c) => {
          const auto = autoMap[c.key];
          const checked = auto === true || !!d.audit[section].checks[c.key];
          return `<label class="check"><input type="checkbox" data-audit="${section}" data-key="${esc(c.key)}" ${checked ? 'checked' : ''} ${locked || auto !== undefined ? 'disabled' : ''}>
               <span>${esc(c.label)}${auto !== undefined ? `<br><span class="auto">${auto === true ? '✓ Diperiksa otomatis dari angka laporan' : auto === false ? '✗ Gagal pemeriksaan otomatis — perbaiki data' : 'Data inti belum lengkap untuk diperiksa otomatis'}</span>` : ''}</span></label>`;
     }).join('');
}

function stepFinancial(d, { locked, ctxAudit }) {
     const auto = automaticAudit(ctxAudit.borrower, ctxAudit.documents);
     const autoMap = Object.fromEntries(auto.checks.map((c) => [c.key, c.passed]));
     const cmp = auto.comparisons.filter((c) => !c.matches);
     return card('Audit laporan keuangan', `${bulk('financial', locked, 'Centang semua yang sudah diperiksa')}<p class="muted small">Semua butir harus tercentang. Dua butir pertama diperiksa otomatis dari angka laporan.</p>
          ${checklist('financial', FINANCIAL_CHECKLIST, d, locked, autoMap)}
          ${cmp.length ? `<p class="callout warn small">${cmp.length} angka berbeda dari berkas sumber: ${cmp.map((c) => `${esc(FINANCE_FIELDS.find((f) => f.key === c.key)?.label || c.key)} (berkas ${rpShort(c.source)}, isian ${rpShort(c.current)})`).join('; ')}.</p>` : auto.document ? '<p class="callout ok small">Angka isian sama dengan berkas laporan sumber.</p>' : ''}
          ${noteField('financial', d, locked)}`);
}

function noteField(section, d, locked) {
     return `<div class="field" style="margin-top:12px"><label for="note-${section}">Catatan pemeriksaan</label><textarea id="note-${section}" data-audit-note="${section}" ${locked ? 'disabled' : ''} placeholder="Temuan, sumber verifikasi, dll.">${esc(d.audit[section].notes || '')}</textarea></div>`;
}

/* ---- 3 Agunan ---- */
function stepCollateral(d, { locked }) {
     const a = d.borrower.agunan || {};
     return card('Verifikasi agunan', `${a.ketersediaan === 'ada'
          ? rows([['Jenis', esc(COLLATERAL_OPTIONS.find((c) => c.key === a.jenis)?.label || a.jenis || '—')], ['Perkiraan nilai', rp(a.nilai_agunan)], ['Atas nama', esc(a.pemilik || '—')], ['Lokasi / identitas', esc(a.keterangan || '—')], ['Jaminan setara', d.amount_requested && a.nilai_agunan ? `${pct(d.amount_requested / a.nilai_agunan, 0)} dari pinjaman (LTV)` : '—']])
          : '<p class="callout warn">Pemohon menyatakan tidak ada agunan. Penawaran tanpa agunan memerlukan keputusan manual.</p>'}
          <div style="margin-top:12px">${bulk('collateral', locked || a.ketersediaan !== 'ada', 'Centang semua yang sudah diperiksa')}${checklist('collateral', COLLATERAL_CHECKLIST, d, locked)}</div>${noteField('collateral', d, locked)}`);
}

/* ---- 4 Wawancara ---- */
function stepInterview(d, { locked }) {
     const scores = d.audit.interview.scores || {};
     return interviewGroups().map((g) => card(`${g.label}`, g.items.map((q) => {
          const cur = score01(scores[q.key]);
          return `<fieldset class="field" style="border:0;padding:0;margin:0 0 16px"><legend style="font-weight:600;color:var(--strong)">${esc(q.label)}</legend>
               <p class="hint">${esc(q.help || '')}</p>
               <div class="scale">${AUDIT_SCORE_OPTIONS.map((o) => `<label><input type="radio" name="iv-${esc(q.key)}" data-score="${esc(q.key)}" value="${o.value}" ${cur === o.value ? 'checked' : ''} ${locked ? 'disabled' : ''}><span>${esc(o.label.split(' — ')[0])}</span></label>`).join('')}
               ${cur !== null && !AUDIT_SCORE_OPTIONS.some((o) => o.value === cur) ? `<span class="pill plain">Nilai tersimpan ${cur}</span>` : ''}</div></fieldset>`;
     }).join(''))).join('')
          + (locked ? '' : '<p class="small muted">Tip: pilih nilai lalu tekan Tab untuk pindah ke pertanyaan berikutnya; panah kiri/kanan mengganti nilai.</p>')
          + card('', noteField('interview', d, locked));
}

/* ---- 5 Hasil & keputusan ---- */
function stepResult(d, { prog }) {
     const s = d.status;
     if (['submitted', 'need_fix', 'verified'].includes(s)) {
          const ready = prog.complete;
          return answer({
               eyebrow: 'Langkah berikutnya',
               title: s === 'need_fix' ? 'Menunggu perbaikan dari pemohon' : ready ? 'Audit lengkap — siap dinilai' : 'Audit belum lengkap',
               text: s === 'need_fix' ? 'Pemohon sedang memperbaiki data. Anda tetap bisa menolak bila perlu.' : ready ? 'Verifikasi akan mengunci lembar audit lalu menghitung skor, peringkat, dan saran plafon.' : `Lengkapi ${[!prog.financial.complete && 'audit keuangan', !prog.collateral.complete && 'agunan', !prog.interview.complete && 'wawancara'].filter(Boolean).join(', ')}. Atau lanjutkan dengan catatan justifikasi.`,
               tone: ready ? 'ok' : 'warn',
               actions: (s !== 'need_fix' ? `<button class="btn btn-primary" data-act="verify">${s === 'verified' ? 'Hitung penilaian' : ready ? 'Verifikasi & hitung' : 'Lanjutkan dengan justifikasi'}</button>` : '')
                    + (s === 'submitted' ? '<button class="btn" data-act="request_fix">Minta perbaikan</button>' : '')
                    + '<button class="btn btn-danger" data-act="reject">Tolak</button>'
          });
     }
     const r = d.result;
     const borrower = applyAuditToBorrower(d.borrower, d.audit);
     const gate = d.intake?.gate || {};
     const conf = d.intake?.confidence || {};
     const head = card('Gerbang keputusan', rows([
          ['Peringkat', `${esc(d.grade || '—')} ${gate.grade_ok ? pill('Memenuhi', 'ok') : pill('Di bawah ambang', 'warn')}`],
          ['Keyakinan data', `${esc({ HIGH: 'Tinggi', MEDIUM: 'Sedang', LOW: 'Rendah' }[d.confidence_level] || '—')} ${gate.confidence_ok ? pill('Memenuhi', 'ok') : pill('Kurang', 'warn')}`],
          ['Hasil gerbang', gate.pass ? pill('Lolos otomatis', 'ok') : gate.auto_reject ? pill('Zona tolak otomatis', 'bad') : pill('Perlu keputusan manual', 'warn')]
     ]) + (gate.reasons?.length ? `<p class="small muted">${gate.reasons.map((x) => esc(x.message)).join(' · ')}</p>` : '') + (conf.mandatory_missing?.length ? `<p class="small muted">Dokumen wajib belum terverifikasi: ${conf.mandatory_missing.map((k) => esc(A.VERIFICATION_SOURCES.find((x) => x.key === k)?.label || k)).join(', ')}</p>` : ''), { level: 3 });
     let decision = '';
     if (s === 'scored') decision = offerForm(d, borrower);
     else if (['offered', 'accepted', 'declined'].includes(s)) {
          decision = card(s === 'offered' ? 'Penawaran terkirim — menunggu pemohon' : s === 'accepted' ? 'Penawaran diterima pemohon' : 'Penawaran ditolak pemohon',
               offerTermsHtml(d.offer) + (d.offer_assessment?.override ? `<p class="callout warn small">Keputusan manual: ${esc(d.offer_assessment.override_reason)}</p>` : '')
               + `<div class="actions" style="margin-top:12px">${s === 'accepted' ? (d.borrower_id ? `<a class="btn btn-primary" href="#/nasabah/${encodeURIComponent(d.borrower_id)}?bagian=fasilitas">Buka fasilitas</a>` : '<button class="btn btn-primary" data-prepare>Siapkan fasilitas</button>') : ''}
               ${s === 'offered' ? '<button class="btn" data-act="request_fix">Minta perbaikan</button><button class="btn btn-danger" data-act="reject">Tolak</button>' : ''}</div>`);
     } else if (s === 'decided') decision = card('Diputuskan manual', `<p>Keputusan: <strong>${esc(d.decision)}</strong> · ${esc(date(d.decided_at))}</p>`);
     else if (s === 'rejected') decision = card('Pengajuan ditolak', `<p>${esc(d.events.at(-1)?.note || '')}</p>`);
     const improve = ['scored', 'offered', 'accepted', 'declined', 'decided', 'rejected'].includes(s)
          ? card('Catatan perbaikan untuk pemohon', `<p class="muted small">Tampil di halaman pemohon. Tulis langkah bernomor dan buktinya, misal "1. Lunasi tunggakan", lalu di baris berikutnya "Bukti: surat lunas". Pisahkan langkah dengan baris kosong.</p>
               <textarea data-improve aria-label="Catatan perbaikan">${esc(d.improvement_note?.text || '')}</textarea>
               <div class="actions" style="margin-top:8px"><button class="btn btn-sm" data-save-improve>Kirim catatan</button></div>`, { level: 3 })
          : '';
     return `${r ? resultSummary(r, borrower) : ''}${head}${decision}
          ${r ? card('Rincian analis', analystDetail(r), { sub: 'Angka teknis mesin MEZS.id' }) : ''}
          ${improve}
          ${s === 'scored' ? '<div class="actions"><button class="btn btn-quiet" data-act="reassess">Buka ulang penilaian</button></div>' : ''}`;
}

function offerForm(d, borrower) {
     const opts = buildOfferOptions(d.result, borrower);
     const elig = offerEligibility(d.result, d.intake?.gate);
     if (!opts.ready) return card('Kirim penawaran', '<p class="callout warn">Opsi penawaran belum tersedia. Buka ulang penilaian lalu nilai lagi.</p>');
     const rec = opts.recommended;
     return card('Kirim penawaran', `<form data-offer novalidate>
          ${elig.allowed ? '' : `<p class="callout warn small"><strong>Perlu keputusan manual.</strong> ${elig.reasons.map(esc).join(' ')}</p>`}
          <div class="field"><span class="label">Jenis imbal hasil</span><div class="scale">
               <label><input type="radio" name="basis" value="principal" checked><span>Bunga flat</span></label>
               <label><input type="radio" name="basis" value="net_profit"><span>Bagi hasil laba</span></label></div></div>
          <div class="field"><span class="label">Jumlah</span><div class="choices">${opts.amounts.map((a) => `<label class="choice"><input type="radio" name="amount" value="${a.value}" ${a.value === rec.amount ? 'checked' : ''}><span>${rpShort(a.value)}<small>${esc(a.tag)}</small></span></label>`).join('')}</div></div>
          <div class="field" data-principal><span class="label">Bunga flat per tahun</span><div class="choices">${opts.rates.map((r) => `<label class="choice"><input type="radio" name="rate" value="${r.value}" ${r.value === rec.rate ? 'checked' : ''}><span>${pct(r.value, 2)}<small>${esc(r.tag)}</small></span></label>`).join('')}</div></div>
          <div class="field" data-profit hidden><label for="of-share">Porsi bagi hasil dari laba bersih (%)</label><input id="of-share" name="share" type="number" min="1" max="100" step="1" value="30"></div>
          <div data-preview aria-live="polite"></div>
          <div class="field" data-override hidden><label class="check" style="border:0"><input type="checkbox" name="force"><span>Saya mengambil keputusan manual atas risiko ini</span></label>
               <label for="of-reason">Alasan keputusan manual</label><textarea id="of-reason" name="reason" placeholder="Misal: kontrak katering kantor terverifikasi 24 bulan"></textarea></div>
          <div class="field"><label for="of-note">Pesan untuk pemohon (opsional)</label><textarea id="of-note" name="note"></textarea></div>
          <div class="actions"><button class="btn btn-primary" type="submit">Kirim penawaran</button>
               <button class="btn" type="button" data-act="request_fix">Minta perbaikan</button>
               <button class="btn btn-danger" type="button" data-act="reject">Tolak</button>
               ${d.intake?.gate?.pass ? '' : '<button class="btn btn-quiet" type="button" data-act="decide">Putuskan tanpa penawaran</button>'}</div>
     </form>`, { sub: `Saran: ${rpShort(rec.amount)} · ${pct(rec.rate, 2)}` });
}

/* ---- perilaku ---- */
function selection(form) {
     const v = Object.fromEntries(new FormData(form));
     const basis = v.basis;
     return { basis, amount: Number(v.amount), rate: basis === 'net_profit' ? 0 : Number(v.rate), share_ratio: basis === 'net_profit' ? Number(v.share) / 100 : null };
}

function bindReview(main, d, ctx) {
     const id = d.id;
     const refresh = () => ctx.refresh();
     main.querySelectorAll('[data-verify]').forEach((el) => el.addEventListener('change', () => {
          try { A.setDocumentVerified(id, el.dataset.verify, el.checked); paintProgress(main, id); } catch (err) { toast(err.message, 'bad'); el.checked = !el.checked; }
     }));
     main.querySelectorAll('[data-audit]').forEach((el) => el.addEventListener('change', () => {
          try { A.setAuditCheck(id, el.dataset.audit, el.dataset.key, el.checked); paintProgress(main, id); } catch (err) { toast(err.message, 'bad'); el.checked = !el.checked; }
     }));
     main.querySelectorAll('[data-audit-note]').forEach((el) => el.addEventListener('change', () => {
          try { A.setAuditNote(id, el.dataset.auditNote, el.value); toast('Catatan tersimpan.'); } catch (err) { toast(err.message, 'bad'); }
     }));
     main.querySelectorAll('[data-score]').forEach((el) => el.addEventListener('change', () => {
          try { A.setAuditScore(id, el.dataset.score, el.value); paintProgress(main, id); } catch (err) { toast(err.message, 'bad'); }
     }));
     main.querySelectorAll('[data-bulk]').forEach((btn) => btn.addEventListener('click', () => {
          const sec = btn.dataset.bulk;
          const boxes = [...main.querySelectorAll(sec === 'docs' ? '[data-verify]' : `[data-audit="${sec}"]`)].filter((el) => !el.disabled && !el.checked);
          try {
               for (const el of boxes) {
                    if (sec === 'docs') A.setDocumentVerified(id, el.dataset.verify, true);
                    else A.setAuditCheck(id, sec, el.dataset.key, true);
                    el.checked = true;
               }
               paintProgress(main, id);
               toast(boxes.length ? `${boxes.length} butir ditandai.` : 'Semua butir sudah tercentang.');
               track('bulk_check', { sec, n: boxes.length });
          } catch (err) { toast(err.message, 'bad'); }
     }));
     main.querySelectorAll('[data-jump]').forEach((btn) => btn.addEventListener('click', () => {
          const el = main.querySelector(`#sec-${btn.dataset.jump}`);
          el?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
          el?.querySelector('input:not([disabled]), button')?.focus({ preventScroll: true });
     }));
     main.querySelectorAll('[data-open]').forEach((el) => el.addEventListener('click', async () => {
          await busy(el, async () => {
               const bytes = await A.readAttachment(id, el.dataset.open);
               const doc = d.documents.find((x) => x.id === el.dataset.open);
               const url = URL.createObjectURL(new Blob([bytes], { type: doc.type || 'application/octet-stream' }));
               const w = window.open(url, '_blank', 'noopener');
               if (!w) toast('Browser memblokir jendela baru. Izinkan pop-up untuk melihat berkas.', 'warn');
               setTimeout(() => URL.revokeObjectURL(url), 60_000);
          }, { fail: 'Berkas tidak dapat dibuka' });
     }));

     main.querySelectorAll('[data-act]').forEach((btn) => btn.addEventListener('click', async () => {
          const kind = btn.dataset.act;
          const cfg = {
               verify: { title: 'Verifikasi & hitung penilaian?', message: 'Lembar audit akan dikunci lalu skor, peringkat, dan saran plafon dihitung.', confirm: 'Verifikasi', note: auditProgressOf(d).complete ? null : { label: 'Justifikasi (audit belum lengkap)', required: true } },
               request_fix: { title: 'Minta perbaikan ke pemohon', confirm: 'Kirim permintaan', note: { label: 'Apa yang perlu diperbaiki?', required: true, placeholder: 'Misal: lampirkan rekening koran 6 bulan terakhir' } },
               reject: { title: 'Tolak pengajuan?', message: 'Pemohon akan melihat pengajuan ditutup beserta alasan Anda.', confirm: 'Tolak pengajuan', danger: true, note: { label: 'Alasan penolakan', required: true } },
               reassess: { title: 'Buka ulang penilaian?', message: 'Status kembali ke Terverifikasi agar audit dapat diubah dan dinilai ulang. Hasil lama disimpan di riwayat.', confirm: 'Buka ulang', note: { label: 'Alasan', required: false } },
               decide: { title: 'Putuskan tanpa penawaran?', message: d.intake?.gate?.auto_reject ? 'Pengajuan di zona tolak otomatis; keputusan ini dicatat sebagai keputusan manual.' : 'Keputusan dicatat sesuai hasil mesin.', confirm: 'Putuskan', note: { label: 'Justifikasi', required: !!d.intake?.gate?.auto_reject } }
          }[kind];
          const out = await confirmSheet(cfg);
          if (!out) return;
          if (kind === 'verify') {
               const res = await busy(btn, () => A.verifyAndScore(id, out.note), { fail: 'Belum bisa diverifikasi' });
               if (res) { toast(res.warning || (res.to === 'scored' ? 'Penilaian selesai.' : 'Pengajuan terverifikasi.'), res.warning ? 'warn' : 'ok', 5000); track('review_scored'); window.scrollTo(0, 0); refresh(); }
               return;
          }
          const decisionValue = kind === 'decide' ? (d.result?.decision?.decision || 'REVIEW') : undefined;
          const res = await busy(btn, () => A.lenderAction(id, kind, { note: out.note, decision: decisionValue, force: kind === 'decide' && !!d.intake?.gate?.auto_reject }), {
               ok: { request_fix: 'Permintaan perbaikan terkirim ke pemohon.', reject: 'Pengajuan ditolak.', reassess: 'Penilaian dibuka ulang.', decide: 'Keputusan tercatat.' }[kind], fail: 'Gagal'
          });
          if (res !== undefined) { track('review_action', { kind }); window.scrollTo(0, 0); refresh(); }
     }));

     main.querySelector('[data-prepare]')?.addEventListener('click', async (e) => {
          const fac = await busy(e.currentTarget, () => A.prepareFacility(id), { ok: 'Fasilitas disiapkan. Lengkapi syarat pencairan.', fail: 'Gagal' });
          if (fac) location.hash = `#/nasabah/${encodeURIComponent(fac.id)}?bagian=fasilitas`;
     });
     main.querySelector('[data-save-improve]')?.addEventListener('click', (e) => {
          busy(e.currentTarget, () => A.sendImprovementNote(id, main.querySelector('[data-improve]').value), { ok: 'Catatan perbaikan terkirim ke pemohon.', fail: 'Gagal' });
     });

     const form = main.querySelector('[data-offer]');
     if (!form) return;
     const borrower = applyAuditToBorrower(d.borrower, d.audit);
     const preview = () => {
          const sel = selection(form);
          form.querySelector('[data-principal]').hidden = sel.basis !== 'principal';
          form.querySelector('[data-profit]').hidden = sel.basis !== 'net_profit';
          const box = form.querySelector('[data-preview]');
          try {
               const chk = assessOffer({ result: d.result, gate: d.intake?.gate, borrower, ...sel });
               const a = chk.assessment;
               box.innerHTML = `<div class="callout ${chk.allowed ? 'ok' : 'warn'}" style="margin-bottom:12px"><strong>${chk.allowed ? 'Lolos pemeriksaan otomatis' : 'Perlu keputusan manual'}</strong>
                    <p class="small" style="margin:4px 0 0">Uang usaha ${chk.dscr.toFixed(2)}× cicilan (target ${chk.target.toFixed(2)}×)${a.ltv === null ? '' : ` · pinjaman ${pct(a.ltv, 0)} dari jaminan`}${a.grade ? ` · peringkat struktur ${esc(a.grade)}` : ''}</p>
                    ${a.reasons.length ? `<ul class="small">${a.reasons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
                    ${a.sizing?.recommended > 0 && sel.amount !== a.sizing.recommended ? `<p class="small">Jumlah yang pas untuk syarat ini: <strong>${rp(a.sizing.recommended)}</strong></p>` : ''}</div>
                    ${offerTermsHtml({ ...sel, terms: chk.terms, expected_profit_monthly: chk.expected_profit_monthly })}`;
               form.querySelector('[data-override]').hidden = chk.allowed;
          } catch (err) {
               box.innerHTML = `<p class="callout bad small">${esc(err.message)}</p>`;
               form.querySelector('[data-override]').hidden = false;
          }
     };
     form.addEventListener('change', preview);
     form.addEventListener('input', (e) => { if (e.target.name === 'share') preview(); });
     preview();
     form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const sel = selection(form);
          const v = Object.fromEntries(new FormData(form));
          const ok = await confirmSheet({ title: 'Kirim penawaran ke pemohon?', message: `${rp(sel.amount)} · ${sel.basis === 'net_profit' ? `bagi hasil ${pct(sel.share_ratio, 0)}` : `bunga flat ${pct(sel.rate, 2)}`}. Berlaku 14 hari.`, confirm: 'Kirim' });
          if (!ok) return;
          const res = await busy(e.submitter, () => A.lenderAction(id, 'offer', { ...sel, note: v.note || '', force: v.force === 'on', overrideReason: v.reason || '' }), { ok: 'Penawaran terkirim. Pemohon dapat menerima atau menolak.', fail: 'Penawaran belum terkirim' });
          if (res !== undefined) { track('offer_sent', { manual: v.force === 'on' }); refresh(); }
     });
}

const auditProgressOf = (d) => auditProgress(d.audit, { borrower: d.borrower, documents: d.documents });
