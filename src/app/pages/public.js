/**
 * pages/public.js — Halaman utama, masuk, dan daftar.
 * Halaman utama memakai halaman depan dashboard lama apa adanya (src/legacy/landing.js).
 * Halaman masuk/daftar mengikuti alur dashboard lama (ui/login.js, ui/register.js):
 * pilihan Pemohon kredit / Tim lender dan akun pengujian.
 */

import { login, loginDemo, registerBorrower } from '../../services/core.js';
import { DEMO_USERS } from '../../core/auth-local.js';
import { esc, toast, track, formData } from '../ui.js';
import { render as renderLegacyLanding } from '../../legacy/landing.js';

const BRAND = 'MEZS.id';
const goHome = () => { location.hash = '#/beranda'; };

/** Logo MEZS.id (bentuk dari dashboard lama, warna design system baru). */
export const logoMark = (size = 32) =>
     `<svg class="logo-mark" width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true" focusable="false"><rect width="100" height="100" rx="24" fill="var(--logo-bg, #1f5fbf)"/><polyline points="22,76 22,36 46,60 74,26 74,76" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/><circle cx="74" cy="26" r="9" fill="#f0b429"/></svg>`;

/* ======================================================= HALAMAN UTAMA ==== */

/**
 * Halaman utama = halaman depan dashboard lama apa adanya (teks & tampilan),
 * dirender di Shadow DOM dengan CSS lama agar tidak bercampur dengan design system baru.
 */
export function landing(main) {
     main.innerHTML = '<div data-legacy-landing></div>';
     renderLegacyLanding(main.querySelector('[data-legacy-landing]'));
     return { title: 'Kredit usaha produktif', bare: true };
}

/* ============================================================== MASUK ==== */

const AUDIENCE_KEY = 'mezs.login.audience';
const COPY = {
     borrower: {
          eyebrow: 'Portal pemohon UMKM', title: 'Masuk untuk mengajukan & memantau kredit',
          intro: 'Lanjutkan pengajuan, unggah laporan keuangan, cek status, dan tanggapi penawaran dari lender.', placeholder: 'nama@usaha.id',
          hero: 'Ajukan kredit usaha secara online, <em>pantau</em> setiap tahapnya.',
          points: [['Unggah laporan apa adanya', 'PDF, Excel, CSV, atau foto laporan keuangan terbaca otomatis, tanpa mengetik ulang.'],
               ['Status selalu terlihat', 'Dari verifikasi dokumen sampai keputusan lender, lengkap dengan langkah perbaikan.'],
               ['Penawaran yang jelas', 'Plafon, tenor, bunga atau bagi hasil, dan total pembayaran tampil sebelum Anda setuju.']]
     },
     lender: {
          eyebrow: 'Akses tim lender', title: 'Masuk ke ruang kerja',
          intro: 'Tinjau pengajuan, kelola analisis, dan pantau tindak lanjut kredit.', placeholder: 'nama@perusahaan.id',
          hero: 'Keputusan kredit produktif yang <em>terukur</em> dan dapat ditelusuri.',
          points: [['Skoring 6 pilar &amp; grade', 'Kuantitatif + kualitatif dengan benchmark industri IDX.'],
               ['Satu halaman kerja per pengajuan', 'Dokumen, audit, agunan, dan wawancara tanpa pindah halaman.'],
               ['Peringatan dini pasca-pencairan', 'Pantau seluruh pinjaman bulanan dalam satu tabel.']]
     }
};

function initialAudience(params) {
     if (COPY[params.as]) return params.as;
     try { const saved = localStorage.getItem(AUDIENCE_KEY); if (COPY[saved]) return saved; } catch { /* penyimpanan tidak tersedia */ }
     return 'borrower';
}

function authShell(audience, inner) {
     const c = COPY[audience];
     return `<div class="auth">
          <aside class="auth-hero" aria-hidden="true">
               <a class="lp-brand" href="#/" tabindex="-1">${logoMark(34)}<span>${BRAND}</span></a>
               <h2>${c.hero}</h2>
               <ul>${c.points.map(([t, d]) => `<li><span class="auth-dot">✓</span><div><strong>${t}</strong><span>${d}</span></div></li>`).join('')}</ul>
          </aside>
          <div class="auth-main">
               <a class="auth-back" href="#/">← Beranda ${BRAND}</a>
               <div class="auth-brand-sm"><a class="lp-brand" href="#/">${logoMark(30)}<span>${BRAND}</span></a></div>
               ${inner}
               <p class="auth-foot">Mode pengujian lokal · akun dan data tersimpan di browser ini.</p>
          </div></div>`;
}

export function loginPage(main, params) {
     const paint = (audience, keepEmail = '') => {
          const c = COPY[audience];
          const demo = [...DEMO_USERS].sort((a, b) => Number(b.role === (audience === 'lender' ? 'lender' : 'borrower')) - Number(a.role === (audience === 'lender' ? 'lender' : 'borrower')));
          main.innerHTML = authShell(audience, `<section class="auth-card" aria-labelledby="login-title">
               <div class="auth-switch" role="group" aria-label="Masuk sebagai">
                    <button type="button" data-audience="borrower" aria-pressed="${audience === 'borrower'}">Pemohon kredit</button>
                    <button type="button" data-audience="lender" aria-pressed="${audience === 'lender'}">Tim lender</button></div>
               <p class="lp-eyebrow">${c.eyebrow}</p>
               <h1 id="login-title">${c.title}</h1>
               <p class="muted">${c.intro}</p>
               <form data-login novalidate>
                    <div class="field"><label for="li-email">Email</label><input id="li-email" name="email" type="email" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="${c.placeholder}" value="${esc(keepEmail)}" required></div>
                    <div class="field"><label for="li-pw">Kata sandi</label>
                         <div class="pw"><input id="li-pw" name="password" type="password" autocomplete="current-password" required aria-describedby="li-err">
                         <button type="button" class="btn btn-quiet btn-sm" data-pw aria-controls="li-pw" aria-pressed="false">Tampilkan</button></div></div>
                    <p class="err" id="li-err" role="alert" hidden></p>
                    <button class="btn btn-primary btn-block" type="submit">Masuk</button>
               </form>
               ${audience === 'borrower'
                    ? `<div class="auth-signup"><span>Belum punya akun?</span><a class="btn btn-gold btn-block" href="#/daftar">Daftar akun pemohon</a><p class="small muted">Cukup nama, email, dan kata sandi.</p></div>
                         <ol class="timeline small" style="margin-top:14px"><li><strong>Daftar akun</strong><span class="when">Buat akun pemohon dengan email Anda.</span></li><li><strong>Isi data &amp; unggah laporan</strong><span class="when">Angka keuangan terisi otomatis dari laporan.</span></li><li><strong>Pantau &amp; tanggapi</strong><span class="when">Lihat status, langkah perbaikan, dan penawaran.</span></li></ol>`
                    : `<p class="small muted" style="margin-top:14px">Akun tim dibuat oleh admin di menu Lainnya → Tim. Ingin mengajukan kredit? <button type="button" class="btn btn-quiet btn-sm" data-audience="borrower">Masuk sebagai pemohon</button></p>`}
               <details class="more"><summary>Coba akun pengujian</summary>
                    <p class="small muted">Klik untuk mengisi, atau masuk langsung. Data tersimpan di browser ini.</p>
                    <div class="grid">${demo.map((u) => `<div class="demo-user"><div><strong>${u.role === 'lender' ? 'Tim lender' : 'Pemohon UMKM'}</strong><br><code>${esc(u.email)}</code> · <code>${esc(u.password)}</code></div>
                         <div class="actions"><button type="button" class="btn btn-sm" data-fill="${esc(u.email)}" data-pass="${esc(u.password)}">Isi</button><button type="button" class="btn btn-sm btn-primary" data-demo="${u.role}">Masuk langsung</button></div></div>`).join('')}</div>
               </details>
          </section>`);
          bindLogin(main, audience, paint);
     };
     paint(initialAudience(params));
     return { title: 'Masuk', bare: true };
}

function bindLogin(main, audience, paint) {
     const form = main.querySelector('[data-login]');
     const email = form.elements.email;
     const pw = form.elements.password;
     const err = main.querySelector('#li-err');
     const clear = () => { err.hidden = true; email.removeAttribute('aria-invalid'); pw.removeAttribute('aria-invalid'); };
     const show = (msg) => { err.textContent = msg; err.hidden = false; email.setAttribute('aria-invalid', 'true'); pw.setAttribute('aria-invalid', 'true'); pw.focus(); };
     main.querySelectorAll('[data-audience]').forEach((b) => b.addEventListener('click', () => {
          try { localStorage.setItem(AUDIENCE_KEY, b.dataset.audience); } catch { /* opsional */ }
          paint(b.dataset.audience, email.value);
          main.querySelector(`[data-audience="${b.dataset.audience}"][aria-pressed]`)?.focus();
     }));
     main.querySelector('[data-pw]').addEventListener('click', (e) => {
          const show = pw.type === 'password';
          pw.type = show ? 'text' : 'password';
          e.currentTarget.textContent = show ? 'Sembunyikan' : 'Tampilkan';
          e.currentTarget.setAttribute('aria-pressed', String(show));
     });
     form.addEventListener('input', clear);
     main.querySelectorAll('[data-fill]').forEach((b) => b.addEventListener('click', () => {
          email.value = b.dataset.fill; pw.value = b.dataset.pass; clear();
          toast('Akun pengujian terisi. Tekan Masuk.', 'info', 2500);
     }));
     main.querySelectorAll('[data-demo]').forEach((b) => b.addEventListener('click', () => {
          const s = loginDemo(b.dataset.demo);
          track('login_demo', { role: b.dataset.demo });
          toast(`Selamat datang, ${s.name}.`);
          goHome();
     }));
     form.addEventListener('submit', (e) => {
          e.preventDefault();
          clear();
          const v = formData(form);
          if (!v.email.trim() || !v.password) return show('Isi email dan kata sandi.');
          const btn = form.querySelector('[type=submit]');
          btn.setAttribute('aria-busy', 'true');
          btn.disabled = true;
          try {
               const s = login(v.email, v.password);
               track('login', { role: s.role });
               if ((s.role === 'borrower') !== (audience === 'borrower')) toast(`Anda masuk sebagai ${s.role === 'borrower' ? 'pemohon' : 'tim lender'} sesuai akun.`, 'info', 4000);
               else toast(`Selamat datang, ${s.name}.`);
               goHome();
          } catch (ex) {
               show(ex.message);
          } finally {
               btn.removeAttribute('aria-busy');
               btn.disabled = false;
          }
     });
}

/* ============================================================== DAFTAR ==== */

export function register(main) {
     main.innerHTML = authShell('borrower', `<section class="auth-card" aria-labelledby="rg-title">
          <p class="lp-eyebrow">Portal pemohon UMKM</p>
          <h1 id="rg-title">Daftar akun pemohon</h1>
          <p class="muted">Akun ini untuk pemilik usaha. Akun tim lender dibuat oleh admin.</p>
          <form data-register novalidate>
               <div class="field"><label for="rg-name">Nama lengkap</label><input id="rg-name" name="name" type="text" autocomplete="name" required></div>
               <div class="field"><label for="rg-email">Email</label><input id="rg-email" name="email" type="email" autocomplete="email" placeholder="nama@usaha.id" required></div>
               <div class="field"><label for="rg-pw">Kata sandi</label><p class="hint">Minimal 6 karakter.</p><input id="rg-pw" name="password" type="password" autocomplete="new-password" minlength="6" required></div>
               <p class="err" data-err role="alert" hidden></p>
               <button class="btn btn-gold btn-block" type="submit">Daftar &amp; mulai pengajuan</button>
          </form>
          <p class="small" style="margin-top:12px">Sudah punya akun? <a href="#/masuk">Masuk</a></p>
     </section>`);
     main.querySelector('[data-register]').addEventListener('submit', (e) => {
          e.preventDefault();
          const err = main.querySelector('[data-err]');
          try {
               registerBorrower(formData(e.target));
               track('register');
               toast('Akun dibuat. Selamat datang!');
               location.hash = '#/ajukan';
          } catch (ex) {
               err.textContent = ex.message;
               err.hidden = false;
          }
     });
     return { title: 'Daftar', bare: true };
}
