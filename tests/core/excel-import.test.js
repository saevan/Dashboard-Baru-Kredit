/**
 * tests/excel-import.test.js — Pemetaan templat rasio IDX → skema keuangan.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
     normalizeHeader,
     detectTemplate,
     parseIdxRatioTemplate,
     toBorrowerPatch
} from '../../src/core/excel-import.js';

const profitabilitas = {
     name: 'PROFITABILITAS',
     rows: [
          ['ACUAN', 'NO', 'KODE', 'NAMA PERUSAHAAN', 'TAHUN', 'Penjualan dan pendapatan usaha',
               'Jumlah laba bruto', 'Jumlah laba (rugi) dari operasi yang dilanjutkan',
               'Jumlah laba rugi komprehensif', 'Jumlah aset', 'Jumlah ekuitas',
               'GPM', 'OPM', 'NPM', 'ROA', 'ROE'],
          ['X', 1, 'ABCD', 'PT Contoh', 2024, 6000, 1800, 400, 200, 5000, 3000, 0.3, 0.0667, 0.0333, 0.04, 0.0667],
          ['X', 2, 'ABCD', 'PT Contoh', 2023, 5000, 1500, 300, 150, 4500, 2800, 30, 0.06, 0.03, 0.0333, 0.0536]
     ]
};

const solvabilitas = {
     name: 'SOLVABILITAS',
     rows: [
          ['Jumlah Liabilitas', 'Jumlah aset', 'Jumlah ekuitas', 'Beban bunga dan keuangan',
               'DAR', 'DER', 'TIMES INTEREST EARNED'],
          [2000, 5000, 3000, 100, 0.4, 0.6667, 4],
          [1700, 4500, 2800, 90, 0.3778, 0.6071, 3.3333]
     ]
};

const likuiditas = {
     name: 'LIKUIDITAS',
     rows: [
          ['Jumlah aset lancar', 'Kas dan setara kas', 'Piutang usaha pihak ketiga',
               'Piutang usaha pihak berelasi', 'Persediaan', 'Jumlah liabilitas jangka pendek',
               'CURRENT RATIO'],
          [2000, 500, 600, 100, 800, 1000, 2],
          [1800, 450, 500, 80, 700, 900, 2]
     ]
};

const workbook = { sheets: [profitabilitas, solvabilitas, likuiditas] };

test('excel-import: normalizeHeader merapikan spasi & huruf', () => {
     assert.equal(normalizeHeader('  Jumlah   Aset '), 'JUMLAH ASET');
     assert.equal(normalizeHeader(null), '');
});

test('excel-import: deteksi templat IDX', () => {
     assert.equal(detectTemplate(workbook), true);
     assert.equal(detectTemplate({ sheets: [{ name: 'Sheet1', rows: [['a', 'b']] }] }), false);
});

test('excel-import: pemetaan kolom → field keuangan', () => {
     const parsed = parseIdxRatioTemplate(workbook);
     assert.equal(parsed.template, true);
     assert.equal(parsed.count, 2);
     assert.equal(parsed.rows.length, 2);

     const r0 = parsed.rows[0];
     assert.equal(r0.company, 'PT Contoh');
     assert.equal(r0.year, 2024);
     assert.equal(r0.keuangan.penjualan, 6000);
     assert.equal(r0.keuangan.ebit, 400);
     assert.equal(r0.keuangan.laba_bersih, 200);
     assert.equal(r0.keuangan.total_aset, 5000);
     assert.equal(r0.keuangan.ekuitas, 3000);
     assert.equal(r0.keuangan.total_liabilitas, 2000);
     assert.equal(r0.keuangan.beban_bunga, 100);
     assert.equal(r0.keuangan.aset_lancar, 2000);
     assert.equal(r0.keuangan.kas, 500);
     assert.equal(r0.keuangan.piutang, 700); // 600 pihak ketiga + 100 berelasi
     assert.equal(r0.keuangan.persediaan, 800);
     assert.equal(r0.keuangan.liabilitas_jangka_pendek, 1000);
     assert.equal(r0.keuangan.hpp, 4200); // Penjualan − Laba Bruto
     assert.equal(r0.keuangan.related_party_receivables, 100); // spreading
     assert.equal(r0.keuangan.arus_kas_operasional, undefined);
});

test('excel-import: peringatan data yang tidak tersedia', () => {
     const r0 = parseIdxRatioTemplate(workbook).rows[0];
     assert.ok(r0.warnings.some((w) => /Arus Kas Operasional/.test(w)));
     assert.ok(r0.warnings.some((w) => /HPP dihitung/.test(w)));
});

test('excel-import: cek silang rasio templat vs computeRatios', () => {
     const r0 = parseIdxRatioTemplate(workbook).rows[0];
     const gpm = r0.checks.find((c) => c.key === 'gpm');
     assert.ok(gpm);
     assert.equal(gpm.expected, 0.3);
     assert.ok(Math.abs(gpm.actual - 0.3) < 1e-9);
     assert.equal(gpm.ok, true);
     const cr = r0.checks.find((c) => c.key === 'current_ratio');
     assert.equal(cr.ok, true);
     const der = r0.checks.find((c) => c.key === 'der');
     assert.equal(der.ok, true);

     // Baris 2 menyajikan GPM sebagai persen (30) → tetap dianggap sesuai.
     const r1 = parseIdxRatioTemplate(workbook).rows[1];
     const gpm1 = r1.checks.find((c) => c.key === 'gpm');
     assert.equal(gpm1.expected, 30);
     assert.equal(gpm1.ok, true);
});

test('excel-import: pilih baris tertentu via options.rows', () => {
     const parsed = parseIdxRatioTemplate(workbook, { rows: [1] });
     assert.equal(parsed.rows.length, 1);
     assert.equal(parsed.rows[0].year, 2023);
     assert.equal(parsed.rows[0].keuangan.penjualan, 5000);
});

test('excel-import: toBorrowerPatch menghasilkan patch + meta', () => {
     const r0 = parseIdxRatioTemplate(workbook).rows[0];
     const patch = toBorrowerPatch(r0);
     assert.equal(patch.meta.nama, 'PT Contoh');
     assert.equal(patch.meta.tahun, 2024);
     assert.equal(patch.keuangan.penjualan, 6000);
     assert.equal(patch.keuangan.total_aset, 5000);
});

test('excel-import: boolean and whitespace financial cells are not converted into Rupiah', () => {
     const parsed = parseIdxRatioTemplate({ sheets: [{ name: 'PROFITABILITAS', rows: [
          ['NAMA PERUSAHAAN', 'TAHUN', 'Penjualan dan pendapatan usaha', 'Jumlah aset', 'Jumlah ekuitas'],
          ['PT Uji', 2026, true, ' ', 0]
     ] }] });
     assert.equal(parsed.rows[0].keuangan.penjualan, undefined);
     assert.equal(parsed.rows[0].keuangan.total_aset, undefined);
     assert.equal(parsed.rows[0].keuangan.ekuitas, 0);
});
