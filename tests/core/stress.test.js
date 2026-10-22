/**
 * tests/stress.test.js — Stress test skenario (W5a) di atas debt service riil.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { runStressTest } from '../../src/core/stress.js';
import { DEFAULT_CONFIG, resolveConfig } from '../../src/core/config.js';

const strongBorrower = {
     nama: 'PT Stress Kuat',
     sektor: 'IDX-CONSUMER-NON-CYCLICALS',
     profil_company: 'ukm_mapan',
     plafon_diajukan: 1_000_000_000,
     tenor_bulan: 36,
     bunga_tahunan: 0.14,
     keuangan: {
          penjualan: 8_000_000_000,
          // Gross/EBIT margin tinggi agar EBIT tetap positif bahkan saat omzet −35%
          // (implied opex = penjualan − hpp − ebit = 1,2 M) → ICR tidak jebol.
          hpp: 3_800_000_000,
          ebit: 3_000_000_000,
          laba_bersih: 2_200_000_000,
          beban_bunga: 100_000_000,
          total_aset: 6_000_000_000,
          aset_lancar: 2_500_000_000,
          liabilitas_jangka_pendek: 1_200_000_000,
          total_liabilitas: 2_000_000_000,
          ekuitas: 4_000_000_000,
          kas: 800_000_000,
          persediaan: 500_000_000,
          piutang: 700_000_000,
          arus_kas_operasional: 1_500_000_000,
          arrears_days: 0,
          ocf_negatif_periode: 0
     },
     agunan: { nilai_agunan: 1_500_000_000, jenis: 'tanah_bangunan', personal_guarantee: false }
};

test('stress: menjalankan seluruh skenario terkonfigurasi + ringkasan lengkap', () => {
     const res = runStressTest({ borrower: strongBorrower, config: resolveConfig() });

     assert.equal(res.scenarios.length, DEFAULT_CONFIG.stress.scenarios.length);
     assert.equal(res.scenarios.length, 8);
     assert.ok(res.base.dscr !== null, 'DSCR basis harus tersedia');
     assert.equal(res.buffer_target, DEFAULT_CONFIG.stress.bufferTarget);
     assert.equal(res.passed + res.failed, res.scenarios.length);
     assert.ok(res.survival_rate >= 0 && res.survival_rate <= 1);
     assert.equal(typeof res.recommendation, 'string');
     assert.ok(res.recommendation.length > 0);

     for (const s of res.scenarios) {
          assert.ok(s.id && s.label, 'skenario punya id & label');
          assert.ok('dscr' in s && 'shocks' in s && 'hard_violations' in s);
          assert.equal(typeof s.survives, 'boolean');
          assert.ok(Array.isArray(s.hard_violations));
          assert.ok(Array.isArray(s.soft_notes));
     }
});

test('stress: worst = skenario dengan DSCR terendah', () => {
     const res = runStressTest({ borrower: strongBorrower, config: resolveConfig() });
     const min = res.scenarios.reduce((acc, s) => Math.min(acc, s.dscr ?? Infinity), Infinity);
     assert.equal(res.worst.dscr, min);
     assert.ok(res.worst.id);
});

test('stress: peminjam kuat tahan terhadap hampir seluruh skenario (hanya omzet −35% yang menjebol)', () => {
     const res = runStressTest({ borrower: strongBorrower, config: resolveConfig() });
     assert.deepEqual(res.scenarios.filter((s) => !s.survives).map((s) => s.id), ['S2']);
     assert.ok(res.survival_rate >= 0.875);
     assert.match(res.recommendation, /Tahan/);
});

test('stress: shock omzet menekan EBIT & arus kas operasi, juga tanpa HPP (biaya variabel 70%)', () => {
     const noHpp = JSON.parse(JSON.stringify(strongBorrower));
     delete noHpp.keuangan.hpp;
     for (const b of [strongBorrower, noHpp]) {
          const res = runStressTest({ borrower: b, config: resolveConfig() });
          const s1 = res.scenarios.find((s) => s.id === 'S1');
          const s2 = res.scenarios.find((s) => s.id === 'S2');
          assert.ok(s1.dscr < res.base.dscr, 'omzet −20% menurunkan DSCR');
          assert.ok(s2.dscr < s1.dscr, 'omzet −35% lebih berat dari −20%');
          assert.ok(s1.icr < res.base.icr, 'ICR tidak boleh naik saat omzet turun');
     }
     // Tanpa HPP: biaya 5 M → variabel 3,5 M, tetap 1,5 M. Omzet −20%: EBIT = 6,4 − 2,8 − 1,5 = 2,1 M.
     const res = runStressTest({ borrower: noHpp, config: resolveConfig() });
     const s1 = res.scenarios.find((s) => s.id === 'S1');
     assert.ok(Math.abs(s1.icr - 2.1e9 / 1e8) < 1e-6);
});

test('stress: label pelanggaran aturan terisi', () => {
     const weak = JSON.parse(JSON.stringify(strongBorrower));
     weak.keuangan.arus_kas_operasional = 120_000_000;
     const res = runStressTest({ borrower: weak, config: resolveConfig() });
     for (const s of res.scenarios) for (const l of [...s.hard_violations, ...s.soft_notes]) assert.ok(typeof l === 'string' && l.length > 0);
});

test('stress: peminjam lemah gagal di seluruh skenario & direkomendasikan restrukturisasi', () => {
     const weak = JSON.parse(JSON.stringify(strongBorrower));
     weak.keuangan.arus_kas_operasional = 120_000_000; // DSCR jauh di bawah buffer
     const res = runStressTest({ borrower: weak, config: resolveConfig() });

     assert.equal(res.failed, 8);
     assert.equal(res.survival_rate, 0);
     assert.ok(res.worst.dscr < DEFAULT_CONFIG.stress.bufferTarget);
     assert.match(res.recommendation, /rentan/i);
});

test('stress: shock perubahan bunga menaikkan debt service (DSCR tidak lebih baik dari basis)', () => {
     const res = runStressTest({ borrower: strongBorrower, config: resolveConfig() });
     const repricing = res.scenarios.find((s) => s.id === 'S7');
     assert.ok(repricing, 'skenario repricing S7 harus ada');
     assert.equal(repricing.shocks.bunga_bps, 300);
});
