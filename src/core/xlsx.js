/**
 * core/xlsx.js — Pembaca berkas Excel (.xlsx) tanpa dependensi.
 *
 * XLSX adalah arsip ZIP (Open Packaging Convention). Modul ini:
 *   1) membaca direktori pusat ZIP (EOCD → central directory → local header),
 *   2) meng-inflate entri DEFLATE via DecompressionStream('deflate-raw'),
 *   3) mem-parse xl/workbook.xml, xl/_rels/workbook.xml.rels, xl/sharedStrings.xml,
 *      dan setiap xl/worksheets/sheetN.xml menjadi baris × kolom nilai primitif.
 *
 * Tanpa DOM, tanpa zlib, tanpa dependensi npm → aman di browser maupun Node ≥ 18.
 * Modul ini murni: tidak boleh mengimpor lapisan ui/*.
 */

const EOCD_SIG = 0x06054b50;
const CDH_SIG = 0x02014b50;
const LFH_SIG = 0x04034b50;
const EOCD_MIN = 22;
const EOCD_MAX_SCAN = 22 + 65535;
const MAX_EXPANDED_BYTES = 25 * 1024 * 1024;

/** Normalisasi input menjadi Uint8Array tanpa menyalin bila memungkinkan. */
function toBytes(input) {
     if (input instanceof Uint8Array) return input;
     if (input instanceof ArrayBuffer) return new Uint8Array(input);
     if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
     throw new Error('Input harus ArrayBuffer atau Uint8Array.');
}

function decodeUtf8(bytes, offset, length) {
     return new TextDecoder('utf-8').decode(bytes.subarray(offset, offset + length));
}

/** Cari posisi End Of Central Directory (dipindai dari ekor berkas). */
function findEocd(dv, total) {
     if (total < EOCD_MIN) return -1;
     const from = Math.max(0, total - EOCD_MAX_SCAN);
     for (let i = total - EOCD_MIN; i >= from; i--) {
          if (dv.getUint32(i, true) === EOCD_SIG) return i;
     }
     return -1;
}

/** Inflate DEFLATE mentah (metode 8) melalui DecompressionStream. */
async function inflateRaw(bytes, limit) {
     if (typeof DecompressionStream === 'undefined') {
          throw new Error('DecompressionStream tidak tersedia; impor .xlsx tidak didukung di lingkungan ini.');
     }
     const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
     const reader = stream.getReader();
     const chunks = [];
     let size = 0;
     try {
          while (true) {
               const { done, value } = await reader.read();
               if (done) break;
               size += value.length;
               if (size > limit) { await reader.cancel(); throw new Error('Isi XLSX terlalu besar setelah dekompresi (maksimal 25 MB).'); }
               chunks.push(value);
          }
     } finally { reader.releaseLock(); }
     const output = new Uint8Array(size);
     let offset = 0;
     for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
     return output;
}

/** Ambil isi satu entri ZIP (mendukung STORED=0 dan DEFLATE=8). */
async function extractEntry(bytes, dv, localOffset, method, compressedSize, limit) {
     if (localOffset + 30 > bytes.length || dv.getUint32(localOffset, true) !== LFH_SIG) {
          throw new Error('Header lokal ZIP tidak valid.');
     }
     const nameLen = dv.getUint16(localOffset + 26, true);
     const extraLen = dv.getUint16(localOffset + 28, true);
     const start = localOffset + 30 + nameLen + extraLen;
     if (start + compressedSize > bytes.length) throw new Error('Isi ZIP terpotong.');
     const raw = bytes.subarray(start, start + compressedSize);
     if (method === 0) {
          if (raw.length > limit) throw new Error('Isi XLSX terlalu besar setelah dekompresi (maksimal 25 MB).');
          return raw.slice();
     }
     if (method === 8) return await inflateRaw(raw, limit);
     throw new Error(`Metode kompresi ZIP ${method} tidak didukung.`);
}

/**
 * Buka arsip ZIP menjadi Map<nama_entri, Uint8Array>.
 * @param {ArrayBuffer|Uint8Array} input
 * @returns {Promise<Map<string, Uint8Array>>}
 */
export async function unzip(input) {
     const bytes = toBytes(input);
     const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
     const eocd = findEocd(dv, bytes.byteLength);
     if (eocd < 0) throw new Error('Berkas bukan ZIP/XLSX yang valid (EOCD tidak ditemukan).');
     const count = dv.getUint16(eocd + 10, true);
     if (count > 512) throw new Error('XLSX memiliki terlalu banyak entri (maksimal 512).');
     const cdOffset = dv.getUint32(eocd + 16, true);
     const files = new Map();
     let p = cdOffset;
     let expanded = 0;
     for (let i = 0; i < count; i++) {
          if (p + 46 > bytes.byteLength || dv.getUint32(p, true) !== CDH_SIG) throw new Error('Direktori ZIP terpotong.');
          if (dv.getUint16(p + 8, true) & 1) throw new Error('XLSX terenkripsi tidak didukung.');
          const method = dv.getUint16(p + 10, true);
          const compressedSize = dv.getUint32(p + 20, true);
          const declaredSize = dv.getUint32(p + 24, true);
          if (declaredSize > MAX_EXPANDED_BYTES - expanded) throw new Error('Isi XLSX terlalu besar setelah dekompresi (maksimal 25 MB).');
          const nameLen = dv.getUint16(p + 28, true);
          const extraLen = dv.getUint16(p + 30, true);
          const commentLen = dv.getUint16(p + 32, true);
          const localOffset = dv.getUint32(p + 42, true);
          const name = decodeUtf8(bytes, p + 46, nameLen);
          p += 46 + nameLen + extraLen + commentLen;
          if (name.endsWith('/')) continue; // entri direktori
          if (files.has(name)) throw new Error('Nama entri ZIP duplikat.');
          const data = await extractEntry(bytes, dv, localOffset, method, compressedSize, MAX_EXPANDED_BYTES - expanded);
          if (data.length !== declaredSize) throw new Error('Ukuran isi ZIP tidak cocok.');
          expanded += data.length;
          files.set(name, data);
     }
     return files;
}

// ——————————————————— XML util (regex-scan khusus struktur OOXML) ———————————————————

function parseAttrs(src) {
     const out = {};
     const re = /([\w:.-]+)\s*=\s*"([^"]*)"/g;
     let m;
     while ((m = re.exec(src))) out[m[1]] = m[2];
     return out;
}

function unescapeXml(s) {
     return String(s)
          .replace(/</g, '<')
          .replace(/>/g, '>')
          .replace(/"/g, '"')
          .replace(/'/g, "'")
          .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
          .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
          .replace(/&/g, '&');
}

function decodeXml(bytes) {
     if (bytes === undefined || bytes === null) return '';
     let s = typeof bytes === 'string' ? bytes : decodeUtf8(bytes, 0, bytes.length);
     if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
     return s;
}

/** Kumpulkan teks dari satu atau banyak <t> (menangani rich text <r>). */
function collectText(inner) {
     let s = '';
     const re = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
     let m;
     while ((m = re.exec(inner))) s += unescapeXml(m[1]);
     return s;
}

function parseSharedStrings(bytes) {
     const xml = decodeXml(bytes);
     if (!xml) return [];
     const out = [];
     const re = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
     let m;
     while ((m = re.exec(xml))) out.push(collectText(m[1]));
     return out;
}

/** Kolom Excel (A, B, ..., AA) menjadi indeks 0-based. */
function colIndex(letters) {
     let n = 0;
     for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
     return n - 1;
}

function cellValue(body, type, shared) {
     if (type === 'inlineStr') return collectText(body) || null;
     const vm = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body);
     const raw = vm ? unescapeXml(vm[1]) : '';
     if (raw === '') return null;
     if (type === 's') {
          const idx = Number(raw);
          return Number.isInteger(idx) && idx >= 0 && idx < shared.length ? shared[idx] : null;
     }
     if (type === 'b') return raw === '1' || raw.toLowerCase() === 'true';
     if (type === 'str') return raw;
     if (type === 'e') return null;
     const n = Number(raw);
     return Number.isFinite(n) ? n : raw;
}

function parseRowCells(inner, shared) {
     const cells = [];
     const re = /<c\b([^>]*?)(\/>|>([\s\S]*?)<\/c>)/g;
     let m;
     let auto = 0;
     while ((m = re.exec(inner))) {
          const attrs = parseAttrs(m[1]);
          const body = m[3] || '';
          const ref = attrs.r ? /^([A-Z]+)\d+$/.exec(attrs.r) : null;
          const col = ref ? colIndex(ref[1]) : auto;
          if (col > 16383 || !Number.isSafeInteger(col)) throw new Error('Indeks kolom XLSX tidak valid.');
          auto = col + 1;
          const value = cellValue(body, attrs.t || 'n', shared);
          while (cells.length < col) cells.push(null);
          cells[col] = value;
     }
     return cells;
}

function parseSheet(bytes, shared, budget) {
     const xml = decodeXml(bytes);
     const rows = [];
     if (!xml) return rows;
     const re = /<row\b([^>]*?)(\/>|>([\s\S]*?)<\/row>)/g;
     let m;
     while ((m = re.exec(xml))) {
          const attrs = parseAttrs(m[1]);
          const inner = m[3] || '';
          const rowIdx = attrs.r ? Number(attrs.r) - 1 : rows.length;
          if (!Number.isSafeInteger(rowIdx) || rowIdx < 0 || rowIdx > 50000) throw new Error('XLSX dibatasi hingga 50.000 baris per lembar.');
          budget.rows += Math.max(1, rowIdx + 1 - rows.length);
          if (budget.rows > 100000) throw new Error('Jumlah baris workbook terlalu besar.');
          while (rows.length < rowIdx) rows.push([]);
          const cells = parseRowCells(inner, shared);
          budget.cells += cells.length;
          if (budget.cells > 1000000) throw new Error('Workbook dibatasi hingga 1 juta sel termasuk kolom kosong.');
          rows[rowIdx] = cells;
     }
     return rows;
}

function parseRels(bytes) {
     const map = new Map();
     const xml = decodeXml(bytes);
     if (!xml) return map;
     const re = /<Relationship\b([^>]*?)\/?>/g;
     let m;
     while ((m = re.exec(xml))) {
          const a = parseAttrs(m[1]);
          if (a.Id && a.Target) map.set(a.Id, a.Target);
     }
     return map;
}

function normalizeTarget(target) {
     if (!target) return null;
     const t = String(target).replace(/\\/g, '/');
     if (t.startsWith('/')) return t.slice(1);
     if (t.startsWith('xl/')) return t;
     return 'xl/' + t;
}

function parseWorkbook(xmlBytes, relBytes) {
     const xml = decodeXml(xmlBytes);
     const rels = parseRels(relBytes);
     const list = [];
     const re = /<sheet\b([^>]*?)\/?>/g;
     let m;
     while ((m = re.exec(xml))) {
          const a = parseAttrs(m[1]);
          list.push({
               name: a.name ? unescapeXml(a.name) : '',
               path: normalizeTarget(a['r:id'] ? rels.get(a['r:id']) : null)
          });
     }
     return list;
}

function sheetOrder(path) {
     const m = /sheet(\d+)\.xml$/.exec(path);
     return m ? Number(m[1]) : 0;
}

/**
 * Baca berkas .xlsx menjadi struktur lembar kerja.
 * @param {ArrayBuffer|Uint8Array} input
 * @param {{ sheets?: string[] }} [options] — daftar nama lembar yang diinginkan.
 * @returns {Promise<{ sheets: Array<{ name: string, rows: Array<Array<any>> }> }>}
 */
export async function readXlsx(input, { sheets = null } = {}) {
     const files = await unzip(input);
     const shared = parseSharedStrings(files.get('xl/sharedStrings.xml'));
     let list = parseWorkbook(files.get('xl/workbook.xml'), files.get('xl/_rels/workbook.xml.rels'));

     list = list.filter((s) => s.path && files.has(s.path));
     if (!list.length) {
          list = [...files.keys()]
               .filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k))
               .sort((a, b) => sheetOrder(a) - sheetOrder(b))
               .map((p) => ({ name: p.replace(/^xl\/worksheets\//, '').replace(/\.xml$/, ''), path: p }));
     }

     const want = sheets ? new Set(sheets) : null;
     const out = [];
     const budget = { rows: 0, cells: 0 };
     for (const s of list) {
          if (want && !want.has(s.name)) continue;
          out.push({ name: s.name, rows: parseSheet(files.get(s.path), shared, budget) });
     }
     return { sheets: out };
}

export default { unzip, readXlsx };
