/**
 * simple/intake.js — Berkas & dokumen dari pemohon, versi sederhana dari
 * alur intake MEZS.id.
 *
 * - Laporan keuangan dikirim sebagai berkas (CSV, Excel, PDF berteks; foto/PDF
 *   scan lewat OCR di ui/ocr.js). Angkanya dibaca oleh core/attachments.js +
 *   core/statement-extract.js, bukan diketik ulang.
 * - Dokumen pendukung mengikuti katalog VERIFICATION_SOURCES; petugas
 *   memverifikasinya, lalu core/confidence.js menghitung keyakinan data.
 * - Gerbang keputusan (peringkat × keyakinan) dari core/application.js.
 */

import { inspectAttachment, FILE_ACCEPT, MAX_FILE_BYTES } from '../core/attachments.js';
import { VERIFICATION_SOURCES, REQUIRED_FINANCIAL_FIELDS, INTAKE_CONFIG } from '../core/intake-config.js';
import { computeConfidence } from '../core/confidence.js';
import { checkStatementIntegrity } from '../core/statement-integrity.js';
import { gateDecision } from '../core/application.js';
import { FINANCE_FIELDS } from './form-schema.js';

export { FILE_ACCEPT, MAX_FILE_BYTES, REQUIRED_FINANCIAL_FIELDS };

export const CONSENT_CLAUSE = INTAKE_CONFIG.consent.clause;

const DOC_PLAIN = {
     identitas: 'KTP / NPWP pemilik',
     legalitas: 'Akta pendirian / NIB usaha',
     rekening_koran: 'Rekening koran 6–12 bulan terakhir',
     laporan_keuangan: 'Laporan keuangan',
     faktur_pajak: 'SPT / faktur pajak',
     laporan_audited: 'Laporan keuangan diaudit',
     slik_ojk: 'Hasil SLIK OJK (riwayat kredit)',
     agunan: 'Bukti kepemilikan jaminan'
};

/** Dokumen pendukung (tanpa laporan keuangan, yang diunggah di langkahnya sendiri). */
export const DOCUMENTS = VERIFICATION_SOURCES.map((s) => ({ key: s.key, label: DOC_PLAIN[s.key] || s.label, mandatory: !!s.mandatory, weight: s.weight }));
export const SUPPORTING_DOCUMENTS = DOCUMENTS.filter((d) => d.key !== 'laporan_keuangan');

const EXTRA_LABELS = {
     hpp: 'Harga pokok penjualan',
     beban_bunga_lain: 'Bunga utang lain',
     depresiasi: 'Penyusutan',
     amortisasi: 'Amortisasi'
};

export function financeLabel(key) {
     return FINANCE_FIELDS.find((f) => f.key === key)?.label || EXTRA_LABELS[key] || key;
}

/* ------------------------------------------------------- baca berkas ---- */

/**
 * Baca satu berkas. Untuk laporan keuangan, hasilnya berisi kandidat angka
 * per periode. Berkasnya sendiri tidak disimpan — hanya nama, ukuran, sidik
 * jari (SHA-256), dan angka yang terbaca.
 */
export async function readDocument(bytes, filename, key, { now = new Date() } = {}) {
     const info = await inspectAttachment(bytes, filename, key);
     return {
          key,
          filename: info.filename,
          size: info.byte_size,
          type: info.mime_type,
          sha256: info.sha256,
          uploaded_at: now.toISOString(),
          verified: false,
          extraction: key === 'laporan_keuangan' || key === 'laporan_audited' ? info.extraction : null
     };
}

/** Kandidat yang dipakai: satu-satunya, atau tahun terbaru bila tahunnya jelas. */
export function pickCandidate(candidates = []) {
     if (candidates.length === 1) return 0;
     const years = candidates.map((c) => c.period);
     if (!candidates.length || years.some((y) => !Number.isInteger(y)) || new Set(years).size !== years.length) return null;
     return years.indexOf(Math.max(...years));
}

/** Ringkasan angka satu kandidat untuk ditampilkan sebelum dipakai. */
export function candidateView(candidate) {
     const k = candidate?.keuangan || {};
     const rows = Object.entries(k)
          .filter(([, v]) => Number.isFinite(v))
          .map(([key, value]) => ({ key, label: financeLabel(key), value, required: REQUIRED_FINANCIAL_FIELDS.includes(key) }))
          .sort((a, b) => Number(b.required) - Number(a.required));
     const missing = REQUIRED_FINANCIAL_FIELDS.filter((key) => !Number.isFinite(k[key])).map(financeLabel);
     return { label: candidate?.label || 'Laporan', rows, missing, warnings: candidate?.warnings || [] };
}

/** Pakai angka laporan: mengisi keuangan borrower + catat sumbernya. */
export function applyCandidate(borrower, doc, index) {
     const candidate = doc?.extraction?.candidates?.[index];
     if (!candidate) throw new Error('Pilihan laporan tidak tersedia.');
     const entries = Object.entries(candidate.keuangan || {}).filter(([, v]) => Number.isFinite(v));
     // Angka dari berkas/periode sebelumnya dibersihkan dulu agar tidak tercampur dengan laporan baru.
     const keuangan = { ...(borrower.keuangan || {}) };
     for (const key of borrower.financial_import?.fields || []) keuangan[key] = null;
     return {
          ...borrower,
          keuangan: { ...keuangan, ...Object.fromEntries(entries) },
          financial_import: { sha256: doc.sha256, filename: doc.filename, label: candidate.label, candidate_index: index, fields: entries.map(([key]) => key) }
     };
}

/** Kelengkapan & konsistensi angka keuangan, dalam bahasa awam. */
export function financeStatus(keuangan = {}) {
     const missing = REQUIRED_FINANCIAL_FIELDS.filter((key) => !Number.isFinite(keuangan[key]));
     const integrity = checkStatementIntegrity(keuangan);
     const plain = {
          ok: 'Angka konsisten: total harta sama dengan utang ditambah modal.',
          warning: 'Ada angka yang perlu dicek ulang.',
          invalid: 'Neraca tidak seimbang: total harta tidak sama dengan utang ditambah modal.',
          insufficient: 'Angka neraca belum lengkap.'
     }[integrity.status] || integrity.summary;
     return {
          filled: REQUIRED_FINANCIAL_FIELDS.length - missing.length,
          total: REQUIRED_FINANCIAL_FIELDS.length,
          missing: missing.map(financeLabel),
          complete: missing.length === 0,
          integrity: integrity.status,
          integritySentence: plain
     };
}

/* ------------------------------------------------ keyakinan & gerbang --- */

const CONF_PLAIN = { LOW: 'Rendah', MEDIUM: 'Sedang', HIGH: 'Tinggi' };
const CONF_TONE = { LOW: 'merah', MEDIUM: 'kuning', HIGH: 'hijau' };

/** Keyakinan data dari dokumen terverifikasi petugas + kelengkapan laporan. */
export function confidenceView(record) {
     const docs = record.documents || [];
     const c = computeConfidence({
          verified: docs.filter((d) => d.verified).map((d) => d.key),
          declared: docs.map((d) => d.key),
          financials: record.borrower?.keuangan || {}
     });
     const pendingMandatory = DOCUMENTS.filter((d) => d.mandatory && !docs.some((x) => x.key === d.key && x.verified));
     return {
          level: c.level,
          label: CONF_PLAIN[c.level],
          tone: CONF_TONE[c.level],
          score: c.score,
          sentence: pendingMandatory.length
               ? `Keyakinan data ${CONF_PLAIN[c.level].toLowerCase()}: ${pendingMandatory.length} dokumen wajib belum diverifikasi (${pendingMandatory.map((d) => d.label).join(', ')}).`
               : `Keyakinan data ${CONF_PLAIN[c.level].toLowerCase()}: ${c.verified_count} dokumen terverifikasi, angka keuangan ${Math.round(c.completeness * 100)}% lengkap.`,
          raw: c
     };
}

/** Gerbang: peringkat minimal idBBB- dan keyakinan data minimal Sedang. */
export function gateView(result, confidence) {
     const g = gateDecision({ gradeIndex: result?.risk?.pefindo?.index ?? null, confidenceLevel: confidence?.level });
     const reasons = [];
     if (!g.grade_ok) reasons.push('peringkat di bawah batas layak investasi (idBBB-)');
     if (!g.confidence_ok) reasons.push('keyakinan data belum minimal sedang');
     return {
          pass: g.pass,
          autoReject: g.auto_reject,
          sentence: g.pass
               ? 'Lolos gerbang: peringkat dan keyakinan data cukup untuk diberi penawaran.'
               : g.auto_reject
                    ? 'Peringkat terendah (idD): sebaiknya ditolak.'
                    : `Perlu keputusan manual: ${reasons.join(' dan ')}.`,
          raw: g
     };
}
