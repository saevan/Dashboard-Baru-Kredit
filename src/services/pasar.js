/**
 * services/pasar.js — Bahasa pasar untuk pemohon (pedagang & UMKM lokal).
 *
 * Sapaan Bapak/Ibu, kata sehari-hari (omzet, untung, cicilan per hari, petugas),
 * tanpa istilah bank (lender, plafon, tenor, agunan, verifikasi). Mesin dan logika
 * status tetap dari dashboard lama (core/applicant-feedback.js, core/intake-config.js);
 * berkas ini hanya mengganti kata-kata yang dilihat pemohon.
 */

import { applicantFeedback } from '../core/applicant-feedback.js';

/** Label status singkat untuk pemohon. */
export const STATUS_PASAR = {
     draft: 'Belum dikirim',
     submitted: 'Sudah dikirim, menunggu dicek petugas',
     need_fix: 'Ada yang perlu dilengkapi',
     verified: 'Berkas sudah dicek, sedang dinilai',
     scored: 'Sedang dinilai petugas',
     offered: 'Ada tawaran pinjaman untuk Bapak/Ibu',
     accepted: 'Tawaran diterima — tunggu dana cair',
     declined: 'Tawaran tidak diambil',
     decided: 'Selesai — tunggu kabar dari petugas',
     rejected: 'Belum bisa disetujui'
};

/** Tahap linimasa (urutan sama dengan APPLICATION_STAGES). */
export const STAGE_PASAR = {
     submitted: 'Pengajuan dikirim',
     verification: 'Berkas dicek petugas',
     review: 'Usaha dinilai',
     offer: 'Tawaran pinjaman',
     decision: 'Keputusan'
};

const APPROVED = ['LAYAK', 'LAYAK_BERSYARAT', 'DISETUJUI'];

/**
 * Pesan status untuk pemohon. Cabang & nada (tone) sama persis dengan
 * applicantFeedback() lama; hanya kalimatnya yang diganti.
 */
export function feedbackPasar(app) {
     const base = applicantFeedback(app);
     const s = app.status || 'draft';
     const approved = s === 'decided' && APPROVED.includes(app.decision);
     let title = STATUS_PASAR[s] || 'Status belum ada';
     let message = 'Buka rincian pengajuan untuk melihat perkembangannya.';
     if (s === 'draft') message = 'Pengajuan belum dikirim. Lanjutkan mengisi, lalu kirim supaya bisa dicek petugas.';
     else if (s === 'submitted') message = 'Petugas akan mengecek berkas Bapak/Ibu. Kabarnya muncul di halaman ini.';
     else if (s === 'verified' || s === 'scored') message = 'Berkas sudah lengkap. Petugas sedang menghitung kemampuan bayar usaha Bapak/Ibu.';
     if (base.tone === 'danger') {
          title = 'Pengajuan belum bisa disetujui';
          message = 'Pengajuan ini ditutup dan dananya tidak dicairkan. Silakan hubungi petugas kalau perlu penjelasan.';
     } else if (s === 'need_fix') {
          title = 'Ada yang perlu dilengkapi';
          message = 'Baca catatan petugas, lengkapi data atau berkasnya, lalu kirim lagi.';
     } else if (s === 'offered') {
          message = 'Cek jumlah pinjaman, cicilan, dan batas waktunya, lalu pilih terima atau tolak.';
     } else if (s === 'declined') {
          title = 'Bapak/Ibu tidak mengambil tawaran';
          message = 'Pengajuan ditutup tanpa pencairan dana.';
     } else if (approved) {
          title = 'Pengajuan disetujui';
          message = 'Hubungi petugas untuk melengkapi syarat. Disetujui belum berarti dana sudah cair.';
     }
     if (s === 'accepted' || approved) {
          const fac = app.facility_summary?.status;
          if (fac === 'aktif') { title = 'Dana sudah dicairkan'; message = 'Petugas sudah mencatat pencairan. Cek rekening Bapak/Ibu dan jadwal cicilannya.'; }
          else if (fac === 'lunas') { title = 'Pinjaman lunas'; message = 'Terima kasih, pinjaman Bapak/Ibu sudah lunas.'; }
          else if (fac === 'ditolak') { title = 'Pencairan tidak dilanjutkan'; message = 'Silakan hubungi petugas untuk penjelasannya.'; }
          else if (s === 'accepted') message = 'Petugas sedang menyiapkan syarat pencairan. Dana cair setelah syarat lengkap.';
     }
     return { title, message, note: base.note, tone: base.tone };
}
