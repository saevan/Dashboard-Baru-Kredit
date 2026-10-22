/**
 * pages/public.js — Halaman utama, masuk, dan daftar.
 * Isi & alur mengikuti dashboard lama (ui/landing.js, ui/login.js, ui/register.js):
 * cerita "Hari ini → Dengan MEZS.id", cara kerja, simulasi, persyaratan, rumus
 * terbuka, status, FAQ, penutup; halaman masuk terbelah dengan pilihan
 * Pemohon kredit / Tim lender dan akun pengujian.
 */

import { login, loginDemo, registerBorrower, session } from '../../services/core.js';
import { DEMO_USERS } from '../../core/auth-local.js';
import { VERIFICATION_SOURCES } from '../../core/intake-config.js';
import { DOCUMENT_HINT } from '../../services/labels.js';
import { POLICY } from '../../services/simulation.js';
import { esc, toast, track, formData } from '../ui.js';
import { simulatorHtml, bindSimulator } from '../widgets.js';

const BRAND = 'MEZS.id';
const rupiahWords = (n) => (n >= 1e9 ? `Rp${(n / 1e9).toLocaleString('id-ID')} miliar` : `Rp${(n / 1e6).toLocaleString('id-ID')} juta`);
const goHome = () => { location.hash = '#/beranda'; };

/** Logo MEZS.id (bentuk dari dashboard lama, warna design system baru). */
export const logoMark = (size = 32) =>
     `<svg class="logo-mark" width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true" focusable="false"><rect width="100" height="100" rx="24" fill="var(--logo-bg, #1f5fbf)"/><polyline points="22,76 22,36 46,60 74,26 74,76" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/><circle cx="74" cy="26" r="9" fill="#f0b429"/></svg>`;

/** Sumber angka pasar (dikutip apa adanya dari dashboard lama). */
const MARKET = { gdp: '61%', credit: '17%', source: 'Sumber: Kemenkop UKM (porsi PDB); OJK & Bank Indonesia, akhir 2025 (porsi kredit perbankan).' };

const SECTIONS = [['kenapa', 'Kenapa kami'], ['cara-kerja', 'Cara kerja'], ['simulasi', 'Simulasi'], ['persyaratan', 'Persyaratan'], ['faq', 'FAQ']];

const FAQ = [
     ['Apakah pengajuan pasti disetujui?', 'Tidak. Persetujuan, plafon, dan imbal hasil bergantung pada hasil verifikasi dokumen dan penilaian lender. Bila ada yang perlu diperkuat, Anda menerima langkah perbaikan untuk penilaian ulang.'],
     ['Apakah saya harus mengetik ulang laporan keuangan?', 'Tidak perlu. Unggah laporan apa adanya — PDF, Excel, CSV, atau foto. Angka terbaca otomatis; foto dan PDF hasil scan dibaca dengan OCR dan selalu Anda periksa sebelum dipakai.'],
     ['Bagaimana saya mengetahui status pengajuan?', 'Setelah masuk, halaman Pengajuan saya menampilkan tahap pengajuan, catatan lender, langkah perbaikan, dan penawaran bila sudah tersedia.'],
     ['Apa bedanya bunga flat dan bagi hasil?', 'Bunga flat memakai cicilan tetap dari pokok awal. Bagi hasil net profit memakai pokok tetap ditambah porsi laba bersih bulanan, sehingga pembayaran mengikuti kinerja usaha.'],
     ['Apakah ada biaya selain bunga?', 'Simulasi belum termasuk biaya admin, provisi, asuransi, atau denda. Seluruh syarat dan biaya disampaikan dalam penawaran dan perjanjian kredit sebelum Anda setuju.'],
     ['Bisakah saya menolak penawaran?', 'Bisa. Anda dapat menerima atau menolak penawaran dari halaman status. Penawaran berlaku 14 hari.'],
     ['Di mana data saya disimpan?', 'Pada versi ini semua data tersimpan di browser perangkat ini saja (mode lokal), tidak dikirim ke server.']
];

const crisis = (text) => `<div class="lp-crisis"><span class="lp-tag">Hari ini</span><p>${text}</p></div><p class="lp-kicker">Dengan ${BRAND}</p>`;

/* ======================================================= HALAMAN UTAMA ==== */

export function landing(main) {
     const s = session();
     const cta = s
          ? '<a class="btn btn-gold" href="#/beranda">Buka dashboard</a>'
          : '<a class="btn btn-quiet lp-on-dark" href="#/masuk">Masuk</a><a class="btn btn-gold" href="#/daftar">Ajukan kredit</a>';
     const step = (n, title, text) => `<li class="lp-step"><span class="lp-step-n">${n}</span><h3>${title}</h3><p>${text}</p></li>`;
     const tile = (title, text) => `<article class="card"><h3>${title}</h3><p class="muted" style="margin:0">${text}</p></article>`;
     main.innerHTML = `<div class="lp">
     <header class="lp-nav"><div class="lp-wrap lp-nav-in">
          <a class="lp-brand" href="#/">${logoMark(30)}<span>${BRAND}</span></a>
          <nav class="lp-links" aria-label="Bagian halaman">${SECTIONS.map(([id, label]) => `<button type="button" data-scroll="${id}">${label}</button>`).join('')}</nav>
          <div class="actions">${cta}</div></div></header>

     <section class="lp-hero"><div class="lp-wrap lp-hero-grid">
          <div>
               <p class="lp-eyebrow">Kredit usaha produktif untuk UMKM &amp; startup</p>
               <h1>Kredit usaha yang <em>jelas</em> alasannya.</h1>
               <p class="lp-lead">Unggah laporan keuangan apa adanya — angkanya terbaca otomatis, setiap tahap penilaian terlihat, dan setiap keputusan disertai alasan serta langkah perbaikan.</p>
               <div class="actions">${s ? '<a class="btn btn-gold btn-lg" href="#/beranda">Buka dashboard</a>' : '<a class="btn btn-gold btn-lg" href="#/daftar">Ajukan kredit</a>'}
                    <button type="button" class="btn btn-lg lp-ghost" data-scroll="simulasi">Hitung simulasi cicilan</button></div>
               ${s ? '' : '<p class="lp-small">Sudah punya akun? <a href="#/masuk">Masuk</a> · Tim bank/BPR/koperasi? <a href="#/masuk?as=lender">Masuk tim lender</a></p>'}
               <ul class="lp-facts">
                    <li><strong>UMKM &amp; startup</strong><span>usaha produktif</span></li>
                    <li><strong>Hingga ${rupiahWords(POLICY.maxPlafon)}</strong><span>plafon pengajuan</span></li>
                    <li><strong>${POLICY.minTenor}–${POLICY.maxTenor} bulan</strong><span>pilihan tenor</span></li>
               </ul>
          </div>
          <div class="lp-preview" aria-hidden="true">
               <div class="lp-preview-card">
                    <div class="lp-row"><strong>Status pengajuan</strong><span class="pill ok">Penawaran diterima</span></div>
                    <ol class="timeline" style="margin:12px 0"><li class="done">Pengajuan dikirim</li><li class="done">Verifikasi dokumen</li><li class="done">Penilaian lender</li><li class="now">Penawaran</li></ol>
                    <div class="kpis" style="grid-template-columns:repeat(3,1fr)"><div class="kpi"><b>Rp 100 jt</b><span>Plafon</span></div><div class="kpi"><b>12 bln</b><span>Tenor</span></div><div class="kpi lp-key"><b>Rp 9,5 jt</b><span>Cicilan/bulan</span></div></div>
                    <p class="small muted" style="margin:10px 0 0">Contoh tampilan · bunga flat 14% p.a.</p>
               </div>
               <div class="lp-float"><span class="check-anim">✓</span><div><strong>9 angka terisi otomatis</strong><span>dari laporan_keuangan.pdf</span></div></div>
          </div>
     </div></section>

     <section class="lp-section" id="kenapa" aria-labelledby="lp-why"><div class="lp-wrap">
          <div class="lp-crisis lp-crisis-lg"><span class="lp-tag">Hari ini</span><h2 id="lp-why">UMKM menggerakkan ekonomi, tapi kreditnya tertahan di proses.</h2></div>
          <div class="lp-duo"><div><strong>${MARKET.gdp}</strong><span>porsi UMKM dalam ekonomi Indonesia (PDB)</span></div><div class="is-low"><strong>${MARKET.credit}</strong><span>porsi UMKM dalam kredit perbankan</span></div></div>
          <p class="small muted">${MARKET.source}</p>
          <p class="lp-turn">Masalahnya jarang ada di usahanya. Masalahnya ada di proses kredit: lambat, tertutup, dan penuh berkas. ${BRAND} mengubah proses itu, satu per satu.</p>
     </div></section>

     <section class="lp-section lp-alt" id="cara-kerja" aria-labelledby="lp-how"><div class="lp-wrap">
          ${crisis('Berkas menumpuk, dan setiap angka laporan keuangan diketik ulang satu per satu.')}
          <h2 id="lp-how">Unggah apa adanya. Empat langkah dari pengajuan sampai penawaran.</h2>
          <ol class="lp-steps">
               ${step(1, 'Daftar akun', 'Cukup nama, email, dan kata sandi untuk membuat akun pemohon.')}
               ${step(2, 'Isi data &amp; unggah dokumen', 'Laporan keuangan PDF, Excel, CSV, atau foto dibaca otomatis sehingga angka tidak perlu diketik ulang.')}
               ${step(3, 'Verifikasi &amp; penilaian', 'Lender memeriksa dokumen dan menilai usaha Anda. Bila ada yang perlu diperbaiki, Anda menerima langkah perbaikan yang jelas.')}
               ${step(4, 'Tinjau penawaran', 'Plafon, tenor, bunga atau bagi hasil, dan total pembayaran tampil lengkap. Anda yang memutuskan menerima atau menolak.')}
          </ol></div></section>

     <section class="lp-section" id="simulasi" aria-labelledby="lp-sim"><div class="lp-wrap lp-two">
          <div>${crisis('Besar cicilan baru ketahuan setelah tanda tangan — terlambat untuk menimbang arus kas.')}
               <h2 id="lp-sim">Hitung perkiraan cicilan sebelum mengajukan</h2>
               <p class="muted">Ubah plafon, tenor, dan bunga untuk melihat cicilan, total bunga, dan total pembayaran dengan bunga flat — juga berapa yang perlu disisihkan per hari atau per minggu.</p>
               <p class="callout small">Simulasi bukan penawaran. Plafon (hingga ${rupiahWords(POLICY.maxPlafon)}), tenor (${POLICY.minTenor}–${POLICY.maxTenor} bulan), dan suku bunga final ditentukan lender setelah penilaian, dan belum termasuk biaya admin, provisi, asuransi, atau denda.</p></div>
          <div class="card">${simulatorHtml({ id: 'lp' })}</div>
     </div></section>

     <section class="lp-section lp-alt" id="persyaratan" aria-labelledby="lp-req"><div class="lp-wrap lp-two">
          <div>${crisis('Bolak-balik ke kantor karena dokumen yang diminta tidak pernah jelas sejak awal.')}
               <h2 id="lp-req">Daftar dokumen jelas sejak awal</h2>
               <p class="muted">Dokumen opsional membantu lender menilai lebih yakin. Format PDF, JPG, PNG, XLSX, atau CSV, maksimal 5 MB per berkas.</p></div>
          <ul class="card doclist">${VERIFICATION_SOURCES.map((d) => `<li><span><strong>${esc(d.label)}</strong><br><span class="small muted">${esc(DOCUMENT_HINT[d.key] || '')}</span></span>${d.mandatory ? '<span class="pill warn">Wajib</span>' : '<span class="pill plain">Opsional</span>'}</li>`).join('')}</ul>
     </div></section>

     <section class="lp-section" aria-labelledby="lp-clear"><div class="lp-wrap">
          ${crisis('Bunga dan cicilan terasa seperti kotak hitam: tidak tahu dari mana angkanya.')}
          <h2 id="lp-clear">Dua cara imbal hasil, rumusnya terbuka</h2>
          <div class="grid grid-2">
               <article class="card"><h3>Bunga flat</h3><p class="muted">Bunga dihitung dari pokok awal selama seluruh tenor.</p>
                    <code class="lp-code">Total bunga = pokok × bunga tahunan × tenor (bulan) ÷ 12</code><code class="lp-code">Cicilan bulanan = (pokok + total bunga) ÷ tenor</code></article>
               <article class="card"><h3>Bagi hasil net profit</h3><p class="muted">Pokok dibayar tetap setiap bulan, ditambah porsi lender dari laba bersih bulan berjalan.</p>
                    <code class="lp-code">Pembayaran = pokok bulanan + porsi lender × maks(0, laba bersih)</code>
                    <p class="small muted" style="margin:8px 0 0">Bila usaha rugi pada bulan tersebut, bagi hasil nol; pokok tetap dibayar. Laporan laba bulanan diverifikasi.</p></article>
          </div></div></section>

     <section class="lp-section lp-alt" aria-labelledby="lp-status"><div class="lp-wrap">
          ${crisis('Ditolak tanpa penjelasan, dan tidak pernah tahu pengajuan sudah sampai mana.')}
          <h2 id="lp-status">Setiap tahap terlihat, setiap keputusan ada alasannya</h2>
          <div class="grid grid-3">
               ${tile('Status setiap tahap', 'Dikirim, diverifikasi, dinilai, sampai penawaran — semuanya tampil di halaman status Anda.')}
               ${tile('Keputusan yang bisa ditelusuri', 'Lender menilai kemampuan bayar, modal, agunan, dan kondisi usaha dengan perhitungan yang tercatat, bukan tebakan.')}
               ${tile('Langkah perbaikan', 'Bila belum disetujui, Anda menerima catatan apa yang perlu diperkuat untuk penilaian ulang.')}
          </div></div></section>

     <section class="lp-section" id="faq" aria-labelledby="lp-faq"><div class="lp-wrap lp-narrow">
          <p class="lp-kicker">Masih ragu?</p><h2 id="lp-faq">Pertanyaan yang sering diajukan</h2>
          <div class="card">${FAQ.map(([q, a], i) => `<details class="more"${i === 0 ? ' open' : ''}><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</div>
     </div></section>

     <section class="lp-closing" aria-labelledby="lp-climax"><div class="lp-wrap">
          <p class="lp-kicker lp-on-dark">Bersama ${BRAND}</p>
          <h2 id="lp-climax">Kredit usaha yang <em>cepat</em>, <em>transparan</em>, dan <em>sesuai aturan OJK</em>.</h2>
          <p>Kolektibilitas, pencadangan, dan kecukupan modal dihitung mengikuti POJK 40/2019, PSAK 71, dan SEOJK 24/2021. Keputusan akhir tetap di tangan lender — kini dengan alasan yang bisa dibaca kedua pihak.</p>
          <div class="lp-closing-box"><div><h3>Siap mengembangkan usaha Anda?</h3><p>Buat akun pemohon dan mulai pengajuan. Draf tersimpan otomatis dan bisa dilanjutkan kapan saja.</p></div>
               <div class="actions">${s ? '<a class="btn btn-gold btn-lg" href="#/beranda">Buka dashboard</a>' : '<a class="btn btn-gold btn-lg" href="#/daftar">Ajukan kredit</a><a class="btn btn-lg lp-ghost" href="#/masuk">Saya sudah punya akun</a>'}</div></div>
          ${s ? '' : '<p class="lp-small">Dari tim bank, BPR, atau koperasi? <a href="#/masuk?as=lender">Masuk tim lender</a></p>'}
     </div></section>

     <footer class="lp-footer"><div class="lp-wrap lp-footer-in">
          <div><a class="lp-brand" href="#/">${logoMark(26)}<span>${BRAND}</span></a><p>${BRAND} adalah platform pengajuan dan analisis kredit usaha produktif. Keputusan kredit dan penawaran diberikan oleh lender setelah penilaian.</p></div>
          <div><strong>Akses</strong><p><a href="#/masuk">Masuk pemohon</a><br><a href="#/daftar">Daftar akun pemohon</a><br><a href="#/masuk?as=lender">Masuk tim lender</a></p></div>
          <div><strong>Mode</strong><p>Uji coba lokal · data tersimpan di browser ini. Kasus contoh fiktif.</p></div>
     </div><div class="lp-wrap lp-footer-base">© ${new Date().getFullYear()} ${BRAND}</div></footer>
     </div>`;
     main.querySelectorAll('[data-scroll]').forEach((btn) => btn.addEventListener('click', () => {
          const target = main.querySelector(`#${btn.dataset.scroll}`);
          if (!target) return;
          target.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
          const h = target.querySelector('h2');
          h?.setAttribute('tabindex', '-1');
          h?.focus({ preventScroll: true });
     }));
     bindSimulator(main);
     return { title: 'Kredit usaha yang jelas alasannya', bare: true };
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
