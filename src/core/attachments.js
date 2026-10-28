import { REQUIRED_FINANCIAL_FIELDS } from './intake-config.js';
import { readXlsx } from './xlsx.js';
import { parseIdxRatioTemplate } from './excel-import.js';
import { extractStatement } from './statement-extract.js';
import { readPdfText } from './pdf-text.js';

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const FINANCIAL_EXTRACTION_VERSION = 3;
export const FILE_ACCEPT = '.pdf,.png,.jpg,.jpeg,.xlsx,.csv';
export const FINANCIAL_FILE_FIELDS = [...REQUIRED_FINANCIAL_FIELDS, 'kas', 'piutang', 'persediaan', 'hpp', 'beban_bunga', 'beban_bunga_lain', 'depresiasi', 'amortisasi'];
const TYPES = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', csv: 'text/csv' };

export function financialCsvTemplate() {
     return 'field,value\n' + REQUIRED_FINANCIAL_FIELDS.map(key => `${key},`).join('\n') + '\n';
}

/** Deliberately narrow template: one period, Rupiah units, no thousands separators. */
export function parseFinancialCsv(text) {
     const lines = String(text).replace(/^\uFEFF/, '').trim().split(/\r?\n/);
     const separator = lines[0]?.includes(';') ? ';' : ',';
     if (lines[0]?.trim().toLowerCase() !== `field${separator}value`) throw new Error('Gunakan template CSV field,value. Angka Rupiah tanpa pemisah ribuan.');
     const fields = {};
     const seen = new Set();
     for (const [i, line] of lines.slice(1).entries()) {
          if (!line.trim()) continue;
          const parts = line.split(separator).map(v => v.trim());
          const [key, raw] = parts;
          if (parts.length !== 2 || !FINANCIAL_FILE_FIELDS.includes(key)) throw new Error(`Baris ${i + 2}: field atau format tidak dikenali.`);
          if (seen.has(key)) throw new Error(`Field ${key} muncul lebih dari sekali.`);
          seen.add(key);
          if (raw === '') continue;
          if (!/^-?\d+(\.\d+)?$/.test(raw) || !Number.isFinite(Number(raw)) || Math.abs(Number(raw)) > Number.MAX_SAFE_INTEGER) throw new Error(`Baris ${i + 2}: isi angka Rupiah tanpa pemisah ribuan (contoh 100000000).`);
          fields[key] = Number(raw);
     }
     if (!Object.keys(fields).length) throw new Error('CSV belum berisi angka keuangan.');
     return { label: 'Satu periode laporan · Rupiah', keuangan: fields, warnings: [] };
}

/** CSV bebas (ekspor aplikasi akuntansi/Excel): pemisah ; , atau tab, sel boleh dikutip. */
function csvRows(text) {
     const src = String(text).replace(/^\uFEFF/, '');
     const counts = { ',': 0, ';': 0, '\t': 0 };
     let quoted = false;
     for (let i = 0; i < Math.min(src.length, 10000); i++) {
          if (src[i] === '"') { if (quoted && src[i + 1] === '"') i++; else quoted = !quoted; }
          else if (!quoted && src[i] in counts) counts[src[i]]++;
     }
     const separator = Object.keys(counts).sort((a,b) => counts[b] - counts[a])[0];
     const rows = []; let row = [], cell = ''; quoted = false;
     for (let i = 0; i < src.length; i++) {
          const c = src[i];
          if (quoted) { if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c; }
          else if (c === '"') quoted = true;
          else if (c === separator) { row.push(cell.trim()); cell = ''; }
          else if (c === '\n' || c === '\r') {
               if (c === '\r' && src[i + 1] === '\n') i++;
               row.push(cell.trim()); rows.push(row); row = []; cell = '';
               if (rows.length > 5000) throw new Error('Laporan melebihi 5.000 baris. Unggah laporan ringkas.');
          } else cell += c;
     }
     if (quoted) throw new Error('Tanda kutip CSV belum ditutup. Ekspor ulang berkas CSV.');
     if (cell || row.length) { row.push(cell.trim()); rows.push(row); }
     return rows;
}

const keepFinancial = (candidates) => candidates.map((c) => ({ ...c, keuangan: Object.fromEntries(Object.entries(c.keuangan).filter(([k, v]) => FINANCIAL_FILE_FIELDS.includes(k) && Number.isFinite(v))) }))
     .filter((c) => Object.keys(c.keuangan).length);

/** Laporan format bebas: cari pos laporan (Penjualan, Jumlah aset, …) di setiap baris. */
async function freeformCandidates(ext, { bytes, workbook, csvText }) {
     if (ext === 'pdf') {
          const pdf = await readPdfText(bytes);
          const manual = (message) => Object.assign(new Error(message), { manual: true });
          if (pdf.encrypted) throw manual('PDF terkunci kata sandi sehingga angka tidak dapat dibaca. Unggah PDF tanpa kata sandi atau isi angka secara manual.');
          if (!pdf.lines.length) throw manual('PDF ini hasil scan (tanpa lapisan teks); angka dibaca dengan OCR di browser dan selalu ditinjau sebelum dipakai.');
          return extractStatement(pdf.lines, { text: true, source: 'PDF' }).candidates;
     }
     if (ext === 'xlsx') return extractStatement(workbook.sheets.flatMap((sheet) => [...sheet.rows, []]), { source: 'Excel' }).candidates;
     return extractStatement(csvRows(csvText), { source: 'CSV' }).candidates;
}

export async function inspectAttachment(input, filename, sourceKey) {
     const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
     if (!bytes.length || bytes.length > MAX_FILE_BYTES) throw new Error('Ukuran berkas harus lebih dari 0 dan maksimal 5 MB.');
     const name = String(filename || '').split(/[\\/]/).pop().replace(/[\x00-\x1f\x7f]/g, '').trim();
     if (!name || name.length > 180) throw new Error('Nama berkas wajib diisi, maksimal 180 karakter.');
     const ext = name.split('.').pop().toLowerCase();
     const mime = TYPES[ext];
     if (!mime) throw new Error('Format yang didukung: PDF, PNG, JPG, XLSX, atau CSV.');
     const starts = signature => signature.every((b, i) => bytes[i] === b);
     if (ext === 'pdf' && !starts([37, 80, 68, 70, 45]) || ext === 'png' && !starts([137, 80, 78, 71, 13, 10, 26, 10]) || ['jpg', 'jpeg'].includes(ext) && !starts([255, 216, 255]) || ext === 'xlsx' && !starts([80, 75, 3, 4])) throw new Error('Isi berkas tidak sesuai dengan format namanya.');
     const financial = ['laporan_keuangan', 'laporan_audited'].includes(sourceKey);
     let extraction = { status: 'manual', message: 'Berkas siap ditinjau lender. Pembacaan angka otomatis belum tersedia untuk format ini.', candidates: [] };
     let workbook;
     if (ext === 'xlsx') {
          workbook = await readXlsx(bytes);
          if (!workbook.sheets.length) throw new Error('Workbook XLSX tidak memiliki lembar yang dapat dibaca.');
     }
     let csvText;
     if (ext === 'csv') {
          try { csvText = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
          catch { throw new Error('CSV harus memakai encoding UTF-8.'); }
          if (csvText.includes('\0')) throw new Error('Isi CSV tidak valid.');
     }
     if (financial && ['png', 'jpg', 'jpeg'].includes(ext)) {
          extraction = { status: 'manual', message: 'Foto laporan dibaca dengan OCR di browser. Hasil OCR selalu ditinjau sebelum dipakai.', candidates: [] };
     }
     if (financial && ['csv', 'xlsx', 'pdf'].includes(ext)) {
          try {
               let candidates = [];
               const template = ext === 'csv' && /^field[,;]value$/i.test(csvText.replace(/^\uFEFF/, '').trim().split(/\r?\n/)[0]?.trim() || '');
               if (template) {
                    // Template berisi angka bertitik ribuan dsb.: coba pembaca bebas sebelum menolak.
                    try { candidates = [parseFinancialCsv(csvText)]; }
                    catch (err) {
                         // Alternate number formatting is supported; malformed schemas/duplicates are not.
                         if (!/^Baris \d+: isi angka Rupiah/.test(err.message)) throw err;
                         candidates = keepFinancial(await freeformCandidates(ext, { csvText })); if (!candidates.length) throw err;
                    }
               }
               else if (ext === 'xlsx') {
                    try {
                         candidates = keepFinancial(parseIdxRatioTemplate(workbook, { rows: Array.from({ length: 50 }, (_, i) => i) }).rows
                              .filter(r => Object.values(r.keuangan).some(Number.isFinite))
                              .map(r => ({ label: r.label, keuangan: r.keuangan, warnings: r.warnings || [] })));
                    } catch { candidates = []; }
               }
               if (!candidates.length && !template) candidates = keepFinancial(await freeformCandidates(ext, { bytes, workbook, csvText }));
               if (!candidates.length) throw new Error('Pos laporan keuangan (mis. Penjualan, Jumlah aset, Jumlah ekuitas) belum ditemukan di berkas ini. Isi angka secara manual atau gunakan template CSV.');
               extraction = { status: 'ready', message: 'Tinjau usaha, periode, satuan Rupiah, dan angka sebelum menerapkan.', candidates };
          } catch (err) { extraction = { status: err.manual ? 'manual' : 'unrecognized', message: err.message, candidates: [] }; }
     }
     if (financial) extraction.version = FINANCIAL_EXTRACTION_VERSION;
     const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
     return { filename: name, has_file: true, byte_size: bytes.length, mime_type: mime, sha256: Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join(''), extraction };
}

export function bytesToBase64(bytes) {
     let binary = '';
     for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
     return btoa(binary);
}
export function base64ToBytes(base64) { return Uint8Array.from(atob(base64), c => c.charCodeAt(0)); }
