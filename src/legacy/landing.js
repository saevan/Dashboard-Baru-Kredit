/**
 * ui/landing.js — Halaman depan publik MEZS.id untuk calon pemohon.
 *
 * Alur cerita: krisis → kontras yang berulang (proses kredit hari ini vs dengan MEZS.id),
 * berpuncak pada klimaks. Isi hanya menyebut kemampuan yang benar-benar ada di aplikasi
 * (bunga flat / bagi hasil, isi otomatis laporan + OCR, status & langkah perbaikan, alasan
 * keputusan, perhitungan sesuai regulasi). Tidak ada janji persetujuan, kecepatan cair,
 * atau "tanpa biaya"; angka pasar disertai sumbernya.
 * Navigasi dalam halaman memakai tombol scroll karena aplikasi memakai hash routing.
 *
 * Dashboard-Baru-Kredit: disalin apa adanya dari dashboard lama (teks & tampilan sama).
 * Penyesuaian hanya rute (#/login → #/masuk, #/daftar → #/daftar, #/home → #/, beranda
 * → #/beranda) dan render di Shadow DOM dengan CSS lama (legacy/landing.css).
 */
import { session as currentSession } from '../services/core.js';
import { VERIFICATION_SOURCES } from '../core/intake-config.js';
import { DEFAULT_CONFIG } from '../core/config.js';
import { simHtml, bindSimulator } from './simulator.js';
import { iconChip, logoMark } from './icons.js';
import { escapeHtml } from './dom.js';
import { APP_VERSION } from './version.js';

export const BRAND = 'MEZS.id';

/** Batas yang dipublikasikan, diambil dari kebijakan di konfigurasi (bukan angka tertulis manual). */
export const POLICY = Object.freeze({
     minTenor: DEFAULT_CONFIG.nominal.minTenorBulan,
     maxTenor: DEFAULT_CONFIG.nominal.maxTenorBulan,
     maxPlafon: DEFAULT_CONFIG.segment.menengahMax
});
const rupiahWords = (n) => (n >= 1e9 ? `Rp${(n / 1e9).toLocaleString('id-ID')} miliar` : `Rp${(n / 1e6).toLocaleString('id-ID')} juta`);

const SECTIONS = [['kenapa', 'Kenapa kami'], ['cara-kerja', 'Cara kerja'], ['simulasi', 'Simulasi'], ['persyaratan', 'Persyaratan'], ['faq', 'FAQ']];

function navHtml(session) {
     const app = session ? `<a class="btn btn-accent" href="${'#/beranda'}">Buka dashboard</a>`
          : `<a class="btn btn-ghost lp-login" href="#/masuk?as=borrower">Masuk</a><a class="btn btn-accent" href="#/daftar">Ajukan kredit</a>`;
     return `<header class="lp-nav"><div class="lp-wrap lp-nav-inner">
          <a class="lp-brand" href="#/">${logoMark()}<span>${BRAND}</span></a>
          <nav class="lp-links" aria-label="Bagian halaman">${SECTIONS.map(([id, label]) => `<button type="button" data-scroll="${id}">${label}</button>`).join('')}</nav>
          <div class="lp-nav-cta">${app}</div></div></header>`;
}

/** Ilustrasi tampilan aplikasi (dekoratif, angka contoh). */
function heroPreview() {
     const step = (label, state) => `<li class="is-${state}"><span></span>${label}</li>`;
     return `<div class="lp-preview" aria-hidden="true">
          <div class="lp-preview-card">
               <div class="lp-preview-head"><strong>Status pengajuan</strong><span class="pill pill-success">Penawaran diterima</span></div>
               <ol class="lp-preview-steps">${step('Pengajuan dikirim', 'done')}${step('Verifikasi dokumen', 'done')}${step('Penilaian lender', 'done')}${step('Penawaran', 'current')}</ol>
               <div class="lp-preview-tiles">
                    <div><span>Plafon</span><strong>Rp 100 jt</strong></div>
                    <div><span>Tenor</span><strong>12 bulan</strong></div>
                    <div class="is-key"><span>Cicilan / bulan</span><strong>Rp 9,5 jt</strong></div>
               </div>
               <p class="lp-preview-note">Contoh tampilan · bunga flat 14% p.a.</p>
          </div>
          <div class="lp-preview-float">${iconChip('audit', 'teal')}<div><strong>9 angka terisi otomatis</strong><span>dari laporan_keuangan.pdf</span></div></div>
     </div>`;
}

function heroHtml(session) {
     return `<section class="lp-hero"><div class="lp-wrap lp-hero-grid">
          <div class="lp-hero-copy">
               <p class="lp-eyebrow">Kredit usaha produktif untuk UMKM &amp; startup</p>
               <h1>Kredit usaha yang <em>jelas</em> alasannya.</h1>
               <p class="lp-lead">Unggah laporan keuangan apa adanya — angkanya terbaca otomatis, setiap tahap penilaian terlihat, dan setiap keputusan disertai alasan serta langkah perbaikan.</p>
               <div class="lp-cta">${session ? `<a class="btn btn-accent btn-lg" href="${'#/beranda'}">Buka dashboard</a>` : '<a class="btn btn-accent btn-lg" href="#/daftar">Ajukan kredit</a>'}
                    <button type="button" class="btn btn-lg lp-btn-light" data-scroll="simulasi">Hitung simulasi cicilan</button></div>
               ${session ? '' : '<p class="lp-hero-login">Sudah punya akun? <a href="#/masuk?as=borrower">Masuk</a></p>'}
               <ul class="lp-facts">
                    <li><strong>UMKM &amp; startup</strong><span>usaha produktif</span></li>
                    <li><strong>Hingga ${rupiahWords(POLICY.maxPlafon)}</strong><span>plafon pengajuan</span></li>
                    <li><strong>${POLICY.minTenor}–${POLICY.maxTenor} bulan</strong><span>pilihan tenor</span></li>
               </ul>
          </div>
          ${heroPreview()}
     </div></section>`;
}

/** Sumber angka pasar yang dikutip pada bagian cerita. */
export const MARKET_FACTS = Object.freeze({
     gdpShare: '61%',
     creditShare: '17%',
     source: 'Sumber: Kemenkop UKM (porsi PDB); OJK & Bank Indonesia, akhir 2025 (porsi kredit perbankan).'
});

/**
 * Narasi halaman: setiap bagian dibuka dengan krisis ("Hari ini") lalu isi bagian menjadi
 * kontrasnya ("Dengan MEZS.id"); berulang sampai klimaks di penutup.
 */
function crisisHtml(text) {
     return `<div class="lp-crisis"><span class="lp-crisis-tag">Hari ini</span><p>${text}</p></div>
          <p class="lp-kicker lp-kicker-after">Dengan ${BRAND}</p>`;
}

function storyHtml() {
     return `<section class="lp-section lp-story" id="kenapa" aria-labelledby="lp-why"><div class="lp-wrap">
          <div class="lp-crisis lp-crisis-lg"><span class="lp-crisis-tag">Hari ini</span>
               <h2 id="lp-why">UMKM menggerakkan ekonomi, tapi kreditnya tertahan di proses.</h2></div>
          <div class="lp-stat-duo">
               <div><strong>${MARKET_FACTS.gdpShare}</strong><span>porsi UMKM dalam ekonomi Indonesia (PDB)</span></div>
               <div class="is-low"><strong>${MARKET_FACTS.creditShare}</strong><span>porsi UMKM dalam kredit perbankan</span></div>
          </div>
          <p class="lp-source">${MARKET_FACTS.source}</p>
          <p class="lp-story-turn">Masalahnya jarang ada di usahanya. Masalahnya ada di proses kredit: lambat, tertutup, dan penuh berkas. ${BRAND} mengubah proses itu, satu per satu.</p>
     </div></section>`;
}

function stepsHtml() {
     const step = (n, icon, title, text) => `<li class="lp-step"><span class="lp-step-n">${n}</span>${iconChip(icon, 'blue')}<h3>${title}</h3><p>${text}</p></li>`;
     return `<section class="lp-section lp-alt" id="cara-kerja" aria-labelledby="lp-how"><div class="lp-wrap">
          ${crisisHtml('Berkas menumpuk, dan setiap angka laporan keuangan diketik ulang satu per satu.')}
          <h2 id="lp-how">Unggah apa adanya. Empat langkah dari pengajuan sampai penawaran.</h2>
          <ol class="lp-steps">
               ${step(1, 'audit', 'Daftar akun', 'Cukup nama, email, dan kata sandi untuk membuat akun pemohon.')}
               ${step(2, 'inbox', 'Isi data &amp; unggah dokumen', 'Laporan keuangan PDF, Excel, CSV, atau foto dibaca otomatis sehingga angka tidak perlu diketik ulang.')}
               ${step(3, 'analysis', 'Verifikasi &amp; penilaian', 'Lender memeriksa dokumen dan menilai usaha Anda. Bila ada yang perlu diperbaiki, Anda menerima langkah perbaikan yang jelas.')}
               ${step(4, 'funding', 'Tinjau penawaran', 'Plafon, tenor, bunga atau bagi hasil, dan total pembayaran tampil lengkap. Anda yang memutuskan menerima atau menolak.')}
          </ol></div></section>`;
}

function simulationHtml() {
     return `<section class="lp-section" id="simulasi" aria-labelledby="lp-sim"><div class="lp-wrap lp-sim-grid">
          <div>${crisisHtml('Besar cicilan baru ketahuan setelah tanda tangan — terlambat untuk menimbang arus kas.')}
               <h2 id="lp-sim">Hitung perkiraan cicilan sebelum mengajukan</h2>
               <p class="lp-lead-sm">Ubah plafon, tenor, dan bunga untuk melihat cicilan bulanan, total bunga, dan total pembayaran dengan bunga flat.</p>
               <div class="lp-note">${iconChip('shield', 'teal')}<p>Simulasi bukan penawaran. Plafon (hingga ${rupiahWords(POLICY.maxPlafon)}), tenor (${POLICY.minTenor}–${POLICY.maxTenor} bulan), dan suku bunga final ditentukan lender setelah penilaian, dan belum termasuk biaya admin, provisi, asuransi, atau denda.</p></div>
          </div>
          <div class="lp-sim">${simHtml({ limits: POLICY })}</div>
     </div></section>`;
}

function requirementsHtml() {
     const item = (s) => `<li class="${s.mandatory ? 'is-required' : ''}">${iconChip(s.mandatory ? 'audit' : 'inbox', s.mandatory ? 'blue' : 'teal')}<span>${escapeHtml(s.label)}</span><em>${s.mandatory ? 'Wajib' : 'Opsional'}</em></li>`;
     return `<section class="lp-section lp-alt" id="persyaratan" aria-labelledby="lp-req"><div class="lp-wrap lp-req-grid">
          <div>${crisisHtml('Bolak-balik ke kantor karena dokumen yang diminta tidak pernah jelas sejak awal.')}
               <h2 id="lp-req">Daftar dokumen jelas sejak awal</h2>
               <p class="lp-lead-sm">Dokumen opsional membantu lender menilai lebih yakin. Format PDF, JPG, PNG, XLSX, atau CSV, maksimal 5 MB per berkas.</p></div>
          <ul class="lp-req">${VERIFICATION_SOURCES.map(item).join('')}</ul>
     </div></section>`;
}

function transparencyHtml() {
     return `<section class="lp-section" aria-labelledby="lp-clear"><div class="lp-wrap">
          ${crisisHtml('Bunga dan cicilan terasa seperti kotak hitam: tidak tahu dari mana angkanya.')}
          <h2 id="lp-clear">Dua cara imbal hasil, rumusnya terbuka</h2>
          <div class="lp-grid-2">
               <article class="lp-card lp-formula">${iconChip('percent', 'blue')}<h3>Bunga flat</h3>
                    <p>Bunga dihitung dari pokok awal selama seluruh tenor.</p>
                    <code>Total bunga = pokok × bunga tahunan × tenor (bulan) ÷ 12</code>
                    <code>Cicilan bulanan = (pokok + total bunga) ÷ tenor</code></article>
               <article class="lp-card lp-formula">${iconChip('trend', 'gold')}<h3>Bagi hasil net profit</h3>
                    <p>Pokok dibayar tetap setiap bulan, ditambah porsi lender dari laba bersih bulan berjalan.</p>
                    <code>Pembayaran = pokok bulanan + porsi lender × maks(0, laba bersih)</code>
                    <p class="small">Bila usaha rugi pada bulan tersebut, bagi hasil nol; pokok tetap dibayar. Laporan laba bulanan diverifikasi.</p></article>
          </div></div></section>`;
}

function statusHtml() {
     const card = (icon, tone, title, text) => `<article class="lp-card">${iconChip(icon, tone)}<h3>${title}</h3><p>${text}</p></article>`;
     return `<section class="lp-section lp-alt" id="status" aria-labelledby="lp-status"><div class="lp-wrap">
          ${crisisHtml('Ditolak tanpa penjelasan, dan tidak pernah tahu pengajuan sudah sampai mana.')}
          <h2 id="lp-status">Setiap tahap terlihat, setiap keputusan ada alasannya</h2>
          <div class="lp-grid-3">
               ${card('waiting', 'blue', 'Status setiap tahap', 'Dikirim, diverifikasi, dinilai, sampai penawaran — semuanya tampil di halaman status Anda.')}
               ${card('analysis', 'teal', 'Keputusan yang bisa ditelusuri', 'Lender menilai kemampuan bayar, modal, agunan, dan kondisi usaha dengan perhitungan yang tercatat, bukan tebakan.')}
               ${card('audit', 'gold', 'Langkah perbaikan', 'Bila belum disetujui, Anda menerima catatan apa yang perlu diperkuat untuk penilaian ulang.')}
          </div></div></section>`;
}

const FAQ = [
     ['Apakah pengajuan pasti disetujui?', 'Tidak. Persetujuan, plafon, dan imbal hasil bergantung pada hasil verifikasi dokumen dan penilaian lender. Bila ada yang perlu diperkuat, Anda menerima langkah perbaikan untuk penilaian ulang.'],
     ['Apakah saya harus mengetik ulang laporan keuangan?', 'Tidak perlu. Unggah laporan apa adanya — PDF, Excel, CSV, atau foto. Angka terbaca otomatis; foto dan PDF hasil scan dibaca dengan OCR dan selalu Anda periksa sebelum dipakai.'],
     ['Bagaimana saya mengetahui status pengajuan?', 'Setelah masuk, halaman status menampilkan tahap pengajuan, catatan lender, langkah perbaikan, dan penawaran bila sudah tersedia.'],
     ['Apa bedanya bunga flat dan bagi hasil?', 'Bunga flat memakai cicilan tetap dari pokok awal. Bagi hasil net profit memakai pokok tetap ditambah porsi laba bersih bulanan, sehingga pembayaran mengikuti kinerja usaha.'],
     ['Apakah ada biaya selain bunga?', 'Simulasi belum termasuk biaya admin, provisi, asuransi, atau denda. Seluruh syarat dan biaya disampaikan dalam penawaran dan perjanjian kredit sebelum Anda setuju.'],
     ['Bisakah saya menolak penawaran?', 'Bisa. Anda dapat menerima atau menolak penawaran dari halaman status. Penawaran juga memiliki batas waktu berlaku.']
];

function faqHtml() {
     return `<section class="lp-section" id="faq" aria-labelledby="lp-faq"><div class="lp-wrap lp-faq-wrap">
          <p class="lp-kicker">Masih ragu?</p><h2 id="lp-faq">Pertanyaan yang sering diajukan</h2>
          <div class="lp-faq">${FAQ.map(([q, a], i) => `<details ${i === 0 ? 'open' : ''}><summary>${escapeHtml(q)}</summary><p>${escapeHtml(a)}</p></details>`).join('')}</div>
     </div></section>`;
}

function closingHtml(session) {
     return `<section class="lp-closing lp-climax-section" aria-labelledby="lp-climax"><div class="lp-wrap">
          <p class="lp-kicker lp-kicker-light">Bersama ${BRAND}</p>
          <h2 id="lp-climax" class="lp-climax-line">Kredit usaha yang <em>cepat</em>, <em>transparan</em>, dan <em>sesuai aturan OJK</em>.</h2>
          <p class="lp-climax-text">Kolektibilitas, pencadangan, dan kecukupan modal dihitung mengikuti POJK 40/2019, PSAK 71, dan SEOJK 24/2021. Keputusan akhir tetap di tangan lender — kini dengan alasan yang bisa dibaca kedua pihak.</p>
          <div class="lp-closing-inner">
               <div><h3>Siap mengembangkan usaha Anda?</h3><p>Buat akun pemohon dan mulai pengajuan. Anda dapat menyimpan draf dan melanjutkannya kapan saja.</p></div>
               <div class="lp-cta">${session ? `<a class="btn btn-accent btn-lg" href="${'#/beranda'}">Buka dashboard</a>` : '<a class="btn btn-accent btn-lg" href="#/daftar">Ajukan kredit</a><a class="btn btn-lg lp-btn-outline" href="#/masuk?as=borrower">Saya sudah punya akun</a>'}</div>
          </div>
          ${session ? '' : '<p class="lp-climax-lender">Dari tim bank, BPR, atau koperasi? <a href="#/masuk?as=lender">Masuk tim lender</a></p>'}
     </div></section>`;
}

function footerHtml() {
     return `<footer class="lp-footer"><div class="lp-wrap lp-footer-inner">
          <div><a class="lp-brand" href="#/">${logoMark()}<span>${BRAND}</span></a>
               <p>${BRAND} adalah platform pengajuan dan analisis kredit usaha produktif. Keputusan kredit dan penawaran diberikan oleh lender setelah penilaian.</p></div>
          <div><strong>Kontak</strong><p data-contact>Kontak resmi segera tersedia.</p></div>
          <div><strong>Akses</strong><p><a href="#/masuk?as=borrower">Masuk pemohon</a><br><a href="#/daftar">Daftar akun pemohon</a><br><a href="#/masuk?as=lender">Masuk tim lender</a></p></div>
     </div><div class="lp-wrap lp-footer-base"><span>© ${new Date().getFullYear()} ${BRAND}</span><span>Versi ${APP_VERSION}</span></div></footer>`;
}

const CSS_URL = new URL('./landing.css', import.meta.url).href;
const FONT_URL = new URL('./fonts/inter-latin-var.woff2', import.meta.url).href;

/** @font-face tidak berlaku di dalam shadow root, jadi didaftarkan sekali di dokumen. */
function ensureFont() {
     if (document.getElementById('legacy-inter')) return;
     const style = document.createElement('style');
     style.id = 'legacy-inter';
     style.textContent = `@font-face { font-family: 'Inter'; src: url('${FONT_URL}') format('woff2'); font-weight: 100 900; font-style: normal; font-display: swap; }`;
     document.head.append(style);
}

export function render(host) {
     ensureFont();
     const session = currentSession() || null;
     const mount = host.shadowRoot || host.attachShadow({ mode: 'open' });
     mount.innerHTML = `<link rel="stylesheet" href="${CSS_URL}"><div class="landing">${navHtml(session)}<div class="lp-main">${heroHtml(session)}${storyHtml()}${stepsHtml()}${simulationHtml()}${requirementsHtml()}${transparencyHtml()}${statusHtml()}${faqHtml()}${closingHtml(session)}</div>${footerHtml()}</div>`;
     mount.querySelectorAll('[data-scroll]').forEach((button) => button.addEventListener('click', () => {
          const target = mount.querySelector(`#${button.dataset.scroll}`);
          if (!target) return;
          const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
          target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
          target.querySelector('h2')?.setAttribute('tabindex', '-1');
          target.querySelector('h2')?.focus({ preventScroll: true });
     }));
     bindSimulator(mount);
     return mount;
}

export default render;
