/**
 * utils/format.js — Format angka Indonesia (id-ID).
 * Pure functions; aman dijalankan di Node (untuk unit test) maupun browser.
 */

const LOCALE = 'id-ID';

/** Format Rupiah tanpa desimal, mis. 1000000000 -> "Rp 1.000.000.000". */
export function formatRupiah(value) {
     if (value === null || value === undefined || Number.isNaN(value)) return '—';
     const n = Math.round(Number(value));
     return 'Rp ' + n.toLocaleString(LOCALE, { maximumFractionDigits: 0 });
}

/** Format Rupiah ringkas, mis. 1000000000 -> "Rp 1,0 M". */
export function formatRupiahShort(value) {
     if (value === null || value === undefined || Number.isNaN(value)) return '—';
     const n = Number(value);
     const abs = Math.abs(n);
     if (abs >= 1e12) return `Rp ${(n / 1e12).toLocaleString(LOCALE, { maximumFractionDigits: 2 })} T`;
     if (abs >= 1e9) return `Rp ${(n / 1e9).toLocaleString(LOCALE, { maximumFractionDigits: 2 })} M`;
     if (abs >= 1e6) return `Rp ${(n / 1e6).toLocaleString(LOCALE, { maximumFractionDigits: 1 })} jt`;
     if (abs >= 1e3) return `Rp ${(n / 1e3).toLocaleString(LOCALE, { maximumFractionDigits: 0 })} rb`;
     return formatRupiah(n);
}

/** Format persen 1 desimal dari rasio desimal, mis. 0.14 -> "14,0%". */
export function formatPercent(ratio, digits = 1) {
     if (ratio === null || ratio === undefined || Number.isNaN(ratio)) return '—';
     return (
          (Number(ratio) * 100).toLocaleString(LOCALE, {
               minimumFractionDigits: digits,
               maximumFractionDigits: digits
          }) + '%'
     );
}

/** Format persen langsung (nilai sudah dalam %), mis. 29.2 -> "29,2%". */
export function formatPercentValue(pct, digits = 1) {
     if (pct === null || pct === undefined || Number.isNaN(pct)) return '—';
     return (
          Number(pct).toLocaleString(LOCALE, {
               minimumFractionDigits: digits,
               maximumFractionDigits: digits
          }) + '%'
     );
}

/** Format angka desimal umum. */
export function formatNumber(value, digits = 2) {
     if (value === null || value === undefined || Number.isNaN(value)) return '—';
     return Number(value).toLocaleString(LOCALE, {
          minimumFractionDigits: 0,
          maximumFractionDigits: digits
     });
}

/** Format tanggal ISO -> "24 Sep 2026" (id-ID). */
export function formatDate(iso) {
     if (!iso) return '—';
     const d = new Date(iso);
     if (Number.isNaN(d.getTime())) return '—';
     return d.toLocaleDateString(LOCALE, { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Format tanggal+waktu ISO -> "24 Sep 2026, 17.00". */
export function formatDateTime(iso) {
     if (!iso) return '—';
     const d = new Date(iso);
     if (Number.isNaN(d.getTime())) return '—';
     return d.toLocaleString(LOCALE, {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
     });
}
