/**
 * app/widgets.js — Komponen berulang lintas layar: simulasi cicilan,
 * ringkasan penawaran, bunga efektif, dan linimasa pengajuan.
 */

import { simulate, POLICY } from '../services/simulation.js';
import { normalizeLoanCost } from '../core/loan-cost.js';
import { PERIODICITY_LABELS } from '../core/debt-service.js';
import { APPLICATION_STAGES } from '../core/intake-config.js';
import { stageOf } from '../core/application.js';
import { esc, rp, pct, rows, dateTime, track } from './ui.js';

const UNIT = { harian: 'hari', mingguan: 'minggu', bulanan: 'bulan' };

/* ---------------------------------------------------- simulasi cicilan --- */

export function simulatorHtml({ plafon = 100_000_000, tenor = 12, bunga = 14, id = 'sim' } = {}) {
     return `<form class="sim" data-sim="${esc(id)}" novalidate>
          <div class="form-grid">
               <div class="field"><label for="${id}-plafon">Jumlah pinjaman (Rp)</label>
                    <input id="${id}-plafon" name="plafon" type="number" inputmode="numeric" min="1" max="${POLICY.maxPlafon}" step="1000000" value="${plafon}"></div>
               <div class="field"><label for="${id}-tenor">Lama pinjaman (bulan)</label>
                    <input id="${id}-tenor" name="tenor" type="number" inputmode="numeric" min="${POLICY.minTenor}" max="${POLICY.maxTenor}" value="${tenor}"></div>
               <div class="field"><label for="${id}-bunga">Bunga flat per tahun (%)</label>
                    <input id="${id}-bunga" name="bunga" type="number" inputmode="decimal" min="0" step="0.5" value="${bunga}"></div>
               <div class="field"><span class="label" id="${id}-per">Cicil setiap</span>
                    <div class="scale" role="radiogroup" aria-labelledby="${id}-per">${Object.entries(PERIODICITY_LABELS).map(([k, l]) => `<label><input type="radio" name="periodicity" value="${k}"><span>${esc(l)}</span></label>`).join('')}</div></div>
          </div>
          <div data-sim-out aria-live="polite"></div>
     </form>`;
}

export function bindSimulator(root) {
     const form = root.querySelector('[data-sim]');
     if (!form) return;
     const out = form.querySelector('[data-sim-out]');
     let touched = false;
     const paint = () => {
          const v = Object.fromEntries(new FormData(form));
          const r = simulate({ plafon: v.plafon, tenor: v.tenor, bungaPersen: v.bunga, periodicity: touched ? v.periodicity : null });
          if (r.error) { out.innerHTML = `<p class="callout warn" role="alert">${esc(r.error)}</p>`; return; }
          if (!touched) form.querySelector(`[name=periodicity][value=${r.periodicity}]`).checked = true;
          const unit = UNIT[r.periodicity];
          out.innerHTML = `<div class="kpis" style="margin-bottom:10px">
               <div class="kpi"><b>${rp(r.periodic.per_period)}</b><span>Sisihkan per ${unit}</span></div>
               <div class="kpi"><b>${rp(r.inst.first_payment)}</b><span>Cicilan per bulan</span></div>
               <div class="kpi"><b>${rp(r.inst.total_interest)}</b><span>Total bunga</span></div>
               <div class="kpi"><b>${rp(r.inst.total_payment)}</b><span>Total dibayar</span></div></div>
               ${costLine(r.cost)}
               <p class="small muted">Usaha seukuran ini biasanya menyisihkan uang <strong>${esc(r.periodicityLabel.toLowerCase())}</strong> (${esc(r.segment.label)}). Simulasi bukan penawaran; belum termasuk biaya admin, provisi, asuransi, atau denda.</p>`;
     };
     form.addEventListener('input', (e) => { if (e.target.name === 'periodicity') touched = true; paint(); });
     form.addEventListener('change', () => track('simulate'), { once: true });
     paint();
}

/** Bunga efektif tahunan dari jadwal (core/loan-cost). */
export function costLine(raw) {
     const cost = normalizeLoanCost(raw);
     if (!cost) return '';
     return `<p class="small"><strong>Setara bunga efektif ${esc(pct(cost.effective_annual_rate, 2))} per tahun</strong>
          <span class="muted">(${esc(pct(cost.monthly_rate, 2))} per bulan dari sisa pinjaman). Bunga flat terlihat lebih kecil karena dihitung dari pinjaman awal.</span></p>`;
}

/* ------------------------------------------------------ penawaran -------- */

export function offerTermsHtml(offer) {
     if (!offer?.terms) return '<p class="muted">Rincian cicilan belum tersedia.</p>';
     const t = offer.terms;
     const unit = UNIT[t.periodicity] || 'bulan';
     if (offer.basis === 'net_profit') {
          return rows([
               ['Jumlah pinjaman', rp(offer.amount)],
               ['Lama', `${t.tenor_bulan} bulan`],
               ['Pokok wajib per bulan', rp(t.principal_installment)],
               ['Bagi hasil', `${pct(offer.share_ratio, 1)} dari laba bersih bulanan`],
               ['Perkiraan bayar per bulan', rp(t.installment)],
               ['Perkiraan total dibayar', rp(t.total_payment)]
          ]) + '<p class="small muted">Bila usaha rugi di suatu bulan, bagi hasil nol; pokok tetap dibayar. Angka bagi hasil adalah perkiraan dari laba historis.</p>';
     }
     return rows([
          ['Jumlah pinjaman', rp(offer.amount)],
          ['Lama', `${t.tenor_bulan} bulan`],
          ['Bunga flat', `${pct(offer.rate, 2)} per tahun`],
          [`Cicilan per ${unit}`, `<strong>${rp(t.installment)}</strong>`],
          t.periodicity !== 'bulanan' ? ['Setara per bulan', rp(t.first_payment)] : null,
          ['Total bunga', rp(t.total_interest)],
          ['Total dibayar', rp(t.total_payment)]
     ]) + costLine(t.cost_disclosure);
}

/* ------------------------------------------------------- linimasa -------- */

export function timelineHtml(app) {
     const status = app.status || 'draft';
     const cur = APPLICATION_STAGES.findIndex((s) => s.key === stageOf(status));
     const at = (key) => {
          const ev = [...(app.events || [])].reverse().find((e) => APPLICATION_STAGES.find((s) => s.key === key)?.statuses.includes(e.to));
          return ev?.at ? `<span class="when">${esc(dateTime(ev.at))}</span>` : '';
     };
     const label = (s) => (s.key === 'decision' && ['rejected', 'declined'].includes(status) ? (status === 'declined' ? 'Penawaran ditolak' : 'Pengajuan ditolak') : s.key === 'decision' && status === 'accepted' ? 'Penawaran diterima' : s.label);
     return `<ol class="timeline">${APPLICATION_STAGES.map((s, i) => {
          const cls = status === 'draft' ? '' : i < cur ? 'done' : i === cur ? (['accepted', 'decided'].includes(status) ? 'done' : 'now') : '';
          return `<li class="${cls}">${esc(label(s))}${at(s.key)}</li>`;
     }).join('')}</ol>`;
}
