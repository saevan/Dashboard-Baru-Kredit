/**
 * pages/more.js — Portofolio dan menu "Lainnya" petugas:
 * Analisis manual · Panduan 5C · Pengaturan (kebijakan, profil, benchmark,
 * data & cadangan, statistik penggunaan) · Tim.
 */

import * as core from '../../services/core.js';
import * as P from '../../services/portfolio.js';
import { demoBuSari } from '../../services/demo.js';
import { emptyBorrower } from '../../core/engine.js';
import { PILLARS, PILLAR_LABELS, PROFILE_RULES, RATIO_META, HARD_RULE_DEFS, SCORE_SCALE_GUIDE, COMPONENT_DEFS } from '../../core/config.js';
import { FIVE_C_DEFS, COMPONENT_TO_C } from '../../core/five-c.js';
import { AUDIT_SCORE_OPTIONS, interviewGroups } from '../../core/audit.js';
import { inspectAttachment, FILE_ACCEPT } from '../../core/attachments.js';
import { getBenchmark } from '../../core/benchmark.js';
import { loadBenchmarkOverrides, setBenchmarkOverride, removeBenchmarkOverride, clearBenchmarkOverrides } from '../../data/storage.js';
import { clearAttachmentStorage } from '../../data/attachments.js';
import { SECTOR_OPTIONS, PROFILE_OPTIONS, COLLATERAL_OPTIONS, SCHEME_OPTIONS, PERIOD_OPTIONS, FINANCE_FIELDS, parseAmount } from '../../services/labels.js';
import { esc, rp, rpShort, pct, num, date, card, answer, rows, pill, kpi, empty, field, options, choices, toast, confirmSheet, busy, track, usage, clearUsage, fileBytes, prefs, setPref } from '../ui.js';
import { seedDemo } from './lender.js';
import { EWS_WORD } from './customers.js';

const MORE = [{ label: 'Lainnya', href: '#/lainnya' }];

/* ========================================================= PORTOFOLIO ==== */

export function portfolio(main, params, ctx) {
     const r = P.portfolioReport();
     const t = r.totals || {};
     const detail = params.lengkap === '1' || prefs().detail === 'lengkap';
     if (!t.facilities) {
          main.innerHTML = `<div class="page-head"><div><h1>Portofolio</h1></div></div>${card('', empty('Belum ada pinjaman berjalan', 'Portofolio terisi setelah fasilitas dicairkan.', '<button class="btn btn-primary" data-seed>Muat data contoh</button>'))}`;
          main.querySelector('[data-seed]').addEventListener('click', (e) => seedDemo(e.currentTarget, ctx));
          return { title: 'Portofolio' };
     }
     const nplTone = r.npl.gross_ratio >= 0.05 ? 'bad' : r.npl.gross_ratio >= 0.03 ? 'warn' : 'ok';
     const watch = r.watchlist || [];
     main.innerHTML = `
     <div class="page-head"><div><h1>Portofolio</h1><p>${t.active} pinjaman berjalan · ${t.borrowers} debitur</p></div>
          <div class="scale" role="radiogroup" aria-label="Tingkat detail"><label><input type="radio" name="lvl" value="sederhana" ${detail ? '' : 'checked'}><span>Sederhana</span></label><label><input type="radio" name="lvl" value="lengkap" ${detail ? 'checked' : ''}><span>Lengkap</span></label></div></div>
     ${answer({ eyebrow: 'Kesehatan portofolio', title: r.npl.gross_ratio >= 0.05 ? 'Kredit bermasalah di atas batas 5%' : watch.length ? `${watch.length} pinjaman perlu diawasi` : 'Portofolio sehat', text: `Kredit bermasalah (NPL) ${pct(r.npl.gross_ratio, 2)} dari ${rpShort(t.exposure)} pinjaman beredar.`, tone: watch.length && nplTone === 'ok' ? 'warn' : nplTone })}
     <div class="kpis" style="margin:14px 0">${kpi('Pinjaman beredar', rpShort(t.exposure))}${kpi('NPL', pct(r.npl.gross_ratio, 2))}${kpi('Cadangan (CKPN)', rpShort(r.provision?.ckpn_total))}${kpi('Konsentrasi sektor', esc(r.concentration?.status || '—'))}</div>
     <div class="grid grid-2">
          ${card('Per kolektibilitas', `<div class="table-wrap"><table><thead><tr><th>Tingkat</th><th class="r">Jumlah</th><th class="r">Pinjaman</th><th class="r">Porsi</th></tr></thead><tbody>${r.by_collectibility.map((c) => `<tr><td>${esc(c.label)} ${c.is_npl ? pill('NPL', 'bad') : ''}</td><td class="r">${c.count}</td><td class="r">${rpShort(c.exposure)}</td><td class="r">${pct(c.share, 0)}</td></tr>`).join('')}</tbody></table></div>`, { level: 3 })}
          ${card('Perlu diawasi', watch.length ? `<ul class="list">${watch.map((w) => `<li><div class="main"><a href="#/nasabah/${encodeURIComponent(w.id)}">${esc(w.nama)}</a><div class="meta">${rpShort(w.outstanding)} · telat ${num(w.days_late)} hari · ${esc(w.collectibility_label)}</div></div>${pill(EWS_WORD[w.ews_level]?.[0] || w.ews_level, EWS_WORD[w.ews_level]?.[1] || '')}</li>`).join('')}</ul>` : '<p class="muted">Tidak ada.</p>', { level: 3 })}
     </div>
     ${detail ? `<div class="grid grid-2" style="margin-top:14px">
          ${card('Cadangan kerugian (PSAK 71)', `<div class="table-wrap"><table><thead><tr><th>Tahap</th><th class="r">Jumlah</th><th class="r">Eksposur</th><th class="r">CKPN</th></tr></thead><tbody>${(r.ecl?.by_stage || []).map((s) => `<tr><td>${esc(s.label)}</td><td class="r">${s.count}</td><td class="r">${rpShort(s.exposure)}</td><td class="r">${rpShort(s.ecl)}</td></tr>`).join('')}</tbody></table></div>${rows([['PPKA minimum (POJK 40)', rp(r.provision?.total)], ['Kekurangan cadangan', rp(r.provision?.shortfall)]])}`, { level: 3 })}
          ${card('Modal regulasi (ATMR)', rows([['EAD', rp(r.rwa?.ead)], ['ATMR', rp(r.rwa?.rwa)], ['Kepadatan ATMR', pct(r.rwa?.density, 1)], ['Modal minimum', rp(r.rwa?.capital_min)], ['Modal + buffer', rp(r.rwa?.capital_with_buffer)], ['Expected loss', rp(r.loss?.el_total)], ['Unexpected loss', rp(r.loss?.ul_total)]]), { level: 3 })}
          ${card('Konsentrasi sektor', `${rows([['Indeks HHI', num(r.concentration?.hhi, 3)], ['Ambang waspada', num(r.concentration?.hhi_alert, 2)]])}<ul class="list">${(r.concentration?.by_sector || []).map((s) => `<li><span>${esc(s.label)}</span><span>${pct(s.share, 0)} · ${rpShort(s.exposure)}</span></li>`).join('')}</ul>`, { level: 3 })}
          ${card('Perpindahan kolektibilitas', rows([['Membaik', r.migration?.upgrades], ['Memburuk', r.migration?.downgrades], ['Tetap', r.migration?.stable], ['Belum ada riwayat', r.migration?.no_history]]) + (r.restructured?.length ? `<p class="small">${r.restructured.length} fasilitas dalam masa tunggu keringanan.</p>` : '') + (r.contagion?.facilities ? `<p class="small">${r.contagion.facilities} fasilitas disesuaikan aturan satu debitur.</p>` : ''), { level: 3 })}
     </div>` : '<p class="small muted" style="margin-top:12px">Pilih <strong>Lengkap</strong> untuk melihat CKPN, PPKA, ATMR, konsentrasi, dan migrasi.</p>'}`;
     main.querySelectorAll('[name=lvl]').forEach((el) => el.addEventListener('change', () => { setPref('detail', el.value); location.hash = el.value === 'lengkap' ? '#/portofolio?lengkap=1' : '#/portofolio'; }));
     return { title: 'Portofolio' };
}

/* ============================================================ LAINNYA ==== */

export function menu(main) {
     const items = [
          ['#/analisis', 'Analisis manual', 'Nilai calon nasabah tanpa pengajuan online, langsung dari data yang Anda masukkan.'],
          ['#/panduan', 'Panduan 5C', 'Cara mesin menilai: 5C, 6 bagian, aturan, dan skala skor.'],
          ['#/pengaturan', 'Pengaturan', 'Bobot penilaian, aturan kebijakan, benchmark sektor, cadangan data, statistik penggunaan.'],
          ['#/tim', 'Tim', 'Anggota petugas yang bisa masuk ke dashboard ini.']
     ];
     main.innerHTML = `<div class="page-head"><div><h1>Lainnya</h1></div></div>
          <div class="grid grid-2">${items.map(([h, t, d]) => `<a class="card" href="${h}" style="text-decoration:none;color:inherit"><h2>${esc(t)} →</h2><p class="muted" style="margin:0">${esc(d)}</p></a>`).join('')}</div>`;
     return { title: 'Lainnya' };
}

/* ==================================================== ANALISIS MANUAL ==== */

let manualDraft = null;

export function manual(main, params) {
     manualDraft ??= emptyBorrower();
     const b = manualDraft;
     const scoreSel = (key) => `<select id="q-${key}" name="bm.${key}">${AUDIT_SCORE_OPTIONS.map((o) => `<option value="${o.value}"${Math.abs(Number(b.bisnis_manajemen[key]) - o.value) < 0.13 ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
     main.innerHTML = `<div class="page-head"><div><h1>Analisis manual</h1><p>Hasil disimpan sebagai nasabah dan bisa dihitung ulang kapan saja.</p></div><button class="btn btn-quiet" data-example>Isi contoh Bu Sari</button></div>
     <form data-manual novalidate class="stack">
          ${card('Usaha & pinjaman', `<div class="form-grid">
               ${field({ id: 'm-nama', label: 'Nama usaha', control: `<input id="m-nama" name="nama" type="text" value="${esc(b.nama)}" required>` })}
               ${field({ id: 'm-sektor', label: 'Bidang usaha', control: `<select id="m-sektor" name="sektor">${options(SECTOR_OPTIONS, b.sektor, 'Pilih bidang')}</select>` })}
               ${field({ id: 'm-profil', label: 'Profil usaha', control: `<select id="m-profil" name="profil_company">${options(PROFILE_OPTIONS, b.profil_company)}</select>` })}
               ${field({ id: 'm-plafon', label: 'Jumlah pinjaman', hint: 'Contoh: 400 jt', control: `<input id="m-plafon" name="plafon_diajukan" type="text" inputmode="decimal" value="${b.plafon_diajukan ? esc(b.plafon_diajukan.toLocaleString('id-ID')) : ''}">` })}
               ${field({ id: 'm-tenor', label: 'Lama (bulan)', control: `<input id="m-tenor" name="tenor_bulan" type="number" min="1" max="120" value="${esc(b.tenor_bulan)}">` })}
               ${field({ id: 'm-bunga', label: 'Bunga per tahun (%)', control: `<input id="m-bunga" name="bunga" type="number" step="0.25" value="${esc(+(b.bunga_tahunan * 100).toFixed(2))}">` })}
               ${field({ id: 'm-skema', label: 'Skema cicilan', control: `<select id="m-skema" name="skema_angsuran">${options(SCHEME_OPTIONS, b.skema_angsuran)}</select>` })}
               ${field({ id: 'm-periode', label: 'Cicil setiap', control: `<select id="m-periode" name="periode_angsuran">${options(PERIOD_OPTIONS, b.periode_angsuran, 'Sesuai saran')}</select>` })}
               ${field({ id: 'm-grace', label: 'Masa tenggang (bulan)', control: `<input id="m-grace" name="grace_period_bulan" type="number" min="0" value="${esc(b.grace_period_bulan || 0)}">` })}
               ${field({ id: 'm-tujuan', label: 'Tujuan', control: `<input id="m-tujuan" name="tujuan_kredit" type="text" value="${esc(b.tujuan_kredit || '')}">` })}
          </div>`)}
          ${card('Laporan keuangan (setahun)', `<div class="drop" style="padding:14px;margin-bottom:12px"><label class="btn btn-sm">Isi dari berkas laporan<input type="file" accept="${FILE_ACCEPT}" data-mfile class="sr-only"></label> <span class="small muted" data-mfile-status aria-live="polite"></span></div>
               <div class="form-grid">${FINANCE_FIELDS.map((f) => `<div class="field"><label for="mk-${f.key}">${esc(f.label)}</label><input id="mk-${f.key}" name="k.${f.key}" type="text" inputmode="decimal" value="${b.keuangan[f.key] === null || b.keuangan[f.key] === undefined ? '' : esc(Number(b.keuangan[f.key]).toLocaleString('id-ID'))}"></div>`).join('')}
               ${field({ id: 'mk-arrears', label: 'Tunggakan berjalan (hari)', control: `<input id="mk-arrears" name="arrears_days" type="number" min="0" value="${esc(b.keuangan.arrears_days || 0)}">` })}
               ${field({ id: 'mk-ocfneg', label: 'Arus kas negatif berturut-turut (periode)', control: `<input id="mk-ocfneg" name="ocf_negatif_periode" type="number" min="0" value="${esc(b.keuangan.ocf_negatif_periode || 0)}">` })}</div>`)}
          ${card('Penilaian kualitatif', interviewGroups().map((g) => `<h3>${esc(g.label)}</h3><div class="form-grid">${g.items.map((q) => field({ id: `q-${q.key}`, label: q.label, hint: q.help, control: scoreSel(q.key) })).join('')}</div>`).join('') + `<div class="form-grid">
               ${field({ id: 'm-track', label: 'Lama usaha berjalan (tahun)', control: `<input id="m-track" name="bm.track_record_tahun" type="number" min="0" value="${esc(b.bisnis_manajemen.track_record_tahun ?? '')}">` })}
               ${field({ id: 'm-runway', label: 'Kas cukup untuk (bulan)', control: `<input id="m-runway" name="bm.cash_runway_bulan" type="number" min="0" value="${esc(b.bisnis_manajemen.cash_runway_bulan ?? '')}">` })}</div>`)}
          ${card('Jaminan & utang lain', `<div class="form-grid">
               ${field({ id: 'm-ag', label: 'Jenis jaminan', control: `<select id="m-ag" name="ag.jenis">${options(COLLATERAL_OPTIONS, b.agunan.jenis, 'Tanpa jaminan')}</select>` })}
               ${field({ id: 'm-agv', label: 'Nilai jaminan', control: `<input id="m-agv" name="ag.nilai_agunan" type="text" inputmode="decimal" value="${b.agunan.nilai_agunan ? esc(Number(b.agunan.nilai_agunan).toLocaleString('id-ID')) : ''}">` })}
               <label class="check span-2"><input type="checkbox" name="ag.personal_guarantee" ${b.agunan.personal_guarantee ? 'checked' : ''}><span>Ada jaminan pribadi pemilik (personal guarantee)</span></label>
               ${field({ id: 'm-debt', label: 'Cicilan utang lain per bulan', hint: 'Total angsuran pinjaman lain yang sedang berjalan', control: `<input id="m-debt" name="utang_bulanan" type="text" inputmode="decimal" value="${esc((b.utang_eksisting?.[0]?.angsuran_bulanan || '').toLocaleString?.('id-ID') || '')}">` })}
          </div>`)}
          <div class="actions"><button class="btn btn-primary" type="submit">Hitung &amp; simpan</button><button class="btn" type="button" data-reset>Kosongkan</button></div>
     </form>`;
     const form = main.querySelector('[data-manual]');
     const collect = () => {
          const v = Object.fromEntries(new FormData(form));
          const n = (x) => (x === '' || x === undefined ? null : Number(x));
          Object.assign(b, { nama: v.nama.trim(), sektor: v.sektor, profil_company: v.profil_company, plafon_diajukan: parseAmount(v.plafon_diajukan), tenor_bulan: n(v.tenor_bulan), bunga_tahunan: n(v.bunga) === null ? null : n(v.bunga) / 100, skema_angsuran: v.skema_angsuran, periode_angsuran: v.periode_angsuran, grace_period_bulan: n(v.grace_period_bulan) || 0, tujuan_kredit: v.tujuan_kredit });
          for (const f of FINANCE_FIELDS) b.keuangan[f.key] = parseAmount(v[`k.${f.key}`]);
          b.keuangan.arrears_days = n(v.arrears_days) || 0;
          b.keuangan.ocf_negatif_periode = n(v.ocf_negatif_periode) || 0;
          for (const [k, val] of Object.entries(v)) if (k.startsWith('bm.')) b.bisnis_manajemen[k.slice(3)] = n(val);
          b.agunan = { ...b.agunan, jenis: v['ag.jenis'] || '', nilai_agunan: parseAmount(v['ag.nilai_agunan']), personal_guarantee: !!form.querySelector('[name="ag.personal_guarantee"]').checked };
          const debt = parseAmount(v.utang_bulanan);
          b.utang_eksisting = debt ? [{ nama: 'Utang lain', angsuran_bulanan: debt }] : [];
     };
     form.addEventListener('submit', async (e) => {
          e.preventDefault();
          collect();
          const missing = [!b.nama && 'nama usaha', !b.sektor && 'bidang usaha', !(b.plafon_diajukan > 0) && 'jumlah pinjaman', ...FINANCE_FIELDS.filter((f) => f.min && b.keuangan[f.key] === null).map((f) => f.label.toLowerCase())].filter(Boolean);
          if (missing.length) return toast(`Lengkapi: ${missing.join(', ')}.`, 'warn', 6000);
          const out = await busy(e.submitter, () => P.saveManualAnalysis({ ...b }), { ok: 'Analisis selesai dan disimpan.', fail: 'Gagal menghitung' });
          if (out) { manualDraft = null; track('manual_analysis'); location.hash = `#/nasabah/${encodeURIComponent(out.id)}?bagian=analisis`; }
     });
     main.querySelector('[data-example]').addEventListener('click', () => { manualDraft = demoBuSari(); manual(main, params); toast('Contoh Bu Sari diisi.'); });
     main.querySelector('[data-reset]').addEventListener('click', () => { manualDraft = emptyBorrower(); manual(main, params); });
     main.querySelector('[data-mfile]').addEventListener('change', async (e) => {
          const file = e.target.files[0];
          if (!file) return;
          const status = main.querySelector('[data-mfile-status]');
          status.textContent = 'Membaca…';
          try {
               const meta = await inspectAttachment(await fileBytes(file), file.name, 'laporan_keuangan');
               const cand = meta.extraction?.candidates || [];
               if (!cand.length) { status.textContent = meta.extraction?.message || 'Angka belum terbaca.'; return; }
               collect();
               const pickIdx = cand.length > 1 ? cand.reduce((best, c, i) => (Number(c.period) > Number(cand[best].period) ? i : best), 0) : 0;
               Object.assign(b.keuangan, cand[pickIdx].keuangan);
               manual(main, params);
               toast(`${Object.keys(cand[pickIdx].keuangan).length} angka diisi dari ${file.name}${cand.length > 1 ? ` (${cand[pickIdx].label})` : ''}.`);
          } catch (err) { status.textContent = err.message; }
     });
     return { title: 'Analisis manual', crumbs: [...MORE, { label: 'Analisis manual' }] };
}

/* ======================================================== PANDUAN 5C ==== */

export function guide(main) {
     const comps = (c) => COMPONENT_DEFS.filter((d) => COMPONENT_TO_C[d.key] === c).map((d) => d.label);
     main.innerHTML = `<div class="page-head"><div><h1>Panduan penilaian</h1><p>Bagaimana mesin MEZS.id menilai sebuah usaha.</p></div></div>
     ${answer({ eyebrow: 'Singkatnya', title: 'Skor 0–100 dari 5C → keputusan + peringkat', text: 'Setiap usaha dinilai dari 5 sisi (5C). Skor akhir menentukan keputusan dan peringkat gaya PEFINDO, lalu aturan kebijakan (misalnya kemampuan bayar minimum) dapat menurunkan keputusan.', tone: 'info' })}
     <div class="grid grid-2" style="margin-top:14px">${FIVE_C_DEFS.map((c) => card(`${c.ico} ${c.id} (${c.name})`, `<p>${esc(c.desc)}</p><p class="small muted">Bobot ${pct(c.weight, 0)} · dinilai dari: ${comps(c.key).map(esc).join(', ')}</p>`, { level: 3 })).join('')}</div>
     ${card('Aturan kebijakan', `<ul class="list">${HARD_RULE_DEFS.map((r) => `<li><div class="main"><strong>${esc(r.label)}</strong><div class="meta">${esc(r.description)}</div></div>${pill(r.enforcement === 'hard' ? 'Wajib — gagal = belum layak' : r.enforcement === 'soft' ? 'Batas — maksimal ditinjau' : 'Dicatat saja', r.enforcement === 'hard' ? 'bad' : r.enforcement === 'soft' ? 'warn' : 'plain')}</li>`).join('')}</ul>`)}
     ${card('Skala penilaian wawancara', rows(SCORE_SCALE_GUIDE.map((s) => [`${s.label} (${s.range})`, esc(s.note)])))}
     ${card('Keputusan', rows([['Layak dibiayai', 'Skor tinggi dan semua aturan terpenuhi'], ['Layak dengan syarat', 'Layak dengan janji kredit (covenant)'], ['Perlu ditinjau', 'Skor di tengah atau ada batas yang terlampaui'], ['Belum layak', 'Skor rendah atau aturan wajib gagal']]) + '<p class="small muted">Peringkat adalah model internal MEZS.id, bukan rating resmi PEFINDO.</p>')}`;
     return { title: 'Panduan 5C', crumbs: [...MORE, { label: 'Panduan 5C' }] };
}

/* ========================================================= PENGATURAN ==== */

const SET_TABS = [
     { key: 'kebijakan', label: 'Kebijakan' },
     { key: 'profil', label: 'Profil usaha' },
     { key: 'benchmark', label: 'Benchmark sektor' },
     { key: 'data', label: 'Data & cadangan' },
     { key: 'statistik', label: 'Statistik penggunaan' }
];
const BENCH_FIELDS = ['p01', 'p10', 'p25', 'median', 'p75', 'p90', 'p99', 'mean'];

function setPath(obj, path, value) {
     const parts = path.split('.');
     let cur = obj;
     for (let i = 0; i < parts.length - 1; i++) { if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] === null) cur[parts[i]] = {}; cur = cur[parts[i]]; }
     cur[parts.at(-1)] = value;
}

const numField = (path, label, value, { step = '0.01', div = 1, hint = '' } = {}) => {
     const v = value === undefined || value === null || value === '' ? '' : String(div === 1 ? value : Math.round(Number(value) * div * 1000) / 1000);
     const id = `s-${path.replace(/\./g, '-')}`;
     return `<div class="field"><label for="${id}">${esc(label)}</label>${hint ? `<p class="hint">${esc(hint)}</p>` : ''}<input id="${id}" type="number" step="${step}" data-num="${esc(path)}" data-div="${div}" value="${esc(v)}"></div>`;
};

/** Kumpulkan isian → patch pengaturan (collect lama). */
function collectSettings(root) {
     const out = {};
     root.querySelectorAll('[data-num]').forEach((el) => {
          if (el.value === '') return;
          let v = Number(el.value);
          if (Number.isNaN(v)) return;
          const div = Number(el.dataset.div || 1);
          if (div !== 1) v /= div;
          setPath(out, el.dataset.num, v);
     });
     if (out.profiles) {
          for (const key of Object.keys(out.profiles)) {
               const base = core.COMPANY_PROFILES[key] || {};
               const q = out.profiles[key].quanti;
               if (q === undefined || q === null) { delete out.profiles[key]; continue; }
               out.profiles[key] = { ...base, quanti: q, quali: Math.max(0, Math.round((1 - q) * 1000) / 1000) };
          }
     }
     return out;
}

export function settings(main, params, ctx) {
     const tab = SET_TABS.some((t) => t.key === params.tab) ? params.tab : 'kebijakan';
     const cfg = core.getConfig();
     const body = { kebijakan: () => policyTab(cfg), profil: () => profileTab(cfg), benchmark: benchTab, data: dataTab, statistik: statsTab }[tab]();
     main.innerHTML = `<div class="page-head"><div><h1>Pengaturan</h1><p>Perubahan kebijakan berlaku untuk penilaian berikutnya; hasil lama tidak berubah sampai dihitung ulang.</p></div></div>
     <nav class="tabs" aria-label="Bagian pengaturan">${SET_TABS.map((t) => `<a href="#/pengaturan?tab=${t.key}"${t.key === tab ? ' aria-current="page"' : ''}>${esc(t.label)}</a>`).join('')}</nav>
     <div data-settings>${body}</div>`;
     bindSettings(main, tab, ctx);
     return { title: 'Pengaturan', crumbs: [...MORE, { label: 'Pengaturan' }, { label: SET_TABS.find((t) => t.key === tab).label }] };
}

function policyTab(cfg) {
     const hr = cfg.hardRules;
     return `<form data-policy class="stack" novalidate>
          ${card('Bobot 6 bagian penilaian', `<div class="form-grid">${PILLARS.map((k) => numField(`pillarWeights.${k}`, PILLAR_LABELS[k], cfg.pillarWeights[k], { step: 1, div: 100 })).join('')}</div><p class="small" data-sum aria-live="polite"></p>`)}
          ${card('Batas skor keputusan (0–100)', `<div class="form-grid">${numField('thresholds.layak', 'Layak dibiayai mulai', cfg.thresholds.layak, { step: 1 })}${numField('thresholds.layak_bersyarat', 'Layak dengan syarat mulai', cfg.thresholds.layak_bersyarat, { step: 1 })}${numField('thresholds.review', 'Perlu ditinjau mulai', cfg.thresholds.review, { step: 1 })}</div>`)}
          ${card('Aturan kebijakan', `<div class="form-grid">
               ${numField('hardRules.dscr_min', 'Uang usaha minimal × cicilan (DSCR)', hr.dscr_min)}${numField('hardRules.icr_min', 'Laba usaha minimal × bunga (ICR)', hr.icr_min)}
               ${numField('hardRules.dti_max', 'Cicilan maks. dari omzet (DTI)', hr.dti_max)}${numField('hardRules.ds_ratio_max', 'Cicilan maks. dari uang usaha', hr.ds_ratio_max)}
               ${numField('hardRules.ltv_max', 'Pinjaman maks. dari nilai jaminan (LTV)', hr.ltv_max, { step: '0.05' })}${numField('hardRules.ltv_max_with_guarantee', 'LTV maks. dengan jaminan pribadi', hr.ltv_max_with_guarantee, { step: '0.05' })}
               ${numField('hardRules.altman_z_distress', 'Batas risiko bangkrut (Altman Z)', hr.altman_z_distress)}${numField('hardRules.negative_ocf_periods', 'Arus kas negatif berturut-turut', hr.negative_ocf_periods, { step: 1 })}
               ${numField('hardRules.arrears_days_max', 'Tunggakan maks. (hari)', hr.arrears_days_max, { step: 1 })}</div>`)}
          ${card('Plafon, selisih sektor & peringatan dini', `<div class="form-grid">
               ${numField('nominal.dscrTarget', 'Target DSCR untuk saran plafon', cfg.nominal.dscrTarget, { step: '0.05' })}${numField('nominal.ltvMax', 'LTV maks. untuk saran plafon', cfg.nominal.ltvMax, { step: '0.05' })}
               ${numField('nominal.ltvMaxWithGuarantee', 'LTV maks. dengan jaminan pribadi', cfg.nominal.ltvMaxWithGuarantee, { step: '0.05' })}${numField('nominal.rounding', 'Pembulatan plafon (Rp)', cfg.nominal.rounding, { step: 1000000 })}
               ${numField('gap.too_far', 'Selisih terlalu jauh dari sektor (%)', cfg.gap.too_far, { step: 1, hint: 'Nilai negatif, mis. -30' })}${numField('gap.mainRatiosMinBreach', 'Min. rasio utama melanggar', cfg.gap.mainRatiosMinBreach, { step: 1 })}
               ${numField('gap.sensitivityK', 'Sensitivitas selisih (k)', cfg.gap.sensitivityK, { step: '0.1' })}${numField('ews.watchDays', 'Diawasi bila telat (hari)', cfg.ews.watchDays, { step: 1 })}
               ${numField('ews.criticalDays', 'Bermasalah bila telat (hari)', cfg.ews.criticalDays, { step: 1 })}</div>`)}
          ${card('Pratinjau dampak', '<p class="small muted">Hasil contoh Bu Sari dengan isian di atas (belum disimpan).</p><div data-impact aria-live="polite"></div>', { level: 3 })}
          <div class="actions"><button class="btn btn-primary" type="submit">Simpan pengaturan</button><button class="btn" type="button" data-reset>Kembalikan ke bawaan</button></div>
     </form>`;
}

function profileTab(cfg) {
     const over = cfg.profileRules || {};
     return `<form data-policy class="stack" novalidate>
          ${card('Porsi angka vs penilaian kualitatif', `<div class="form-grid">${core.PROFILE_LIST.map((p) => {
               const base = cfg.profiles?.[p.key] || core.COMPANY_PROFILES[p.key] || {};
               return numField(`profiles.${p.key}.quanti`, `${PROFILE_OPTIONS.find((o) => o.key === p.key)?.label || p.label} — porsi angka (%)`, base.quanti, { step: 1, div: 100, hint: base.deskripsi || 'Sisanya penilaian kualitatif' });
          }).join('')}</div>`)}
          ${core.PROFILE_LIST.map((p) => {
               const def = PROFILE_RULES[p.key] || {};
               const o = over[p.key] || {};
               const hr = { ...(def.hardRules || {}), ...(o.hardRules || {}) };
               const th = { ...(def.thresholds || {}), ...(o.thresholds || {}) };
               const cv = { ...(def.covenant || {}), ...(o.covenant || {}) };
               const nom = { ...(def.nominal || {}), ...(o.nominal || {}) };
               const k = `profileRules.${p.key}`;
               return `<details class="card more"><summary>Aturan khusus: ${esc(PROFILE_OPTIONS.find((x) => x.key === p.key)?.label || p.label)}</summary><div class="form-grid" style="margin-top:10px">
                    ${numField(`${k}.thresholds.layak`, 'Layak mulai', th.layak, { step: 1 })}${numField(`${k}.thresholds.layak_bersyarat`, 'Layak dengan syarat mulai', th.layak_bersyarat, { step: 1 })}${numField(`${k}.thresholds.review`, 'Perlu ditinjau mulai', th.review, { step: 1 })}
                    ${numField(`${k}.pdMultiplier`, 'Pengali PD', o.pdMultiplier ?? def.pdMultiplier, { step: '0.05' })}
                    ${numField(`${k}.hardRules.dscr_min`, 'DSCR minimum', hr.dscr_min)}${numField(`${k}.hardRules.icr_min`, 'ICR minimum', hr.icr_min)}${numField(`${k}.hardRules.dti_max`, 'DTI maksimum', hr.dti_max)}
                    ${numField(`${k}.hardRules.ds_ratio_max`, 'Cicilan maks. dari uang usaha', hr.ds_ratio_max)}${numField(`${k}.hardRules.ltv_max`, 'LTV maksimum', hr.ltv_max, { step: '0.05' })}${numField(`${k}.hardRules.altman_z_distress`, 'Altman Z distress', hr.altman_z_distress)}
                    ${numField(`${k}.hardRules.negative_ocf_periods`, 'Arus kas negatif (periode)', hr.negative_ocf_periods, { step: 1 })}${numField(`${k}.hardRules.arrears_days_max`, 'Tunggakan maks. (hari)', hr.arrears_days_max, { step: 1 })}
                    ${numField(`${k}.nominal.dscrTarget`, 'Target DSCR', nom.dscrTarget, { step: '0.05' })}${numField(`${k}.covenant.dscrMin`, 'Covenant DSCR min', cv.dscrMin, { step: '0.05' })}${numField(`${k}.covenant.derMax`, 'Covenant DER maks', cv.derMax, { step: '0.1' })}${numField(`${k}.covenant.reportingMaxHari`, 'Batas laporan (hari)', cv.reportingMaxHari, { step: 1 })}
               </div></details>`;
          }).join('')}
          <div class="actions"><button class="btn btn-primary" type="submit">Simpan pengaturan</button></div></form>`;
}

function benchTab() {
     const overrides = loadBenchmarkOverrides();
     const list = Object.entries(overrides).flatMap(([s, m]) => Object.entries(m || {}).map(([r, v]) => ({ s, r, v })));
     return `${card('Ubah acuan sektor', `<p class="small muted">Menimpa statistik sektor IDX untuk satu rasio. Kosongkan kolom untuk memakai nilai asli.</p>
          <form data-bench novalidate><div class="form-grid">
               ${field({ id: 'b-sector', label: 'Sektor', control: `<select id="b-sector" name="sector">${options(core.sectorOptions().map((s) => ({ key: s.key, label: SECTOR_OPTIONS.find((o) => o.key === s.key)?.label || s.label })), '')}</select>` })}
               ${field({ id: 'b-ratio', label: 'Rasio', control: `<select id="b-ratio" name="ratio">${options(Object.entries(RATIO_META).map(([k, m]) => ({ key: k, label: m.label || k })), '')}</select>` })}
               ${field({ id: 'b-dir', label: 'Arah', control: '<select id="b-dir" name="direction"><option value="">(bawaan)</option><option value="high">Makin tinggi makin baik</option><option value="low">Makin rendah makin baik</option></select>' })}
               ${BENCH_FIELDS.map((k) => field({ id: `b-${k}`, label: k, control: `<input id="b-${k}" type="number" step="0.001" data-bench-field="${k}">` })).join('')}
          </div><div class="actions"><button class="btn btn-primary" type="submit">Simpan acuan</button><button class="btn btn-danger" type="button" data-bench-clear ${list.length ? '' : 'disabled'}>Hapus semua perubahan</button></div></form>`)}
          ${card('Acuan yang diubah', list.length ? `<ul class="list">${list.map((x) => `<li><div class="main"><strong>${esc(core.sectorLabel(x.s))}</strong> · ${esc(RATIO_META[x.r]?.label || x.r)}<div class="meta">${Object.entries(x.v).map(([k, v]) => `${k}=${v}`).join(' · ')}</div></div><button class="btn btn-sm btn-quiet" data-bench-del="${esc(x.s)}|${esc(x.r)}">Hapus</button></li>`).join('')}</ul>` : '<p class="muted">Belum ada perubahan — memakai data IDX asli.</p>')}`;
}

function dataTab() {
     return `${card('Cadangan data', `<p>Semua data (pengajuan, nasabah, analisis, pemantauan, pengaturan, akun) tersimpan di browser ini. Simpan cadangan secara berkala.</p>
          <div class="actions"><button class="btn btn-primary" data-export>Unduh cadangan (.json)</button><button class="btn" data-copy>Salin cadangan ke papan klip</button></div>`)}
          ${card('Pulihkan / impor', `<p class="small muted">Menerima cadangan dari dashboard ini maupun dashboard lama (format sama). Data digabung, tidak menimpa semuanya.</p>
               <div class="actions"><label class="btn">Pilih berkas .json<input type="file" accept=".json,application/json" data-import class="sr-only"></label><button class="btn" data-seed>Muat data contoh</button></div>
               <details class="more"><summary>Tempel teks cadangan</summary><textarea data-paste aria-label="Teks cadangan JSON" style="margin-top:8px"></textarea><button class="btn btn-sm" data-paste-go style="margin-top:8px">Impor teks</button></details>`)}
          ${card('Hapus semua data', '<p>Menghapus seluruh data dan lampiran di browser ini. Tidak dapat dibatalkan.</p><button class="btn btn-danger" data-clear>Hapus semua data</button>')}`;
}

function statsTab() {
     const ev = usage();
     const count = (name) => ev.filter((e) => e.name === name).length;
     const starts = count('apply_start');
     const submits = count('apply_submit');
     const steps = [1, 2, 3, 4].map((s) => ev.filter((e) => e.name === 'apply_step' && e.step === s).length);
     const views = {};
     for (const e of ev.filter((x) => x.name === 'view')) views[e.page] = (views[e.page] || 0) + 1;
     const errors = {};
     for (const e of ev.filter((x) => x.name === 'apply_error')) errors[e.step] = (errors[e.step] || 0) + 1;
     return `${card('Statistik penggunaan (perangkat ini)', `<p class="small muted">Dicatat hanya di browser ini untuk membantu memperbaiki alur — tidak dikirim ke mana pun. ${ev.length} peristiwa sejak ${esc(date(ev[0]?.at))}.</p>
          <div class="kpis">${kpi('Formulir dimulai', starts)}${kpi('Pengajuan terkirim', submits)}${kpi('Tingkat selesai', starts ? pct(submits / starts, 0) : '—')}${kpi('Berkas diunggah', count('upload'))}</div>`)}
          <div class="grid grid-2">
               ${card('Langkah formulir dicapai', rows([['1. Usaha & pinjaman', starts], ['2. Laporan keuangan', steps[1]], ['3. Jaminan & dokumen', steps[2]], ['4. Periksa & kirim', steps[3]]]) + (Object.keys(errors).length ? `<p class="small">Paling sering tertahan: langkah ${Object.entries(errors).sort((a, b) => b[1] - a[1])[0][0]}.</p>` : ''), { level: 3 })}
               ${card('Halaman dibuka', rows(Object.entries(views).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => [k || 'masuk', v])), { level: 3 })}
               ${card('Aktivitas petugas', rows([['Penilaian selesai', count('review_scored')], ['Penawaran dikirim', count('offer_sent')], ['Pemantauan disimpan', count('monitoring')], ['Pencarian dipakai', count('search_open')], ['Simulasi bagaimana-jika', count('what_if')]]), { level: 3 })}
          </div>
          <div class="actions" style="margin-top:14px"><button class="btn" data-clear-stats>Hapus statistik</button></div>`;
}

function bindSettings(main, tab, ctx) {
     const refresh = () => ctx.refresh();
     const policy = main.querySelector('[data-policy]');
     if (policy) {
          const sample = demoBuSari();
          const word = { LAYAK: 'Layak dibiayai', LAYAK_BERSYARAT: 'Layak dengan syarat', REVIEW: 'Perlu ditinjau', TIDAK_LAYAK: 'Belum layak' };
          const before = core.analyze(sample);
          const update = () => {
               const sum = main.querySelector('[data-sum]');
               if (sum) {
                    const total = [...policy.querySelectorAll('[data-num^="pillarWeights."]')].reduce((a, el) => a + (Number(el.value) || 0), 0);
                    sum.innerHTML = `Total: <strong>${Math.round(total * 100) / 100}%</strong> ${Math.abs(total - 100) < 0.5 ? pill('Pas', 'ok') : pill('Sebaiknya 100%', 'warn')}`;
               }
               const box = main.querySelector('[data-impact]');
               if (!box) return;
               try {
                    const after = core.analyzeWithSettings(sample, collectSettings(policy));
                    box.innerHTML = rows([['Skor', `${num(before.finalScore, 1)} → <strong>${num(after.finalScore, 1)}</strong>`], ['Keputusan', `${esc(word[before.decision.decision])} → <strong>${esc(word[after.decision.decision])}</strong>`], ['Peringkat', `${esc(before.risk.pefindo.grade)} → <strong>${esc(after.risk.pefindo.grade)}</strong>`], ['Saran plafon', `${rpShort(before.nominal.recommended_nominal)} → <strong>${rpShort(after.nominal.recommended_nominal)}</strong>`]]);
               } catch (err) { box.innerHTML = `<p class="small">${esc(err.message)}</p>`; }
          };
          policy.addEventListener('input', update);
          update();
          policy.addEventListener('submit', async (e) => {
               e.preventDefault();
               const patch = collectSettings(policy);
               await busy(e.submitter, () => core.persistSettings(patch), { ok: 'Pengaturan disimpan.', fail: 'Gagal' });
               const w = patch.pillarWeights;
               if (w && Math.abs(PILLARS.reduce((a, k) => a + (w[k] || 0), 0) - 1) > 0.01) toast('Total bobot tidak 100% — mesin menormalkan otomatis.', 'warn', 5200);
               refresh();
          });
          main.querySelector('[data-reset]')?.addEventListener('click', async () => {
               if (!(await confirmSheet({ title: 'Kembalikan pengaturan bawaan?', message: 'Data nasabah dan pengajuan tidak terhapus.', confirm: 'Kembalikan', danger: true }))) return;
               core.resetSettings();
               toast('Pengaturan kembali ke bawaan.');
               refresh();
          });
     }

     const bench = main.querySelector('[data-bench]');
     if (bench) {
          const fill = () => {
               const { sector, ratio } = Object.fromEntries(new FormData(bench));
               const existing = (loadBenchmarkOverrides()[sector] || {})[ratio] || {};
               const base = getBenchmark(core.benchmarkData(), sector, ratio) || {};
               bench.querySelectorAll('[data-bench-field]').forEach((el) => {
                    const k = el.dataset.benchField;
                    const v = existing[k] ?? base[k];
                    el.value = v === undefined || v === null ? '' : String(v);
                    el.placeholder = base[k] === undefined || base[k] === null ? '' : String(base[k]);
               });
               bench.elements.direction.value = existing.direction || '';
          };
          bench.elements.sector.addEventListener('change', fill);
          bench.elements.ratio.addEventListener('change', fill);
          fill();
          bench.addEventListener('submit', (e) => {
               e.preventDefault();
               const { sector, ratio, direction } = Object.fromEntries(new FormData(bench));
               const patch = {};
               bench.querySelectorAll('[data-bench-field]').forEach((el) => { if (el.value !== '' && Number.isFinite(Number(el.value))) patch[el.dataset.benchField] = Number(el.value); });
               if (direction === 'high' || direction === 'low') patch.direction = direction;
               setBenchmarkOverride(sector, ratio, patch);
               toast('Acuan sektor disimpan.');
               refresh();
          });
          main.querySelectorAll('[data-bench-del]').forEach((b) => b.addEventListener('click', () => { const [s, r] = b.dataset.benchDel.split('|'); removeBenchmarkOverride(s, r); toast('Perubahan acuan dihapus.'); refresh(); }));
          main.querySelector('[data-bench-clear]')?.addEventListener('click', async () => {
               if (!(await confirmSheet({ title: 'Hapus semua perubahan acuan?', message: 'Benchmark kembali ke data IDX asli.', confirm: 'Hapus', danger: true }))) return;
               clearBenchmarkOverrides();
               refresh();
          });
     }

     if (tab === 'data') {
          const json = () => JSON.stringify(P.exportBackup(), null, 2);
          main.querySelector('[data-export]').addEventListener('click', () => {
               try {
                    const url = URL.createObjectURL(new Blob([json()], { type: 'application/json' }));
                    const a = Object.assign(document.createElement('a'), { href: url, download: `mezs-cadangan-${new Date().toISOString().slice(0, 10)}.json` });
                    document.body.append(a); a.click(); a.remove();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                    toast('Cadangan diunduh. Bila unduhan diblokir, pakai "Salin cadangan".', 'ok', 5000);
               } catch (err) { toast(err.message, 'bad'); }
          });
          main.querySelector('[data-copy]').addEventListener('click', async (e) => {
               await busy(e.currentTarget, () => navigator.clipboard.writeText(json()), { ok: 'Cadangan disalin. Tempel ke catatan atau email untuk disimpan.', fail: 'Tidak bisa menyalin' });
          });
          const doImport = (text) => {
               try { P.importBackup(JSON.parse(text), true); toast('Data berhasil diimpor.'); track('import'); refresh(); } catch (err) { toast(`Impor gagal: ${err.message}`, 'bad', 6000); }
          };
          main.querySelector('[data-import]').addEventListener('change', async (e) => { const f = e.target.files[0]; if (f) doImport(await f.text()); });
          main.querySelector('[data-paste-go]').addEventListener('click', () => doImport(main.querySelector('[data-paste]').value));
          main.querySelector('[data-seed]').addEventListener('click', (e) => seedDemo(e.currentTarget, ctx));
          main.querySelector('[data-clear]').addEventListener('click', async () => {
               if (!(await confirmSheet({ title: 'Hapus semua data?', message: 'Seluruh pengajuan, nasabah, analisis, pemantauan, lampiran, pengaturan, dan akun tambahan dihapus dari browser ini.', confirm: 'Ya, hapus semua', danger: true }))) return;
               try { await clearAttachmentStorage(); } catch { /* penyimpanan berkas tidak tersedia */ }
               P.clearAllData();
               toast('Semua data dihapus.');
               location.hash = '#/';
               refresh();
          });
     }
     main.querySelector('[data-clear-stats]')?.addEventListener('click', () => { clearUsage(); toast('Statistik dihapus.'); refresh(); });
}

/* ================================================================ TIM ==== */

export function team(main, params, ctx) {
     const members = core.teamMembers();
     main.innerHTML = `<div class="page-head"><div><h1>Tim</h1><p>${members.length} petugas</p></div></div>
     <div class="split">
          ${card('Anggota', `<ul class="list">${members.map((u) => `<li><div class="main"><strong>${esc(u.name)}</strong><div class="meta">${esc(u.email)}${u.jabatan ? ` · ${esc(u.jabatan)}` : ''}</div></div>${u.active === false ? pill('Nonaktif', 'plain') : pill('Aktif', 'ok')}</li>`).join('')}</ul>`)}
          ${card('Tambah petugas', `<form data-team novalidate>
               <div class="field"><label for="t-name">Nama</label><input id="t-name" name="name" type="text" required></div>
               <div class="field"><label for="t-email">Email</label><input id="t-email" name="email" type="email" required></div>
               <div class="field"><label for="t-pw">Kata sandi awal</label><p class="hint">Minimal 8 karakter.</p><input id="t-pw" name="password" type="password" minlength="8" autocomplete="new-password" required></div>
               <button class="btn btn-primary" type="submit">Tambah</button></form>
               <p class="small muted" style="margin-top:10px">Mode lokal: akun tersimpan di browser ini.</p>`)}
     </div>`;
     main.querySelector('[data-team]').addEventListener('submit', async (e) => {
          e.preventDefault();
          const v = Object.fromEntries(new FormData(e.target));
          const ok = await busy(e.submitter, () => { core.addTeamMember(v); return true; }, { ok: `${v.name} ditambahkan.`, fail: 'Belum ditambahkan' });
          if (ok !== undefined) ctx.refresh();
     });
     return { title: 'Tim', crumbs: [...MORE, { label: 'Tim' }] };
}
