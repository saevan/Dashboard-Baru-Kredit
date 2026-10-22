/**
 * utils/validate.js — Validasi input form (pure functions).
 */

/** Nilai dianggap "terisi" bila bukan null/undefined/'' dan bukan NaN. */
export function isFilled(value) {
     if (value === null || value === undefined) return false;
     if (typeof value === 'number') return !Number.isNaN(value);
     if (typeof value === 'string') return value.trim() !== '';
     return true;
}

/** Angka valid (finite) dan (opsional) > min / >= min. */
export function isPositiveNumber(value, { min = 0, allowZero = false } = {}) {
     const n = Number(value);
     if (!Number.isFinite(n)) return false;
     return allowZero ? n >= min : n > min;
}

/** Rentang 0..1 (untuk skor kualitatif). */
export function isScore01(value) {
     const n = Number(value);
     return Number.isFinite(n) && n >= 0 && n <= 1;
}

/**
 * Validasi borrower lengkap per-wizard-step.
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateBorrower(borrower, { step = 5 } = {}) {
     const errors = [];
     const b = borrower || {};
     const k = b.keuangan || {};
     const bm = b.bisnis_manajemen || {};
     const ag = b.agunan || {};

     if (step >= 1) {
          if (!isFilled(b.nama)) errors.push('Nama borrower wajib diisi.');
          if (!isFilled(b.sektor)) errors.push('Sektor industri wajib dipilih.');
          if (!isFilled(b.profil_company)) errors.push('Profil company wajib dipilih.');
          if (!isPositiveNumber(b.plafon_diajukan)) errors.push('Plafon diajukan harus > 0.');
          if (!isPositiveNumber(b.tenor_bulan)) errors.push('Tenor harus > 0 bulan.');
          if (!isPositiveNumber(b.bunga_tahunan, { min: 0, allowZero: true }))
               errors.push('Bunga tahunan harus angka ≥ 0.');
     }
     if (step >= 2) {
          const requiredNum = ['ebit', 'penjualan', 'beban_bunga', 'total_aset', 'ekuitas', 'arus_kas_operasional'];
          for (const f of requiredNum) {
               if (!Number.isFinite(Number(k[f]))) errors.push(`Data keuangan "${f}" wajib angka.`);
          }
          if (Number(k.total_aset) <= 0) errors.push('Total aset harus > 0.');
          if (Number(k.ekuitas) <= 0) errors.push('Ekuitas harus > 0 (hindari pembagi 0 pada DER/ROE).');
     }
     if (step >= 3) {
          for (const f of ['skor_model_bisnis', 'skor_manajemen', 'skor_industri_risk']) {
               if (!isScore01(bm[f])) errors.push(`Skor "${f}" harus dalam rentang 0–1.`);
          }
     }
     if (step >= 4) {
          if (!isPositiveNumber(ag.nilai_agunan, { min: 0, allowZero: true }))
               errors.push('Nilai agunan harus angka ≥ 0.');
     }
     // Step 5 = review -> seluruh step dievaluasi
     return { ok: errors.length === 0, errors };
}
