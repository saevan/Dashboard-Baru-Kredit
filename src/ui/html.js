/**
 * ui/html.js — Pembantu kecil penyusun HTML (escape, format angka, input).
 */

import { rupiah } from '../simple/translate.js';

export const esc = (v) =>
     String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const fmtInput = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString('id-ID') : '');
export const pct = (v, d = 1) => (Number.isFinite(v) ? `${(v * 100).toLocaleString('id-ID', { maximumFractionDigits: d })}%` : '—');
export const num = (v, d = 2) => (Number.isFinite(v) ? v.toLocaleString('id-ID', { maximumFractionDigits: d }) : '—');
export const fullRp = (v) => (Number.isFinite(v) ? `Rp ${Math.round(v).toLocaleString('id-ID')}` : '—');
export const dateLabel = (iso) => (iso ? new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

export const options = (list, selected) =>
     list.map((o) => `<option value="${esc(o.key)}"${o.key === selected ? ' selected' : ''}>${esc(o.label)}</option>`).join('');

/** Kotak isian rupiah. `attr` menentukan atribut data yang dibaca pengendali input. */
export function amountField({ id, attr = 'data-amount', path, label, hint = '', required = false, value = null }) {
     return `<label class="field" for="${esc(id)}">
          <span class="field-label">${esc(label)}${required ? ' <b class="req" aria-label="wajib">*</b>' : ''}</span>
          ${hint ? `<span class="field-hint">${esc(hint)}</span>` : ''}
          <span class="money"><span class="money-prefix">Rp</span><input id="${esc(id)}" type="text" inputmode="numeric" ${attr}="${esc(path)}" value="${esc(fmtInput(value))}" placeholder="contoh: 400.000.000"></span>
          <span class="field-echo" data-echo="${esc(path)}">${Number.isFinite(value) && value !== 0 ? `= ${esc(rupiah(value))}` : ''}</span>
     </label>`;
}

export function stars(n) {
     return `<span class="stars" aria-label="${n} dari 5 bintang">${'★'.repeat(n)}<span class="stars-off">${'★'.repeat(5 - n)}</span></span>`;
}

/** Linimasa bertahap (done / current / todo). */
export function timelineHtml(steps) {
     return `<ol class="steps">${steps.map((s) => `<li class="step-${s.state}"><span class="dot" aria-hidden="true"></span><span>${esc(s.label)}</span></li>`).join('')}</ol>`;
}
