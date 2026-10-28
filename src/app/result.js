/**
 * app/result.js — Tampilan hasil analisis mesin lama.
 * Lapis 1 (selalu terlihat): status lampu, peringkat + artinya, alasan, jumlah
 * aman, cicilan, bintang per bagian, uji kondisi sulit, saran perbaikan.
 * Lapis 2 ("Rincian analis"): angka teknis apa adanya — skor, 5C, aturan,
 * rasio vs sektor IDX, kapasitas, PD/LGD/EL, harga, RAROC, ATMR, covenant.
 * Tidak ada perhitungan ulang selain analisis pada jumlah saran (pembanding).
 */

import { toPlain, plainMetrics } from '../services/plain.js';
import { analyze } from '../services/core.js';
import { debtorSize } from '../services/segment-size.js';
import { esc, rp, pct, times, num, card, pill, rows, stars, bar, TONE } from './ui.js';

const UNIT = { harian: 'hari', mingguan: 'minggu', bulanan: 'bulan' };

/** Analisis ulang pada jumlah saran (hanya bila lebih kecil dari permintaan). */
export function atSuggested(result, borrower) {
     const s = Number(result?.nominal?.recommended_nominal) || 0;
     const req = Number(borrower?.plafon_diajukan) || 0;
     if (!(s > 0 && s < req)) return null;
     try { return analyze({ ...borrower, plafon_diajukan: s }); } catch { return null; }
}

export function resultSummary(result, borrower) {
     const p = toPlain(result, atSuggested(result, borrower));
     if (!p) return '<p class="muted">Belum ada hasil analisis.</p>';
     const inst = p.installment;
     const tone = TONE[p.status.tone];
     return `<section class="answer ${tone}">
          <div class="eyebrow">Hasil penilaian</div>
          <div class="actions" style="justify-content:space-between;align-items:flex-start">
               <div><h2>${esc(p.status.label)}</h2><p>${esc(p.reason)}</p></div>
               ${p.grade ? `<div class="grade" title="${esc(p.grade.disclaimer)}"><b>${esc(p.grade.grade)}</b><span>${esc(p.grade.label)}</span></div>` : ''}
          </div>
          ${p.grade ? `<p class="small muted">Peringkat ${esc(p.grade.grade)}: ${esc(p.grade.meaning.toLowerCase())}. ${esc(p.grade.disclaimer)}</p>` : ''}
     </section>
     <div class="grid grid-2" style="margin-top:14px">
          ${card('Jumlah yang aman', `<p>${esc(p.amount.sentence)}</p>
               ${p.amount.suggestedStatus ? `<p class="callout ${TONE[p.amount.suggestedStatus.tone]}">Pada ${rp(p.amount.suggested)}: <strong>${esc(p.amount.suggestedStatus.label)}</strong>${p.amount.suggestedInstallment?.perPeriod ? `, cicilan ${rp(p.amount.suggestedInstallment.perPeriod)} per ${UNIT[p.amount.suggestedInstallment.periodicity] || 'bulan'}` : ''}.</p>` : ''}
               ${rows([['Diajukan', rp(p.amount.requested)], ['Saran', rp(p.amount.suggested)], [`Cicilan per ${UNIT[inst.periodicity] || 'bulan'}`, rp(inst.perPeriod)], inst.daily ? ['Sisihkan per hari kerja', rp(inst.daily)] : null])}`, { level: 3 })}
          ${card('Nilai per bagian', `<ul class="list">${p.pillars.map((x) => `<li><span>${esc(x.name)}</span><span>${stars(x.stars)} <span class="small muted">${esc(x.word)}</span></span></li>`).join('')}</ul>`, { level: 3 })}
     </div>
     ${p.stress ? card('Jika kondisi memburuk', `<p>${esc(p.stress.summary)} ${p.stress.caution ? `<strong>${esc(p.stress.caution)}</strong>` : ''}</p>
          <div class="actions">${p.stress.items.map((s) => pill(`${s.text}: ${s.survives ? 'aman' : 'berat'}`, s.survives ? 'ok' : 'bad')).join('')}</div>`, { level: 3 }) : ''}
     ${p.fixes.length ? card('Yang bisa diperbaiki pemohon', `<ul>${p.fixes.map((f) => `<li>${esc(f.text)}</li>`).join('')}</ul>`, { level: 3 }) : ''}
     <p class="small muted">${esc(p.footnote)}</p>`;
}

/* ------------------------------------------------------ rincian analis --- */

const section = (title, body, open = false) => `<details class="more"${open ? ' open' : ''}><summary>${esc(title)}</summary><div style="margin-top:8px">${body}</div></details>`;
const table = (head, bodyRows) => `<div class="table-wrap"><table><thead><tr>${head.map((h, i) => `<th${i ? ' class="r"' : ''}>${esc(h)}</th>`).join('')}</tr></thead><tbody>${bodyRows.join('')}</tbody></table></div>`;

function ratioFmt(item) {
     const v = item.value;
     if (v === null || v === undefined) return '—';
     return ['dscr', 'icr', 'current_ratio', 'quick_ratio', 'cash_ratio', 'tato', 'altman_z', 'inventory_turnover', 'receivable_turnover'].includes(item.rasio) ? times(v) : pct(v, 1);
}

export function analystDetail(result) {
     if (!result) return '';
     const r = result;
     const risk = r.risk || {};
     const pricing = risk.pricing || {};
     const loss = risk.loss || {};
     const rwa = r.credit?.rwa || {};
     const levelTone = { above_median: 'ok', top_quartile: 'ok', below_median: 'warn', bottom_quartile: 'bad' };
     return `<div class="stack">
     ${section('Skor & bobot', `${rows([['Skor akhir', `<b>${num(r.finalScore, 1)}</b> / 100`], ['Keputusan mesin', esc(r.decision?.decision_label || r.decision?.decision)], ['Peringkat', `${esc(risk.pefindo?.grade || '—')} · ${esc(risk.pefindo?.category_label || '')}`], ['Profil bobot', esc(r.weights?.profile?.label || r.borrower?.profil_company || '—')]])}
          ${table(['Pilar', 'Bobot', 'Skor'], (r.pillars || []).map((p) => `<tr><td>${esc(p.label)}</td><td class="r">${pct(p.weight, 0)}</td><td class="r">${num(p.score, 1)} ${bar(p.score, 100, p.score >= 75 ? 'ok' : p.score >= 60 ? 'warn' : 'bad')}</td></tr>`))}`, true)}
     ${section('Kerangka 5C', table(['C', 'Bobot', 'Skor'], (r.five_c?.items || []).map((c) => `<tr><td>${esc(c.id)} <span class="small muted">${esc(c.name)}</span></td><td class="r">${pct(c.weight, 0)}</td><td class="r">${num(c.score, 0)} · ${esc(c.label)}</td></tr>`)) + `<p class="small muted">Terkuat: ${esc(r.five_c?.strongest || '—')} · terlemah: ${esc(r.five_c?.weakest || '—')} · skor tertimbang ${num(r.five_c?.weighted_score, 1)}</p>`)}
     ${section('Aturan kebijakan', table(['Aturan', 'Nilai', 'Batas'], (r.decision?.rules_evaluated || []).map((x) => `<tr><td>${x.violated ? pill(x.enforcement === 'hard' ? 'Gagal' : 'Catatan', x.enforcement === 'hard' ? 'bad' : 'warn') : pill('Lolos', 'ok')} ${esc(x.rule)}</td><td class="r">${x.unit === 'x' ? times(x.value) : x.unit === '%' || x.unit === 'pct' ? pct(x.value) : num(x.value, 2)}</td><td class="r">${x.unit === 'x' ? times(x.limit) : x.unit === '%' || x.unit === 'pct' ? pct(x.limit) : num(x.limit, 2)}</td></tr>`)) + `<ul class="small">${(r.decision?.reasons || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`)}
     ${section('Rasio vs sektor (IDX)', table(['Rasio', 'Usaha', 'Median sektor'], (r.benchmark?.items || []).filter((b) => b.value !== null && b.value !== undefined).map((b) => `<tr><td>${esc(b.label)} ${b.level ? pill(b.level.replace(/_/g, ' '), levelTone[b.level] || 'plain') : ''}</td><td class="r">${ratioFmt(b)}</td><td class="r">${ratioFmt({ ...b, value: b.median })}</td></tr>`)) + `<p class="small muted">Sektor ${esc(r.benchmark?.sector_label || '')}. ${plainMetrics(r).map((m) => `${esc(m.term)}: ${esc(m.text)}`).join(' ')}</p>`)}
     ${section('Kapasitas & plafon', rows([['Saran plafon', rp(r.nominal?.recommended_nominal)], ['Rentang', `${rp(r.nominal?.range_narrow?.[0])} – ${rp(r.nominal?.range_narrow?.[1])}`], ['Pembatas', esc(r.nominal?.binding_label || '—')], ['Batas dari kemampuan bayar', rp(r.nominal?.capacity?.dscr_based)], ['Batas dari jaminan', rp(r.nominal?.capacity?.ltv_based)], ['DSCR pada saran', times(r.nominal?.dscr_at_recommended)], ['Target DSCR', times(r.nominal?.dscr_target)], ['Skema cicilan', esc(r.debtService?.scheme_label || '')], ['Segmen', esc(r.segment?.label || '')]]))}
     ${section('Risiko kredit & harga', rows([['PD 12 bulan', pct(risk.pd?.pd_12m, 2)], ['PD seumur pinjaman', pct(risk.pd?.pd_lifetime, 2)], ['LGD', pct(risk.lgd?.lgd, 1)], ['EAD', rp(risk.ead?.ead)], ['Expected loss', `${rp(loss.el_amount)} (${pct(loss.el_rate, 3)})`], ['Unexpected loss', `${rp(loss.ul_amount)} (${pct(loss.ul_rate, 3)})`], ['Bunga saran', pct(pricing.recommended_rate, 2)], ['Titik impas', pct(pricing.breakeven_rate, 2)], ['Batas RAROC (hurdle)', pct(pricing.hurdle_rate, 2)], ['RAROC', `${pct(pricing.raroc, 0)} ${pricing.meets_hurdle ? pill('Memenuhi', 'ok') : pill('Di bawah hurdle', 'warn')}`]]))}
     ${section('Modal regulasi (ATMR)', rows([['Kelas eksposur', esc(rwa.exposure_class_label || '—')], ['Bobot risiko', pct(rwa.risk_weight, 2)], ['ATMR', rp(rwa.rwa)], ['Modal minimum', rp(rwa.capital_min)], ['Modal + buffer', rp(rwa.capital_with_buffer)], ['Imbal hasil atas modal', pct(rwa.return_on_capital, 1)]]) + (rwa.notes?.length ? `<p class="small muted">${rwa.notes.map(esc).join(' ')}</p>` : ''))}
     ${section('Uji ketahanan (8 skenario)', table(['Skenario', 'DSCR', 'Hasil'], (r.stress?.scenarios || []).map((s) => `<tr><td>${esc(s.label)}</td><td class="r">${times(s.dscr)}</td><td class="r">${s.survives ? pill('Bertahan', 'ok') : pill('Gagal', 'bad')}</td></tr>`)) + `<p class="small">${esc(r.stress?.recommendation || '')}</p>`)}
     ${section('Integritas laporan & arus kas harian', rows([['Integritas', esc(r.integrity?.status_label || '—')], ['Catatan', esc(r.integrity?.summary || '')], r.daily_cashflow?.applicable ? ['Omzet per hari', rp(r.daily_cashflow.daily?.revenue)] : null, r.daily_cashflow?.applicable ? ['Sisihan cicilan per hari', rp(r.daily_cashflow.daily?.debt_service_set_aside)] : null, r.daily_cashflow?.applicable ? ['Rasio cakupan harian', times(r.daily_cashflow.coverage_ratio)] : null]))}
     ${section('Covenant', `<p class="small">${esc(r.covenant?.summary || '')}</p><ul class="small">${(r.covenant?.covenants || []).slice(0, 18).map((c) => `<li><strong>${esc(c.label)}</strong> — ${esc(c.description)}</li>`).join('')}</ul>`)}
     </div>`;
}

/* ------------------------------------------- segmen debitur kecil/besar --- */

/** Pill "Debitur kecil · Usaha mikro" dari omzet laporan (PP 7/2021). */
export function sizePill(keuangan) {
     const sz = debtorSize(keuangan);
     return sz ? `<span title="Omzet ${esc(rp(sz.omzet))} setahun — ${esc(sz.klasLabel.toLowerCase())} (PP 7/2021)">${pill(`${sz.label} · ${sz.klas}`, sz.key === 'kecil' ? 'ok plain' : 'info plain')}</span>` : '';
}

/**
 * Kartu rincian analis. Debitur kecil: ringkasan di atas sudah cukup untuk
 * memutus, jadi istilah bank (PD/LGD, RAROC, ATMR, covenant) dilipat.
 * Debitur besar: tampil lengkap seperti biasa. Angkanya sama persis.
 */
export function analystCard(result, keuangan) {
     if (!result) return '';
     const small = debtorSize(keuangan)?.key === 'kecil';
     if (!small) return card('Rincian analis', analystDetail(result), { sub: 'Angka teknis mesin MEZS.id' });
     return `<details class="card more" data-analyst-fold><summary>Rincian lengkap (istilah bank)</summary>
          <p class="small muted" style="margin:10px 0">Debitur kecil — ringkasan di atas sudah cukup untuk memutus. Angka teknis di bawah tetap dihitung untuk arsip &amp; komite.</p>
          ${analystDetail(result)}</details>`;
}
