/**
 * ui/result-view.js — Kartu hasil analisis (untuk petugas): status, peringkat,
 * alasan, jumlah aman, cicilan, bintang per pilar, uji kondisi sulit,
 * perbaikan, simulasi, dan rincian lengkap.
 */

import { analyze } from '../simple/analyze.js';
import { toPlain, plainMetrics, rupiah, TONE_WORD, PILLAR_PLAIN } from '../simple/translate.js';
import { periodUnit } from '../simple/loans.js';
import { borrowingBase } from '../core/disbursement.js';
import { esc, fmtInput, pct, num, fullRp, stars } from './html.js';

/** Kotak cicilan sesuai periode pilihan (harian/mingguan/bulanan). */
export function installmentKpi(inst, { amount }) {
     const unit = periodUnit(inst.periodicity);
     const perPeriod = inst.perPeriod ?? inst.monthly;
     return `<div class="kpi"><p class="kpi-label">Cicilan per ${esc(unit)}</p><p class="kpi-value">${esc(rupiah(perPeriod))}</p>
          <p class="kpi-sub">${unit === 'bulan' ? `${esc(inst.tenor)} bulan` : `setara ${esc(rupiah(inst.monthly))}/bulan`}, untuk ${esc(rupiah(amount))}</p></div>`;
}

export function renderResultCard({ result, atSuggested, lengkap, detailOpen, sim, keuangan }) {
     const v = toPlain(result, atSuggested);
     const open = lengkap || detailOpen;
     const sug = v.amount;
     const showSuggestion = sug.suggested > 0 && sug.suggested < sug.requested && sug.suggestedInstallment;
     const sugUnit = showSuggestion ? periodUnit(sug.suggestedInstallment.periodicity) : 'bulan';
     return `
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
               ${installmentKpi(v.installment, { amount: sug.requested })}
               ${v.installment.daily && v.installment.periodicity !== 'harian' ? `<div class="kpi"><p class="kpi-label">Sisihkan per hari kerja</p><p class="kpi-value">${esc(rupiah(v.installment.daily))}</p><p class="kpi-sub">agar cicilan selalu siap</p></div>` : ''}
          </div>
          <p class="sentence">${esc(sug.sentence)}</p>
          ${showSuggestion ? `<div class="suggest">
               <p><b>Saran:</b> pinjam <b>${esc(rupiah(sug.suggested))}</b> selama ${esc(sug.suggestedInstallment.tenor)} bulan. Cicilan sekitar <b>${esc(rupiah(sug.suggestedInstallment.perPeriod))} per ${esc(sugUnit)}</b>${sugUnit === 'bulan' ? '' : ` (setara ${esc(rupiah(sug.suggestedInstallment.monthly))}/bulan)`}.</p>
               ${sug.suggestedStatus ? `<p>Pada jumlah ini hasilnya: <span class="pill tone-${sug.suggestedStatus.tone}">${esc(sug.suggestedStatus.label)}</span></p>` : ''}
          </div>` : ''}

          ${sim ? renderSimulator(sim) : ''}

          <h3 class="sub">Nilai per bagian</h3>
          <ul class="pillars">${v.pillars.map((p) => `
               <li><span class="pillar-name">${esc(p.name)}${lengkap ? ` <span class="tech">${esc(num(p.score, 1))}</span>` : ''}</span>${stars(p.stars)}<span class="pillar-word">${esc(p.word)}</span></li>`).join('')}
          </ul>

          ${v.stress ? `<h3 class="sub">Perlu diingat</h3>
          <div class="callout">
               ${v.stress.caution ? `<p><b>${esc(v.stress.caution)}</b></p>` : ''}
               <p>${esc(v.stress.summary)}</p>
               <details><summary>Lihat kondisi yang diuji</summary>
                    <ul class="stress">${v.stress.items.map((s) => `<li class="${s.survives ? 'ok' : 'fail'}"><span>${s.survives ? '✓ Tahan' : '✕ Belum tahan'}</span> jika ${esc(s.text)}</li>`).join('')}</ul>
               </details>
          </div>` : ''}

          <h3 class="sub">Yang bisa diperbaiki pemohon</h3>
          ${v.fixes.length ? `<ul class="plain-list fix-list">${v.fixes.map((f) => `<li>${esc(f.text)}</li>`).join('')}</ul>` : '<p class="muted">Tidak ada yang perlu diperbaiki dari data yang diisi.</p>'}

          <p class="disclaimer">${v.grade ? `${esc(v.grade.disclaimer)} ` : ''}${esc(v.footnote)}</p>

          ${lengkap ? '' : `<button type="button" class="btn ghost wide" data-action="detail" aria-expanded="${open}">${open ? 'Sembunyikan detail perhitungan' : 'Lihat detail perhitungan'}</button>`}
          ${open ? renderDetail(result, keuangan) : ''}`;
}

/* ---------------------------------------------- simulasi "bagaimana jika" */

export function renderSimulator(sim) {
     return `<h3 class="sub">Coba: bagaimana jika?</h3>
     <div class="sim">
          <p class="muted">Ubah jumlah, lama, atau bunga — hasilnya dihitung ulang oleh mesin yang sama.</p>
          <div class="field-grid">
               <label class="field" for="sim-amount"><span class="field-label">Jumlah pinjaman</span>
                    <span class="money"><span class="money-prefix">Rp</span><input id="sim-amount" type="text" inputmode="numeric" data-sim="amount" value="${esc(fmtInput(sim.amount))}"></span></label>
               <label class="field" for="sim-tenor"><span class="field-label">Lama pinjaman: <output data-sim-tenor>${esc(sim.tenor)} bulan</output></span>
                    <input id="sim-tenor" type="range" min="6" max="120" step="6" data-sim="tenor" value="${esc(sim.tenor)}"></label>
               <label class="field" for="sim-rate"><span class="field-label">Bunga per tahun (%)</span>
                    <input id="sim-rate" type="number" min="0" max="60" step="0.5" data-sim="rate" value="${esc(Math.round(sim.rate * 1000) / 10)}"></label>
          </div>
          <div class="sim-out" data-sim-out aria-live="polite">${simOutput(sim)}</div>
     </div>`;
}

export function simOutput(sim) {
     const { amount, tenor, rate, base } = sim;
     if (!(amount > 0) || !(tenor > 0)) return '<p class="muted">Isi jumlah dan lama pinjaman.</p>';
     const result = analyze({ ...base, plafon_diajukan: amount, tenor_bulan: tenor, bunga_tahunan: rate });
     const v = toPlain(result);
     const dscr = result.ratios?.dscr;
     const unit = periodUnit(v.installment.periodicity);
     return `<p><span class="pill tone-${v.status.tone}">${esc(v.status.label)}</span> ${v.grade ? `<b>${esc(v.grade.grade)}</b> — ${esc(v.grade.label)}` : ''}</p>
          <p>Cicilan <b>${esc(rupiah(v.installment.perPeriod))}/${esc(unit)}</b>${Number.isFinite(dscr) ? ` · uang usaha ${esc(num(dscr, 2))} kali cicilan` : ''}.</p>
          <p class="muted">${esc(v.reason)}</p>`;
}

/* -------------------------------------------- detail (tampilan lengkap) - */

const row = (cells) => `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;

function renderDetail(r, keuangan = {}) {
     const credit = r.credit || {};
     const pricing = r.risk?.pricing || {};
     const bu = pricing.build_up || {};
     const bb = borrowingBase(keuangan || {});
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
          <h3 class="sub">Rincian untuk analis</h3>
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
