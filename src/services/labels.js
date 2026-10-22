/**
 * services/labels.js — Kosakata sehari-hari untuk isian & pilihan (hanya label;
 * kunci nilainya sama dengan skema data mesin lama).
 */
import { COLLATERAL_TYPES } from '../core/collateral-intake.js';
import { PERIODICITY_LABELS } from '../core/debt-service.js';

export const SECTOR_OPTIONS = [
     { key: 'IDX-CONSUMER-NON-CYCLICALS', label: 'Makanan, minuman & kebutuhan pokok' },
     { key: 'IDX-CONSUMER-CYCLICALS', label: 'Pakaian, otomotif, wisata & hiburan' },
     { key: 'IDX-INDUSTRIALS', label: 'Industri & barang modal' },
     { key: 'IDX-BASIC-MATERIALS', label: 'Bahan dasar (kimia, logam, kayu)' },
     { key: 'IDX-HEALTHCARE', label: 'Kesehatan' },
     { key: 'IDX-TECHNOLOGY', label: 'Teknologi' },
     { key: 'IDX-TRANSPORTATION', label: 'Transportasi & logistik' },
     { key: 'IDX-INFRASTRUCTURE', label: 'Infrastruktur' },
     { key: 'IDX-PROPERTY-REALESTATE', label: 'Properti' },
     { key: 'IDX-ENERGY', label: 'Energi' },
     { key: 'IDX-FINANCIALS', label: 'Keuangan (koperasi, lembaga keuangan)' }
];

export const PROFILE_OPTIONS = [
     { key: 'ukm_mapan', label: 'Usaha sudah berjalan stabil' },
     { key: 'startup', label: 'Usaha rintisan / baru mulai' },
     { key: 'manufacturing', label: 'Pabrik / produksi' },
     { key: 'trade', label: 'Perdagangan / distribusi' }
];

export const COLLATERAL_OPTIONS = Object.entries(COLLATERAL_TYPES).map(([key, label]) => ({ key, label }));

export const SCHEME_OPTIONS = [
     { key: 'flat', label: 'Bunga flat (cicilan sama tiap bulan)' },
     { key: 'annuity', label: 'Anuitas (cicilan tetap, bunga dari sisa pinjaman)' },
     { key: 'bullet', label: 'Bayar bunga saja, pokok di akhir' },
     { key: 'musiman', label: 'Musiman (lebih besar di musim ramai)' }
];

export const PERIOD_OPTIONS = Object.entries(PERIODICITY_LABELS).map(([key, label]) => ({ key, label }));

export const PURPOSE_OPTIONS = [
     { key: 'modal_kerja', label: 'Modal kerja (bahan baku, stok, operasional)' },
     { key: 'investasi', label: 'Investasi (peralatan, mesin, renovasi, kendaraan)' }
];

/** Pos laporan keuangan. `min` = 4 angka minimal agar pengajuan bisa dikirim. */
export const FINANCE_FIELDS = [
     { key: 'penjualan', label: 'Penjualan / omzet setahun', hint: 'Total uang dari penjualan dalam 1 tahun', min: true },
     { key: 'laba_bersih', label: 'Laba bersih setahun', hint: 'Untung setelah semua biaya dan pajak' },
     { key: 'ebit', label: 'Laba usaha', hint: 'Untung sebelum bunga & pajak' },
     { key: 'arus_kas_operasional', label: 'Uang bersih dari usaha setahun', hint: 'Uang masuk dikurangi uang keluar operasional', min: true },
     { key: 'total_aset', label: 'Total harta usaha', hint: 'Kas, stok, piutang, peralatan, bangunan', min: true },
     { key: 'aset_lancar', label: 'Harta lancar', hint: 'Yang cair dalam 1 tahun' },
     { key: 'total_liabilitas', label: 'Total utang', hint: 'Semua utang usaha' },
     { key: 'liabilitas_jangka_pendek', label: 'Utang jatuh tempo < 1 tahun', hint: 'Harus lunas dalam 1 tahun' },
     { key: 'ekuitas', label: 'Modal sendiri', hint: 'Total harta dikurangi total utang', min: true },
     { key: 'kas', label: 'Kas & tabungan', hint: 'Opsional' },
     { key: 'piutang', label: 'Tagihan ke pelanggan', hint: 'Opsional' },
     { key: 'persediaan', label: 'Stok barang', hint: 'Opsional' },
     { key: 'beban_bunga', label: 'Bunga utang setahun', hint: 'Opsional' }
];

/** Nama dokumen ramah pemohon (kunci = VERIFICATION_SOURCES). */
export const DOCUMENT_HINT = {
     identitas: 'Foto KTP pemilik dan NPWP',
     legalitas: 'Akta pendirian / NIB',
     rekening_koran: 'Mutasi rekening 6–12 bulan terakhir',
     laporan_keuangan: 'Neraca & laba rugi — angkanya dibaca otomatis',
     faktur_pajak: 'Faktur pajak atau SPT tahunan',
     laporan_audited: 'Bila ada, laporan yang sudah diaudit',
     slik_ojk: 'Hasil cek SLIK OJK (riwayat kredit)',
     agunan: 'Sertifikat / BPKB jaminan'
};

/** Angka dari teks bebas: "400.000.000", "Rp 400 jt", "1,2 M" → rupiah penuh. */
export function parseAmount(text) {
     if (text === null || text === undefined) return null;
     let raw = String(text).trim().toLowerCase().replace(/^rp\.?/, '').trim();
     if (!raw) return null;
     const negative = /^[-−(]/.test(raw);
     raw = raw.replace(/[-−()]/g, '').trim();
     const units = [[/\s*(miliar|m)$/, 1e9], [/\s*(juta|jt)$/, 1e6], [/\s*(ribu|rb)$/, 1e3]];
     let unit = 1;
     for (const [re, mult] of units) {
          if (re.test(raw)) { unit = mult; raw = raw.replace(re, ''); break; }
     }
     raw = raw.replace(/\s/g, '');
     const cleaned = unit > 1 ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/[.,]/g, '');
     if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
     return (negative ? -1 : 1) * Math.round(Number(cleaned) * unit);
}
