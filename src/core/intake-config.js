/**
 * core/intake-config.js — Konfigurasi alur intake pemohon (mode ganda).
 *
 * Fitur "mode pemohon": borrower mengisi data kuantitatif lebih dulu, lender
 * memverifikasi, baru sistem menilai. Modul ini memusatkan status alur, katalog
 * sumber verifikasi, daftar field kelengkapan, ambang keyakinan data, dan ambang
 * gate keputusan.
 *
 * Sengaja DIPISAH dari `core/config.js` (DEFAULT_CONFIG) agar `configHash`
 * tidak berubah dan seluruh tes lama tetap stabil.
 */

/** Status siklus pengajuan (state machine). */
export const APPLICATION_STATUS = {
     DRAFT: 'draft',
     SUBMITTED: 'submitted',
     NEED_FIX: 'need_fix',
     VERIFIED: 'verified',
     SCORED: 'scored',
     OFFERED: 'offered',
     ACCEPTED: 'accepted',
     DECLINED: 'declined',
     DECIDED: 'decided',
     REJECTED: 'rejected'
};

/** Label internal (konteks lender). */
export const APPLICATION_STATUS_LABEL = {
     draft: 'Draf',
     submitted: 'Diajukan',
     need_fix: 'Perlu Perbaikan',
     verified: 'Terverifikasi',
     scored: 'Sudah Dinilai',
     offered: 'Ditawarkan',
     accepted: 'Diterima Pemohon',
     declined: 'Ditolak Pemohon',
     decided: 'Diputuskan',
     rejected: 'Ditolak'
};

/**
 * Label ramah pemohon — TANPA istilah penilaian/peringkat. Pemohon hanya
 * melihat progres dan konfirmasi (grade hanya untuk lender).
 */
export const BORROWER_STATUS_LABEL = {
     draft: 'Draf belum dikirim',
     submitted: 'Pengajuan diterima, menunggu verifikasi',
     need_fix: 'Perlu perbaikan dokumen',
     verified: 'Dokumen terverifikasi, sedang ditinjau',
     scored: 'Sedang ditinjau',
     offered: 'Penawaran menunggu konfirmasi Anda',
     accepted: 'Penawaran diterima — menunggu proses pencairan',
     declined: 'Penawaran ditolak',
     decided: 'Selesai — silakan cek konfirmasi lender',
     rejected: 'Pengajuan ditolak'
};

/** Urutan tahap untuk linimasa pemohon. */
export const APPLICATION_STAGES = [
     { key: 'submitted', label: 'Pengajuan dikirim', statuses: ['submitted'] },
     { key: 'verification', label: 'Verifikasi dokumen', statuses: ['need_fix', 'verified'] },
     { key: 'review', label: 'Peninjauan lender', statuses: ['scored'] },
     { key: 'offer', label: 'Penawaran', statuses: ['offered'] },
     { key: 'decision', label: 'Keputusan', statuses: ['decided', 'rejected', 'accepted', 'declined'] }
];

/**
 * Katalog sumber verifikasi. `weight` menaikkan keyakinan data; `mandatory`
 * berarti wajib terverifikasi agar keyakinan minimal tercapai.
 */
export const VERIFICATION_SOURCES = [
     { key: 'identitas', label: 'Identitas pemilik (KTP/NPWP)', weight: 1, mandatory: true },
     { key: 'legalitas', label: 'Legalitas perusahaan (akta/NIB)', weight: 1, mandatory: true },
     { key: 'rekening_koran', label: 'Rekening koran 6–12 bulan', weight: 2, mandatory: true },
     // MEZS.id (Dashboard-Baru-Kredit): surat keterangan bank memvalidasi keaslian rekening koran.
     { key: 'surat_keterangan_bank', label: 'Surat keterangan bank (validasi rekening koran)', weight: 1, mandatory: true },
     { key: 'laporan_keuangan', label: 'Laporan keuangan', weight: 2, mandatory: true },
     { key: 'faktur_pajak', label: 'Faktur pajak / SPT', weight: 2, mandatory: false },
     { key: 'laporan_audited', label: 'Laporan keuangan diaudit', weight: 3, mandatory: false },
     { key: 'slik_ojk', label: 'Hasil SLIK OJK', weight: 3, mandatory: false },
     { key: 'agunan', label: 'Bukti kepemilikan agunan', weight: 2, mandatory: false }
];

/** Field keuangan yang dihitung untuk kelengkapan data. */
export const REQUIRED_FINANCIAL_FIELDS = [
     'penjualan',
     'laba_bersih',
     'ebit',
     'total_aset',
     'aset_lancar',
     'total_liabilitas',
     'liabilitas_jangka_pendek',
     'ekuitas',
     'arus_kas_operasional'
];

/** Ambang keyakinan data & gate keputusan (default MVP). */
export const INTAKE_CONFIG = {
     scaleMode: 'pefindo',
     confidence: {
          medium_min_verified: 4,
          high_min_verified: 6,
          high_min_weight: 12,
          high_min_completeness: 0.85,
          medium_min_completeness: 0.6,
          integrity_penalty: ['FAIL', 'WARNING', 'INVALID', 'INSUFFICIENT']
     },
     gate: {
          min_grade_index: 9,
          min_confidence: 'MEDIUM',
          auto_reject_grade_index: 17
     },
     consent: {
          version: 'v1',
          clause:
               'Pemohon menyatakan data yang diisi benar dan menyetujui lender melakukan audit finansial serta verifikasi dokumen pendukung sebelum keputusan kredit.'
     }
};

function isPlainObject(v) {
     return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** Gabung dalam (deep) konfigurasi intake dengan override. */
export function deepMergeIntake(base, over) {
     if (!isPlainObject(base)) return over;
     if (!isPlainObject(over)) return base;
     const out = { ...base };
     for (const key of Object.keys(over)) {
          const b = base[key];
          const o = over[key];
          out[key] = isPlainObject(b) && isPlainObject(o) ? deepMergeIntake(b, o) : o;
     }
     return out;
}

/** Resolusi konfigurasi intake (default + override). */
export function resolveIntakeConfig(over = {}) {
     return deepMergeIntake(INTAKE_CONFIG, over || {});
}

/** Metadata satu sumber verifikasi. */
export function sourceByKey(key) {
     return VERIFICATION_SOURCES.find((s) => s.key === key) || null;
}

/** Daftar key sumber verifikasi yang wajib. */
export function mandatorySourceKeys() {
     return VERIFICATION_SOURCES.filter((s) => s.mandatory).map((s) => s.key);
}

/** Tingkat keyakinan data yang dikenal. */
export function confidenceLevels() {
     return ['LOW', 'MEDIUM', 'HIGH'];
}

export default {
     APPLICATION_STATUS,
     APPLICATION_STATUS_LABEL,
     BORROWER_STATUS_LABEL,
     APPLICATION_STAGES,
     VERIFICATION_SOURCES,
     REQUIRED_FINANCIAL_FIELDS,
     INTAKE_CONFIG,
     resolveIntakeConfig,
     sourceByKey,
     mandatorySourceKeys,
     confidenceLevels
};
