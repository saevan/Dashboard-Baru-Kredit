import { automaticAudit, numericValue } from './audit-automation.js';
import { effectiveDscrTarget } from './nominal.js';

const money = n => `Rp${Math.ceil(n).toLocaleString('id-ID')}`;
const positive = v => numericValue(v) !== null && Number(v) > 0;

/** Evidence-based suggestions only. No generated claims about authenticity or future approval. */
export function borrowerImprovements(detail = {}) {
     const borrower = detail.borrower || {};
     const result = detail.result || {};
     const report = automaticAudit(borrower, detail.documents || []);
     const snapshot = result.meta?.snapshot || {};
     const contract = detail.offer || detail.financing_offer;
     const assessment = detail.offer_assessment || contract?.assessment;
     const items = [];
     const add = (key, action, evidence, source) => {
          if (!items.some(i => i.key === key)) items.push({key,action,evidence,source});
     };
     if (report.missing_files.length) add('documents',
          `Lampirkan berkas yang belum tersedia: ${report.missing_files.join(', ')}.`,
          'Berkas lengkap dan terbaca; unggah pada jenis dokumen yang sesuai.', 'Kelengkapan lampiran');
     if (report.integrity.status === 'insufficient') add('financial',
          'Lengkapi total aset, total liabilitas dan ekuitas sebelum penilaian ulang.',
          'Neraca lengkap untuk periode yang sama beserta rincian saldo.', 'Kelengkapan neraca');
     else if (report.integrity.status === 'invalid' || report.checks.some(c => c.passed === false)) add('financial',
          'Rekonsiliasi neraca dan koreksi komponen yang tidak sesuai totalnya berdasarkan transaksi sebenarnya.',
          'Neraca revisi, buku besar dan penjelasan selisih; jangan mengubah angka hanya untuk menyeimbangkan laporan.', 'Pemeriksaan konsistensi angka');
     if (report.stale_import || report.changed.length) add('source',
          'Cocokkan kembali angka dashboard dengan laporan sumber terbaru dan jelaskan setiap koreksi.',
          'CSV/Excel laporan yang digunakan beserta rekonsiliasi perubahan angka.', 'Pencocokan laporan sumber');

     const rules = result.decision?.rules_evaluated || [];
     const breached = metric => rules.some(r => r.metric === metric && r.violated);
     const value = metric => numericValue(result.ratios?.[metric] ?? rules.find(r => r.metric === metric)?.value);
     const limits = snapshot.hard_rules || {};
     const limitLtv = borrower.agunan?.personal_guarantee ? limits.ltv_max_with_guarantee : limits.ltv_max;
     const ltv = numericValue(assessment ? assessment.ltv : result.extra?.ltv ?? value('ltv'));
     const amount = numericValue(assessment ? contract?.amount : borrower.plafon_diajukan);
     const collateral = numericValue(borrower.agunan?.nilai_agunan);
     if (positive(limitLtv) && ltv !== null && ltv > limitLtv) {
          const options = positive(collateral) && positive(amount)
               ? ` Untuk memenuhi batas agunan saat ini, pertimbangkan plafon paling tinggi ${money(Math.floor(collateral*limitLtv))} atau nilai agunan terverifikasi sedikitnya ${money(amount/limitLtv)}.` : '';
          add('collateral', `Sesuaikan plafon atau ajukan tambahan agunan untuk ditinjau lender.${options}`,
               'Bukti kepemilikan, rincian aset, penilaian agunan terbaru, dan informasi pengikatan pada kredit lain.', 'Rasio agunan pada penilaian/penawaran tersimpan');
     }
     const target = numericValue(assessment?.dscr_target ?? (snapshot.hard_rules ? effectiveDscrTarget({hardRules:limits,nominal:snapshot.nominal}) : null));
     const dscr = numericValue(assessment ? assessment.dscr : value('dscr'));
     if ((dscr !== null && target !== null && dscr < target) || (!assessment && (breached('dscr') || breached('ds_ratio') || breached('dti')))) {
          add('cashflow', 'Perbaiki arus kas yang tersedia untuk cicilan; diskusikan pengurangan plafon atau penyesuaian tenor dan cicilan dengan lender.',
               'Mutasi rekening 6 bulan, proyeksi arus kas bulanan, daftar seluruh utang dan jadwal pembayaran, serta bukti sumber penerimaan.', 'Kapasitas pembayaran');
     }
     if (breached('arrears_days') || Number(result.extra?.arrears_days) > Number(limits.arrears_days_max)) add('arrears',
          'Selesaikan tunggakan atau sepakati penyelesaiannya dengan kreditur dan jelaskan penyebab keterlambatan.',
          'Bukti pembayaran, surat penyelesaian/restrukturisasi dan laporan riwayat kredit terbaru.', 'Riwayat pembayaran');
     // Original ICR depends on the original terms; do not present it as a current finding after an offer.
     if (breached('negative_ocf_periods') || (!assessment && breached('icr')) || breached('altman_z')) add('performance',
          'Jelaskan penyebab tekanan laba/arus kas dan siapkan rencana perbaikan biaya, penagihan piutang atau permodalan yang dapat dibuktikan.',
          'Laporan laba rugi dan arus kas terbaru, umur piutang, rincian biaya, serta bukti realisasi perbaikan.', 'Kinerja keuangan');
     const qualitative = {
          tata_kelola: ['Rapikan pencatatan keuangan dan pembagian tanggung jawab usaha.', 'SOP, struktur pengurus dan laporan keuangan rutin.'],
          ketergantungan: ['Kurangi ketergantungan pada satu pelanggan atau pemasok.', 'Daftar kontribusi pelanggan/pemasok dan kontrak alternatif.'],
          model_bisnis: ['Perjelas sumber pendapatan, biaya dan keberlanjutan usaha.', 'Rincian produk, margin usaha, kontrak dan bukti transaksi.'],
          rekam_jejak_bayar: ['Tunjukkan riwayat pembayaran kewajiban yang konsisten.', 'Jadwal utang, bukti cicilan dan riwayat kredit terbaru.'],
          pengalaman_tim: ['Lengkapi bukti pengalaman dan kemampuan pengelola usaha.', 'Profil pengelola, riwayat usaha dan bukti pekerjaan/proyek.']
     };
     for (const [key,[action,evidence]] of Object.entries(qualitative)) {
          const score = numericValue(result.subscores?.[key]);
          if (score !== null && score < 60 && !result.score_details?.[key]?.used_default) add(key,action,evidence,'Komponen penilaian yang perlu diperkuat');
     }
     if (!items.length) add('refresh','Siapkan pembaruan usaha untuk penilaian periode berikutnya.',
          'Laporan keuangan periode terbaru, mutasi rekening dan daftar utang terkini.','Tidak ada temuan spesifik yang terdeteksi dari data tersedia');
     const selected = items.slice(0,7);
     const text = selected.map((i,n)=>`${n+1}. ${i.action}\nBukti: ${i.evidence}`).join('\n\n') + '\n\nPerbaikan akan ditinjau berdasarkan bukti terbaru; tidak menjamin kenaikan rating atau persetujuan.';
     return {items:selected,text};
}
