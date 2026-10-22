/**
 * pages/customers.js — Nasabah: daftar dengan lampu kesehatan, dan satu halaman
 * per nasabah dengan 4 bagian:
 *   Ringkasan · Analisis · Fasilitas & pemantauan · Simulasi
 * Menggantikan Borrower + Hasil + Detail (8 tab) + Monitor Risiko dashboard lama.
 */

import * as P from '../../services/portfolio.js';
import { sectorLabel } from '../../services/core.js';
import { COLLECTIBILITY, COLLECTIBILITY_ORDER } from '../../core/config.js';
import { RESTRUCTURE_TYPE_LABEL } from '../../core/restructuring.js';
import { EWS_STAGES, classifyStage } from '../../core/ews.js';
import { SCHEME_OPTIONS } from '../../services/labels.js';
import { esc, rp, rpShort, pct, times, num, date, dateTime, card, answer, rows, pill, kpi, empty, toast, confirmSheet, busy, track, options } from '../ui.js';
import { resultSummary, analystDetail } from '../result.js';

/* Kata sehari-hari untuk tingkat peringatan dini & status fasilitas. */
export const EWS_WORD = { NORMAL: ['Sehat', 'ok'], WATCH: ['Diawasi', 'warn'], WARNING: ['Waspada', 'warn'], CRITICAL: ['Bermasalah', 'bad'], UNKNOWN: ['Belum dipantau', ''] };
const FAC_WORD = { pipeline: ['Disiapkan', 'info'], aktif: ['Berjalan', 'ok'], lunas: ['Lunas', 'plain'], ditolak: ['Tidak dilanjutkan', 'bad'] };
const COLL_TONE = { lancar: 'ok', dpk: 'warn', kurang_lancar: 'bad', diragukan: 'bad', macet: 'bad' };
const OPTION_WORD = { positif: 'Positif', negatif_1_periode: 'Negatif 1 periode', negatif_2_periode: 'Negatif 2 periode', none: 'Tidak ada', indicated: 'Terindikasi', confirmed: 'Terkonfirmasi', normal: 'Normal', suspicious: 'Mencurigakan', sudden_large: 'Penarikan besar mendadak', compliant: 'Patuh', minor: 'Pelanggaran kecil', material: 'Pelanggaran berat' };
const PLAIN_PARAM = { P1_dscr: 'Uang usaha ÷ cicilan (DSCR)', P4_ocf: 'Arus kas usaha', P6_omzet_yoy_pct: 'Perubahan omzet (%)', P10_cash_change_pct: 'Perubahan saldo kas (%)', P11_days_late: 'Telat bayar (hari)', P12_response_days: 'Lama membalas petugas (hari)', P20_covenant: 'Kepatuhan janji kredit' };
const ews = (lvl) => { const [w, t] = EWS_WORD[lvl] || EWS_WORD.UNKNOWN; return pill(w, t); };

/* ============================================================== DAFTAR ==== */

const LIST_FILTERS = [
     { key: '', label: 'Semua' },
     { key: 'risiko', label: 'Perlu perhatian' },
     { key: 'pantau', label: 'Perlu dipantau' },
     { key: 'siap', label: 'Siap dicairkan' }
];

export function list(main, params) {
     const all = P.customerList();
     const f = LIST_FILTERS.some((x) => x.key === params.filter) ? params.filter || '' : '';
     const stale = (r) => { const t = Date.parse(r.lastMonitoring?.created_at || ''); return r.facilityInfo.status === 'aktif' && (!Number.isFinite(t) || Date.now() - t > 30 * 86400000); };
     const pick = (r) => f === 'risiko' ? r.facilityInfo.status === 'aktif' && (['WATCH', 'WARNING', 'CRITICAL'].includes(r.facilityInfo.ews_level) || r.facilityInfo.collectibility !== 'lancar')
          : f === 'pantau' ? stale(r) : f === 'siap' ? r.facilityInfo.status === 'pipeline' : true;
     const items = all.filter(pick).sort((a, b) => String(b.borrower.updated_at || '').localeCompare(String(a.borrower.updated_at || '')));
     main.innerHTML = `
     <div class="page-head"><div><h1>Nasabah</h1><p>${all.length} nasabah · ${all.filter((r) => r.facilityInfo.status === 'aktif').length} pinjaman berjalan</p></div><div class="actions"><a class="btn btn-primary" href="#/pemantauan">Pemantauan bulanan (${all.filter(stale).length} perlu)</a><a class="btn" href="#/analisis">+ Analisis manual</a></div></div>
     <nav class="tabs" aria-label="Saring nasabah">${LIST_FILTERS.map((x) => `<a href="#/nasabah${x.key ? `?filter=${x.key}` : ''}"${x.key === f ? ' aria-current="page"' : ''}>${esc(x.label)} (${all.filter((r) => (x.key === 'risiko' ? r.facilityInfo.status === 'aktif' && (['WATCH', 'WARNING', 'CRITICAL'].includes(r.facilityInfo.ews_level) || r.facilityInfo.collectibility !== 'lancar') : x.key === 'pantau' ? stale(r) : x.key === 'siap' ? r.facilityInfo.status === 'pipeline' : true)).length})</a>`).join('')}</nav>
     ${card('', items.length ? `<ul class="list">${items.map((r) => {
          const fac = r.facilityInfo;
          const fw = FAC_WORD[r.borrower.facility_status] || null;
          return `<li><div class="main"><a href="#/nasabah/${encodeURIComponent(r.borrower.id)}">${esc(r.borrower.nama || r.borrower.id)}</a>
               <div class="meta">${esc(sectorLabel(r.borrower.sektor))} · ${fac.status === 'aktif' ? `sisa ${rpShort(fac.outstanding)}` : `plafon ${rpShort(r.borrower.plafon_diajukan)}`}${r.lastMonitoring ? ` · dipantau ${esc(date(r.lastMonitoring.created_at))}` : ''}</div></div>
               ${fw ? pill(fw[0], fw[1]) : r.analysis ? pill('Analisis saja', 'plain') : ''}
               ${fac.status === 'aktif' ? ews(r.lastMonitoring ? fac.ews_level : 'UNKNOWN') + pill(fac.collectibility_label, COLL_TONE[fac.collectibility]) : ''}</li>`;
     }).join('')}</ul>` : empty('Belum ada nasabah di sini', 'Nasabah muncul setelah penawaran diterima dan fasilitas disiapkan, atau dari Analisis manual.'))}`;
     return { title: 'Nasabah' };
}

/* ============================================================== DETAIL ==== */

const SECTIONS = [
     { key: 'ringkasan', label: 'Ringkasan' },
     { key: 'analisis', label: 'Analisis' },
     { key: 'fasilitas', label: 'Fasilitas & pemantauan' },
     { key: 'simulasi', label: 'Simulasi' }
];

export function detail(main, params, ctx) {
     const c = P.customer(params.id);
     const crumbs = [{ label: 'Nasabah', href: '#/nasabah' }];
     if (!c) {
          main.innerHTML = card('', empty('Nasabah tidak ditemukan', '', '<a class="btn" href="#/nasabah">Kembali</a>'));
          return { title: 'Tidak ditemukan', crumbs: [...crumbs, { label: 'Tidak ditemukan' }] };
     }
     const active = SECTIONS.some((s) => s.key === params.bagian) ? params.bagian : 'ringkasan';
     const b = c.borrower;
     const fw = FAC_WORD[b.facility_status];
     const body = { ringkasan: summary, analisis: analysis, fasilitas: facility, simulasi: simulation }[active](c);
     main.innerHTML = `
     <div class="page-head"><div><h1>${esc(b.nama || b.id)}</h1><p>${esc(sectorLabel(b.sektor))}${c.application ? ` · dari <a href="#/pengajuan/${encodeURIComponent(c.application.id)}">pengajuan</a>` : ''}</p></div>
          <div class="actions">${fw ? pill(fw[0], fw[1]) : ''}${c.facility.status === 'aktif' ? ews(c.monitoring.length ? c.facility.ews_level : 'UNKNOWN') : ''}</div></div>
     <nav class="tabs" aria-label="Bagian nasabah">${SECTIONS.map((s) => `<a href="#/nasabah/${encodeURIComponent(b.id)}?bagian=${s.key}"${s.key === active ? ' aria-current="page"' : ''}>${esc(s.label)}</a>`).join('')}</nav>
     <div data-section>${body}</div>`;
     bind(main, c, ctx);
     return { title: b.nama || 'Nasabah', crumbs: [...crumbs, { label: b.nama || b.id, href: `#/nasabah/${encodeURIComponent(b.id)}` }, { label: SECTIONS.find((s) => s.key === active).label }] };
}

/* ---- Ringkasan: jawaban dulu ---- */
function nextStepOf(c) {
     const f = c.facility;
     const href = `#/nasabah/${encodeURIComponent(c.borrower.id)}?bagian=fasilitas`;
     if (f.status === 'pipeline') return { tone: c.conditions.ready ? 'ok' : 'warn', title: c.conditions.ready ? 'Siap dicairkan' : 'Lengkapi syarat pencairan', text: c.conditions.ready ? 'Semua syarat wajib terpenuhi. Catat pencairan.' : `${c.conditions.mandatory_pending.length} syarat wajib belum terpenuhi.`, action: `<a class="btn btn-primary" href="${href}">Buka fasilitas</a>` };
     if (f.status === 'aktif') {
          const last = c.monitoring.at(-1);
          const stale = !last || Date.now() - Date.parse(last.created_at) > 30 * 86400000;
          if (['WARNING', 'CRITICAL'].includes(f.ews_level) && last) return { tone: f.ews_level === 'CRITICAL' ? 'bad' : 'warn', title: `Pinjaman ${EWS_WORD[f.ews_level][0].toLowerCase()}`, text: last.recommended_action || 'Tinjau pemantauan terakhir.', action: `<a class="btn btn-primary" href="${href}#keringanan">Lihat pilihan keringanan</a>` };
          if (stale) return { tone: 'warn', title: 'Saatnya pemantauan bulanan', text: last ? `Pemantauan terakhir ${date(last.created_at)}.` : 'Pinjaman belum pernah dipantau.', action: `<a class="btn btn-primary" href="${href}#pantau">Isi pemantauan</a>` };
          return { tone: 'ok', title: 'Pinjaman berjalan sehat', text: `Pemantauan terakhir ${date(last.created_at)}: ${EWS_WORD[f.ews_level]?.[0] || f.ews_level}.`, action: `<a class="btn" href="${href}">Lihat fasilitas</a>` };
     }
     if (f.status === 'lunas') return { tone: 'ok', title: 'Pinjaman lunas', text: 'Tidak ada tindakan.', action: '' };
     if (!c.analysis) return { tone: 'warn', title: 'Belum dianalisis', text: 'Jalankan analisis untuk melihat kelayakan.', action: '<button class="btn btn-primary" data-recalc>Hitung analisis</button>' };
     return { tone: 'info', title: 'Analisis tersedia', text: 'Nasabah dari analisis manual (belum ada fasilitas).', action: `<a class="btn" href="#/nasabah/${encodeURIComponent(c.borrower.id)}?bagian=analisis">Lihat analisis</a>` };
}

function summary(c) {
     const b = c.borrower;
     const f = c.facility;
     const n = nextStepOf(c);
     return `${answer({ eyebrow: 'Yang perlu dilakukan', title: n.title, text: n.text, tone: n.tone, actions: n.action })}
     <div class="kpis" style="margin:14px 0">
          ${kpi('Plafon', rpShort(b.plafon_diajukan))}
          ${kpi('Sisa pinjaman', f.status === 'aktif' ? rpShort(f.outstanding) : '—')}
          ${kpi('Kolektibilitas', esc(f.status === 'aktif' ? f.collectibility_label : '—'))}
          ${kpi('Peringkat', esc(c.analysis?.risk?.pefindo?.grade || '—'))}
     </div>
     <div class="grid grid-2">
          ${card('Data pinjaman', rows([['Lama', `${esc(b.tenor_bulan)} bulan`], ['Bunga', pct(b.bunga_tahunan, 2)], ['Skema', esc(SCHEME_OPTIONS.find((s) => s.key === b.skema_angsuran)?.label || b.skema_angsuran || '—')], ['Dicairkan', esc(date(b.disbursed_at))], ['Keperluan', esc(b.tujuan_kredit || '—')]]), { level: 3 })}
          ${card('Pemantauan terakhir', c.monitoring.length ? historyHtml(c.monitoring.slice(-3)) : '<p class="muted">Belum ada pemantauan.</p>', { level: 3 })}
     </div>
     <div class="actions" style="margin-top:14px"><button class="btn" data-recalc>Hitung ulang analisis</button><button class="btn btn-danger" data-delete>Hapus nasabah</button></div>`;
}

/* ---- Analisis ---- */
function analysis(c) {
     if (!c.analysis) return answer({ title: 'Belum ada analisis', text: 'Hitung analisis dari data nasabah yang tersimpan.', tone: 'warn', actions: '<button class="btn btn-primary" data-recalc>Hitung analisis</button>' });
     return `${resultSummary(c.analysis, c.borrower)}
          ${card('Rincian analis', analystDetail(c.analysis), { sub: 'Angka teknis mesin MEZS.id' })}
          <div class="actions" style="margin-top:14px"><button class="btn" data-recalc>Hitung ulang dengan pengaturan terbaru</button></div>`;
}

/* ---- Fasilitas & pemantauan ---- */
function facility(c) {
     const b = c.borrower;
     const f = c.facility;
     if (!b.facility_status) return answer({ title: 'Belum ada fasilitas', text: 'Fasilitas dibuat saat pemohon menerima penawaran dan petugas menyiapkannya dari halaman pengajuan.', tone: 'info' });
     const ladder = `<ol class="actions" aria-label="Tangga kolektibilitas OJK" style="list-style:none;padding:0;margin:8px 0 0">${COLLECTIBILITY_ORDER.map((k) => `<li>${k === f.collectibility ? pill(COLLECTIBILITY[k.toUpperCase()], COLL_TONE[k]) : `<span class="pill plain" style="opacity:.55">${esc(COLLECTIBILITY[k.toUpperCase()])}</span>`}</li>`).join('')}</ol>`;
     const pv = c.provision;
     const status = card('Status pinjaman', `<div class="kpis">
               ${kpi('Plafon', rpShort(f.plafon))}${kpi('Sisa pinjaman', rpShort(f.outstanding))}${kpi('Telat bayar', `${num(f.days_late)} hari`)}${kpi('Peringatan dini', esc(EWS_WORD[c.monitoring.length ? f.ews_level : 'UNKNOWN'][0]))}</div>
          ${f.status === 'aktif' ? ladder : ''}
          ${f.contagion_from ? `<p class="callout warn small" style="margin-top:10px">Kolektibilitas disesuaikan karena fasilitas lain milik debitur yang sama (${esc(f.contagion_from.nama)}) — aturan satu debitur satu kolektibilitas.</p>` : ''}
          ${pv ? `<details class="more"><summary>Cadangan kerugian (PSAK 71 / POJK 40)</summary>${rows([['Tahap PSAK 71', `Tahap ${pv.ecl.stage} · ECL ${esc(pv.ecl.horizon)}`], ['CKPN', pv.ecl.ecl === null ? 'Perlu analisis PD/LGD' : rp(pv.ecl.ecl)], [`PPKA minimum (${Math.round(pv.ppka.rate * 100)}%)`, rp(pv.ppka.amount)], pv.shortfall ? ['Selisih dibentuk dari modal', rp(pv.shortfall)] : null])}${pv.ecl.triggers.length ? `<p class="small">${pv.ecl.triggers.map(esc).join(' · ')}</p>` : ''}</details>` : ''}`);
     const actions = f.status === 'pipeline'
          ? card('Pencairan', `<form data-fac-form class="actions" style="align-items:flex-end" novalidate>
               <div class="field" style="margin:0;flex:1 1 220px"><label for="fac-amt">Jumlah dicairkan (Rp)</label><input id="fac-amt" name="outstanding" type="number" min="1" step="1000000" value="${esc(f.plafon)}"></div>
               <button class="btn btn-primary" data-fac="disburse" ${c.conditions.ready ? '' : 'disabled aria-describedby="cp-hint"'}>Catat pencairan</button>
               <button class="btn btn-danger" type="button" data-fac="ditolak">Batalkan fasilitas</button></form>
               ${c.conditions.ready ? '<p class="small muted">Pencairan pertama dibatasi borrowing base (aset lancar yang dijaminkan).</p>' : `<p class="small muted" id="cp-hint">Terkunci sampai ${c.conditions.mandatory_pending.length} syarat wajib di bawah terpenuhi.</p>`}`)
          : f.status === 'aktif'
               ? card('Perbarui pinjaman', `<form data-fac-form class="actions" style="align-items:flex-end" novalidate>
                    <div class="field" style="margin:0;flex:1 1 220px"><label for="fac-amt">Sisa pinjaman sekarang (Rp)</label><input id="fac-amt" name="outstanding" type="number" min="0" step="1000000" value="${esc(f.outstanding)}"></div>
                    <button class="btn btn-primary" data-fac="update">Simpan sisa pinjaman</button><button class="btn" type="button" data-fac="lunas">Tandai lunas</button></form>`)
               : '';
     const cp = c.conditions;
     const conditions = cp.total && ['pipeline', 'aktif'].includes(f.status) ? card('Syarat pencairan', `<div class="bulkbar"><p class="small muted" style="margin:0">${cp.done}/${cp.total} terpenuhi. Centang setelah dokumen asli diperiksa; tercatat waktu dan petugas.</p>${f.status === 'pipeline' && cp.done < cp.total ? '<button class="btn btn-sm" data-cp-all>✓ Tandai semua terpenuhi</button>' : ''}</div>
          ${cp.items.map((it) => `<label class="check"><input type="checkbox" data-cp="${esc(it.code)}" ${it.done ? 'checked' : ''} ${f.status === 'pipeline' ? '' : 'disabled'}><span><strong>${esc(it.label)}</strong> ${it.mandatory ? pill('Wajib', 'warn') : pill('Disarankan', 'plain')}<br><span class="small muted">${esc(it.description)}${it.record?.done ? ` · ${esc(dateTime(it.record.at))}${it.record.by ? ` oleh ${esc(it.record.by)}` : ''}` : ''}</span></span></label>`).join('')}`) : '';
     return `<div class="stack">${status}${actions}${conditions}
          ${f.status === 'aktif' ? monitorCard(c) + reliefCard(c) + covenantCard(c) : ''}
          ${c.monitoring.length ? card('Riwayat pemantauan', historyHtml(c.monitoring)) : ''}</div>`;
}

function historyHtml(list) {
     return `<ol class="timeline">${[...list].reverse().map((m) => `<li class="${m.ews_level === 'NORMAL' ? 'done' : 'now'}">${esc(m.period || date(m.created_at))} ${ews(m.ews_level)} <span class="small muted">${esc(m.collectibility || '')}</span>
          <span class="when">${esc(m.recommended_action || '')}${m.note ? ` — ${esc(m.note)}` : ''}</span></li>`).join('')}</ol>`;
}

/* Pemantauan bulanan: 7 pertanyaan utama terlihat, 13 lainnya di "Parameter lengkap". */
function monitorCard(c) {
     const prefill = P.ewsPrefill(c.analysis);
     const last = c.monitoring.at(-1)?.params || {};
     const value = (k) => last[k] ?? prefill[k] ?? '';
     const input = (p) => p.type === 'select'
          ? `<select id="ew-${p.key}" name="${p.key}"><option value="">—</option>${p.options.map((o) => `<option value="${o}"${String(value(p.key)) === o ? ' selected' : ''}>${esc(OPTION_WORD[o] || o)}</option>`).join('')}</select>`
          : `<input id="ew-${p.key}" name="${p.key}" type="number" step="${p.step}" value="${esc(value(p.key))}">`;
     const fieldOf = (p) => `<div class="field"><label for="ew-${p.key}">${esc(PLAIN_PARAM[p.key] || p.label)}</label><p class="hint">Waspada ${esc(p.warning)} · bermasalah ${esc(p.critical)}</p>${input(p)}</div>`;
     const main = P.EWS_PARAMS.filter((p) => PLAIN_PARAM[p.key]);
     const rest = P.EWS_PARAMS.filter((p) => !PLAIN_PARAM[p.key]);
     return card('Pemantauan bulanan', `<form data-ews novalidate>
          <div class="form-grid">
               <div class="field"><label for="ew-period">Periode</label><input id="ew-period" name="period" type="month" value="${P.currentPeriod()}"></div>
               <div class="field"><label for="ew-note">Catatan kunjungan</label><input id="ew-note" name="note" type="text" placeholder="Temuan lapangan (opsional)"></div>
               ${main.map(fieldOf).join('')}
          </div>
          <details class="more"><summary>Parameter lengkap (${rest.length} lainnya)</summary><div class="form-grid" style="margin-top:10px">${rest.map(fieldOf).join('')}</div></details>
          <div data-ews-out aria-live="polite" style="margin-top:12px"></div>
          <div class="actions" style="margin-top:12px"><button class="btn" type="button" data-ews-eval>Lihat hasil dulu</button><button class="btn btn-primary" type="submit">Simpan pemantauan</button></div>
     </form>`, { id: 'pantau', sub: 'Diisi dari analisis & pemantauan terakhir; ubah sesuai kondisi bulan ini' });
}

function ewsResultHtml(ev) {
     const [word, tone] = EWS_WORD[ev.ews_level] || EWS_WORD.UNKNOWN;
     const stages = {};
     for (const s of ev.signals || []) { const st = classifyStage(s.param); if (st && (!stages[st] || s.severity === 'CRITICAL')) stages[st] = s.severity; }
     return `<div class="callout ${tone}"><strong>Hasil: ${esc(word)}</strong> · kolektibilitas ${esc(ev.collectibility || '—')}<br>${esc(ev.recommended_action || '')}${ev.escalate_to ? `<br><span class="small">Eskalasi ke: <strong>${esc(ev.escalate_to)}</strong></span>` : ''}</div>
          <div class="actions" style="margin-top:8px">${EWS_STAGES.map((st) => pill(`${st.key}. ${{ 1: 'Pasar', 2: 'Perilaku', 3: 'Operasional', 4: 'Keuangan memburuk' }[st.key]}${stages[st.key] ? '' : ' — aman'}`, stages[st.key] === 'CRITICAL' ? 'bad' : stages[st.key] ? 'warn' : 'ok')).join('')}</div>
          ${(ev.judgements || []).length ? `<ul class="small">${ev.judgements.map((j) => `<li>${esc(String(j.message).replace(/^\S+\s/, ''))}</li>`).join('')}</ul>` : ''}`;
}

/* Keringanan 3R */
function reliefCard(c) {
     const b = c.borrower;
     const st = c.restructuring;
     const rec = b.restructuring;
     const inputs = P.restructuringInputs(b, c.analysis);
     const form = `<form data-rs novalidate><div class="form-grid">
          <div class="field"><label for="rs-cash">Uang bersih usaha setahun sekarang (Rp)</label><input id="rs-cash" name="cash" type="number" min="0" step="1000000" value="${Math.round(inputs.annualCashFlow)}"></div>
          <div class="field"><label for="rs-rem">Sisa lama pinjaman (bulan)</label><input id="rs-rem" name="remaining" type="number" min="1" value="${inputs.remainingMonths}"></div>
          <div class="field"><label for="rs-grace">Masa tenggang pokok (bulan)</label><input id="rs-grace" name="grace" type="number" min="0" max="12" value="0"></div>
          <div class="field"><label for="rs-note">Dasar persetujuan</label><input id="rs-note" name="note" type="text" maxlength="500" placeholder="Misal: omzet turun karena jalan diperbaiki"></div></div>
          <button class="btn btn-primary" type="submit">Hitung pilihan keringanan</button><div data-rs-out style="margin-top:12px"></div></form>`;
     if (!rec) {
          const urgent = c.facility.ecl_stage >= 2 || c.facility.collectibility !== 'lancar' || ['WARNING', 'CRITICAL'].includes(c.facility.ews_level);
          return card('Keringanan cicilan (3R)', `${urgent ? '<p class="callout warn small">Risiko pinjaman naik. Keringanan lebih awal — selagi masih Lancar/DPK — menjaga usaha tetap bisa membayar.</p>' : ''}<details class="more"${urgent ? ' open' : ''}><summary>Simulasikan pilihan keringanan</summary><div style="margin-top:10px">${form}</div></details>`, { id: 'keringanan', sub: 'Perpanjang waktu · ubah syarat · susun ulang' });
     }
     const label = (k) => COLLECTIBILITY[String(k).toUpperCase()] || k;
     return card('Keringanan cicilan — masa tunggu', `${rows([['Jenis', esc(rec.label || RESTRUCTURE_TYPE_LABEL[rec.type] || rec.type)], ['Sejak', esc(date(rec.at))], ['Kolektibilitas sebelum', esc(label(st.collectibility_before))], ['Batas kolektibilitas sekarang', esc(label(st.cap))], ['Bayar tepat waktu berturut-turut', `${st.consecutive_on_time}×`]])}
          <p class="small" style="margin-top:8px">${st.in_grace ? `Masa tenggang sampai ${esc(date(rec.grace_until))}.` : st.next_upgrade_in === null ? 'Masa tunggu selesai; kolektibilitas kembali mengikuti tunggakan.' : `${st.next_upgrade_in} kali bayar tepat waktu lagi untuk naik satu tingkat.${st.missed_last ? ' Pembayaran terakhir terlambat — hitungan diulang.' : ''}`}</p>
          ${rec.terms_after ? `<p class="small muted">Syarat baru: ${rec.terms_after.tenor_bulan} bulan, bunga ${pct(rec.terms_after.rate, 2)}${rec.terms_after.monthly_installment ? `, cicilan ${rp(rec.terms_after.monthly_installment)}/bulan` : ''}.</p>` : ''}
          <div class="actions"><button class="btn btn-primary btn-sm" data-pay="1">Catat bayar tepat waktu</button><button class="btn btn-sm" data-pay="0">Catat terlambat</button></div>
          <details class="more"><summary>Keringanan ulang</summary><div style="margin-top:10px">${form}</div></details>`, { id: 'keringanan' });
}

function reliefOptionsHtml(p) {
     const all = [p.current, ...p.options];
     return `<div class="table-wrap"><table><thead><tr><th>Pilihan</th><th class="r">Lama</th><th class="r">Bunga</th><th class="r">Cicilan/bln</th><th class="r">Uang usaha ÷ cicilan</th><th></th></tr></thead><tbody>
          ${all.map((o) => `<tr><td><strong>${esc(o.label)}</strong>${o.type === p.recommended ? ` ${pill('Disarankan', 'ok')}` : ''}</td><td class="r">${o.tenor_bulan} bln</td><td class="r">${pct(o.rate, 2)}</td><td class="r">${rp(o.monthly_installment)}</td>
               <td class="r">${times(o.dscr)} ${o.type === 'berjalan' ? '' : pill(o.meets_target ? 'Cukup' : o.feasible ? 'Pas-pasan' : 'Tidak cukup', o.meets_target ? 'ok' : o.feasible ? 'warn' : 'bad')}</td>
               <td>${o.type === 'berjalan' ? '' : `<button class="btn btn-sm" type="button" data-apply="${esc(o.type)}" data-tenor="${o.tenor_bulan}" data-rate="${o.rate}" data-inst="${o.monthly_installment}" ${o.feasible ? '' : 'disabled'}>Terapkan</button>`}</td></tr>`).join('')}</tbody></table></div>
          ${p.needs_full_restructuring ? `<p class="callout bad small">Tidak ada pilihan yang membuat usaha sanggup membayar. ${esc(p.full_restructuring_note)} <button class="btn btn-sm" type="button" data-apply="restructuring">Catat susun ulang menyeluruh (keputusan komite)</button></p>` : ''}
          <p class="small muted">Bunga tidak diturunkan di bawah titik impas ${pct(p.inputs.floor_rate, 2)}. Target uang usaha ${times(p.inputs.target_dscr)} cicilan; lama maksimal ${p.inputs.max_tenor} bulan.</p>`;
}

function covenantCard(c) {
     const fromAnalysis = c.analysis?.covenant?.covenants || [];
     const saved = c.covenants?.covenants || (Array.isArray(c.covenants) ? c.covenants : []);
     if (!fromAnalysis.length && !saved.length) return '';
     return card('Janji kredit (covenant)', `${saved.length ? `<p class="small">${saved.length} covenant tersimpan untuk fasilitas ini.</p>` : `<p class="small muted">${esc(c.analysis?.covenant?.summary || '')}</p>`}
          <details class="more"><summary>Lihat daftar</summary><ul class="small">${(saved.length ? saved : fromAnalysis).map((x) => `<li><strong>${esc(x.label)}</strong> — ${esc(x.description)}</li>`).join('')}</ul></details>
          ${fromAnalysis.length ? '<div class="actions" style="margin-top:8px"><button class="btn btn-sm" data-cov>Simpan covenant dari analisis</button></div>' : ''}`);
}

/* ---- Simulasi ---- */
function simulation(c) {
     const b = c.borrower;
     return card('Bagaimana jika…', `<p class="muted small">Ubah jumlah, lama, bunga, atau skema untuk melihat dampaknya terhadap kelayakan. Data nasabah tidak berubah.</p>
          <form data-whatif class="form-grid" novalidate>
               <div class="field"><label for="wi-plafon">Jumlah pinjaman (Rp)</label><input id="wi-plafon" name="plafon" type="number" step="1000000" value="${esc(b.plafon_diajukan ?? '')}"></div>
               <div class="field"><label for="wi-tenor">Lama (bulan)</label><input id="wi-tenor" name="tenorBulan" type="number" min="1" max="120" value="${esc(b.tenor_bulan ?? '')}"></div>
               <div class="field"><label for="wi-rate">Bunga per tahun (%)</label><input id="wi-rate" name="bunga" type="number" step="0.25" value="${esc(b.bunga_tahunan === null || b.bunga_tahunan === undefined ? '' : +(b.bunga_tahunan * 100).toFixed(2))}"></div>
               <div class="field"><label for="wi-scheme">Skema cicilan</label><select id="wi-scheme" name="skemaAngsuran">${options(SCHEME_OPTIONS, b.skema_angsuran)}</select></div>
               <div class="span-2"><button class="btn btn-primary" type="submit">Hitung</button></div>
          </form><div data-whatif-out aria-live="polite" style="margin-top:14px"></div>`);
}

function whatIfHtml(out) {
     const r = (label, base, sc, fmt) => `<tr><td>${esc(label)}</td><td class="r">${fmt(base)}</td><td class="r"><strong>${fmt(sc)}</strong></td></tr>`;
     const word = { LAYAK: 'Layak', LAYAK_BERSYARAT: 'Layak dengan syarat', REVIEW: 'Perlu ditinjau', TIDAK_LAYAK: 'Belum layak' };
     return `<div class="table-wrap"><table><thead><tr><th></th><th class="r">Sekarang</th><th class="r">Jika diubah</th></tr></thead><tbody>
          ${r('Hasil', out.base.decision, out.scenario.decision, (v) => esc(word[v] || v || '—'))}
          ${r('Skor', out.base.finalScore, out.scenario.finalScore, (v) => num(v, 1))}
          ${r('Cicilan rata-rata per bulan', out.base.monthly_installment, out.scenario.monthly_installment, rp)}
          ${r('Uang usaha ÷ cicilan (DSCR)', out.base.dscr, out.scenario.dscr, times)}
          ${r('Porsi uang usaha untuk cicilan', out.base.ds_ratio, out.scenario.ds_ratio, (v) => pct(v, 0))}
          ${r('Saran plafon', out.base.recommended_nominal, out.scenario.recommended_nominal, rp)}
     </tbody></table></div>`;
}

/* ---- perilaku ---- */
function bind(main, c, ctx) {
     const id = c.borrower.id;
     const refresh = () => ctx.refresh();
     main.querySelectorAll('[data-recalc]').forEach((btn) => btn.addEventListener('click', async () => {
          if (await busy(btn, () => P.recalculate(id), { ok: 'Analisis dihitung ulang.', fail: 'Gagal menghitung' })) refresh();
     }));
     main.querySelector('[data-delete]')?.addEventListener('click', async () => {
          if (!(await confirmSheet({ title: 'Hapus nasabah ini?', message: `"${c.borrower.nama}" beserta hasil analisisnya akan dihapus. Tidak dapat dibatalkan.`, confirm: 'Hapus', danger: true }))) return;
          P.removeCustomer(id);
          toast('Nasabah dihapus.');
          location.hash = '#/nasabah';
     });
     main.querySelectorAll('[data-fac]').forEach((btn) => btn.addEventListener('click', async (e) => {
          e.preventDefault();
          const kind = btn.dataset.fac;
          const amt = main.querySelector('#fac-amt')?.value;
          const outstanding = amt === '' || amt === undefined ? null : Number(amt);
          const msg = { disburse: ['Catat pencairan?', `Dana ${rp(outstanding)} dicatat sudah dicairkan. Syarat pencairan akan dikunci.`, 'Catat pencairan'], lunas: ['Tandai lunas?', 'Sisa pinjaman menjadi nol.', 'Tandai lunas'], ditolak: ['Batalkan fasilitas?', 'Fasilitas tidak dilanjutkan.', 'Batalkan'] }[kind];
          if (msg && !(await confirmSheet({ title: msg[0], message: msg[1], confirm: msg[2], danger: kind === 'ditolak' }))) return;
          const ok = await busy(btn, () => P.facilityAction(id, kind, { outstanding }), { ok: { disburse: 'Pencairan tercatat — pinjaman berjalan.', update: 'Sisa pinjaman diperbarui.', lunas: 'Pinjaman ditandai lunas.', ditolak: 'Fasilitas dibatalkan.' }[kind], fail: 'Gagal' });
          if (ok !== undefined) { track('facility', { kind }); refresh(); }
     }));
     main.querySelector('[data-cp-all]')?.addEventListener('click', async (e) => {
          const pending = c.conditions.items.filter((it) => !it.done);
          if (!(await confirmSheet({ title: `Tandai ${pending.length} syarat terpenuhi?`, message: 'Pastikan dokumen asli sudah Anda periksa. Setiap syarat tercatat dengan waktu dan nama Anda.', confirm: 'Tandai semua' }))) return;
          if (await busy(e.currentTarget, async () => { for (const it of pending) P.setCondition(id, it.code, true); return true; }, { ok: `${pending.length} syarat ditandai. Pencairan siap dicatat.`, fail: 'Gagal' })) { track('bulk_conditions'); refresh(); }
     });
     main.querySelectorAll('[data-cp]').forEach((el) => el.addEventListener('change', () => {
          try { P.setCondition(id, el.dataset.cp, el.checked); refresh(); main.querySelector(`[data-cp="${el.dataset.cp}"]`)?.focus(); } catch (err) { toast(err.message, 'bad'); el.checked = !el.checked; }
     }));

     const ewsForm = main.querySelector('[data-ews]');
     if (ewsForm) {
          const values = () => Object.fromEntries(new FormData(ewsForm));
          main.querySelector('[data-ews-eval]').addEventListener('click', () => {
               main.querySelector('[data-ews-out]').innerHTML = ewsResultHtml(P.evaluateMonitoringFor(id, values()));
          });
          ewsForm.addEventListener('submit', async (e) => {
               e.preventDefault();
               const v = values();
               const ev = await busy(e.submitter, () => P.saveMonitoring(id, v, { period: v.period, note: v.note }), { fail: 'Pemantauan belum tersimpan' });
               if (!ev) return;
               toast(`Pemantauan tersimpan — ${EWS_WORD[ev.ews_level]?.[0] || ev.ews_level}.`, EWS_WORD[ev.ews_level]?.[1] || 'ok');
               if (ev.ews_level === 'CRITICAL') toast(`Eskalasi ke ${ev.escalate_to || 'Manajer Risiko'}.`, 'warn', 6000);
               track('monitoring', { level: ev.ews_level });
               refresh();
          });
     }

     main.querySelectorAll('[data-rs]').forEach((form) => form.addEventListener('submit', (e) => {
          e.preventDefault();
          const v = Object.fromEntries(new FormData(form));
          const out = form.querySelector('[data-rs-out]');
          try {
               out.innerHTML = reliefOptionsHtml(P.proposeRelief(id, { annualCashFlow: Number(v.cash), remainingMonths: Number(v.remaining) }));
          } catch (err) { out.innerHTML = `<p class="callout bad small">${esc(err.message)}</p>`; }
          out.querySelectorAll('[data-apply]').forEach((btn) => btn.addEventListener('click', async () => {
               const option = { type: btn.dataset.apply, tenor_bulan: Number(btn.dataset.tenor || 0), rate: Number(btn.dataset.rate || 0), monthly_installment: Number(btn.dataset.inst || 0), grace_bulan: Number(v.grace || 0) };
               if (!(await confirmSheet({ title: `Terapkan ${RESTRUCTURE_TYPE_LABEL[option.type] || 'keringanan'}?`, message: 'Kolektibilitas saat ini menjadi batas atas selama masa tunggu dan naik satu tingkat setiap 3 kali bayar tepat waktu.', confirm: 'Terapkan' }))) return;
               if (await busy(btn, () => P.applyRelief(id, option, v.note || ''), { ok: 'Keringanan tercatat.', fail: 'Gagal' })) { track('relief'); refresh(); }
          }));
     }));
     main.querySelectorAll('[data-pay]').forEach((btn) => btn.addEventListener('click', async () => {
          if (await busy(btn, () => P.recordReliefPayment(id, btn.dataset.pay === '1'), { ok: btn.dataset.pay === '1' ? 'Pembayaran tepat waktu dicatat.' : 'Keterlambatan dicatat.', fail: 'Gagal' })) refresh();
     }));
     main.querySelector('[data-cov]')?.addEventListener('click', (e) => busy(e.currentTarget, () => P.saveCovenantsFromAnalysis(id), { ok: 'Covenant disimpan untuk fasilitas ini.', fail: 'Gagal' }).then(refresh));

     const wf = main.querySelector('[data-whatif]');
     wf?.addEventListener('submit', async (e) => {
          e.preventDefault();
          const v = Object.fromEntries(new FormData(wf));
          const changes = { plafon: v.plafon === '' ? null : Number(v.plafon), tenorBulan: v.tenorBulan === '' ? null : Number(v.tenorBulan), bungaTahunan: v.bunga === '' ? null : Number(v.bunga) / 100, skemaAngsuran: v.skemaAngsuran || null };
          const out = await busy(e.submitter, async () => P.whatIf(c.borrower, changes), { fail: 'Simulasi gagal' });
          if (out) { main.querySelector('[data-whatif-out]').innerHTML = whatIfHtml(out); track('what_if'); }
     });

     const hash = location.hash.split('#')[2];
     if (hash) document.getElementById(hash)?.scrollIntoView({ block: 'start' });
}

/* ================================================= PEMANTAUAN CEPAT ==== */

const QUICK = ['P11_days_late', 'P1_dscr', 'P6_omzet_yoy_pct', 'P20_covenant'];

/**
 * Pemantauan bulanan semua pinjaman berjalan dalam satu tabel. Isian awal =
 * nilai bulan lalu (atau dari analisis); parameter lain dari 20 parameter ikut
 * nilai bulan lalu. Evaluasi tetap memakai mesin EWS lama per pinjaman.
 */
export function quickMonitor(main, params, ctx) {
     const rowsAll = P.customerList().filter((r) => r.facilityInfo.status === 'aktif');
     const period = P.currentPeriod();
     const doneThisMonth = (r) => r.monitoring.some((m) => m.period === period);
     const defs = Object.fromEntries(P.EWS_PARAMS.map((p) => [p.key, p]));
     const valueOf = (r, k) => (r.lastMonitoring?.params?.[k] ?? P.ewsPrefill(r.analysis)[k] ?? '');
     const input = (r, k) => {
          const p = defs[k];
          const v = valueOf(r, k);
          const id = `qm-${r.borrower.id}-${k}`;
          return p.type === 'select'
               ? `<select id="${id}" data-row="${esc(r.borrower.id)}" data-k="${k}" aria-label="${esc(PLAIN_PARAM[k])} — ${esc(r.borrower.nama)}"><option value="">—</option>${p.options.map((o) => `<option value="${o}"${String(v) === o ? ' selected' : ''}>${esc(OPTION_WORD[o] || o)}</option>`).join('')}</select>`
               : `<input id="${id}" type="number" step="${p.step}" data-row="${esc(r.borrower.id)}" data-k="${k}" value="${esc(v)}" aria-label="${esc(PLAIN_PARAM[k])} — ${esc(r.borrower.nama)}" style="max-width:110px">`;
     };
     main.innerHTML = `<div class="page-head"><div><h1>Pemantauan bulanan</h1><p>Periode ${esc(period)} · ${rowsAll.filter(doneThisMonth).length}/${rowsAll.length} pinjaman sudah dipantau</p></div></div>
     ${rowsAll.length ? card('', `<p class="small muted">Isian awal = kondisi bulan lalu. Ubah yang berubah saja, lalu <strong>Simpan semua</strong>. 16 parameter lain memakai nilai bulan lalu; rincian lengkap tetap bisa diisi di halaman nasabah.</p>
          <div class="table-wrap"><table class="quick"><thead><tr><th>Nasabah</th><th>Terakhir</th>${QUICK.map((k) => `<th>${esc(PLAIN_PARAM[k])}</th>`).join('')}<th>Hasil</th></tr></thead><tbody>
          ${rowsAll.map((r) => `<tr data-tr="${esc(r.borrower.id)}"><td><a href="#/nasabah/${encodeURIComponent(r.borrower.id)}?bagian=fasilitas">${esc(r.borrower.nama)}</a><div class="small muted">sisa ${rpShort(r.facilityInfo.outstanding)}</div></td>
               <td>${r.lastMonitoring ? `${ews(r.lastMonitoring.ews_level)}<div class="small muted">${esc(r.lastMonitoring.period || date(r.lastMonitoring.created_at))}</div>` : ews('UNKNOWN')}</td>
               ${QUICK.map((k) => `<td>${input(r, k)}</td>`).join('')}
               <td data-out>${doneThisMonth(r) ? pill('Sudah bulan ini', 'plain') : ''}</td></tr>`).join('')}
          </tbody></table></div>
          <div class="actionbar"><div class="actionbar-in"><span class="small" data-qm-status aria-live="polite">${rowsAll.length} pinjaman</span><div class="actions">
               <button class="btn" data-qm-eval>Lihat hasil dulu</button><button class="btn btn-primary" data-qm-save>Simpan semua</button></div></div></div>`)
          : card('', empty('Tidak ada pinjaman berjalan', 'Pemantauan bulanan muncul setelah ada fasilitas yang dicairkan.'))}`;
     const collect = (id) => {
          const r = rowsAll.find((x) => x.borrower.id === id);
          const base = { ...(r.lastMonitoring?.params || P.ewsPrefill(r.analysis)) };
          main.querySelectorAll(`[data-row="${CSS.escape(id)}"]`).forEach((el) => { base[el.dataset.k] = el.value; });
          return base;
     };
     const paint = (save) => {
          let n = 0;
          const levels = {};
          for (const r of rowsAll) {
               const id = r.borrower.id;
               const ev = save ? P.saveMonitoring(id, collect(id), { period, note: 'Pemantauan cepat' }) : P.evaluateMonitoringFor(id, collect(id));
               levels[ev.ews_level] = (levels[ev.ews_level] || 0) + 1;
               main.querySelector(`[data-tr="${CSS.escape(id)}"] [data-out]`).innerHTML = `${ews(ev.ews_level)}<div class="small muted">${esc(ev.collectibility || '')}</div>`;
               n += 1;
          }
          main.querySelector('[data-qm-status]').innerHTML = `${save ? `<strong>${n} pemantauan tersimpan.</strong> ` : ''}${Object.entries(levels).map(([k, v]) => `${v} ${esc(EWS_WORD[k]?.[0] || k)}`).join(' · ')}`;
          return levels;
     };
     main.querySelector('[data-qm-eval]')?.addEventListener('click', () => paint(false));
     main.querySelector('[data-qm-save]')?.addEventListener('click', async (e) => {
          const ok = await confirmSheet({ title: `Simpan pemantauan ${rowsAll.length} pinjaman?`, message: `Periode ${period}. Setiap pinjaman mendapat catatan pemantauan baru.`, confirm: 'Simpan semua' });
          if (!ok) return;
          const levels = await busy(e.currentTarget, async () => paint(true), { fail: 'Gagal menyimpan' });
          if (!levels) return;
          toast(`Pemantauan tersimpan.${levels.CRITICAL ? ` ${levels.CRITICAL} pinjaman bermasalah — eskalasi ke Manajer Risiko.` : ''}`, levels.CRITICAL ? 'warn' : 'ok', 6000);
          track('quick_monitor', { n: rowsAll.length });
     });
     return { title: 'Pemantauan bulanan', crumbs: [{ label: 'Nasabah', href: '#/nasabah' }, { label: 'Pemantauan bulanan' }] };
}
