/**
 * core/disbursement.js — Syarat penarikan (conditions precedent) & borrowing base.
 * Pure functions; TIDAK menyentuh DOM.
 *
 * Prinsip materi *Covenants, POJK 40 & PSAK 71*: dana tidak dicairkan sebelum
 * seluruh syarat wajib terpenuhi — perjanjian & persetujuan organ perusahaan,
 * pengikatan agunan peringkat pertama, asuransi dengan banker's clause, setoran
 * modal sendiri untuk kredit investasi, dan sertifikat borrowing base untuk
 * kredit modal kerja.
 */

import { DEFAULT_CONFIG } from './config.js';

const num = (v, d = 0) =>
     v === null || v === undefined || v === ''
          ? d
          : Number.isFinite(Number(v))
               ? Number(v)
               : d;

/** Pengikatan agunan menurut jenisnya (hukum jaminan Indonesia). */
const BINDING = {
     tanah_bangunan: 'APHT dan Sertifikat Hak Tanggungan peringkat pertama terdaftar di Kantor Pertanahan',
     kendaraan: 'Akta dan Sertifikat Jaminan Fidusia terdaftar, BPKB asli disimpan lender',
     mesin: 'Akta dan Sertifikat Jaminan Fidusia terdaftar, nomor seri mesin sesuai faktur',
     persediaan: 'Akta dan Sertifikat Jaminan Fidusia atas persediaan terdaftar',
     piutang: 'Akta dan Sertifikat Jaminan Fidusia atas piutang (cessie) terdaftar',
     deposito: 'Akta gadai dan pemblokiran deposito atas nama lender',
     lainnya: 'Pengikatan jaminan sesuai jenis agunan, terdaftar dan peringkat pertama'
};

/** Agunan fisik yang wajib diasuransikan. */
const INSURABLE = new Set(['tanah_bangunan', 'kendaraan', 'mesin', 'persediaan', 'lainnya']);

/**
 * Validasi format identitas usaha (opsional): NPWP 15 digit (format lama) atau
 * 16 digit (NIK/NPWP baru), NIB 13 digit. Tanda baca diabaikan.
 * @returns {{npwp:(string|null), nib:(string|null)}} pesan galat per field
 */
export function identityErrors({ npwp = '', nib = '' } = {}) {
     const digits = (v) => String(v || '').replace(/[\s.\-]/g, '');
     const n = digits(npwp);
     const b = digits(nib);
     return {
          npwp: n && !/^\d{15,16}$/.test(n) ? 'NPWP harus 15 atau 16 digit angka.' : null,
          nib: b && !/^\d{13}$/.test(b) ? 'NIB harus 13 digit angka.' : null
     };
}

/** Samarkan nomor identitas untuk tampilan (sisakan 4 digit terakhir). */
export function maskId(value) {
     const s = String(value || '').replace(/\D/g, '');
     return s.length > 4 ? `${'•'.repeat(s.length - 4)}${s.slice(-4)}` : s;
}

/** Bentuk badan usaha dari isian eksplisit atau awalan nama. */
export function legalForm(borrower = {}) {
     const explicit = String(borrower.bentuk_usaha || '').toLowerCase();
     if (['pt', 'cv', 'ud', 'koperasi', 'perorangan'].includes(explicit)) return explicit;
     const name = String(borrower.nama || '').trim().toLowerCase();
     if (/^pt\b|\btbk\b/.test(name)) return 'pt';
     if (/^cv\b/.test(name)) return 'cv';
     if (/^koperasi\b|^kop\b/.test(name)) return 'koperasi';
     if (/^ud\b/.test(name)) return 'ud';
     return 'perorangan';
}

/** Jenis kredit dari isian eksplisit atau kata kunci tujuan kredit. */
export function facilityPurpose(borrower = {}) {
     const explicit = String(borrower.jenis_kredit || '').toLowerCase();
     if (['modal_kerja', 'investasi'].includes(explicit)) return explicit;
     const text = String(borrower.tujuan_kredit || '').toLowerCase();
     if (/investasi|mesin|pembangunan|bangun|renovasi|ekspansi|armada|kendaraan|peralatan|pabrik|gedung|tanah/.test(text)) return 'investasi';
     if (/modal kerja|bahan baku|persediaan|stok|piutang|operasional|pembelian barang|proyek berjalan/.test(text)) return 'modal_kerja';
     return 'tidak_diketahui';
}

/**
 * Borrowing base: (piutang eligible × advance rate) + (persediaan × advance rate).
 * Piutang related-party dikeluarkan; piutang > 90 hari dikeluarkan proporsional
 * terhadap rata-rata umur piutang bila hanya angka agregat yang tersedia.
 */
export function borrowingBase(keuangan = {}, config = DEFAULT_CONFIG) {
     const cfg = config.disbursement?.borrowingBase || DEFAULT_CONFIG.disbursement.borrowingBase;
     const piutang = num(keuangan.piutang);
     const persediaan = num(keuangan.persediaan);
     if (piutang <= 0 && persediaan <= 0) return null;
     const relatedParty = Math.min(piutang, num(keuangan.related_party_receivables));
     const aging = num(keuangan.aging_piutang_hari, null);
     const cutoff = num(cfg.arIneligibleOverDays, 90);
     // Tanpa rincian umur, porsi di atas batas diperkirakan dari rata-rata umur piutang.
     const overdueShare = aging !== null && aging > cutoff ? Math.min(1, (aging - cutoff) / aging) : 0;
     const eligibleAr = Math.max(0, (piutang - relatedParty) * (1 - overdueShare));
     const arBase = eligibleAr * num(cfg.arAdvanceRate, 0.75);
     const inventoryBase = persediaan * num(cfg.inventoryAdvanceRate, 0.5);
     return {
          piutang: Math.round(piutang),
          piutang_ineligible: Math.round(piutang - eligibleAr),
          piutang_eligible: Math.round(eligibleAr),
          persediaan: Math.round(persediaan),
          ar_advance_rate: num(cfg.arAdvanceRate, 0.75),
          inventory_advance_rate: num(cfg.inventoryAdvanceRate, 0.5),
          availability: Math.round(arBase + inventoryBase)
     };
}

/**
 * Daftar syarat penarikan untuk satu fasilitas.
 * @param {object} args — { borrower, decision, config }
 * @returns {Array<{code,label,description,mandatory,detail?}>}
 */
export function buildConditionsPrecedent({ borrower = {}, decision = null, config = DEFAULT_CONFIG } = {}) {
     const cfg = config.disbursement || DEFAULT_CONFIG.disbursement;
     const form = legalForm(borrower);
     const purpose = facilityPurpose(borrower);
     const ag = borrower.agunan || {};
     const jenis = ag.jenis && num(ag.nilai_agunan) > 0 && ag.ketersediaan !== 'tidak_ada' ? ag.jenis : null;
     const amount = num(borrower.plafon_diajukan);
     const list = [];
     const add = (code, label, description, mandatory = true, detail = null) => list.push({ code, label, description, mandatory, detail });

     add('PERJANJIAN_KREDIT', 'Perjanjian kredit ditandatangani',
          'Perjanjian kredit (PK) ditandatangani para pihak yang berwenang, memuat syarat penawaran yang diterima.');
     const approval = {
          pt: 'Persetujuan RUPS / Dewan Komisaris sesuai anggaran dasar, dan surat kuasa direksi penanda tangan.',
          cv: 'Persetujuan seluruh sekutu aktif sesuai akta pendirian CV.',
          koperasi: 'Keputusan rapat anggota / pengurus sesuai anggaran dasar koperasi.',
          ud: 'Persetujuan pasangan (suami/istri) pemilik usaha.',
          perorangan: 'Persetujuan pasangan (suami/istri) peminjam.'
     }[form];
     add('PERSETUJUAN_ORGAN', 'Persetujuan organ perusahaan', approval);
     add('LEGALITAS', 'Legalitas usaha & kepatuhan pajak',
          'NIB/izin usaha aktif, NPWP, KTP pengurus, dan bukti tidak ada tunggakan pajak. Izin lingkungan (AMDAL/UKL-UPL) bila diwajibkan.');
     add('SLIK', 'Pemeriksaan SLIK OJK terbaru',
          'Hasil SLIK maksimal 30 hari sebelum pencairan; tidak ada fasilitas lain berkolektibilitas buruk (satu debitur satu kolektibilitas).');

     if (jenis) {
          add('PENGIKATAN_AGUNAN', 'Pengikatan agunan sempurna', `${BINDING[jenis] || BINDING.lainnya}.`);
          if (INSURABLE.has(jenis)) {
               add('ASURANSI_AGUNAN', "Asuransi agunan dengan banker's clause",
                    "Polis asli menanggung 100% nilai agunan, banker's clause untuk lender, premi lunas.");
          }
     }

     if (purpose === 'investasi') {
          const share = num(cfg.minEquityShareInvestasi, 0.2);
          add('SETORAN_MODAL', 'Setoran modal sendiri',
               `Bukti dana sendiri minimal ${Math.round(share * 100)}% dari biaya proyek telah disetor sebelum kredit membiayai tagihan.`,
               true, { min_share: share });
     }
     if (purpose === 'modal_kerja' || purpose === 'tidak_diketahui') {
          const bb = borrowingBase(borrower.keuangan || {}, config);
          const short = bb && bb.availability < amount;
          add('BORROWING_BASE', 'Sertifikat borrowing base',
               bb
                    ? `Piutang eligible × ${Math.round(bb.ar_advance_rate * 100)}% + persediaan × ${Math.round(bb.inventory_advance_rate * 100)}% = batas tarik ${bb.availability.toLocaleString('id-ID')}${short ? ' — di bawah plafon; penarikan dibatasi sampai batas ini.' : '.'}`
                    : 'Laporan umur piutang dan stok terbaru untuk menghitung batas tarik.',
               purpose === 'modal_kerja', bb ? { ...bb, below_plafon: short } : null);
     }

     if (decision === 'LAYAK_BERSYARAT') {
          add('COVENANT', 'Covenant disetujui debitur',
               'Daftar covenant (rasio, pelaporan, larangan) ditandatangani sebagai bagian perjanjian kredit.');
     }
     add('REKENING_OPERASIONAL', 'Rekening operasional di lender',
          'Penerimaan usaha dialirkan ke rekening operasional/penampungan untuk memantau omzet dan menampung angsuran.', false);
     return list;
}

/**
 * Status pemenuhan syarat.
 * @param {Array} conditions — keluaran buildConditionsPrecedent
 * @param {object} fulfilled — { [code]: { done:boolean, at, by, note } }
 */
export function conditionsStatus(conditions = [], fulfilled = {}) {
     const items = conditions.map((c) => ({ ...c, done: !!fulfilled?.[c.code]?.done, record: fulfilled?.[c.code] || null }));
     const pendingMandatory = items.filter((c) => c.mandatory && !c.done);
     return {
          items,
          total: items.length,
          done: items.filter((c) => c.done).length,
          mandatory_pending: pendingMandatory.map((c) => c.code),
          ready: pendingMandatory.length === 0
     };
}

/**
 * Pesan penolakan pencairan, atau null bila boleh dicairkan: semua syarat wajib
 * terpenuhi dan, untuk kredit modal kerja, nominal tidak melebihi borrowing base.
 */
export function disbursementBlocker({ borrower = {}, decision = null, amount = null, config = DEFAULT_CONFIG } = {}) {
     const conditions = buildConditionsPrecedent({ borrower, decision, config });
     const status = conditionsStatus(conditions, borrower.conditions_precedent || {});
     if (!status.ready) {
          const labels = status.items.filter((c) => c.mandatory && !c.done).map((c) => c.label);
          return `Syarat penarikan belum terpenuhi: ${labels.join(', ')}.`;
     }
     const bb = conditions.find((c) => c.code === 'BORROWING_BASE' && c.mandatory)?.detail;
     if (bb && amount !== null && num(amount) > bb.availability) {
          return `Penarikan melebihi borrowing base ${bb.availability.toLocaleString('id-ID')}; turunkan nominal atau perbarui sertifikat borrowing base.`;
     }
     return null;
}

export default { identityErrors, maskId, legalForm, facilityPurpose, borrowingBase, buildConditionsPrecedent, conditionsStatus, disbursementBlocker };
