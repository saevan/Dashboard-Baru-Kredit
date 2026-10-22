/**
 * core/pdf-text.js — Pembaca lapisan teks PDF tanpa dependensi.
 *
 * Cukup untuk laporan yang diekspor dari Excel/Word/aplikasi akuntansi:
 * stream FlateDecode, object stream (PDF 1.5+), font sederhana dan Type0 dengan
 * ToUnicode, serta Form XObject. Teks dikelompokkan per baris menurut posisi Y.
 * PDF hasil scan/foto tidak memiliki lapisan teks dan mengembalikan baris kosong.
 * Modul ini murni: berjalan di browser maupun Node ≥ 18.
 */

const MAX_EXPANDED = 25 * 1024 * 1024;
const MAX_PAGES = 60;

const latin1 = (bytes) => new TextDecoder('latin1').decode(bytes);

async function inflate(bytes, budget) {
     if (typeof DecompressionStream === 'undefined') throw new Error('DecompressionStream tidak tersedia.');
     const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
     const chunks = []; let size = 0;
     try {
          while (true) {
               const { done, value } = await reader.read();
               if (done) break;
               size += value.length; budget.used += value.length;
               if (budget.used > MAX_EXPANDED) { await reader.cancel().catch(() => {}); throw new Error('Isi PDF terlalu besar setelah dekompresi.'); }
               chunks.push(value);
          }
     } catch (err) {
          // Banyak generator menulis sampah setelah akhir zlib; pakai isi yang sudah terbaca.
          if (/terlalu besar/.test(err.message) || !chunks.length) throw err;
     }
     const out = new Uint8Array(size); let offset = 0;
     for (const c of chunks) { out.set(c, offset); offset += c.length; }
     return out;
}

function ascii85(bytes) {
     const text = latin1(bytes).replace(/\s+/g, '').replace(/^<~/, '').replace(/~>.*$/, '');
     const out = []; let group = [];
     const flush = (n) => {
          let v = 0; for (let k = 0; k < 5; k++) v = v * 85 + (group[k] ?? 84);
          for (let k = 0; k < n; k++) out.push((v >>> (24 - 8 * k)) & 255);
          group = [];
     };
     for (const ch of text) {
          if (ch === 'z' && !group.length) { out.push(0, 0, 0, 0); continue; }
          const c = ch.charCodeAt(0) - 33;
          if (c < 0 || c > 84) throw new Error('Data ASCII85 PDF tidak valid.');
          group.push(c); if (group.length === 5) flush(4);
     }
     if (group.length) flush(group.length - 1);
     return new Uint8Array(out);
}

// ——— Parser objek PDF ———
const WS = /[\s\0]/;
const DELIM = /[()<>[\]{}/%]/;

class Lexer {
     constructor(text, pos = 0) { this.s = text; this.i = pos; }
     skip() {
          const s = this.s;
          while (this.i < s.length) {
               if (WS.test(s[this.i])) this.i++;
               else if (s[this.i] === '%') { while (this.i < s.length && s[this.i] !== '\n' && s[this.i] !== '\r') this.i++; }
               else break;
          }
     }
     /** Satu token mentah: {t:'num'|'name'|'str'|'hex'|'op'|'['|']'|'<<'|'>>', v} atau null. */
     next() {
          this.skip();
          const s = this.s; if (this.i >= s.length) return null;
          const c = s[this.i];
          if (c === '[' || c === ']' || c === '{' || c === '}') { this.i++; return { t: c }; }
          if (c === '<' && s[this.i + 1] === '<') { this.i += 2; return { t: '<<' }; }
          if (c === '>' && s[this.i + 1] === '>') { this.i += 2; return { t: '>>' }; }
          if (c === '<') {
               const end = s.indexOf('>', this.i); const hex = s.slice(this.i + 1, end < 0 ? s.length : end).replace(/[^0-9a-f]/gi, '');
               this.i = end < 0 ? s.length : end + 1;
               return { t: 'hex', v: hex.length % 2 ? hex + '0' : hex };
          }
          if (c === '(') return { t: 'str', v: this.literal() };
          if (c === '/') {
               let j = this.i + 1; while (j < s.length && !WS.test(s[j]) && !DELIM.test(s[j])) j++;
               const v = s.slice(this.i + 1, j).replace(/#([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
               this.i = j; return { t: 'name', v };
          }
          let j = this.i; while (j < s.length && !WS.test(s[j]) && !DELIM.test(s[j])) j++;
          if (j === this.i) { this.i++; return { t: 'op', v: c }; }
          const word = s.slice(this.i, j); this.i = j;
          return /^[+-]?(\d+\.?\d*|\.\d+)$/.test(word) ? { t: 'num', v: Number(word) } : { t: 'op', v: word };
     }
     literal() {
          const s = this.s; let depth = 0, out = '';
          this.i++;
          while (this.i < s.length) {
               const c = s[this.i++];
               if (c === '\\') {
                    const n = s[this.i++];
                    const map = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' };
                    if (n in map) out += map[n];
                    else if (/[0-7]/.test(n)) {
                         let oct = n; while (oct.length < 3 && /[0-7]/.test(s[this.i])) oct += s[this.i++];
                         out += String.fromCharCode(parseInt(oct, 8) & 255);
                    } else if (n === '\r') { if (s[this.i] === '\n') this.i++; }
                    else if (n !== '\n') out += n;
               } else if (c === '(') { depth++; out += c; }
               else if (c === ')') { if (depth === 0) break; depth--; out += c; }
               else out += c;
          }
          return out;
     }
}

/** Nilai objek PDF; referensi "n g R" menjadi {ref:n}. */
function parseValue(lx, tok = lx.next()) {
     if (!tok) return null;
     if (tok.t === '<<') {
          const dict = {};
          while (true) {
               const k = lx.next();
               if (!k || k.t === '>>') break;
               if (k.t !== 'name') continue;
               dict[k.v] = parseValue(lx);
          }
          return dict;
     }
     if (tok.t === '[') {
          const arr = [];
          while (true) {
               const t = lx.next();
               if (!t || t.t === ']') break;
               arr.push(parseValue(lx, t));
          }
          return arr;
     }
     if (tok.t === 'num') {
          const save = lx.i; const g = lx.next(); const r = g && lx.next();
          if (g?.t === 'num' && r?.t === 'op' && r.v === 'R') return { ref: tok.v };
          lx.i = save; return tok.v;
     }
     if (tok.t === 'name') return { name: tok.v };
     if (tok.t === 'str') return { str: tok.v };
     if (tok.t === 'hex') return { str: hexToBinary(tok.v) };
     if (tok.t === 'op') return tok.v === 'true' ? true : tok.v === 'false' ? false : null;
     return null;
}
const hexToBinary = (hex) => hex.replace(/../g, (h) => String.fromCharCode(parseInt(h, 16)));
const nameOf = (v) => (v && typeof v === 'object' && 'name' in v ? v.name : null);

class PdfDoc {
     constructor(bytes) {
          this.bytes = bytes; this.text = latin1(bytes); this.objects = new Map(); this.budget = { used: 0 };
     }
     async load() {
          const re = /(\d+)\s+(\d+)\s+obj\b/g; let m;
          while ((m = re.exec(this.text))) {
               const num = Number(m[1]); const start = re.lastIndex;
               const lx = new Lexer(this.text, start);
               let value;
               try { value = parseValue(lx); } catch { continue; }
               const obj = { value, stream: null };
               lx.skip();
               if (this.text.startsWith('stream', lx.i) && value && typeof value === 'object') {
                    let s = lx.i + 6; if (this.text[s] === '\r') s++; if (this.text[s] === '\n') s++;
                    let end = typeof value.Length === 'number' ? s + value.Length : -1;
                    if (end < 0 || !/^\s*endstream/.test(this.text.slice(end, end + 20))) end = this.text.indexOf('endstream', s);
                    if (end < 0) continue;
                    obj.stream = this.bytes.subarray(s, end);
                    re.lastIndex = end;
               }
               this.objects.set(num, obj); // objek terakhir menang (pembaruan bertahap)
          }
          for (const [, obj] of [...this.objects]) {
               if (nameOf(obj.value?.Type) !== 'ObjStm' || !obj.stream) continue;
               try {
                    const data = latin1(await this.decode(obj));
                    const n = Number(obj.value.N) || 0; const first = Number(obj.value.First) || 0;
                    const head = data.slice(0, first).trim().split(/\s+/).map(Number);
                    for (let k = 0; k < n && k * 2 + 1 < head.length; k++) {
                         const lx = new Lexer(data, first + head[k * 2 + 1]);
                         this.objects.set(head[k * 2], { value: parseValue(lx), stream: null });
                    }
               } catch { /* object stream rusak: lewati */ }
          }
          return this;
     }
     get(v) {
          let guard = 0;
          while (v && typeof v === 'object' && 'ref' in v && guard++ < 20) v = this.objects.get(v.ref)?.value ?? null;
          return v;
     }
     obj(v) { return v && typeof v === 'object' && 'ref' in v ? this.objects.get(v.ref) : null; }
     async decode(obj) {
          const filters = [].concat(this.get(obj.value.Filter) ?? []).map((f) => nameOf(this.get(f)));
          let data = obj.stream;
          for (const f of filters) {
               if (f === 'FlateDecode' || f === 'Fl') data = await inflate(data, this.budget);
               else if (f === 'ASCII85Decode' || f === 'A85') data = ascii85(data);
               else throw new Error(`Filter PDF ${f} belum didukung.`);
          }
          return data;
     }
}

// ——— Font & CMap ———
function parseCMap(text) {
     const map = new Map(); let width = 1;
     const utf16 = (hex) => {
          let out = '';
          for (let i = 0; i + 4 <= hex.length; i += 4) out += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
          if (hex.length % 4 === 2) out += String.fromCharCode(parseInt(hex.slice(-2), 16));
          return out;
     };
     for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
          for (const m of block[1].matchAll(/<([0-9a-f]+)>\s*<([0-9a-f]*)>/gi)) { width = Math.max(width, m[1].length / 2); map.set(parseInt(m[1], 16), utf16(m[2])); }
     }
     for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
          for (const m of block[1].matchAll(/<([0-9a-f]+)>\s*<([0-9a-f]+)>\s*(<[0-9a-f]*>|\[[^\]]*\])/gi)) {
               const lo = parseInt(m[1], 16), hi = Math.min(parseInt(m[2], 16), lo + 65535); width = Math.max(width, m[1].length / 2);
               if (m[3].startsWith('[')) {
                    [...m[3].matchAll(/<([0-9a-f]*)>/gi)].forEach((d, k) => { if (lo + k <= hi) map.set(lo + k, utf16(d[1])); });
               } else {
                    const base = m[3].slice(1, -1); const head = base.slice(0, -4); const tail = parseInt(base.slice(-4) || '0', 16);
                    for (let c = lo; c <= hi; c++) map.set(c, utf16(head + (tail + c - lo).toString(16).padStart(4, '0')));
               }
          }
     }
     for (const block of text.matchAll(/begincodespacerange([\s\S]*?)endcodespacerange/g)) {
          for (const m of block[1].matchAll(/<([0-9a-f]+)>/gi)) width = Math.max(width, m[1].length / 2);
     }
     return { map, width };
}

const WIN_ANSI = { 128: '€', 130: '‚', 132: '„', 133: '…', 145: '‘', 146: '’', 147: '“', 148: '”', 150: '–', 151: '—', 160: ' ' };

async function loadFont(doc, ref, cache) {
     const key = ref && typeof ref === 'object' && 'ref' in ref ? ref.ref : null;
     if (key !== null && cache.has(key)) return cache.get(key);
     const dict = doc.get(ref) || {};
     const type0 = nameOf(dict.Subtype) === 'Type0';
     let cmap = null;
     const tu = doc.obj(dict.ToUnicode);
     if (tu?.stream) { try { cmap = parseCMap(latin1(await doc.decode(tu))); } catch { cmap = null; } }
     const font = { type0, cmap, bytes: cmap ? cmap.width : type0 ? 2 : 1 };
     if (key !== null) cache.set(key, font);
     return font;
}

function decodeString(font, raw) {
     const step = font?.bytes || 1; let out = '';
     for (let i = 0; i + step <= raw.length; i += step) {
          let code = 0; for (let k = 0; k < step; k++) code = code * 256 + raw.charCodeAt(i + k);
          const mapped = font?.cmap?.map.get(code);
          if (mapped !== undefined) out += mapped;
          else if (!font?.type0) out += WIN_ANSI[code] || String.fromCharCode(code);
     }
     return out;
}

// ——— Interpretasi content stream ———
const mul = (m, n) => [m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3], m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3], m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5]];

async function runContent(doc, data, resources, ctm, out, fontCache, depth) {
     const res = doc.get(resources) || {};
     const fonts = doc.get(res.Font) || {};
     const xobjects = doc.get(res.XObject) || {};
     const lx = new Lexer(latin1(data));
     const stack = []; let gs = { ctm, font: null, size: 1, leading: 0, cs: 0, ws: 0, th: 1 };
     let tm = [1, 0, 0, 1, 0, 0], tlm = tm;
     let ops = [];
     const emit = (str) => {
          const text = decodeString(gs.font, str);
          if (!text) return;
          // Lebar glyph tidak dibaca; perkiraan 0,5 em cukup untuk mengurutkan potongan teks.
          const tx = text.length * gs.size * 0.5 * gs.th;
          const m = mul(tm, gs.ctm);
          out.push({ x: m[4], y: m[5], size: Math.abs(gs.size * Math.hypot(m[2], m[3])) || 1, w: tx * Math.hypot(m[0], m[1]), text });
          tm = mul([1, 0, 0, 1, tx, 0], tm);
     };
     let tok;
     while ((tok = lx.next())) {
          if (tok.t !== 'op') {
               if (tok.t === '[') { const arr = []; let t; while ((t = lx.next()) && t.t !== ']') arr.push(t); ops.push({ t: 'arr', v: arr }); }
               else if (tok.t === '<<') { parseValue(lx, tok); ops.push({ t: 'dict' }); }
               else ops.push(tok);
               if (ops.length > 64) ops = ops.slice(-16);
               continue;
          }
          const n = (k) => Number(ops[ops.length - k]?.v) || 0;
          switch (tok.v) {
               case 'q': if (stack.length < 64) stack.push({ ...gs }); break;
               case 'Q': gs = stack.pop() || gs; break;
               case 'cm': gs.ctm = mul([n(6), n(5), n(4), n(3), n(2), n(1)], gs.ctm); break;
               case 'BT': tm = tlm = [1, 0, 0, 1, 0, 0]; break;
               case 'Tf': gs.size = n(1); gs.font = await loadFont(doc, fonts[ops[ops.length - 2]?.v], fontCache); break;
               case 'TL': gs.leading = n(1); break;
               case 'Tz': gs.th = n(1) / 100 || 1; break;
               case 'Td': tlm = mul([1, 0, 0, 1, n(2), n(1)], tlm); tm = tlm; break;
               case 'TD': gs.leading = -n(1); tlm = mul([1, 0, 0, 1, n(2), n(1)], tlm); tm = tlm; break;
               case 'Tm': tlm = tm = [n(6), n(5), n(4), n(3), n(2), n(1)]; break;
               case 'T*': tlm = mul([1, 0, 0, 1, 0, -gs.leading], tlm); tm = tlm; break;
               case 'Tj': if (ops.at(-1)?.t === 'str' || ops.at(-1)?.t === 'hex') emit(strOf(ops.at(-1))); break;
               case "'": case '"':
                    tlm = mul([1, 0, 0, 1, 0, -gs.leading], tlm); tm = tlm;
                    if (ops.at(-1)?.t === 'str' || ops.at(-1)?.t === 'hex') emit(strOf(ops.at(-1)));
                    break;
               case 'TJ': {
                    const arr = ops.at(-1)?.t === 'arr' ? ops.at(-1).v : [];
                    for (const part of arr) {
                         if (part.t === 'num') {
                              const shift = -part.v / 1000 * gs.size * gs.th;
                              tm = mul([1, 0, 0, 1, shift, 0], tm);
                         } else if (part.t === 'str' || part.t === 'hex') emit(strOf(part));
                    }
                    break;
               }
               case 'Do': {
                    const name = ops.at(-1)?.v; const xo = doc.obj(xobjects[name]);
                    if (depth < 6 && xo?.stream && nameOf(xo.value.Subtype) === 'Form') {
                         const matrix = Array.isArray(xo.value.Matrix) ? xo.value.Matrix.map(Number) : [1, 0, 0, 1, 0, 0];
                         try { await runContent(doc, await doc.decode(xo), xo.value.Resources ?? resources, mul(matrix, gs.ctm), out, fontCache, depth + 1); } catch { /* XObject rusak */ }
                    }
                    break;
               }
               case 'BI': { const end = lx.s.indexOf('EI', lx.s.indexOf('ID', lx.i)); lx.i = end < 0 ? lx.s.length : end + 2; break; }
               default: break;
          }
          ops = [];
     }
}
const strOf = (tok) => (tok.t === 'hex' ? hexToBinary(tok.v) : tok.v);

/** Kelompokkan potongan teks menjadi baris (atas → bawah, kiri → kanan). */
function toLines(chunks) {
     const sorted = chunks.filter((c) => c.text.trim()).sort((a, b) => b.y - a.y || a.x - b.x);
     const lines = [];
     for (const c of sorted) {
          const line = lines.at(-1);
          if (line && Math.abs(line.y - c.y) <= Math.max(2, Math.min(line.size, c.size) * 0.45)) line.items.push(c);
          else lines.push({ y: c.y, size: c.size, items: [c] });
     }
     return lines.map((line) => {
          const items = line.items.sort((a, b) => a.x - b.x);
          let text = ''; let end = null;
          for (const it of items) {
               // Huruf yang ditulis per karakter digabung; kolom angka tetap terpisah spasi.
               if (end !== null && it.x - end > it.size * 0.1) text += ' ';
               text += it.text;
               end = Math.max(end ?? -Infinity, it.x + it.w);
          }
          return text.replace(/\s+/g, ' ').trim();
     }).filter(Boolean);
}

/**
 * Baca teks per baris dari PDF.
 * @param {Uint8Array} bytes
 * @returns {Promise<{lines: string[], pages: number, encrypted: boolean}>}
 */
/** Halaman sesuai urutan pohon /Pages; bila pohon rusak, urutan objek di berkas. */
function pageList(doc) {
     const out = []; const seen = new Set();
     const walk = (ref, depth) => {
          const node = doc.get(ref);
          if (!node || depth > 30 || out.length >= MAX_PAGES) return;
          const key = ref && typeof ref === 'object' && 'ref' in ref ? ref.ref : null;
          if (key !== null) { if (seen.has(key)) return; seen.add(key); }
          if (nameOf(node.Type) === 'Page' || (!node.Kids && node.Contents)) { out.push({ value: node }); return; }
          for (const kid of [].concat(doc.get(node.Kids) ?? [])) walk(kid, depth + 1);
     };
     const root = [...doc.objects.values()].find((o) => nameOf(o.value?.Type) === 'Catalog');
     if (root) walk(root.value.Pages, 0);
     return out.length ? out : [...doc.objects.values()].filter((o) => nameOf(o.value?.Type) === 'Page').slice(0, MAX_PAGES);
}

function pageResources(doc, page) {
     let resources = page.value.Resources; let parent = page.value.Parent; let guard = 0;
     while (!resources && parent && guard++ < 20) { const p = doc.get(parent); resources = p?.Resources; parent = p?.Parent; }
     return resources;
}

/** PNG predictor (DecodeParms /Predictor ≥ 10) untuk gambar FlateDecode. */
function unpredict(data, columns, colors) {
     const stride = columns * colors; const rows = Math.floor(data.length / (stride + 1));
     const out = new Uint8Array(rows * stride);
     for (let r = 0; r < rows; r++) {
          const type = data[r * (stride + 1)]; const src = r * (stride + 1) + 1; const dst = r * stride;
          for (let i = 0; i < stride; i++) {
               const left = i >= colors ? out[dst + i - colors] : 0; const up = r ? out[dst - stride + i] : 0;
               const ul = r && i >= colors ? out[dst - stride + i - colors] : 0;
               let v = data[src + i];
               if (type === 1) v += left; else if (type === 2) v += up; else if (type === 3) v += (left + up) >> 1;
               else if (type === 4) { const pa = Math.abs(up - ul), pb = Math.abs(left - ul), pc = Math.abs(left + up - 2 * ul); v += pa <= pb && pa <= pc ? left : pb <= pc ? up : ul; }
               out[dst + i] = v & 255;
          }
     }
     return out;
}

/**
 * Gambar terbesar per halaman, untuk OCR PDF hasil scan.
 * JPEG (DCTDecode) dikembalikan apa adanya; FlateDecode 8-bit Gray/RGB sebagai piksel mentah.
 * @returns {Promise<{images: Array<{type:'jpeg', bytes:Uint8Array}|{type:'pixels', width:number, height:number, channels:number, bytes:Uint8Array}>, pages:number, skipped:number, encrypted:boolean}>}
 */
export async function readPdfImages(bytes, { maxPages = 5 } = {}) {
     const doc = await new PdfDoc(bytes).load();
     if (/\/Encrypt\s*(?:\d+\s+\d+\s+R|<<)/.test(doc.text)) return { images: [], pages: 0, skipped: 0, encrypted: true };
     const pages = pageList(doc).slice(0, maxPages);
     const images = []; let skipped = 0;
     for (const page of pages) {
          const found = [];
          const collect = (resources, depth) => {
               const xobjects = doc.get(doc.get(resources)?.XObject) || {};
               for (const ref of Object.values(xobjects)) {
                    const xo = doc.obj(ref);
                    if (!xo?.stream) continue;
                    const sub = nameOf(xo.value.Subtype);
                    if (sub === 'Image') found.push(xo);
                    else if (sub === 'Form' && depth < 4) collect(xo.value.Resources, depth + 1);
               }
          };
          collect(pageResources(doc, page), 0);
          const best = found.sort((a, b) => (b.value.Width * b.value.Height || 0) - (a.value.Width * a.value.Height || 0))[0];
          if (!best || best.value.Width * best.value.Height < 200 * 200) { skipped++; continue; }
          const filters = [].concat(doc.get(best.value.Filter) ?? []).map((f) => nameOf(doc.get(f)));
          try {
               let data = best.stream;
               for (const f of filters) {
                    if (f === 'FlateDecode' || f === 'Fl') data = await inflate(data, doc.budget);
                    else if (f === 'ASCII85Decode' || f === 'A85') data = ascii85(data);
                    else if (f === 'DCTDecode' || f === 'DCT') { images.push({ type: 'jpeg', bytes: data }); data = null; break; }
                    else throw new Error(f);
               }
               if (!data) continue;
               const cs = doc.get(best.value.ColorSpace);
               const csName = nameOf(cs) || nameOf(doc.get(Array.isArray(cs) ? cs[0] : null));
               const iccN = Array.isArray(cs) && nameOf(doc.get(cs[0])) === 'ICCBased' ? Number(doc.get(doc.obj(cs[1])?.value?.N) ?? 0) : 0;
               const channels = csName === 'DeviceGray' ? 1 : csName === 'DeviceRGB' ? 3 : iccN === 1 || iccN === 3 ? iccN : 0;
               const width = Number(best.value.Width), height = Number(best.value.Height);
               if (!channels || Number(best.value.BitsPerComponent) !== 8) { skipped++; continue; }
               const parms = doc.get(best.value.DecodeParms);
               if (Number(parms?.Predictor) >= 10) data = unpredict(data, width, channels);
               if (data.length < width * height * channels) { skipped++; continue; }
               images.push({ type: 'pixels', width, height, channels, bytes: data.subarray(0, width * height * channels) });
          } catch { skipped++; }
     }
     return { images, pages: pages.length, skipped, encrypted: false };
}

export async function readPdfText(bytes) {
     const doc = await new PdfDoc(bytes).load();
     if (/\/Encrypt\s*(?:\d+\s+\d+\s+R|<<)/.test(doc.text)) return { lines: [], pages: 0, encrypted: true };
     const pages = pageList(doc);
     const fontCache = new Map(); const lines = [];
     for (const page of pages) {
          const resources = pageResources(doc, page);
          const contents = [].concat(page.value.Contents ?? []);
          const parts = [];
          for (const ref of contents) {
               const o = doc.obj(ref);
               if (o?.stream) { try { parts.push(await doc.decode(o)); } catch { /* stream tidak terbaca */ } }
               else if (Array.isArray(doc.get(ref))) for (const r of doc.get(ref)) { const oo = doc.obj(r); if (oo?.stream) { try { parts.push(await doc.decode(oo)); } catch { /* lewati */ } } }
          }
          const data = new Uint8Array(parts.reduce((n, p) => n + p.length + 1, 0)); let off = 0;
          for (const p of parts) { data.set(p, off); off += p.length; data[off++] = 10; }
          const chunks = [];
          await runContent(doc, data, resources, [1, 0, 0, 1, 0, 0], chunks, fontCache, 0);
          lines.push(...toLines(chunks));
     }
     return { lines, pages: pages.length, encrypted: false };
}

export default readPdfText;
