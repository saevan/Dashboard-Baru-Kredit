/**
 * simple/demo.js — Kasus demo fiktif dari Kompendium MEZS.id.
 * Bu Sari: skor 87,2 → idAA, keputusan REVIEW (cicilan 63% arus kas),
 * saran plafon Rp 380 jt.
 */

import { emptyBorrower } from '../core/engine.js';

export function demoBuSari() {
     const b = emptyBorrower();
     Object.assign(b, {
          nama: 'Katering Dapur Sari',
          sektor: 'IDX-CONSUMER-NON-CYCLICALS',
          profil_company: 'ukm_mapan',
          plafon_diajukan: 400_000_000,
          tenor_bulan: 36,
          bunga_tahunan: 0.14,
          skema_angsuran: 'anuitas'
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
