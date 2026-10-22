import { BORROWER_STATUS_LABEL } from './intake-config.js';
export function applicantFeedback(app) {
     const status = app.status || 'draft';
     const event = [...(app.events || [])].reverse().find(e => (e.to_status || e.to) === status);
     const note = ['rejected', 'need_fix'].includes(status) ? String(event?.note || app.feedback?.note || '').trim() : '';
     let title = BORROWER_STATUS_LABEL[status] || 'Status belum tersedia';
     let message = 'Buka detail pengajuan untuk mengikuti prosesnya.';
     let tone = 'info';
     if (status === 'rejected' || status === 'decided' && ['TIDAK_LAYAK', 'DITOLAK', 'REJECTED'].includes(app.decision)) {
          title = 'Pengajuan ditolak'; tone = 'danger';
          message = 'Pengajuan ini sudah ditutup dan tidak dilanjutkan ke pencairan. Hubungi lender jika membutuhkan penjelasan.';
     } else if (status === 'need_fix') {
          title = 'Perbaikan diperlukan'; tone = 'warning'; message = 'Periksa catatan lender, perbaiki data atau dokumen, lalu kirim ulang pengajuan.';
     } else if (status === 'offered') {
          message = 'Tinjau nominal, cicilan, syarat, dan masa berlaku penawaran sebelum memberi respons.';
     } else if (status === 'declined') {
          title = 'Anda menolak penawaran'; message = 'Pengajuan ditutup tanpa pencairan.';
     } else if (status === 'decided' && ['LAYAK', 'LAYAK_BERSYARAT', 'DISETUJUI'].includes(app.decision)) {
          title = 'Pengajuan disetujui'; message = 'Hubungi lender untuk melengkapi syarat fasilitas. Persetujuan belum berarti dana sudah dicairkan.';
     }
     if (status === 'accepted' || status === 'decided' && ['LAYAK', 'LAYAK_BERSYARAT', 'DISETUJUI'].includes(app.decision)) {
          if (app.facility_summary?.status === 'aktif') { title = 'Pencairan tercatat'; message = 'Lender telah mencatat pencairan fasilitas. Hubungi lender untuk konfirmasi penerimaan dana dan jadwal pembayaran.'; }
          else if (app.facility_summary?.status === 'lunas') { title = 'Fasilitas lunas'; message = 'Lender telah mencatat pelunasan fasilitas Anda.'; }
          else if (app.facility_summary?.status === 'ditolak') { title = 'Fasilitas tidak dilanjutkan'; message = 'Hubungi lender untuk penjelasan mengenai fasilitas yang tidak dilanjutkan.'; }
     }
     return { title, message, note, tone };
}
