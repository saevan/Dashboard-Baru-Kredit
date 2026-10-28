/**
 * core/statement-extract.js — Membaca angka laporan keuangan format bebas.
 *
 * Masukan berupa baris (sel Excel/CSV atau baris teks PDF). Label dicocokkan
 * persis (setelah normalisasi) dengan sinonim pos laporan Indonesia/Inggris,
 * sehingga "Jumlah liabilitas dan ekuitas" tidak terbaca sebagai ekuitas.
 * Field yang tidak ditemukan dibiarkan kosong; modul ini tidak menebak nilai.
 */

const SYNONYMS = {
     penjualan: ['penjualan', 'penjualan bersih', 'jumlah penjualan', 'total penjualan', 'pendapatan', 'pendapatan usaha', 'pendapatan bersih', 'jumlah pendapatan', 'jumlah pendapatan usaha', 'total pendapatan', 'pendapatan penjualan', 'omzet', 'omset', 'revenue', 'revenues', 'total revenue', 'net revenue', 'sales', 'net sales'],
     hpp: ['harga pokok penjualan', 'beban pokok penjualan', 'beban pokok pendapatan', 'hpp', 'cost of goods sold', 'cost of revenue', 'cost of sales'],
     ebit: ['laba usaha', 'laba operasi', 'laba operasional', 'laba rugi usaha', 'ebit', 'operating profit', 'operating income', 'income from operations', 'laba sebelum bunga dan pajak'],
     laba_bersih: ['laba bersih', 'laba rugi bersih', 'laba bersih tahun berjalan', 'laba tahun berjalan', 'laba periode berjalan', 'laba bersih periode berjalan', 'laba rugi tahun berjalan', 'laba bersih setelah pajak', 'laba setelah pajak', 'net income', 'net profit', 'profit for the year', 'profit for the period'],
     total_aset: ['total aset', 'jumlah aset', 'total aktiva', 'jumlah aktiva', 'total harta', 'jumlah harta', 'total assets'],
     aset_lancar: ['aset lancar', 'total aset lancar', 'jumlah aset lancar', 'aktiva lancar', 'total aktiva lancar', 'jumlah aktiva lancar', 'harta lancar', 'jumlah harta lancar', 'current assets', 'total current assets'],
     total_liabilitas: ['total liabilitas', 'jumlah liabilitas', 'total kewajiban', 'jumlah kewajiban', 'total utang', 'jumlah utang', 'total hutang', 'jumlah hutang', 'total liabilities'],
     liabilitas_jangka_pendek: ['liabilitas jangka pendek', 'total liabilitas jangka pendek', 'jumlah liabilitas jangka pendek', 'liabilitas lancar', 'jumlah liabilitas lancar', 'kewajiban lancar', 'jumlah kewajiban lancar', 'kewajiban jangka pendek', 'jumlah kewajiban jangka pendek', 'jumlah utang jangka pendek', 'jumlah hutang jangka pendek', 'utang lancar', 'jumlah utang lancar', 'current liabilities', 'total current liabilities'],
     ekuitas: ['ekuitas', 'total ekuitas', 'jumlah ekuitas', 'ekuitas pemilik', 'modal', 'jumlah modal', 'total modal', 'modal pemilik', 'modal sendiri', 'jumlah modal sendiri', 'total equity', 'equity'],
     arus_kas_operasional: ['arus kas operasional', 'arus kas operasi', 'arus kas dari aktivitas operasi', 'arus kas bersih dari aktivitas operasi', 'arus kas bersih dari aktivitas operasional', 'arus kas bersih diperoleh dari aktivitas operasi', 'arus kas bersih yang diperoleh dari aktivitas operasi', 'arus kas bersih digunakan untuk aktivitas operasi', 'arus kas bersih yang digunakan untuk aktivitas operasi', 'kas bersih dari aktivitas operasi', 'kas bersih diperoleh dari aktivitas operasi', 'kas bersih yang diperoleh dari aktivitas operasi', 'kas bersih digunakan untuk aktivitas operasi', 'kas bersih yang digunakan untuk aktivitas operasi', 'net cash from operating activities', 'net cash provided by operating activities', 'net cash generated from operating activities', 'net cash used in operating activities', 'operating cash flow', 'cash flow from operations'],
     kas: ['kas', 'kas dan bank', 'kas dan setara kas', 'cash', 'cash and cash equivalents'],
     piutang: ['piutang', 'piutang usaha', 'piutang dagang', 'jumlah piutang usaha', 'trade receivables', 'accounts receivable'],
     persediaan: ['persediaan', 'persediaan barang dagang', 'inventories', 'inventory'],
     beban_bunga: ['beban bunga', 'biaya bunga', 'beban keuangan', 'biaya keuangan', 'interest expense', 'finance costs'],
     depresiasi: ['penyusutan', 'beban penyusutan', 'biaya penyusutan', 'depresiasi', 'depreciation', 'depreciation expense'],
     amortisasi: ['amortisasi', 'beban amortisasi', 'amortization']
};

const LABELS = new Map();
for (const [field, names] of Object.entries(SYNONYMS)) for (const name of names) LABELS.set(name, field);

const LABEL_TEXT = { penjualan: 'Penjualan', laba_bersih: 'Laba bersih', ebit: 'Laba usaha', total_aset: 'Total aset', aset_lancar: 'Aset lancar', total_liabilitas: 'Total liabilitas', liabilitas_jangka_pendek: 'Liabilitas jangka pendek', ekuitas: 'Ekuitas', arus_kas_operasional: 'Arus kas operasional' };

/** Huruf kecil, tanpa diakritik/tanda baca/penomoran, tanpa akhiran satuan. */
export function normalizeLabel(text) {
     return String(text ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
          .replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim()
          .replace(/^(?:[0-9]{1,2}|[a-h]|[ivx]{1,4})\s+(?=[a-z])/, '')
          .replace(/\s+(?:rp|idr|rupiah)$/, '').replace(/\s+/g, ' ').trim();
}

/** Angka format Indonesia/Inggris: 1.250.000 · 1.250.000,50 · 1,250,000 · (25.000) · Rp 5.000 · "-" = nol. */
export function parseAmount(raw) {
     if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
     let s = String(raw ?? '').trim().replace(/\s+/g, '');
     if (/^[-–—]$/.test(s)) return 0;
     let negative = false;
     if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
     if (/^[-–—]/.test(s)) { negative = !negative; s = s.slice(1); }
     s = s.replace(/^(?:rp\.?|idr)/i, '');
     if (/^[-–—]/.test(s)) { negative = !negative; s = s.slice(1); }
     if (!/^\d[\d.,]*$/.test(s)) return null;
     const dot = s.lastIndexOf('.'), comma = s.lastIndexOf(',');
     let value;
     if (dot >= 0 && comma >= 0) value = dot > comma ? Number(s.replace(/,/g, '')) : Number(s.replace(/\./g, '').replace(',', '.'));
     else if (dot >= 0) value = /^\d{1,3}(\.\d{3})+$/.test(s) ? Number(s.replace(/\./g, '')) : Number(s);
     else if (comma >= 0) value = /^\d{1,3}(,\d{3})+$/.test(s) ? Number(s.replace(/,/g, '')) : Number(s.replace(',', '.'));
     else value = Number(s);
     if (!Number.isFinite(value)) return null;
     return negative ? -value : value;
}

const EXPENSES = new Set(['hpp', 'beban_bunga', 'depresiasi', 'amortisasi']);
const NOTE_REF = /^\d{1,2}[a-z]?(?:[,.]\d{1,2}[a-z]?)*$/i;

/** Satuan laporan dari judul/keterangan: "dalam ribuan Rupiah", "(Rp 000)", "in millions of Rupiah". */
export function detectUnit(text) {
     // Satuan sering ditulis dalam kurung, jadi jangan pakai normalizeLabel.
     const t = String(text ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ');
     if (/\b(?:dalam|in)\s+(?:miliar|milyar|billions?)\b/.test(t)) return { factor: 1e9, label: 'miliar' };
     if (/\b(?:dalam|in)\s+(?:jutaan|juta|millions?)\b/.test(t) || /\brp\s*000\s*000\b/.test(t)) return { factor: 1e6, label: 'jutaan' };
     if (/\b(?:dalam|in)\s+(?:ribuan|ribu|thousands?)\b/.test(t) || /\brp\s*000\b/.test(t)) return { factor: 1e3, label: 'ribuan' };
     return { factor: 1, label: '' };
}

/** Pecah satu baris teks PDF menjadi label + angka di ujung kanan. */
export function splitTextRow(line) {
     const tokens = String(line).trim().split(/\s+/).filter(Boolean);
     const values = [];
     while (tokens.length) {
          let token = tokens.at(-1);
          // "Rp" terpisah dari angkanya: "Rp 5.000.000".
          if (values.length && /^(?:rp\.?|idr)$/i.test(token)) { tokens.pop(); continue; }
          if (parseAmount(token) === null) break;
          values.unshift(token); tokens.pop();
     }
     return { label: tokens.join(' '), values };
}

/** Sel Excel/CSV: label = sel teks yang dikenali (kolom bagian/kode diabaikan), angka = sel bernilai sesudahnya. */
function cellRow(cells) {
     const texts = []; const values = [];
     for (const cell of cells || []) {
          if (cell === null || cell === undefined || String(cell).trim() === '') continue;
          const numeric = parseAmount(cell) !== null;
          if (!values.length && !numeric) texts.push(String(cell));
          else if (texts.length && numeric) values.push(cell);
     }
     const label = texts.find((t) => LABELS.has(normalizeLabel(t))) ?? texts.at(-1) ?? '';
     return { label, values };
}

const MONTHS = { jan: 1, januari: 1, january: 1, feb: 2, februari: 2, february: 2, mar: 3, maret: 3, march: 3, apr: 4, april: 4,
     mei: 5, may: 5, jun: 6, juni: 6, june: 6, jul: 7, juli: 7, july: 7, agu: 8, agt: 8, agus: 8, agustus: 8, aug: 8, august: 8,
     sep: 9, sept: 9, september: 9, okt: 10, oktober: 10, oct: 10, october: 10, nov: 11, nopember: 11, november: 11, des: 12, desember: 12, dec: 12, december: 12 };
const FLOWS = new Set(['penjualan', 'laba_bersih', 'ebit', 'arus_kas_operasional', 'hpp', 'beban_bunga', 'beban_bunga_lain', 'depresiasi', 'amortisasi']);

/** Periode satu sel: 2025 · FY2025 · 2025-01 · 01/2025 · Jan 2025 · Januari 2025 · 2025-01-31 · 31/01/2025 · tanggal Excel. */
export function parsePeriod(cell, { dateColumn = false } = {}) {
     if (typeof cell === 'number' && dateColumn && cell > 20000 && cell < 80000) {
          const d = new Date(Date.UTC(1899, 11, 30) + Math.round(cell) * 86400000);
          return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
     }
     const t = String(cell ?? '').trim().toLowerCase();
     let m;
     if ((m = t.match(/^(?:fy|tahun|th\.?)?\s*((?:19|20)\d{2})$/))) return { year: +m[1], month: null };
     if ((m = t.match(/^((?:19|20)\d{2})[-/.](\d{1,2})(?:[-/.]\d{1,2})?$/)) && +m[2] >= 1 && +m[2] <= 12) return { year: +m[1], month: +m[2] };
     if ((m = t.match(/^(?:(\d{1,2})[-/.])?(\d{1,2})[-/.]((?:19|20)\d{2})$/)) && +m[2] >= 1 && +m[2] <= 12) return { year: +m[3], month: +m[2] };
     if ((m = t.match(/^([a-z]+)\.?[\s\-/']*((?:19|20)\d{2}|\d{2})$/)) && MONTHS[m[1]]) return { year: m[2].length === 2 ? 2000 + +m[2] : +m[2], month: MONTHS[m[1]] };
     return null;
}

/**
 * Bentuk lebar: baris judul berisi nama pos, satu baris per periode (tahun,penjualan,…).
 * Data bulanan dijumlahkan per tahun: laba/penjualan/arus kas dijumlah, posisi neraca memakai bulan terakhir.
 */
function wideCandidates(input, source, unit) {
     const fieldsIn = (row) => new Set((row || []).map((c) => LABELS.get(normalizeLabel(c))).filter(Boolean));
     // Judul kolom: ≥2 pos berbeda dan tanpa angka. Baris "penjualan,Penjualan,1.000" (kunci + label) bukan judul.
     const headerIndex = input.slice(0, 40).findIndex((row) => fieldsIn(row).size >= 2 && !(row || []).some((c) => String(c ?? '').trim() && parseAmount(c) !== null));
     if (headerIndex < 0) return [];
     const below = input.slice(headerIndex + 1, headerIndex + 400).filter((row) => (row || []).some((c) => String(c ?? '').trim()));
     // Bentuk lebar berisi angka di bawah judul; bila baris berikutnya masih memuat nama pos, ini format per baris.
     if (!below.length || below.filter((row) => fieldsIn(row).size).length * 2 > below.length) return [];
     const titles = input[headerIndex].map((c) => normalizeLabel(c));
     const header = input[headerIndex].map((c) => LABELS.get(normalizeLabel(c)) || null);
     const yearCol = titles.findIndex((t) => /^(tahun|year|fiscal year|th)$/.test(t));
     const monthCol = titles.findIndex((t) => /^(bulan|month|bln)$/.test(t));
     const dateCols = titles.map((t, i) => (/^(tanggal|tgl|date|periode|period|bulan|month)$/.test(t) ? i : -1)).filter((i) => i >= 0);
     const periodOf = (row) => {
          if (yearCol >= 0) {
               const year = parsePeriod(row[yearCol])?.year;
               if (!year) return null;
               const month = monthCol >= 0 ? (MONTHS[normalizeLabel(row[monthCol])] || (+row[monthCol] >= 1 && +row[monthCol] <= 12 ? +row[monthCol] : null)) : null;
               return { year, month };
          }
          for (let i = 0; i < row.length; i++) {
               if (header[i]) continue;
               const p = parsePeriod(row[i], { dateColumn: dateCols.includes(i) });
               if (p) return p;
          }
          return null;
     };
     const unitWarning = unit.factor !== 1 ? [`Laporan tertulis dalam ${unit.label} Rupiah; angka sudah dikonversi ke Rupiah penuh.`] : [];
     const rows = [];
     for (const row of below) {
          const keuangan = {}; const warnings = [];
          header.forEach((field, i) => {
               const value = field ? parseAmount(row?.[i]) : null;
               if (!field || value === null) return;
               const amount = Math.round((EXPENSES.has(field) ? Math.abs(value) : value) * unit.factor);
               if (!Number.isSafeInteger(amount)) { warnings.push(`${field}: angka di luar batas pembacaan.`); return; }
               if (field in keuangan && keuangan[field] !== amount) warnings.push(`${field}: beberapa kolom berisi angka berbeda. Periksa kembali.`);
               else keuangan[field] = amount;
          });
          if (Object.keys(keuangan).length >= 2) rows.push({ period: periodOf(row), keuangan, warnings });
     }
     const dated = rows.filter((r) => r.period);
     // Tanpa kolom periode: tiap baris tetap pilihan terpisah, tidak ditebak.
     if (!dated.length) return rows.map((r, i) => ({ period: null, label: `${source} · baris ${i + 1}`, keuangan: r.keuangan, warnings: [...unitWarning, ...r.warnings] }));
     const years = [...new Set(dated.map((r) => r.period.year))].sort((a, b) => b - a);
     return years.map((year) => {
          const group = dated.filter((r) => r.period.year === year);
          const annual = group.filter((r) => r.period.month === null);
          if (annual.length) {
               const warnings = [...unitWarning, ...annual[0].warnings];
               if (annual.length > 1) warnings.push(`Ada ${annual.length} baris untuk tahun ${year}; dipakai baris pertama. Periksa kembali.`);
               return { period: year, label: `${source} · periode ${year}`, keuangan: annual[0].keuangan, warnings };
          }
          const months = [...new Set(group.map((r) => r.period.month))].sort((a, b) => a - b);
          const warnings = [...unitWarning, ...group.flatMap((r) => r.warnings)];
          if (months.length !== group.length) warnings.push(`Ada bulan yang tercatat lebih dari sekali pada ${year}. Periksa kembali.`);
          if (months.length < 12) warnings.push(`Data ${year} hanya ${months.length} bulan; penjualan, laba, dan arus kas dijumlahkan untuk bulan tersebut saja, bukan setahun penuh.`);
          const keuangan = {};
          const last = Math.max(...months);
          for (const r of group) {
               for (const [field, value] of Object.entries(r.keuangan)) {
                    if (FLOWS.has(field)) keuangan[field] = (keuangan[field] ?? 0) + value;
                    else if (r.period.month === last) keuangan[field] = value;
               }
          }
          return { period: year, label: `${source} · periode ${year} (${months.length} bulan)`, keuangan, warnings: [...new Set(warnings)] };
     });
}

/** Kolom periode dari baris judul yang berisi tahun (2025, 31 Desember 2024, FY2025). */
function periodHeader(rows) {
     let best = [];
     for (const row of rows.slice(0, 60)) {
          if (LABELS.has(normalizeLabel(row.label))) continue;
          const years = [];
          for (const cell of row.raw) {
               for (const m of String(cell ?? '').matchAll(/(?:^|[^\d])((?:19|20)\d{2})(?!\d)/g)) years.push(m[1]);
          }
          // Judul "31 Desember 2025" kalah dari baris kolom "2025  2024".
          if (years.length > best.length) best = years;
     }
     return best;
}

// Keep physical columns in CSV/Excel: an empty 2025 cell must never receive 2024's value.
function yearColumns(row) {
     return (row || []).flatMap((cell, col) => {
          const match = String(cell ?? '').trim().match(/^(?:(?:tahun|fy)\s*|31\s+(?:desember|december)\s+)?((?:19|20)\d{2})$/i);
          return match ? [{ col, year: Number(match[1]) }] : [];
     });
}

function columnCandidates(input, source, unit) {
     let columns = [];
     const reports = new Map();
     for (const row of input) {
          const label = (row || []).find(c => LABELS.has(normalizeLabel(c)));
          if (label === undefined) {
               const header = yearColumns(row);
               if (header.length) columns = header;
               continue;
          }
          if (!columns.length) continue;
          const field = LABELS.get(normalizeLabel(label));
          const rank = /^(?:jumlah|total)\b/.test(normalizeLabel(label)) ? 0 : 1;
          for (const { col, year } of columns) {
               if (!reports.has(year)) reports.set(year, { period: year, label: `${source} · periode ${year}`, keuangan: {}, warnings: [], ranks: {} });
               const report = reports.get(year);
               const amount = parseAmount(row[col]);
               if (amount === null) continue;
               const value = Math.round((EXPENSES.has(field) ? Math.abs(amount) : amount) * unit.factor);
               if (!Number.isSafeInteger(value)) { report.warnings.push(`${field}: angka di luar batas pembacaan.`); continue; }
               if (!(field in report.keuangan) || rank < report.ranks[field]) {
                    report.keuangan[field] = value; report.ranks[field] = rank;
               } else if (rank === report.ranks[field] && report.keuangan[field] !== value) {
                    report.warnings.push(`${LABEL_TEXT[field] || field}: ditemukan angka berbeda untuk periode yang sama. Periksa kembali.`);
               }
               if (field === 'arus_kas_operasional' && /digunakan|used/.test(normalizeLabel(label)) && value > 0) report.warnings.push('Arus kas operasi berlabel digunakan; periksa tanda kas keluar.');
          }
     }
     return [...reports.values()].filter(c => Object.keys(c.keuangan).length >= 2).map(({ ranks, ...c }) => ({ ...c,
          warnings: [...new Set([...(unit.factor !== 1 ? [`Laporan tertulis dalam ${unit.label} Rupiah; angka sudah dikonversi ke Rupiah penuh.`] : []), ...c.warnings])] }));
}

/** Satu baris per (tahun, pos, nilai): "2025,Neraca,Total aset,500.000.000". */
function periodRowCandidates(input, source, unit) {
     const reports = new Map();
     for (const row of input) {
          const cells = (row || []).map((c) => String(c ?? '').trim());
          const labelAt = cells.findIndex((c) => LABELS.has(normalizeLabel(c)));
          if (labelAt < 0) continue;
          const yearAt = cells.findIndex((c, i) => i !== labelAt && /^(?:fy\s*)?(?:19|20)\d{2}$/i.test(c));
          if (yearAt < 0) continue;
          const amounts = cells.map((c, i) => (i === yearAt || i === labelAt ? null : parseAmount(c))).filter((v, i) => v !== null && i > labelAt);
          if (amounts.length !== 1) continue;
          const year = Number(cells[yearAt].replace(/\D/g, ''));
          const field = LABELS.get(normalizeLabel(cells[labelAt]));
          const rank = /^(?:jumlah|total)\b/.test(normalizeLabel(cells[labelAt])) ? 0 : 1;
          const value = Math.round((EXPENSES.has(field) ? Math.abs(amounts[0]) : amounts[0]) * unit.factor);
          if (!Number.isSafeInteger(value)) continue;
          if (!reports.has(year)) reports.set(year, { period: year, label: `${source} · periode ${year}`, keuangan: {}, warnings: [], ranks: {} });
          const report = reports.get(year);
          if (!(field in report.keuangan) || rank < report.ranks[field]) { report.keuangan[field] = value; report.ranks[field] = rank; }
          else if (rank === report.ranks[field] && report.keuangan[field] !== value) report.warnings.push(`${LABEL_TEXT[field] || field}: ditemukan angka berbeda untuk periode yang sama. Periksa kembali.`);
     }
     return [...reports.values()].filter((c) => Object.keys(c.keuangan).length >= 2).sort((a, b) => b.period - a.period)
          .map(({ ranks, ...c }) => ({ ...c, warnings: [...new Set([...(unit.factor !== 1 ? [`Laporan tertulis dalam ${unit.label} Rupiah; angka sudah dikonversi ke Rupiah penuh.`] : []), ...c.warnings])] }));
}

/**
 * @param {Array<Array<string|number|null>>|Array<string>} input baris sel atau baris teks
 * @param {{text?: boolean, source?: string}} [options]
 * @returns {{candidates: Array<{label:string, keuangan:object, warnings:string[]}>, matched:number}}
 */
export function extractStatement(input, { text = false, source = 'laporan' } = {}) {
     const rows = (input || []).slice(0, 5000).map((row) => {
          const parsed = text ? splitTextRow(row) : cellRow(row);
          return { ...parsed, raw: text ? [row] : row || [] };
     });
     const unit = detectUnit(rows.slice(0, 40).map((r) => r.raw.join(' ')).join(' '));
     const headers = rows.slice(0, 40).map(r => r.raw.join(' ')).join(' ');
     if (/\b(?:USD|US\s*dollars?|dolar\s*(?:AS|Amerika)|EUR|SGD)\b|US\$/i.test(headers)) throw new Error('Mata uang laporan belum didukung. Gunakan laporan dalam Rupiah; konversi kurs tidak dilakukan otomatis.');
     if (!text) {
          const wide = wideCandidates(input.slice(0, 5000), source, unit);
          if (wide.length) return { candidates: wide, matched: wide.length };
          const columns = columnCandidates(input.slice(0, 5000), source, unit);
          if (columns.length) return { candidates: columns, matched: columns.length };
          const periods = periodRowCandidates(input.slice(0, 5000), source, unit);
          if (periods.length) return { candidates: periods, matched: periods.length };
     }
     const years = periodHeader(rows);
     const hits = [];
     for (const row of rows) {
          let key = normalizeLabel(row.label);
          // Teks PDF/OCR: kolom catatan yang salah baca ("11" → "di") menempel di ujung label.
          if (text && !LABELS.has(key) && /\s\S{1,3}$/.test(key) && LABELS.has(key.replace(/\s\S{1,3}$/, ''))) key = key.replace(/\s\S{1,3}$/, '');
          const field = LABELS.get(key);
          if (!field || !row.values.length) continue;
          let values = row.values.slice();
          // Kolom "Catatan" (5, 2c, 4.1) berada sebelum angka periode.
          const expected = years.length || 1;
          const large = (list) => list.some((v) => Math.abs(parseAmount(v)) >= 1000);
          while (values.length > expected && NOTE_REF.test(String(values[0]).trim()) && (years.length || large(values.slice(1)))) values.shift();
          // Flattened PDF text has no reliable column position when a value is absent.
          if (years.length && values.length !== years.length) continue;
          const amounts = values.map(parseAmount).filter((v) => v !== null);
          if (!amounts.length) continue;
          const total = /^(?:jumlah|total)\b/.test(key) ? 0 : 1;
          hits.push({ field, key, rank: total, amounts, used: /digunakan|used/.test(key) });
     }
     const columns = Math.min(Math.max(0, ...hits.map((h) => h.amounts.length)), years.length || 4);
     const candidates = [];
     for (let col = 0; col < columns; col++) {
          const chosen = {}; const warnings = [];
          for (const hit of hits) {
               if (hit.amounts.length <= col) continue;
               // Beban ditulis dalam kurung di laporan, tetapi engine memakai angka positif.
               const value = Math.round((EXPENSES.has(hit.field) ? Math.abs(hit.amounts[col]) : hit.amounts[col]) * unit.factor);
               if (!Number.isSafeInteger(value)) continue;
               const old = chosen[hit.field];
               if (!old || hit.rank < old.rank) chosen[hit.field] = { value, rank: hit.rank, used: hit.used };
               else if (hit.rank === old.rank && old.value !== value && !warnings.some((w) => w.includes(LABEL_TEXT[hit.field] || hit.field))) {
                    warnings.push(`${LABEL_TEXT[hit.field] || hit.field}: ditemukan lebih dari satu angka; dipakai yang pertama. Periksa kembali.`);
               }
          }
          const keuangan = Object.fromEntries(Object.entries(chosen).map(([k, v]) => [k, v.value]));
          if (Object.keys(keuangan).length < 2) continue;
          if (unit.factor !== 1) warnings.unshift(`Laporan tertulis dalam ${unit.label} Rupiah; angka sudah dikonversi ke Rupiah penuh.`);
          if (chosen.arus_kas_operasional?.used && chosen.arus_kas_operasional.value > 0) warnings.push('Arus kas operasi berlabel "digunakan"; pastikan tandanya negatif bila kas keluar.');
          candidates.push({ period: years[col] ? Number(years[col]) : null, label: years[col] ? `${source} · periode ${years[col]}` : columns > 1 ? `${source} · kolom angka ${col + 1}` : `${source} · satu periode`, keuangan, warnings });
     }
     return { candidates, matched: hits.length };
}

export default extractStatement;
