/**
 * core/ocr-text.js — Membersihkan teks hasil OCR sebelum dibaca sebagai laporan.
 * Murni (tanpa DOM); proses OCR-nya sendiri ada di ui/ocr.js.
 */
import { extractStatement } from './statement-extract.js';

export const OCR_WARNING = 'Angka dibaca dengan OCR dari gambar. Cocokkan setiap angka dengan dokumen asli sebelum memakainya.';

const NUMERIC = /^[(\-–]?(?:rp\.?)?[\dOoIl|SB.,]+[)]?$/i;

/** "1.25O.OOO" → "1.250.000", "1.250. 000" → "1.250.000"; huruf di tengah kata tidak diubah. */
export function normalizeOcrLine(line) {
     const joined = String(line).replace(/(\d)([.,])\s+(?=\d{3}\b)/g, '$1$2').replace(/\s+/g, ' ').trim();
     return joined.split(' ').map((token) => {
          if (!NUMERIC.test(token) || !/\d/.test(token)) return token;
          const fixed = token.replace(/[Oo]/g, '0').replace(/[Il|]/g, '1').replace(/S/g, '5').replace(/B/g, '8');
          // Hanya bila hasilnya angka Rupiah yang wajar (kelompok ribuan, atau angka pendek dengan ≤1 huruf).
          if (/^[(\-–]?(?:rp\.?)?\d{1,3}(?:[.,]\d{3})+(?:,\d{1,2})?\)?$/i.test(fixed)) return fixed;
          if (/^\d+$/.test(fixed) && token.replace(/\d/g, '').length <= 1) return fixed;
          return token;
     }).join(' ');
}

/** Teks OCR (satu atau beberapa halaman) → kandidat laporan yang selalu meminta tinjauan. */
export function ocrCandidates(text) {
     const lines = String(text || '').split(/\r?\n/).map(normalizeOcrLine).filter(Boolean);
     const { candidates } = extractStatement(lines, { text: true, source: 'OCR' });
     return candidates.map((c) => ({ ...c, warnings: [OCR_WARNING, ...c.warnings] }));
}
