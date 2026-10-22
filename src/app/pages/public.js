/**
 * pages/public.js — Halaman depan: pilih peran, masuk, daftar, simulasi
 * cicilan, dan daftar dokumen (landing + login + register dashboard lama).
 */

import { login, loginDemo, registerBorrower } from '../../services/core.js';
import { VERIFICATION_SOURCES } from '../../core/intake-config.js';
import { DOCUMENT_HINT } from '../../services/labels.js';
import { POLICY } from '../../services/simulation.js';
import { esc, card, toast, track, formData } from '../ui.js';
import { simulatorHtml, bindSimulator } from '../widgets.js';

const goHome = () => { location.hash = '#/beranda'; };

const FAQ = [
     ['Apakah pengajuan pasti disetujui?', 'Tidak. Persetujuan, jumlah, dan bunga ditentukan petugas setelah dokumen diperiksa. Bila ada yang perlu diperkuat, Anda menerima catatan perbaikan.'],
     ['Apakah saya harus mengetik ulang laporan keuangan?', 'Tidak. Kirim berkas apa adanya (PDF, Excel, CSV, atau foto). Angkanya dibaca otomatis, Anda cukup memeriksa.'],
     ['Di mana data saya disimpan?', 'Pada versi ini semua data tersimpan di browser perangkat ini saja (mode lokal), tidak dikirim ke server.'],
     ['Bisakah saya menolak penawaran?', 'Bisa. Penawaran dapat diterima atau ditolak dari halaman Pengajuan saya, dan berlaku 14 hari.']
];

export function welcome(main) {
     main.innerHTML = `
     <section class="hero">
          <h1>Pinjaman usaha yang jelas dari awal</h1>
          <p>Ajukan dalam 4 langkah, kirim laporan keuangan apa adanya, dan pantau statusnya. Petugas menilai dengan perhitungan yang sama dan tercatat.</p>
     </section>
     <div class="role-cards">
          ${card('', `<h2><span class="emoji" aria-hidden="true">🏪</span> Saya pemilik usaha</h2>
               <p class="muted">Ajukan pinjaman, unggah laporan, lihat penawaran.</p>
               <div class="actions"><button class="btn btn-primary" data-demo="borrower">Coba sebagai pemohon</button><a class="btn" href="#/daftar">Daftar akun baru</a></div>`)}
          ${card('', `<h2><span class="emoji" aria-hidden="true">🏦</span> Saya petugas bank</h2>
               <p class="muted">Periksa pengajuan, kirim penawaran, pantau pinjaman.</p>
               <div class="actions"><button class="btn btn-primary" data-demo="lender">Coba sebagai petugas</button></div>`)}
     </div>
     <div class="split" style="margin-top:14px">
          <div class="stack">
               ${card('Hitung perkiraan cicilan', `<p class="muted small">Ubah angka untuk melihat cicilan sebelum mengajukan. Jumlah hingga Rp ${(POLICY.maxPlafon / 1e9).toLocaleString('id-ID')} miliar, ${POLICY.minTenor}–${POLICY.maxTenor} bulan.</p>${simulatorHtml({ id: 'pub' })}`)}
               ${card('Pertanyaan umum', FAQ.map(([q, a]) => `<details class="more"><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join(''))}
          </div>
          <div class="stack">
               ${card('Masuk dengan email', `<form data-login novalidate>
                    <div class="field"><label for="li-email">Email</label><input id="li-email" name="email" type="email" autocomplete="username" required></div>
                    <div class="field"><label for="li-pw">Kata sandi</label><input id="li-pw" name="password" type="password" autocomplete="current-password" required></div>
                    <p class="err" data-login-err role="alert" hidden></p>
                    <button class="btn btn-primary btn-block" type="submit">Masuk</button>
                    <p class="small muted" style="margin-top:10px">Akun contoh: <code>umkm@demo.id</code> / <code>umkm123</code> (pemohon), <code>admin@demo.id</code> / <code>admin123</code> (petugas).</p>
               </form>`)}
               ${card('Dokumen yang perlu disiapkan', `<ul class="doclist">${VERIFICATION_SOURCES.map((s) => `<li><span>${esc(s.label)}<br><span class="small muted">${esc(DOCUMENT_HINT[s.key] || '')}</span></span>${s.mandatory ? '<span class="pill warn">Wajib</span>' : '<span class="pill plain">Opsional</span>'}</li>`).join('')}</ul>
                    <p class="small muted" style="margin-top:8px">PDF, JPG, PNG, Excel, atau CSV · maksimal 5 MB per berkas.</p>`)}
          </div>
     </div>`;
     main.querySelectorAll('[data-demo]').forEach((b) => b.addEventListener('click', () => {
          loginDemo(b.dataset.demo);
          track('login_demo', { role: b.dataset.demo });
          toast(b.dataset.demo === 'lender' ? 'Masuk sebagai petugas (akun contoh).' : 'Masuk sebagai pemohon (akun contoh).');
          goHome();
     }));
     main.querySelector('[data-login]').addEventListener('submit', (e) => {
          e.preventDefault();
          const v = formData(e.target);
          const err = main.querySelector('[data-login-err]');
          try {
               login(v.email, v.password);
               track('login');
               goHome();
          } catch (ex) {
               err.textContent = ex.message;
               err.hidden = false;
          }
     });
     bindSimulator(main);
     return { title: 'Masuk' };
}

export function register(main) {
     main.innerHTML = `<div style="max-width:520px;margin:0 auto">
          ${card('Daftar akun pemohon', `<p class="muted">Akun ini untuk pemilik usaha. Akun petugas dibuat oleh admin di menu Tim.</p>
          <form data-register novalidate>
               <div class="field"><label for="rg-name">Nama lengkap</label><input id="rg-name" name="name" type="text" autocomplete="name" required></div>
               <div class="field"><label for="rg-email">Email</label><input id="rg-email" name="email" type="email" autocomplete="email" required></div>
               <div class="field"><label for="rg-pw">Kata sandi</label><p class="hint">Minimal 6 karakter.</p><input id="rg-pw" name="password" type="password" autocomplete="new-password" minlength="6" required></div>
               <p class="err" data-err role="alert" hidden></p>
               <div class="actions"><button class="btn btn-primary" type="submit">Daftar &amp; masuk</button><a class="btn btn-quiet" href="#/">Sudah punya akun? Masuk</a></div>
          </form>`)}
     </div>`;
     main.querySelector('[data-register]').addEventListener('submit', (e) => {
          e.preventDefault();
          const err = main.querySelector('[data-err]');
          try {
               registerBorrower(formData(e.target));
               track('register');
               toast('Akun dibuat. Selamat datang!');
               goHome();
          } catch (ex) {
               err.textContent = ex.message;
               err.hidden = false;
          }
     });
     return { title: 'Daftar', crumbs: [{ label: 'Masuk', href: '#/' }, { label: 'Daftar' }] };
}
