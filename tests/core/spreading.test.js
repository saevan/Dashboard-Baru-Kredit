/**
 * tests/spreading.test.js — Financial statement spreading (pra-rasio).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spreadFinancials, commonSize } from '../../src/core/spreading.js';
import { runFullAnalysis, emptyBorrower } from '../../src/core/engine.js';

const base = {
     total_aset: 5_000_000_000,
     aset_lancar: 2_000_000_000,
     kas: 500_000_000,
     piutang: 700_000_000,
     persediaan: 800_000_000,
     liabilitas_jangka_pendek: 1_000_000_000,
     total_liabilitas: 2_000_000_000,
     ekuitas: 3_000_000_000,
     penjualan: 6_000_000_000,
     hpp: 4_200_000_000,
     ebit: 400_000_000,
     laba_bersih: 200_000_000,
     arus_kas_operasional: 500_000_000
};

test('spreading: tanpa field penyesuaian → adjusted identik & changed=false', () => {
     const s = spreadFinancials(base, {});
     assert.equal(s.changed, false);
     assert.deepEqual(s.adjusted, base);
     assert.equal(s.adjustments.length, 0);
     assert.equal(s.impact.current_ratio_before, s.impact.current_ratio_after);
});

test('spreading: kas dibatasi & piutang related-party keluar dari aset lancar', () => {
     const s = spreadFinancials(
          { ...base, restricted_cash: 100_000_000, related_party_receivables: 200_000_000 },
          {}
     );
     assert.equal(s.changed, true);
     // 2.0M − 100jt − 200jt = 1.7M
     assert.equal(s.adjusted.aset_lancar, 1_700_000_000);
     // kas likuid dikurangi restricted cash
     assert.equal(s.adjusted.kas, 400_000_000);
     // current ratio turun (2.0 → 1.7)
     assert.equal(s.impact.current_ratio_before, 2);
     assert.ok(Math.abs(s.impact.current_ratio_after - 1.7) < 1e-9);
     assert.equal(s.adjustments.length, 2);
});

test('spreading: utang related-party jangka panjang → liabilitas jangka pendek', () => {
     const s = spreadFinancials({ ...base, related_party_debt_lt: 300_000_000 }, {});
     assert.equal(s.changed, true);
     assert.equal(s.adjusted.liabilitas_jangka_pendek, 1_300_000_000);
     assert.ok(s.impact.current_ratio_after < s.impact.current_ratio_before);
});

test('spreading: enabled=false menonaktifkan seluruh penyesuaian', () => {
     const s = spreadFinancials(
          { ...base, restricted_cash: 100_000_000, related_party_debt_lt: 50_000_000 },
          { config: { spreading: { enabled: false } } }
     );
     assert.equal(s.changed, false);
     assert.equal(s.adjusted.aset_lancar, base.aset_lancar);
     assert.equal(s.adjusted.liabilitas_jangka_pendek, base.liabilitas_jangka_pendek);
});

test('spreading: tidak menghasilkan aset lancar negatif', () => {
     const s = spreadFinancials(
          { ...base, aset_lancar: 50_000_000, restricted_cash: 90_000_000 },
          {}
     );
     assert.equal(s.adjusted.aset_lancar, 0);
});

test('commonSize: % penjualan & % total aset', () => {
     const cs = commonSize(base);
     assert.ok(Math.abs(cs.pct_of_sales.ebit - 400_000_000 / 6_000_000_000) < 1e-9);
     assert.ok(Math.abs(cs.pct_of_assets.aset_lancar - 0.4) < 1e-9);
     assert.equal(cs.basis.penjualan, 6_000_000_000);
});

test('commonSize: pembagi nol → null (bukan Infinity)', () => {
     const cs = commonSize({ penjualan: 0, total_aset: 0 });
     assert.equal(cs.pct_of_sales.ebit, null);
     assert.equal(cs.pct_of_assets.kas, null);
});

function sampleBorrower() {
     const b = emptyBorrower();
     Object.assign(b, {
          nama: 'PT Uji Spreading',
          sektor: 'IDX-CONSUMER-NON-CYCLICALS',
          profil_company: 'ukm_mapan',
          plafon_diajukan: 1_000_000_000,
          tenor_bulan: 36,
          bunga_tahunan: 0.14
     });
     b.keuangan = {
          ...b.keuangan,
          penjualan: 6_000_000_000,
          hpp: 4_200_000_000,
          ebit: 400_000_000,
          laba_bersih: 200_000_000,
          beban_bunga: 80_000_000,
          total_aset: 5_000_000_000,
          aset_lancar: 2_000_000_000,
          liabilitas_jangka_pendek: 1_000_000_000,
          total_liabilitas: 2_000_000_000,
          ekuitas: 3_000_000_000,
          kas: 500_000_000,
          piutang: 700_000_000,
          persediaan: 800_000_000,
          arus_kas_operasional: 500_000_000
     };
     return b;
}

test('engine: spreading no-op → spread terekspos & current ratio tak berubah', () => {
     const res = runFullAnalysis(sampleBorrower());
     assert.equal(res.spread.changed, false);
     assert.ok(res.spread.common_size);
     assert.equal(res.meta.snapshot.spreading.enabled, true);
});

test('engine: restricted cash menurunkan current ratio riil', () => {
     const base = runFullAnalysis(sampleBorrower());
     const withRestricted = sampleBorrower();
     withRestricted.keuangan.restricted_cash = 300_000_000;
     const adj = runFullAnalysis(withRestricted);
     assert.equal(adj.spread.changed, true);
     assert.ok(adj.ratios.current_ratio < base.ratios.current_ratio);
     assert.equal(adj.spread.impact.aset_lancar.after, 1_700_000_000);
});
