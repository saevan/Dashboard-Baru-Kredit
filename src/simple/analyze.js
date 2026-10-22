/**
 * simple/analyze.js — Jembatan dashboard sederhana → mesin MEZS.id.
 * Tidak ada rumus di sini: semua angka berasal dari core/engine.js
 * (runFullAnalysis) dengan benchmark IDX & profil perusahaan yang sama.
 */

import { runFullAnalysis, emptyBorrower } from '../core/engine.js';
import { INDUSTRY_BENCHMARK } from '../data/industries.js';
import { COMPANY_PROFILES } from '../data/company-profiles.js';

/** Analisis lengkap — identik dengan aplikasi MEZS.id (tampilan Lengkap). */
export function analyze(borrower, options = {}) {
     return runFullAnalysis(borrower, {
          benchmarkData: INDUSTRY_BENCHMARK,
          profiles: COMPANY_PROFILES,
          ...options
     });
}

/**
 * Analisis + uji ulang pada jumlah yang disarankan.
 * Bila mesin menyarankan plafon lebih kecil dari yang diajukan, analisis
 * dijalankan sekali lagi pada jumlah itu agar kalimat "pinjam Rp X agar
 * langsung layak" hanya muncul bila memang terbukti oleh mesin.
 */
export function analyzeWithSuggestion(borrower, options = {}) {
     const result = analyze(borrower, options);
     const requested = Number(borrower.plafon_diajukan) || 0;
     const suggested = Number(result.nominal?.recommended_nominal) || 0;
     let atSuggested = null;
     if (suggested > 0 && suggested < requested) {
          atSuggested = analyze({ ...borrower, plafon_diajukan: suggested }, options);
     }
     return { result, atSuggested };
}

export { emptyBorrower };
