/**
 * simple/form-schema.js — Isi formulir 5 langkah dalam bahasa sehari-hari,
 * dipetakan ke skema borrower mesin MEZS.id (core/engine.js emptyBorrower).
 */

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

export const COLLATERAL_OPTIONS = [
     { key: 'tanah_bangunan', label: 'Tanah & bangunan' },
     { key: 'deposito', label: 'Deposito / tabungan' },
     { key: 'kendaraan', label: 'Kendaraan' },
     { key: 'mesin', label: 'Mesin / peralatan' },
     { key: 'piutang', label: 'Tagihan ke pelanggan' },
     { key: 'persediaan', label: 'Stok barang' },
     { key: 'lainnya', label: 'Lainnya' }
];

export const SCHEME_OPTIONS = [
     { key: 'anuitas', label: 'Cicilan tetap (anuitas)' },
     { key: 'flat', label: 'Bunga flat' }
];

/** Pos laporan keuangan. `required` = 9 pos wajib kompendium. */
export const FINANCE_FIELDS = [
     { key: 'penjualan', label: 'Penjualan / omzet setahun', hint: 'Total uang dari penjualan dalam 1 tahun', required: true },
     { key: 'laba_bersih', label: 'Laba bersih setahun', hint: 'Untung setelah semua biaya dan pajak', required: true },
     { key: 'ebit', label: 'Laba usaha (sebelum bunga & pajak)', hint: 'Untung dari kegiatan usaha, sebelum bayar bunga dan pajak', required: true },
     { key: 'arus_kas_operasional', label: 'Uang bersih dari usaha setahun', hint: 'Uang masuk dikurangi uang keluar untuk operasional (arus kas operasi)', required: true },
     { key: 'total_aset', label: 'Total harta usaha', hint: 'Semua harta: kas, stok, piutang, peralatan, bangunan', required: true },
     { key: 'aset_lancar', label: 'Harta lancar', hint: 'Kas, tabungan, stok, dan tagihan yang cair dalam 1 tahun', required: true },
     { key: 'total_liabilitas', label: 'Total utang', hint: 'Semua utang usaha', required: true },
     { key: 'liabilitas_jangka_pendek', label: 'Utang jatuh tempo < 1 tahun', hint: 'Utang yang harus lunas dalam 1 tahun', required: true },
     { key: 'ekuitas', label: 'Modal sendiri', hint: 'Total harta dikurangi total utang', required: true },
     { key: 'kas', label: 'Kas & tabungan', hint: 'Opsional' },
     { key: 'piutang', label: 'Tagihan ke pelanggan', hint: 'Opsional' },
     { key: 'persediaan', label: 'Stok barang', hint: 'Opsional' },
     { key: 'beban_bunga', label: 'Bunga utang yang dibayar setahun', hint: 'Opsional — bila sudah punya pinjaman' }
];

export const REQUIRED_FINANCE = FINANCE_FIELDS.filter((f) => f.required).map((f) => f.key);

/**
 * Penilaian petugas (wawancara), skala 1–5. Satu pertanyaan bisa mengisi
 * beberapa parameter mesin. "Belum dinilai" = nilai bawaan mesin tetap dipakai.
 */
export const INTERVIEW_QUESTIONS = [
     { key: 'model', label: 'Seberapa kuat model usahanya?', fields: ['skor_model_bisnis', 'skalabilitas'] },
     { key: 'pasar', label: 'Seberapa kuat posisinya di pasar? (pelanggan beragam, tidak bergantung satu pembeli)', fields: ['posisi_pasar', 'ketergantungan'] },
     { key: 'pengalaman', label: 'Seberapa berpengalaman pengelolanya?', fields: ['pengalaman_tim'] },
     { key: 'bayar', label: 'Bagaimana riwayat membayar utang sebelumnya?', fields: ['rekam_jejak_bayar'] },
     { key: 'kelola', label: 'Seberapa rapi pencatatan & pengelolaan usaha?', fields: ['tata_kelola'] },
     { key: 'tren', label: 'Bagaimana tren usaha 2–3 tahun terakhir?', fields: ['tren_keuangan'] },
     { key: 'industri', label: 'Bagaimana prospek industrinya?', fields: ['skor_industri_risk', 'prospek_industri', 'sensitivitas_makro'] }
];

export const INTERVIEW_SCALE = [
     { value: 1, label: 'Sangat kurang' },
     { value: 2, label: 'Kurang' },
     { value: 3, label: 'Cukup' },
     { value: 4, label: 'Baik' },
     { value: 5, label: 'Sangat baik' }
];

/** Skala 1–5 → nilai 0–1 mesin (1 → 0,2 … 5 → 1,0). */
export const interviewToScore = (v) => Math.round(Number(v) * 20) / 100;

/** Nilai 0–1 mesin → skala 1–5 terdekat (untuk mengisi ulang formulir). */
export const scoreToInterview = (s) => Math.min(5, Math.max(1, Math.round(Number(s) * 5)));

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
          if (re.test(raw)) {
               unit = mult;
               raw = raw.replace(re, '');
               break;
          }
     }
     raw = raw.replace(/\s/g, '');
     // Dengan satuan, koma = desimal ("1,2 M"); tanpa satuan, titik/koma = pemisah ribuan.
     const cleaned = unit > 1 ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/[.,]/g, '');
     if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
     return (negative ? -1 : 1) * Math.round(Number(cleaned) * unit);
}

/** Periksa langkah formulir → daftar pesan kesalahan awam (kosong = boleh lanjut). */
export function validateStep(step, b) {
     const errs = [];
     if (step === 0) {
          if (!String(b.nama || '').trim()) errs.push('Isi nama usaha.');
          if (!b.sektor) errs.push('Pilih bidang usaha.');
     }
     if (step === 1) {
          if (!(Number(b.plafon_diajukan) > 0)) errs.push('Isi jumlah pinjaman yang diajukan.');
          if (!(Number(b.tenor_bulan) >= 1 && Number(b.tenor_bulan) <= 120)) errs.push('Lama pinjaman 1–120 bulan.');
     }
     if (step === 2) {
          const missing = FINANCE_FIELDS.filter((f) => f.required && !Number.isFinite(b.keuangan?.[f.key]));
          if (missing.length) errs.push(`Masih kosong: ${missing.map((f) => f.label.toLowerCase()).join(', ')}.`);
     }
     if (step === 3) {
          if (b.agunan?.jenis && !(Number(b.agunan?.nilai_agunan) > 0)) errs.push('Isi perkiraan nilai jaminan, atau pilih "Tanpa jaminan".');
     }
     return errs;
}
