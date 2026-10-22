/**
 * app/main.js — Kerangka aplikasi: rute, navigasi konsisten per peran,
 * breadcrumb, pencarian cepat, mode gelap, dan pengalihan sesuai peran.
 *
 * Menu (docs/REDESIGN_UX.md §5):
 *   Pemohon : Beranda · Ajukan · Pengajuan saya
 *   Petugas : Beranda · Pengajuan · Nasabah · Portofolio · Lainnya
 */

import { session, sessionIsLender, logout } from '../services/core.js';
import { loadApplications, loadBorrowers } from '../data/storage.js';
import { esc, icon, prefs, setPref, applyTheme, track } from './ui.js';
import * as pub from './pages/public.js';
import * as borrower from './pages/borrower.js';
import * as lender from './pages/lender.js';
import * as customers from './pages/customers.js';
import * as more from './pages/more.js';

const NAV = {
     borrower: [
          { href: '#/beranda', label: 'Beranda', icon: 'home' },
          { href: '#/ajukan', label: 'Ajukan', icon: 'plus' },
          { href: '#/pengajuan', label: 'Pengajuan saya', short: 'Pengajuan', icon: 'list' }
     ],
     lender: [
          { href: '#/beranda', label: 'Beranda', icon: 'home' },
          { href: '#/pengajuan', label: 'Pengajuan', icon: 'list' },
          { href: '#/nasabah', label: 'Nasabah', icon: 'users' },
          { href: '#/portofolio', label: 'Portofolio', icon: 'chart' },
          { href: '#/lainnya', label: 'Lainnya', icon: 'more' }
     ]
};

/** Rute → penangan. Penangan mengisi `main` dan mengembalikan {title, crumbs}. */
const ROUTES = {
     public: { '': pub.welcome, masuk: pub.welcome, daftar: pub.register },
     borrower: {
          beranda: borrower.home,
          ajukan: borrower.apply,
          pengajuan: (m, p, c) => (p.id ? borrower.detail(m, p, c) : borrower.list(m, p, c))
     },
     lender: {
          beranda: lender.home,
          pengajuan: (m, p, c) => (p.id ? lender.review(m, p, c) : lender.queue(m, p, c)),
          nasabah: (m, p, c) => (p.id ? customers.detail(m, p, c) : customers.list(m, p, c)),
          portofolio: more.portfolio,
          lainnya: more.menu,
          analisis: more.manual,
          panduan: more.guide,
          pengaturan: more.settings,
          tim: more.team
     }
};

function parseHash() {
     const raw = location.hash.replace(/^#\/?/, '').split('#')[0];
     const [path, query = ''] = raw.split('?');
     const [page = '', id = ''] = path.split('/').map(decodeURIComponent);
     return { page, params: { ...Object.fromEntries(new URLSearchParams(query)), ...(id ? { id } : {}) } };
}

const roleOf = () => {
     const s = session();
     if (!s) return 'public';
     return sessionIsLender() ? 'lender' : 'borrower';
};

/* ------------------------------------------------------------ shell ----- */

function shell(role) {
     const s = session();
     const nav = NAV[role] || [];
     const roleLabel = role === 'lender' ? 'Petugas' : role === 'borrower' ? 'Pemohon' : '';
     const theme = prefs().theme;
     const themeIcon = theme === 'dark' ? 'sun' : 'moon';
     const search = role === 'lender'
          ? `<div class="search" data-search><label class="sr-only" for="q-SLOT">Cari nasabah atau pengajuan</label>${icon('search', 16)}
               <input id="q-SLOT" type="search" role="combobox" aria-expanded="false" aria-controls="q-SLOT-list" aria-autocomplete="list" autocomplete="off" placeholder="Cari nasabah / pengajuan…">
               <ul class="search-list" id="q-SLOT-list" role="listbox" hidden></ul></div>`
          : '';
     return `<a class="skip" href="#main">Lewati ke isi</a>
     <header class="topbar"><div class="topbar-in">
          <a class="brand" href="#/${role === 'public' ? '' : 'beranda'}"><span class="brand-mark" aria-hidden="true">M</span><span>MEZS.id<br><small>Pinjaman usaha</small></span></a>
          ${nav.length ? `<nav class="topnav" aria-label="Menu utama">${nav.map((n) => `<a href="${n.href}" data-nav="${n.href}">${esc(n.label)}</a>`).join('')}</nav>` : ''}
          ${search.replaceAll('SLOT', 'd')}
          <div class="top-tools">
               ${s ? `<div class="user-chip">${esc(s.name || s.email)}<span>${roleLabel}</span></div>` : ''}
               <button class="icon-btn" type="button" data-theme-toggle aria-label="Ganti mode terang/gelap" title="Mode terang/gelap">${icon(themeIcon)}</button>
               ${s ? `<button class="icon-btn" type="button" data-logout aria-label="Keluar" title="Keluar">${icon('logout')}</button>` : ''}
          </div>
     </div>${search ? `<div class="search-mobile">${search.replaceAll('SLOT', 'm')}</div>` : ''}</header>
     <nav class="crumbs" aria-label="Breadcrumb" data-crumbs hidden></nav>
     <main id="main" tabindex="-1" data-main></main>
     ${nav.length ? `<nav class="bottomnav" aria-label="Menu utama (HP)">${nav.map((n) => `<a href="${n.href}" data-nav="${n.href}">${icon(n.icon, 22)}<span>${esc(n.short || n.label)}</span></a>`).join('')}</nav>` : ''}
     <div class="toasts" data-toasts aria-live="polite"></div>`;
}

let mountedRole = null;
const root = () => document.getElementById('app');

function mountShell(role) {
     root().innerHTML = shell(role);
     mountedRole = role;
     root().querySelector('[data-theme-toggle]').onclick = () => {
          const cur = prefs().theme;
          const dark = cur === 'dark' || (cur === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
          const next = dark ? 'light' : 'dark';
          setPref('theme', next);
          applyTheme(next);
          root().querySelector('[data-theme-toggle]').innerHTML = icon(next === 'dark' ? 'sun' : 'moon');
     };
     root().querySelector('[data-logout]')?.addEventListener('click', () => {
          logout();
          track('logout');
          location.hash = '#/';
          render();
     });
     root().querySelectorAll('[data-search]').forEach(bindSearch);
}

function setCrumbs(crumbs) {
     const el = root().querySelector('[data-crumbs]');
     if (!crumbs || crumbs.length < 2) { el.hidden = true; el.innerHTML = ''; return; }
     el.hidden = false;
     el.innerHTML = `<ol>${crumbs.map((c, i) => (i === crumbs.length - 1 ? `<li><span aria-current="page">${esc(c.label)}</span></li>` : `<li><a href="${esc(c.href)}">${esc(c.label)}</a></li>`)).join('')}</ol>`;
}

function markNav(page) {
     root().querySelectorAll('[data-nav]').forEach((a) => {
          const target = a.dataset.nav.replace('#/', '');
          const lainnya = ['analisis', 'panduan', 'pengaturan', 'tim'].includes(page) && target === 'lainnya';
          if (target === page || lainnya) a.setAttribute('aria-current', 'page');
          else a.removeAttribute('aria-current');
     });
}

/* ----------------------------------------------------- pencarian cepat --- */

function searchIndex() {
     const apps = loadApplications().filter((a) => a.status !== 'draft').map((a) => ({
          label: (a.payload?.borrower || a.borrower || {}).nama || a.id, kind: 'Pengajuan', href: `#/pengajuan/${encodeURIComponent(a.id)}`
     }));
     const borrowers = loadBorrowers().map((b) => ({ label: b.nama || b.id, kind: 'Nasabah', href: `#/nasabah/${encodeURIComponent(b.id)}` }));
     return [...apps, ...borrowers];
}

function bindSearch(box) {
     const input = box.querySelector('input');
     const list = box.querySelector('ul');
     let items = [];
     let active = -1;
     const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); active = -1; };
     const paint = () => {
          const q = input.value.trim().toLowerCase();
          if (!q) return close();
          items = searchIndex().filter((x) => x.label.toLowerCase().includes(q)).slice(0, 8);
          list.innerHTML = items.length
               ? items.map((x, i) => `<li role="option" id="${list.id}-${i}" aria-selected="${i === active}" data-i="${i}"><span>${esc(x.label)}</span><span class="kind">${x.kind}</span></li>`).join('')
               : '<li role="option" aria-disabled="true"><span class="muted">Tidak ditemukan</span></li>';
          list.hidden = false;
          input.setAttribute('aria-expanded', 'true');
          if (active >= 0) input.setAttribute('aria-activedescendant', `${list.id}-${active}`);
          else input.removeAttribute('aria-activedescendant');
     };
     const go = (i) => {
          const x = items[i];
          if (!x) return;
          track('search_open', { kind: x.kind });
          input.value = '';
          close();
          location.hash = x.href;
     };
     input.addEventListener('input', () => { active = -1; paint(); });
     input.addEventListener('keydown', (e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(items.length - 1, active + 1); paint(); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); paint(); }
          else if (e.key === 'Enter') { e.preventDefault(); go(active >= 0 ? active : 0); }
          else if (e.key === 'Escape') close();
     });
     list.addEventListener('mousedown', (e) => { const li = e.target.closest('[data-i]'); if (li) { e.preventDefault(); go(Number(li.dataset.i)); } });
     input.addEventListener('blur', () => setTimeout(close, 120));
}

/* ------------------------------------------------------------ render ---- */

export function render() {
     const role = roleOf();
     let { page, params } = parseHash();
     const table = ROUTES[role];
     if (role === 'public' && !(page in table)) page = '';
     if (role !== 'public' && !(page in table)) { location.replace('#/beranda'); page = 'beranda'; params = {}; }
     if (mountedRole !== role) mountShell(role);
     const main = root().querySelector('[data-main]');
     let meta = {};
     try {
          meta = table[page](main, params, { refresh: render }) || {};
     } catch (err) {
          console.error(err);
          main.innerHTML = `<div class="callout bad"><strong>Halaman gagal dimuat.</strong> ${esc(err.message)} <a href="#/beranda">Kembali ke Beranda</a></div>`;
     }
     document.title = `${meta.title ? `${meta.title} · ` : ''}MEZS.id`;
     setCrumbs(meta.crumbs);
     markNav(page);
}

let lastPage = null;
function onRoute() {
     const { page } = parseHash();
     render();
     if (page !== lastPage) {
          window.scrollTo(0, 0);
          root().querySelector('[data-main]')?.focus({ preventScroll: true });
          track('view', { page: page || 'masuk', role: roleOf() });
     }
     lastPage = page;
}

applyTheme();
window.addEventListener('hashchange', onRoute);
/* Data dapat berubah di tab lain (pemohon & petugas memakai browser yang sama). */
window.addEventListener('storage', (e) => { if (e.key && e.key.startsWith('pla.')) render(); });
onRoute();
