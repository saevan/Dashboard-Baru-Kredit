/**
 * app/ui.js — Perangkat tampilan bersama: escape, format, komponen kecil,
 * umpan balik (toast, dialog konfirmasi di halaman), preferensi, dan catatan
 * penggunaan lokal. Satu sumber gaya agar semua layar konsisten.
 */

import { formatRupiah, formatDate, formatDateTime } from '../utils/format.js';
import { rupiah as rupiahShort } from '../services/plain.js';

export const esc = (v) =>
     String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const rp = (v) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? '—' : formatRupiah(Math.round(Number(v))));
export const rpShort = rupiahShort;
export const pct = (ratio, d = 1) => (ratio === null || ratio === undefined || !Number.isFinite(Number(ratio)) ? '—' : `${(Number(ratio) * 100).toLocaleString('id-ID', { maximumFractionDigits: d })}%`);
export const times = (v, d = 2) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? '—' : `${Number(v).toLocaleString('id-ID', { maximumFractionDigits: d })}×`);
export const num = (v, d = 0) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? '—' : Number(v).toLocaleString('id-ID', { maximumFractionDigits: d }));
export const date = (iso) => (iso ? formatDate(iso) : '—');
export const dateTime = (iso) => (iso ? formatDateTime(iso) : '—');

/* --------------------------------------------------------- komponen ----- */

export const pill = (text, tone = '') => `<span class="pill ${tone}">${esc(text)}</span>`;

/** Lampu hijau/kuning/merah → nada CSS. */
export const TONE = { hijau: 'ok', kuning: 'warn', merah: 'bad', ok: 'ok', warn: 'warn', bad: 'bad', info: 'info', danger: 'bad', warning: 'warn' };

export function answer({ eyebrow = '', title, text = '', tone = 'info', body = '', actions = '' }) {
     return `<section class="answer ${TONE[tone] || tone}" aria-live="polite">
          ${eyebrow ? `<div class="eyebrow">${esc(eyebrow)}</div>` : ''}
          <h2>${esc(title)}</h2>${text ? `<p>${esc(text)}</p>` : ''}${body}
          ${actions ? `<div class="actions">${actions}</div>` : ''}
     </section>`;
}

export function card(title, body, { sub = '', actions = '', id = '', level = 2 } = {}) {
     return `<section class="card"${id ? ` id="${esc(id)}"` : ''}>
          ${title ? `<div class="card-head"><h${level}>${esc(title)}</h${level}>${sub ? `<span class="muted small">${sub}</span>` : ''}${actions}</div>` : ''}
          ${body}
     </section>`;
}

export const rows = (pairs) =>
     `<dl class="rows">${pairs.filter(Boolean).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>`;

export const kpi = (label, value, href = '') =>
     href ? `<a class="kpi" href="${esc(href)}"><b>${value}</b><span>${esc(label)}</span></a>` : `<div class="kpi"><b>${value}</b><span>${esc(label)}</span></div>`;

export const empty = (title, text = '', action = '') => `<div class="empty"><h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}${action}</div>`;

export function stars(n) {
     const k = Math.max(0, Math.min(5, Number(n) || 0));
     return `<span class="stars" aria-label="${k} dari 5 bintang">${'★'.repeat(k)}<span class="off">${'★'.repeat(5 - k)}</span></span>`;
}

export function bar(value, max = 100, tone = '') {
     const w = Math.max(0, Math.min(100, (Number(value) / max) * 100 || 0));
     return `<div class="bar ${tone}" role="presentation"><i style="width:${w.toFixed(1)}%"></i></div>`;
}

/** Langkah bertahap (wizard / peninjauan). items: [{label, href?}] */
export function steps(items, current) {
     return `<ol class="steps" aria-label="Langkah">${items.map((s, i) => {
          const cls = i < current ? 'done' : i === current ? 'now' : '';
          const inner = `<span class="n">${esc(s.label)}</span>`;
          return `<li class="${cls}"${i === current ? ' aria-current="step"' : ''}>${s.href && i !== current ? `<a href="${esc(s.href)}">${inner}</a>` : inner}</li>`;
     }).join('')}</ol>`;
}

export function field({ id, label, hint = '', control, error = '' }) {
     return `<div class="field"><label for="${esc(id)}">${esc(label)}</label>${hint ? `<p class="hint" id="${esc(id)}-hint">${esc(hint)}</p>` : ''}${control}${error ? `<p class="err" role="alert">${esc(error)}</p>` : ''}</div>`;
}

export const options = (list, selected, placeholder = '') =>
     (placeholder ? `<option value="">${esc(placeholder)}</option>` : '') +
     list.map((o) => `<option value="${esc(o.key)}"${String(o.key) === String(selected ?? '') ? ' selected' : ''}>${esc(o.label)}</option>`).join('');

export function choices(name, list, selected) {
     return `<div class="choices" role="radiogroup">${list.map((o) => `<label class="choice"><input type="radio" name="${esc(name)}" value="${esc(o.key)}"${String(o.key) === String(selected ?? '') ? ' checked' : ''}><span>${esc(o.label)}${o.hint ? `<small>${esc(o.hint)}</small>` : ''}</span></label>`).join('')}</div>`;
}

/* ------------------------------------------------------- umpan balik ---- */

let toastHost = null;
export function toast(message, tone = 'ok', ms = 3800) {
     if (!toastHost?.isConnected) toastHost = document.querySelector('[data-toasts]');
     if (!toastHost) return;
     /* Pesan yang sama tidak menumpuk; paling banyak 3 sekaligus. */
     for (const t of toastHost.querySelectorAll('.toast')) if (t.firstElementChild?.textContent === message) t.remove();
     while (toastHost.children.length >= 3) toastHost.firstElementChild.remove();
     const el = document.createElement('div');
     el.className = `toast ${TONE[tone] || tone}`;
     el.setAttribute('role', tone === 'bad' ? 'alert' : 'status');
     el.innerHTML = `<span>${esc(message)}</span><button type="button" aria-label="Tutup">✕</button>`;
     el.querySelector('button').onclick = () => el.remove();
     toastHost.append(el);
     setTimeout(() => el.remove(), ms);
}

/**
 * Konfirmasi di halaman (bukan dialog browser). Bisa meminta catatan.
 * @returns {Promise<null|{note:string}>}
 */
export function confirmSheet({ title, message = '', confirm = 'Ya, lanjutkan', danger = false, note = null }) {
     return new Promise((resolve) => {
          const dlg = document.createElement('dialog');
          dlg.className = 'sheet';
          dlg.setAttribute('aria-labelledby', 'sheet-title');
          dlg.innerHTML = `<form method="dialog">
               <h2 id="sheet-title">${esc(title)}</h2>
               ${message ? `<p>${esc(message)}</p>` : ''}
               ${note ? `<div class="field"><label for="sheet-note">${esc(note.label)}</label><textarea id="sheet-note" ${note.required ? 'required' : ''} placeholder="${esc(note.placeholder || '')}">${esc(note.value || '')}</textarea></div>` : ''}
               <div class="actions end"><button class="btn" value="cancel" type="submit" formnovalidate>Batal</button>
               <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" value="ok" type="submit">${esc(confirm)}</button></div></form>`;
          document.body.append(dlg);
          dlg.addEventListener('close', () => {
               const ok = dlg.returnValue === 'ok';
               const text = dlg.querySelector('#sheet-note')?.value?.trim() || '';
               dlg.remove();
               resolve(ok ? { note: text } : null);
          });
          if (typeof dlg.showModal === 'function') dlg.showModal();
          else dlg.setAttribute('open', '');
          (dlg.querySelector('textarea') || dlg.querySelector('.btn-primary, .btn-danger'))?.focus();
     });
}

/** Jalankan aksi dengan keadaan tombol "sedang diproses" + toast hasil. */
export async function busy(button, fn, { ok = '', fail = 'Gagal' } = {}) {
     if (button) { button.setAttribute('aria-busy', 'true'); button.disabled = true; }
     try {
          const out = await fn();
          if (ok) toast(typeof ok === 'function' ? ok(out) : ok, 'ok');
          return out;
     } catch (err) {
          toast(`${fail}: ${err?.message || err}`, 'bad', 6000);
          return undefined;
     } finally {
          if (button?.isConnected) { button.removeAttribute('aria-busy'); button.disabled = false; }
     }
}

/* -------------------------------------------------------- preferensi ---- */

const PREF_KEY = 'mezs.prefs.v1';
const safeGet = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const safeSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* penyimpanan tidak tersedia */ } };

export function prefs() { return { theme: 'auto', detail: 'lengkap', ...(safeGet(PREF_KEY) || {}) }; }
export function setPref(key, value) { safeSet(PREF_KEY, { ...prefs(), [key]: value }); }

export function applyTheme(theme = prefs().theme) {
     const root = document.documentElement;
     if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
     else delete root.dataset.theme;
}

/* -------------------------------------------- catatan penggunaan lokal ---- */

const STATS_KEY = 'mezs.analytics.v1';
/** Catat peristiwa penggunaan (hanya di browser ini, tidak dikirim keluar). */
export function track(name, detail = {}) {
     const data = safeGet(STATS_KEY) || { events: [] };
     data.events.push({ name, at: new Date().toISOString(), ...detail });
     if (data.events.length > 500) data.events = data.events.slice(-500);
     safeSet(STATS_KEY, data);
}
export const usage = () => (safeGet(STATS_KEY) || { events: [] }).events;
export const clearUsage = () => safeSet(STATS_KEY, { events: [] });

/* ------------------------------------------------------------- ikon ---- */

const ICON = {
     home: '<path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
     plus: '<path d="M12 5v14M5 12h14"/>',
     list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
     users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
     chart: '<path d="M3 3v18h18M7 15l4-4 3 3 5-6"/>',
     more: '<path d="M5 12h.01M12 12h.01M19 12h.01"/>',
     search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
     moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
     sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
     logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>'
};
export const icon = (name, size = 20) =>
     `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name] || ''}</svg>`;

/** Baca isi berkas pilihan pengguna sebagai byte. */
export async function fileBytes(file) {
     return new Uint8Array(await file.arrayBuffer());
}

/** Pasang area seret-lepas berkas. */
export function bindDrop(zone, onFiles) {
     if (!zone) return;
     const input = zone.querySelector('input[type=file]');
     zone.querySelector('[data-pick]')?.addEventListener('click', () => input.click());
     input?.addEventListener('change', () => { if (input.files.length) onFiles([...input.files]); input.value = ''; });
     zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('over'); });
     zone.addEventListener('dragleave', () => zone.classList.remove('over'));
     zone.addEventListener('drop', (e) => { e.preventDefault(); zone.classList.remove('over'); if (e.dataTransfer?.files?.length) onFiles([...e.dataTransfer.files]); });
}

/** Ambil nilai form → objek (checkbox = boolean). */
export function formData(form) {
     const out = {};
     for (const el of form.elements) {
          if (!el.name || el.disabled) continue;
          if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; continue; }
          if (el.type === 'checkbox') { out[el.name] = el.checked; continue; }
          out[el.name] = el.value;
     }
     return out;
}
