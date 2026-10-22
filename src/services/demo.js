/**
 * services/demo.js — Data contoh fiktif dari Kompendium MEZS.id.
 * Bu Sari  : pengajuan baru (skor 87,2 → idAA, saran plafon Rp 380 jt).
 * Pak Darto: fasilitas berjalan yang memburuk — memakai berkas impor JSON
 *            dashboard lama (data/demo/IMPOR_fasilitas_bakso_darto.json).
 */

import { emptyBorrower } from '../core/engine.js';
import * as storage from '../data/storage.js';
import { loginDemo } from './core.js';
import { blankDraft, saveDraft, submitDraft } from './applications.js';

export const DARTO_DEMO_URL = 'data/demo/IMPOR_fasilitas_bakso_darto.json';
export const SAMPLE_REPORT_URL = 'data/contoh/laporan_keuangan_bu_sari.csv';

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
     for (const key of Object.keys(b.bisnis_manajemen)) {
          if (key !== 'ocf_positif' && key !== 'track_record_tahun' && key !== 'cash_runway_bulan') b.bisnis_manajemen[key] = 0.8;
     }
     b.bisnis_manajemen.track_record_tahun = null;
     b.bisnis_manajemen.cash_runway_bulan = null;
     Object.assign(b.agunan, { ketersediaan: 'ada', jenis: 'tanah_bangunan', nilai_agunan: 600_000_000, pemilik: 'Sari Wulandari', keterangan: 'Ruko Jl. Melati 5, Bandung (contoh)', personal_guarantee: false });
     return b;
}

const DEMO_DOC_KEYS = ['identitas', 'legalitas', 'rekening_koran', 'laporan_keuangan', 'agunan'];

/** Kirim pengajuan contoh Bu Sari sebagai pemohon demo, lalu kembalikan sesi semula. */
export function seedBuSariApplication() {
     const before = storage.loadSession();
     loginDemo('borrower');
     try {
          const draft = blankDraft();
          draft.borrower = { ...draft.borrower, ...demoBuSari() };
          saveDraft(draft);
          draft.documents = DEMO_DOC_KEYS.map((k) => ({
               id: storage.uid('doc'), source_key: k, filename: `contoh-sari-${k}.pdf`, size: 120_000, type: 'application/pdf',
               has_file: false, example: true, verified: 0, created_at: new Date().toISOString()
          }));
          saveDraft(draft);
          const res = submitDraft(draft, { consentChecked: true });
          if (!res.ok) throw new Error(res.error);
          return res.id;
     } finally {
          if (before) storage.saveSession(before);
          else storage.clearSession();
     }
}

/** Impor fasilitas contoh Pak Darto (payload JSON lama, digabung). */
export function importDartoDemo(payload) {
     return storage.importAll(payload, { merge: true });
}
