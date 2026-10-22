/**
 * simple/demo.js — Kasus demo fiktif dari Kompendium MEZS.id.
 * Bu Sari: skor 87,2 → idAA, keputusan REVIEW (cicilan 63% arus kas),
 * saran plafon Rp 380 jt.
 */

import { emptyBorrower } from '../core/engine.js';
import { createLoan, makeOffer, acceptOffer, verifyDocument, toggleCondition, conditionsView, disburseLoan, addMonitoring } from './loans.js';
import { DOCUMENTS } from './intake.js';

export function demoBuSari() {
     const b = emptyBorrower();
     Object.assign(b, {
          nama: 'Katering Dapur Sari',
          sektor: 'IDX-CONSUMER-NON-CYCLICALS',
          profil_company: 'ukm_mapan',
          plafon_diajukan: 400_000_000,
          tenor_bulan: 36,
          bunga_tahunan: 0.14,
          skema_angsuran: 'annuity',
          periode_angsuran: 'bulanan',
          jenis_kredit: 'modal_kerja',
          tujuan_kredit: 'Modal kerja bahan baku dan peralatan untuk kontrak katering kantor baru'
     });
     Object.assign(b.keuangan, {
          penjualan: 2_400_000_000,
          laba_bersih: 216_000_000,
          ebit: 290_000_000,
          total_aset: 900_000_000,
          aset_lancar: 420_000_000,
          total_liabilitas: 250_000_000,
          liabilitas_jangka_pendek: 150_000_000,
          ekuitas: 650_000_000,
          arus_kas_operasional: 260_000_000,
          kas: 120_000_000,
          piutang: 180_000_000,
          persediaan: 60_000_000,
          beban_bunga: 18_000_000
     });
     // Hasil wawancara 0,8 untuk semua parameter kualitatif; lama usaha & cadangan kas tidak diisi.
     for (const key of Object.keys(b.bisnis_manajemen)) {
          if (key !== 'ocf_positif' && key !== 'track_record_tahun' && key !== 'cash_runway_bulan') {
               b.bisnis_manajemen[key] = 0.8;
          }
     }
     b.bisnis_manajemen.track_record_tahun = null;
     b.bisnis_manajemen.cash_runway_bulan = null;
     Object.assign(b.agunan, { jenis: 'tanah_bangunan', nilai_agunan: 600_000_000, personal_guarantee: false });
     return b;
}

/**
 * Pak Darto (Warung Bakso, fiktif): pinjaman investasi Rp 250 jt / 24 bulan,
 * cair Maret 2026, lalu memburuk: Mei sehat → Juli waspada → September
 * bermasalah (telat 45 hari). Sisa pinjaman Rp 203,5 jt, sisa 17 bulan,
 * uang bersih usaha kini Rp 110 jt/tahun → kompendium: perpanjang 33 bulan.
 */
export function demoPakDarto() {
     const b = emptyBorrower();
     Object.assign(b, {
          nama: 'Warung Bakso Pak Darto',
          sektor: 'IDX-CONSUMER-NON-CYCLICALS',
          profil_company: 'ukm_mapan',
          bentuk_usaha: 'ud',
          jenis_kredit: 'investasi',
          tujuan_kredit: 'Investasi renovasi dapur dan peralatan cabang kedua',
          plafon_diajukan: 250_000_000,
          tenor_bulan: 24,
          bunga_tahunan: 0.14,
          skema_angsuran: 'annuity',
          periode_angsuran: 'bulanan'
     });
     Object.assign(b.keuangan, {
          penjualan: 1_500_000_000,
          laba_bersih: 150_000_000,
          ebit: 200_000_000,
          total_aset: 600_000_000,
          aset_lancar: 250_000_000,
          total_liabilitas: 200_000_000,
          liabilitas_jangka_pendek: 100_000_000,
          ekuitas: 400_000_000,
          arus_kas_operasional: 260_000_000,
          kas: 80_000_000,
          piutang: 20_000_000,
          persediaan: 40_000_000,
          beban_bunga: 10_000_000
     });
     b.bisnis_manajemen.track_record_tahun = null;
     b.bisnis_manajemen.cash_runway_bulan = null;
     Object.assign(b.agunan, { jenis: 'tanah_bangunan', nilai_agunan: 450_000_000, personal_guarantee: false });
     const interview = { model: 4, pasar: 4, pengalaman: 4, bayar: 4, kelola: 4, tren: 4, industri: 4 };

     let r = createLoan({ borrower: b, documents: demoDocuments('darto'), consent: true, interview, now: new Date('2026-03-02T03:00:00Z') });
     for (const d of r.documents) r = verifyDocument(r, d.key, true, new Date('2026-03-03T03:00:00Z'));
     r = makeOffer(r, { amount: 250_000_000, tenor: 24, rate: 0.14, periodicity: 'bulanan', now: new Date('2026-03-05T03:00:00Z') });
     r = acceptOffer(r, { now: new Date('2026-03-06T03:00:00Z') });
     for (const c of conditionsView(r).items) r = toggleCondition(r, c.code, true, new Date('2026-03-12T03:00:00Z'));
     r = disburseLoan(r, { now: new Date('2026-03-16T03:00:00Z') });
     r = addMonitoring(r, {
          period: '2026-05', note: 'Penjualan stabil, angsuran tepat waktu.',
          extra: { P1_dscr: 1.62 }, ocf: 'positif', omzet_change_pct: 6, days_late: 0, covenant: 'compliant'
     }, { now: new Date('2026-05-31T09:00:00Z') });
     r = addMonitoring(r, {
          period: '2026-07', note: 'Omzet turun setelah jalan depan warung diperbaiki; telat bayar 9 hari.',
          extra: { P1_dscr: 1.32 }, ocf: 'positif', omzet_change_pct: -12, days_late: 9, cash_change_pct: -10, covenant: 'compliant'
     }, { now: new Date('2026-07-31T09:00:00Z') });
     r = addMonitoring(r, {
          period: '2026-09', note: 'Tunggakan 45 hari. Debitur kooperatif; pengunjung belum pulih.',
          extra: { P1_dscr: 0.78 }, ocf: 'negatif_1_periode', omzet_change_pct: -32, days_late: 45, cash_change_pct: -41,
          response_days: 9, covenant: 'minor', cash_flow_annual: 110_000_000, outstanding: 203_500_000, remaining_months: 17
     }, { now: new Date('2026-09-30T09:00:00Z') });
     return r;
}

/**
 * Dokumen contoh (fiktif): hanya catatan nama berkas, tanpa isi. Dipakai demo
 * agar daftar periksa petugas terisi; laporan keuangan Bu Sari dibaca dari
 * data/contoh/laporan_keuangan_bu_sari.csv.
 */
export function demoDocuments(prefix = 'sari') {
     return DOCUMENTS.filter((d) => d.mandatory || d.key === 'agunan').map((d, i) => ({
          key: d.key,
          filename: `contoh-${prefix}-${d.key}.pdf`,
          size: 120_000 + i * 1000,
          type: 'application/pdf',
          sha256: `contoh-${prefix}-${d.key}`,
          uploaded_at: '2026-10-01T00:00:00.000Z',
          verified: false,
          example: true,
          extraction: null
     }));
}

/** Lokasi berkas laporan contoh Bu Sari (dibaca seperti berkas yang diunggah pemohon). */
export const SAMPLE_REPORT_URL = 'data/contoh/laporan_keuangan_bu_sari.csv';
