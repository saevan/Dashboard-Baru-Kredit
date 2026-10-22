/**
 * core/excel-import.js — Pemetaan templat rasio IDX → skema keuangan aplikasi.
 *
 * Templat "Analisis Rasio Keuangan Perusahaan … (Input Neraca & Laba Rugi)"
 * memiliki 4 lembar: PROFITABILITAS, SOLVABILITAS, LIKUIDITAS, RASIO LAIN.
 * Baris 1 = header grup, baris 2 = nama kolom, baris 3+ = data per perusahaan×tahun.
 *
 * Modul ini MURNI (tanpa DOM): menerima { sheets:[{name,rows}] } hasil readXlsx()
 * dan menghasilkan baris-baris keuangan ternormalisasi + peringatan + cek silang
 * rasio templat vs perhitungan aplikasi (computeRatios).
 */

import { computeRatios } from './ratios.js';

const RATIO_SHEETS = ['PROFITABILITAS', 'SOLVABILITAS', 'LIKUIDITAS', 'RASIO LAIN'];

/** Normalisasi nama header: buang spasi ganda, uppercase. */
export function normalizeHeader(value) {
     if (value === null || value === undefined) return '';
     return String(value).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
}

// Identitas baris (perusahaan & tahun).
const ID_COMPANY = ['NAMA PERUSAHAAN', 'NAMA EMITEN'];
const ID_YEAR = ['TAHUN', 'TAHUN PERUSAHAAN'];

// Pemetaan langsung 1 kolom → 1 field (label pertama yang cocok menang).
const DIRECT_FIELDS = [
     ['penjualan', ['PENJUALAN DAN PENDAPATAN USAHA']],
     ['ebit', ['JUMLAH LABA (RUGI) DARI OPERASI YANG DILANJUTKAN', 'LABA OPERASI', 'LABA USAHA']],
     ['laba_bersih', ['JUMLAH LABA RUGI KOMPREHENSIF', 'LABA BERSIH', 'LABA RUGI BERSIH']],
     ['total_aset', ['JUMLAH ASET']],
     ['ekuitas', ['JUMLAH EKUITAS']],
     ['total_liabilitas', ['JUMLAH LIABILITAS']],
     ['beban_bunga', ['BEBAN BUNGA DAN KEUANGAN', 'BEBAN BUNGA']],
     ['aset_lancar', ['JUMLAH ASET LANCAR']],
     ['kas', ['KAS DAN SETARA KAS']],
     ['liabilitas_jangka_pendek', ['JUMLAH LIABILITAS JANGKA PENDEK']],
     ['persediaan', ['PERSEDIAAN LANCAR', 'PERSEDIAAN']]
];

// Field hasil penjumlahan beberapa kolom.
const SUM_FIELDS = [
     ['piutang', [
          'PIUTANG USAHA PIHAK KETIGA',
          'PIUTANG USAHA PIHAK BERELASI',
          'PIUTANG LAINNYA PIHAK KETIGA',
          'PIUTANG LAINNYA PIHAK BERELASI'
     ]]
];

// Field spreading (reklasifikasi RMA) yang dapat dipetakan dari templat.
const SPREADING_FIELDS = [
     ['related_party_receivables', ['PIUTANG USAHA PIHAK BERELASI']]
];

const HPP_LABELS = ['BEBAN POKOK PENJUALAN DAN PENDAPATAN', 'HARGA POKOK PENJUALAN', 'BEBAN POKOK PENJUALAN'];
const GROSS_PROFIT_LABELS = ['JUMLAH LABA BRUTO'];

// Cek silang rasio templat vs computeRatios.
const RATIO_CHECKS = [
     { key: 'gpm', label: 'GPM', labels: ['GPM'], percent: true },
     { key: 'opm', label: 'OPM', labels: ['OPM'], percent: true },
     { key: 'npm', label: 'NPM', labels: ['NPM'], percent: true },
     { key: 'roa', label: 'ROA', labels: ['ROA'], percent: true },
     { key: 'roe', label: 'ROE', labels: ['ROE'], percent: true },
     { key: 'dar', label: 'DAR', labels: ['DAR'], percent: true },
     { key: 'der', label: 'DER', labels: ['DER'], percent: false },
     { key: 'debt_to_capital', label: 'Debt to Capital', labels: ['DEBT TO CAPITAL RATIO'], percent: true },
     { key: 'icr', label: 'Times Interest Earned', labels: ['TIMES INTEREST EARNED'], percent: false },
     { key: 'current_ratio', label: 'Current Ratio', labels: ['CURRENT RATIO'], percent: false },
     { key: 'quick_ratio', label: 'Quick Ratio', labels: ['QUICK RATIO'], percent: false },
     { key: 'cash_ratio', label: 'Cash Ratio', labels: ['CASH RATIO'], percent: false },
     { key: 'tato', label: 'TATO', labels: ['TATO'], percent: false },
     { key: 'inventory_turnover', label: 'Inventory Turnover', labels: ['INVENTORY TURN OVER'], percent: false },
     { key: 'receivable_turnover', label: 'Receivable Turnover', labels: ['RECEIVABLE TURNOVER'], percent: false }
];

const MISSING_WARN = {
     arus_kas_operasional: 'Arus Kas Operasional tidak tersedia di templat IDX — wajib diisi manual (dipakai untuk DSCR riil).',
     hpp: 'HPP tidak dapat dipetakan — GPM tidak akan dihitung.',
     piutang: 'Piutang kosong — Receivable Turnover tidak akan dihitung.',
     beban_bunga_lain: 'Beban Bunga Lain kosong (opsional).'
};

const KNOWN_LABELS = (() => {
     const set = new Set([
          'ACUAN', 'NO', 'KODE', 'TAHUN', 'TAHUN PERUSAHAAN',
          ...ID_COMPANY, ...ID_YEAR,
          ...DIRECT_FIELDS.flatMap(([, labels]) => labels),
          ...SUM_FIELDS.flatMap(([, labels]) => labels),
          ...SPREADING_FIELDS.flatMap(([, labels]) => labels),
          ...HPP_LABELS, ...GROSS_PROFIT_LABELS,
          ...RATIO_CHECKS.flatMap((c) => c.labels)
     ]);
     return set;
})();

// ——————————————————— util nilai ———————————————————

function truthy(v) {
     return v !== null && v !== undefined && String(v).trim() !== '';
}
function str(v) {
     return v === null || v === undefined ? '' : String(v).trim();
}
function numOrNull(v) {
     if (typeof v !== 'number' && typeof v !== 'string' || String(v).trim() === '') return null;
     const n = Number(v);
     return Number.isFinite(n) ? n : null;
}

// ——————————————————— indeks kolom ———————————————————

function findHeaderRow(rows) {
     const limit = Math.min(rows.length, 6);
     let best = -1;
     let bestScore = 0;
     for (let r = 0; r < limit; r++) {
          const row = rows[r] || [];
          let score = 0;
          for (const cell of row) if (KNOWN_LABELS.has(normalizeHeader(cell))) score++;
          if (score > bestScore) { bestScore = score; best = r; }
     }
     return bestScore >= 2 ? best : -1;
}

function buildColumns(sheets) {
     const columns = new Map();
     sheets.forEach((sheet, sheetIndex) => {
          const rows = sheet.rows || [];
          const headerRow = findHeaderRow(rows);
          if (headerRow < 0) return;
          (rows[headerRow] || []).forEach((cell, col) => {
               const label = normalizeHeader(cell);
               if (!label) return;
               if (!columns.has(label)) columns.set(label, []);
               columns.get(label).push({ sheetIndex, sheetName: sheet.name, headerRow, col, label });
          });
     });
     return columns;
}

function firstRef(columns, labels) {
     for (const label of labels) {
          const arr = columns.get(label);
          if (arr && arr.length) return arr[0];
     }
     return null;
}

function cellAt(sheets, ref, offset) {
     const sheet = sheets[ref.sheetIndex];
     const row = sheet && sheet.rows ? sheet.rows[ref.headerRow + 1 + offset] : null;
     if (!row) return null;
     const v = row[ref.col];
     return v === undefined ? null : v;
}

// ——————————————————— deteksi templat ———————————————————

/** Apakah workbook tampak seperti templat rasio IDX. */
export function detectTemplate(workbook) {
     const sheets = (workbook && workbook.sheets) || [];
     const names = new Set(sheets.map((s) => normalizeHeader(s.name)));
     const matched = RATIO_SHEETS.filter((n) => names.has(n));
     if (matched.length >= 2) return true;
     const columns = buildColumns(sheets);
     return columns.has('PENJUALAN DAN PENDAPATAN USAHA') && columns.has('JUMLAH ASET');
}

// ——————————————————— ekstraksi baris ———————————————————

function within(a, b, tol) {
     if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
     const abs = tol && tol.abs !== undefined ? tol.abs : 0.02;
     const rel = tol && tol.rel !== undefined ? tol.rel : 0.05;
     return Math.abs(a - b) <= Math.max(abs, rel * Math.abs(b));
}

function buildCheck(spec, expected, actual) {
     const variants = spec.percent ? [expected, expected / 100] : [expected];
     const ok = Number.isFinite(actual) && variants.some((v) => within(actual, v));
     return {
          key: spec.key,
          label: spec.label,
          expected,
          actual: Number.isFinite(actual) ? actual : null,
          ok,
          note: ok ? 'sesuai' : 'selisih definisi/format — verifikasi manual'
     };
}

function extractRow({ sheets, columns, idCols, offset }) {
     const keuangan = {};
     const mapped = [];
     const unmapped = [];
     const warnings = [];

     const put = (field, value, source) => {
          const n = numOrNull(value);
          if (n === null) return false;
          keuangan[field] = n;
          mapped.push({ field, value: n, source });
          return true;
     };

     const company = idCols.company ? str(cellAt(sheets, idCols.company, offset)) : '';
     const year = idCols.year ? numOrNull(cellAt(sheets, idCols.year, offset)) : null;

     for (const [field, labels] of DIRECT_FIELDS) {
          const ref = firstRef(columns, labels);
          if (!ref) { unmapped.push({ field, reason: 'kolom tidak ditemukan' }); continue; }
          if (!put(field, cellAt(sheets, ref, offset), ref.label)) {
               unmapped.push({ field, reason: 'sel kosong' });
          }
     }

     for (const [field, labels] of SUM_FIELDS) {
          const refs = labels.map((l) => firstRef(columns, [l])).filter(Boolean);
          if (!refs.length) { unmapped.push({ field, reason: 'kolom tidak ditemukan' }); continue; }
          let sum = null;
          for (const ref of refs) {
               const v = numOrNull(cellAt(sheets, ref, offset));
               if (v === null) continue;
               sum = (sum === null ? 0 : sum) + v;
          }
          if (sum === null) unmapped.push({ field, reason: 'sel kosong' });
          else put(field, sum, refs.map((r) => r.label).join(' + '));
     }

     // HPP: kolom eksplisit, atau turunan Penjualan − Laba Bruto.
     const hppRef = firstRef(columns, HPP_LABELS);
     if (hppRef && put('hpp', cellAt(sheets, hppRef, offset), hppRef.label)) {
          // ok
     } else {
          const gpRef = firstRef(columns, GROSS_PROFIT_LABELS);
          const gp = gpRef ? numOrNull(cellAt(sheets, gpRef, offset)) : null;
          const sales = numOrNull(keuangan.penjualan);
          if (gp !== null && sales !== null) {
               put('hpp', sales - gp, `${GROSS_PROFIT_LABELS[0]} (turunan)`);
               warnings.push('HPP dihitung sebagai Penjualan − Laba Bruto (kolom HPP eksplisit tidak tersedia).');
          } else {
               unmapped.push({ field: 'hpp', reason: 'kolom tidak ditemukan' });
          }
     }

     // Field spreading (opsional).
     for (const [field, labels] of SPREADING_FIELDS) {
          const ref = firstRef(columns, labels);
          const v = ref ? numOrNull(cellAt(sheets, ref, offset)) : null;
          if (v !== null) {
               keuangan[field] = v;
               mapped.push({ field, value: v, source: ref.label + ' (spreading)' });
          }
     }

     for (const [field, msg] of Object.entries(MISSING_WARN)) {
          if (keuangan[field] === undefined) warnings.push(msg);
     }

     // Cek silang rasio templat vs perhitungan aplikasi.
     const ratios = computeRatios(keuangan);
     const provided = {};
     const checks = [];
     for (const c of RATIO_CHECKS) {
          const ref = firstRef(columns, c.labels);
          if (!ref) continue;
          const raw = numOrNull(cellAt(sheets, ref, offset));
          if (raw === null) continue;
          provided[c.key] = raw;
          checks.push(buildCheck(c, raw, ratios[c.key]));
     }

     const label = company ? `${company}${year ? ' · ' + year : ''}` : `Baris ${offset + 1}`;
     return { index: offset, company, year, label, keuangan, provided, checks, warnings, mapped, unmapped };
}

function countDataRows(sheets, idCols, columns) {
     const anchor = idCols.company || idCols.year || firstRef(columns, ['PENJUALAN DAN PENDAPATAN USAHA']);
     if (!anchor) return 0;
     const sheet = sheets[anchor.sheetIndex];
     if (!sheet || !sheet.rows) return 0;
     let n = 0;
     for (let r = anchor.headerRow + 1; r < sheet.rows.length; r++) {
          const row = sheet.rows[r] || [];
          const hasCompany = idCols.company ? truthy(row[idCols.company.col]) : false;
          const hasYear = idCols.year ? truthy(row[idCols.year.col]) : false;
          if (!hasCompany && !hasYear) break;
          n++;
     }
     return n;
}

/**
 * Parse templat rasio IDX menjadi daftar baris keuangan ternormalisasi.
 * @param {{ sheets: Array<{name:string, rows:Array<Array<any>>}> }} workbook
 * @param {{ rows?: number[]|null }} [options]
 */
export function parseIdxRatioTemplate(workbook, { rows = null } = {}) {
     const sheets = (workbook && workbook.sheets) || [];
     const columns = buildColumns(sheets);
     const idCols = {
          company: firstRef(columns, ID_COMPANY),
          year: firstRef(columns, ID_YEAR)
     };
     const count = countDataRows(sheets, idCols, columns);
     const indices = rows === null
          ? Array.from({ length: count }, (_, i) => i)
          : rows.filter((i) => Number.isInteger(i) && i >= 0);
     const results = indices.map((i) => extractRow({ sheets, columns, idCols, offset: i }));
     return {
          template: detectTemplate(workbook),
          sheetsFound: sheets.map((s) => s.name),
          count,
          rows: results
     };
}

/** Ubah satu baris hasil parse menjadi patch yang dapat diterapkan ke draft. */
export function toBorrowerPatch(row) {
     const keuangan = { ...((row && row.keuangan) || {}) };
     const meta = {};
     if (row && row.company) meta.nama = row.company;
     if (row && row.year !== null && row.year !== undefined) meta.tahun = row.year;
     return { keuangan, meta };
}

export default { normalizeHeader, detectTemplate, parseIdxRatioTemplate, toBorrowerPatch };
