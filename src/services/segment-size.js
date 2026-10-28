/**
 * services/segment-size.js — Segmen target debitur KECIL vs BESAR dari laporan keuangan.
 *
 * Dasar: omzet (penjualan) setahun pada laporan keuangan, mengikuti kriteria hasil
 * penjualan tahunan PP 7/2021:
 *   mikro    ≤ Rp2 miliar      ┐ debitur kecil
 *   kecil    ≤ Rp15 miliar     ┘
 *   menengah ≤ Rp50 miliar     ┐ debitur besar
 *   besar    > Rp50 miliar     ┘
 *
 * Hanya menentukan TAMPILAN & BAHASA (debitur kecil melihat ringkasan sehari-hari,
 * istilah bank di rincian terlipat). Isian dan perhitungan mesin tetap sama.
 * Berbeda dari core/segment.js (segmen operasional berdasarkan jumlah pinjaman).
 */

export const SMALL_MAX_OMZET = 15_000_000_000;

const BANDS = [
     { klas: 'mikro', label: 'Usaha mikro', max: 2_000_000_000 },
     { klas: 'kecil', label: 'Usaha kecil', max: SMALL_MAX_OMZET },
     { klas: 'menengah', label: 'Usaha menengah', max: 50_000_000_000 },
     { klas: 'besar', label: 'Usaha besar', max: Infinity }
];

export const SIZE_LABEL = { kecil: 'Debitur kecil', besar: 'Debitur besar' };

/**
 * @param {object} keuangan — borrower.keuangan
 * @returns {null|{key:'kecil'|'besar', label:string, klas:string, klasLabel:string, omzet:number}}
 *   null bila omzet belum ada di laporan.
 */
export function debtorSize(keuangan = {}) {
     const omzet = Number(keuangan?.penjualan);
     if (keuangan?.penjualan === null || keuangan?.penjualan === undefined || keuangan?.penjualan === '' || !Number.isFinite(omzet) || omzet < 0) return null;
     const band = BANDS.find((b) => omzet <= b.max);
     const key = omzet <= SMALL_MAX_OMZET ? 'kecil' : 'besar';
     return { key, label: SIZE_LABEL[key], klas: band.klas, klasLabel: band.label, omzet };
}

export const isSmallDebtor = (keuangan) => debtorSize(keuangan)?.key === 'kecil';
