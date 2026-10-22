/**
 * ui/icons.js — Ikon garis kecil (24×24, stroke) untuk ubin KPI dan empty state.
 * Inline SVG tanpa dependensi; warna mengikuti `currentColor`.
 */
const PATHS = {
     audit: 'M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1zM8 6H6a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-2M9 14l2 2 4-4',
     analysis: 'M4 20h16M7 16v-5M12 16V7M17 16v-8',
     funding: 'M3 7h18v10H3zM7 12h.01M17 12h.01M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
     waiting: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
     risk: 'M12 4 2.5 20h19L12 4zM12 10v4M12 17h.01',
     monitor: 'M3 12h4l2.5-6 5 12L17 12h4',
     critical: 'M8 3h8l5 5v8l-5 5H8l-5-5V8l5-5zM12 8v5M12 16h.01',
     wallet: 'M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4V7zM4 7l11-3v3M16 13h.01',
     trend: 'M3 7l6 6 4-4 8 8M21 11v6h-6',
     shield: 'M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z',
     percent: 'M19 5 5 19M7.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM16.5 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
     radar: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12l6-6',
     inbox: 'M3 13l3-8h12l3 8v6H3v-6zM3 13h5l1 3h6l1-3h5'
};

/** Ikon bulat berwarna; `tone`: blue | gold | teal | success | warning | danger. */
export function iconChip(name, tone = 'blue') {
     const d = PATHS[name] || PATHS.inbox;
     return `<span class="icon-chip icon-${tone}" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg></span>`;
}

/**
 * Logo MEZS.id — huruf M sebagai garis grafik naik dengan titik emas (titik data).
 * `tone`: 'blue' untuk permukaan gelap, 'navy' untuk permukaan terang.
 */
export function logoMark(tone = 'blue') {
     const bg = tone === 'navy' ? '#001240' : '#0046FF';
     return `<svg class="logo-mark" viewBox="0 0 100 100" aria-hidden="true" focusable="false"><rect width="100" height="100" rx="24" fill="${bg}"/><polyline points="22,76 22,36 46,60 74,26 74,76" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/><circle cx="74" cy="26" r="9" fill="#FFB81C"/></svg>`;
}

const HERO = {
     borrower: {
          title: 'Ajukan kredit usaha secara online, <em>pantau</em> setiap tahapnya.',
          points: [['audit', 'Unggah laporan apa adanya', 'PDF, Excel, CSV, atau foto laporan keuangan terbaca otomatis, tanpa mengetik ulang.'],
               ['waiting', 'Status selalu terlihat', 'Dari verifikasi dokumen sampai keputusan lender, lengkap dengan langkah perbaikan.'],
               ['funding', 'Penawaran yang jelas', 'Plafon, tenor, bunga atau bagi hasil, dan total pembayaran tampil sebelum Anda setuju.']]
     },
     lender: {
          title: 'Keputusan kredit produktif yang <em>terukur</em> dan dapat ditelusuri.',
          points: [['analysis', 'Skoring 6 pilar &amp; grade', 'Kuantitatif + kualitatif dengan benchmark industri IDX.'],
               ['audit', 'Isi otomatis dari laporan', 'PDF, Excel, CSV, hingga foto laporan dibaca tanpa mengetik ulang.'],
               ['monitor', 'Peringatan dini pasca-pencairan', 'Pantau kolektibilitas dan tindak lanjut tim.']]
     }
};

/** Panel brand untuk halaman masuk/daftar (disembunyikan di layar sempit); isi mengikuti audiens. */
export function authHeroHtml(audience = 'borrower') {
     const hero = HERO[audience] || HERO.borrower;
     const point = ([icon, title, text]) => `<li>${iconChip(icon, 'gold')}<div><strong>${title}</strong><span>${text}</span></div></li>`;
     return `<aside class="auth-hero" aria-hidden="true">
          <div class="auth-hero-brand">${logoMark()}<span>MEZS.id</span></div>
          <h2>${hero.title}</h2>
          <ul>${hero.points.map(point).join('')}</ul>
          <div class="auth-hero-stripe"></div>
     </aside>`;
}

export const ICON_NAMES = Object.keys(PATHS);
