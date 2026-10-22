/**
 * data/company-profiles.js — Profil company: bobot kuantitatif vs kualitatif.
 * Rujukan: ARCHITECTURE §3.6.F (dynamic profiles), PRD §5.4.
 *
 * quanti + quali = 1.0. rasio_dominan = rasio utama penentu profil.
 */

export const COMPANY_PROFILES = {
     startup: {
          key: 'startup',
          label: 'Startup / Early Stage',
          quanti: 0.40,
          quali: 0.60,
          deskripsi: 'Bisnis belum mapan — kualitas tim & model bisnis lebih menentukan.',
          rasio_dominan: ['cash_ratio', 'tato', 'npm']
     },
     ukm_mapan: {
          key: 'ukm_mapan',
          label: 'UKM Mapan',
          quanti: 0.65,
          quali: 0.35,
          deskripsi: 'Sudah berjalan stabil & profitable — angka keuangan dominan.',
          rasio_dominan: ['roa', 'current_ratio', 'der']
     },
     manufacturing: {
          key: 'manufacturing',
          label: 'Manufaktur / Padat Modal',
          quanti: 0.60,
          quali: 0.40,
          deskripsi: 'Padat aset — efisiensi & leverage penting, tetap butuh penilaian operasional.',
          rasio_dominan: ['tato', 'inventory_turnover', 'der']
     },
     trade: {
          key: 'trade',
          label: 'Perdagangan / Distribusi',
          quanti: 0.70,
          quali: 0.30,
          deskripsi: 'Margin tipis & putaran cepat — likuiditas & perputaran dominan.',
          rasio_dominan: ['current_ratio', 'quick_ratio', 'receivable_turnover']
     }
};

export const PROFILE_LIST = Object.values(COMPANY_PROFILES).map((p) => ({
     key: p.key,
     label: p.label
}));

export function getProfile(key) {
     return COMPANY_PROFILES[key] || null;
}

export default COMPANY_PROFILES;
