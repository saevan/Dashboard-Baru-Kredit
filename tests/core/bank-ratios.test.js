/**
 * tests/bank-ratios.test.js — Tes template rasio khusus bank (NIM/NPL/CAR/...).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
     BANK_RATIOS,
     BANK_RATIO_KEYS,
     BANK_THRESHOLDS,
     BANK_SECTORS,
     computeBankRatios,
     bankRatioLevel,
     bankRatiosSummary,
     hasBankData,
     isBankSector,
     NPL_TIERS,
     nplTier,
     bankHealthScore
} from '../../src/core/bank-ratios.js';
import { runFullAnalysis, emptyBorrower } from '../../src/core/engine.js';

function closeTo(actual, expected, relTol = 1e-9, msg = '') {
     assert.ok(Number.isFinite(actual), `${msg} — nilai bukan angka: ${actual}`);
     const diff = Math.abs(actual - expected);
     const tol = Math.abs(expected) * relTol + 1e-12;
     assert.ok(diff <= tol, `${msg} — ${actual} ≠ ${expected}`);
}

/** Bank contoh yang sehat: NIM 6%, NPL gross 3%, CAR 16%, LDR 80%, CASA 50%. */
const bank = {
     pendapatan_bunga: 1_000_000_000,
     beban_bunga: 400_000_000,
     total_aset: 12_000_000_000,
     aset_produktif: 10_000_000_000,
     kredit_bermasalah: 30_000_000,
     total_kredit: 1_000_000_000,
     cadangan_kerugian: 45_000_000,
     modal: 200_000_000,
     atmr: 1_250_000_000,
     dana_pihak_ketiga: 1_250_000_000,
     giro: 200_000_000,
     tabungan: 425_000_000,
     beban_operasional: 700_000_000,
     pendapatan_operasional: 1_000_000_000,
     laba_bersih: 120_000_000,
     ekuitas: 1_500_000_000
};

test('bank-ratios: metadata konsisten (key unik, arah valid, ambang lengkap)', () => {
     assert.equal(BANK_RATIOS.length, BANK_RATIO_KEYS.length);
     assert.equal(new Set(BANK_RATIO_KEYS).size, BANK_RATIO_KEYS.length, 'key harus unik');
     for (const r of BANK_RATIOS) {
          assert.ok(['higher', 'lower', 'band'].includes(r.direction), `${r.key} arah valid`);
          assert.ok(r.label && r.unit === 'ratio', `${r.key} punya label & unit ratio`);
          assert.ok(BANK_THRESHOLDS[r.key], `${r.key} punya ambang`);
     }
});

test('bank-ratios: computeBankRatios menghitung NIM/NPL/CAR/LDR/CASA/BOPO', () => {
     const r = computeBankRatios(bank);
     closeTo(r.nim, 0.06, 1e-9, 'NIM');
     closeTo(r.npl_gross, 0.03, 1e-9, 'NPL gross');
     closeTo(r.npl_net, -0.015, 1e-9, 'NPL net');
     closeTo(r.npl_coverage, 1.5, 1e-9, 'NPL coverage');
     closeTo(r.car, 0.16, 1e-9, 'CAR');
     closeTo(r.ldr, 0.8, 1e-9, 'LDR');
     closeTo(r.casa, 0.5, 1e-9, 'CASA');
     closeTo(r.bopo, 0.7, 1e-9, 'BOPO');
     closeTo(r.roa_bank, 0.01, 1e-9, 'ROA bank');
     closeTo(r.roe_bank, 0.08, 1e-9, 'ROE bank');
});

test('bank-ratios: _basis menyimpan nilai mentah untuk audit', () => {
     const r = computeBankRatios(bank);
     assert.equal(r._basis.pendapatan_bunga_bersih, 600_000_000);
     assert.equal(r._basis.aset_produktif, 10_000_000_000);
     assert.equal(r._basis.atmr, 1_250_000_000);
     assert.equal(r._basis.dana_pihak_ketiga, 1_250_000_000);
});

test('bank-ratios: mendukung alias field bahasa Inggris', () => {
     const r = computeBankRatios({
          interest_income: 1_000_000_000,
          interest_expense: 400_000_000,
          earning_assets: 10_000_000_000,
          npl: 30_000_000,
          loans: 1_000_000_000,
          ckpn: 45_000_000,
          rwa: 1_250_000_000,
          tier1: 200_000_000,
          dpk: 1_250_000_000
     });
     closeTo(r.nim, 0.06, 1e-9, 'NIM alias');
     closeTo(r.npl_gross, 0.03, 1e-9, 'NPL alias');
     closeTo(r.car, 0.16, 1e-9, 'CAR alias');
     closeTo(r.npl_coverage, 1.5, 1e-9, 'coverage alias');
});

test('bank-ratios: field kosong → null, tanpa NaN/Infinity', () => {
     const r = computeBankRatios({});
     for (const key of BANK_RATIO_KEYS) {
          assert.equal(r[key], null, `${key} harus null saat data kosong`);
     }
     assert.ok(!Object.values(r).some((v) => typeof v === 'number' && !Number.isFinite(v)));
});

test('bank-ratios: NIM memakai total_aset bila aset_produktif tidak ada', () => {
     const r = computeBankRatios({
          pendapatan_bunga: 600_000_000,
          beban_bunga: 200_000_000,
          total_aset: 10_000_000_000
     });
     closeTo(r.nim, 0.04, 1e-9, 'NIM fallback total_aset');
});

test('bank-ratios: bankRatioLevel — higher/lower/band', () => {
     // higher: CAR
     assert.equal(bankRatioLevel('car', 0.16), 'good');
     assert.equal(bankRatioLevel('car', 0.1), 'warning');
     assert.equal(bankRatioLevel('car', 0.05), 'risk');
     // lower: NPL gross
     assert.equal(bankRatioLevel('npl_gross', 0.01), 'good');
     assert.equal(bankRatioLevel('npl_gross', 0.03), 'warning');
     assert.equal(bankRatioLevel('npl_gross', 0.08), 'risk');
     // band: LDR (ideal 78–92%)
     assert.equal(bankRatioLevel('ldr', 0.85), 'good');
     assert.equal(bankRatioLevel('ldr', 0.7), 'warning');
     assert.equal(bankRatioLevel('ldr', 0.5), 'risk');
     // tidak dikenal / nilai kosong
     assert.equal(bankRatioLevel('tidak_ada', 1), null);
     assert.equal(bankRatioLevel('car', null), null);
});

test('bank-ratios: bankRatiosSummary menghitung level & daftar terlemah', () => {
     const s = bankRatiosSummary(bank);
     assert.equal(s.items.length, BANK_RATIOS.length);
     assert.equal(s.riskCount, 0, 'tidak ada yang berisiko');
     // NPL gross 3% & ROA 1% marginal; ROE 8% tepat di batas bawah → perhatian.
     assert.equal(s.warningCount, 3, 'NPL gross, ROA, ROE masuk perhatian');
     const keys = s.worst.map((w) => w.key);
     assert.deepEqual(keys, ['npl_gross', 'roa_bank', 'roe_bank']);
     assert.ok(s.worst.every((w) => w.level === 'warning' || w.level === 'risk'));
});

test('bank-ratios: bankRatiosSummary menandai NPL tinggi & CAR rendah sebagai risk', () => {
     const s = bankRatiosSummary({
          kredit_bermasalah: 80_000_000,
          total_kredit: 1_000_000_000, // NPL 8%
          modal: 50_000_000,
          atmr: 1_000_000_000 // CAR 5%
     });
     // Tanpa cadangan: NPL net = NPL gross (8%) & coverage 0 → keduanya risk,
     // plus NPL gross & CAR. Total 4 rasio berisiko.
     assert.equal(s.riskCount, 4);
     const byKey = Object.fromEntries(s.items.map((i) => [i.key, i.level]));
     assert.equal(byKey.npl_gross, 'risk');
     assert.equal(byKey.npl_net, 'risk');
     assert.equal(byKey.npl_coverage, 'risk');
     assert.equal(byKey.car, 'risk');
});

test('bank-ratios: hasBankData mendeteksi kehadiran field khas bank', () => {
     assert.equal(hasBankData({}), false);
     assert.equal(hasBankData({ total_aset: 1_000_000 }), false);
     assert.equal(hasBankData({ npl: 0.03 }), true);
     assert.equal(hasBankData({ aset_produktif: 5_000_000 }), true);
     assert.equal(hasBankData({ interest_income: 1 }), true);
});

test('bank-ratios: isBankSector mengenali sektor keuangan & label bank', () => {
     assert.equal(isBankSector('IDX-FINANCIALS'), true);
     assert.equal(isBankSector('idx-financials'), true);
     assert.equal(isBankSector('Bank Umum'), true);
     assert.equal(isBankSector('Lembaga Keuangan'), true);
     assert.equal(isBankSector('IDX-BASIC-MATERIALS'), false);
     assert.equal(isBankSector(''), false);
     assert.equal(isBankSector(undefined), false);
     assert.ok(BANK_SECTORS.includes('IDX-FINANCIALS'));
});

test('bank-ratios: engine melampirkan template bank untuk sektor keuangan', () => {
     const b = emptyBorrower();
     b.sektor = 'IDX-FINANCIALS';
     Object.assign(b.keuangan, {
          pendapatan_bunga: 1_000_000_000,
          beban_bunga: 400_000_000,
          aset_produktif: 10_000_000_000,
          kredit_bermasalah: 30_000_000,
          total_kredit: 1_000_000_000,
          cadangan_kerugian: 45_000_000,
          modal: 200_000_000,
          atmr: 1_250_000_000,
          dana_pihak_ketiga: 1_250_000_000,
          total_aset: 12_000_000_000
     });
     b.plafon_diajukan = 500_000_000;
     b.tenor_bulan = 36;
     const r = runFullAnalysis(b);
     assert.ok(r.bank_ratios, 'bank_ratios tersedia untuk sektor keuangan');
     assert.equal(r.meta.bank_template, true);
     closeTo(r.bank_ratios.ratios.nim, 0.06, 1e-9, 'NIM via engine');
     closeTo(r.bank_ratios.ratios.car, 0.16, 1e-9, 'CAR via engine');
     assert.equal(r.bank_ratios.ratios.npl_gross, 0.03);
});

test('bank-ratios: engine tidak melampirkan template bank untuk non-bank', () => {
     const b = emptyBorrower();
     b.sektor = 'IDX-BASIC-MATERIALS';
     Object.assign(b.keuangan, {
          total_aset: 5_000_000_000,
          ekuitas: 2_000_000_000,
          penjualan: 4_000_000_000,
          laba_bersih: 300_000_000
     });
     b.plafon_diajukan = 500_000_000;
     b.tenor_bulan = 36;
     const r = runFullAnalysis(b);
     assert.equal(r.bank_ratios, undefined, 'tanpa template bank');
     assert.equal(r.meta.bank_template, false);
});

test('bank-ratios: NPL_TIERS 5 tingkat & nplTier memetakan batas OJK', () => {
     assert.equal(NPL_TIERS.length, 5);
     assert.equal(nplTier(0.015).code, 'P1');
     assert.equal(nplTier(0.03).code, 'P2');
     assert.equal(nplTier(0.06).code, 'P3');
     assert.equal(nplTier(0.10).code, 'P4');
     assert.equal(nplTier(0.15).code, 'P5');
     assert.equal(nplTier(0.15).key, 'tidak_sehat');
     assert.equal(nplTier(null), null);
     assert.match(nplTier(0.03).range_label, /2\.0% – 5\.0%/);
});

test('bank-ratios: bankHealthScore turun bila NPL tidak sehat & rasio berisiko', () => {
     const sehat = bankHealthScore({ items: [], npl_tier: { key: 'sangat_sehat' } });
     const sakit = bankHealthScore({
          items: [{ level: 'risk' }, { level: 'risk' }],
          npl_tier: { key: 'tidak_sehat' }
     });
     assert.ok(sehat.score >= sakit.score);
     assert.equal(sehat.label, 'Sehat');
     assert.equal(sakit.label, 'Berisiko');
     assert.equal(sakit.tone, 'risk');
});

test('bank-ratios: bankRatiosSummary melampirkan tingkat NPL & skor kesehatan', () => {
     const s = bankRatiosSummary(bank); // NPL gross 3% → P2
     assert.ok(s.npl_tier, 'npl_tier tersedia');
     assert.equal(s.npl_tier.code, 'P2');
     assert.equal(s.npl_tier.key, 'sehat');
     assert.ok(s.health && Number.isFinite(s.health.score), 'health tersedia');
});

test('bank-ratios: engine melampirkan tingkat NPL untuk lembaga keuangan', () => {
     const b = emptyBorrower();
     b.sektor = 'IDX-FINANCIALS';
     Object.assign(b.keuangan, {
          pendapatan_bunga: 1_000_000_000,
          beban_bunga: 400_000_000,
          aset_produktif: 10_000_000_000,
          kredit_bermasalah: 30_000_000,
          total_kredit: 1_000_000_000,
          cadangan_kerugian: 45_000_000,
          modal: 200_000_000,
          atmr: 1_250_000_000,
          dana_pihak_ketiga: 1_250_000_000,
          total_aset: 12_000_000_000
     });
     b.plafon_diajukan = 500_000_000;
     b.tenor_bulan = 36;
     const r = runFullAnalysis(b);
     assert.equal(r.bank_ratios.npl_tier.code, 'P2');
     assert.equal(r.segment.key, 'financial_institution');
});
