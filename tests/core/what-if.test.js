/**
 * tests/what-if.test.js — Simulator What-If (F-14) + jadwal amortisasi (F-15).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
     applyWhatIf,
     compareScenario,
     scenarioSnapshot,
     dscrOf,
     amortization,
     amortizationForBorrower,
     maxPlafonForDscr
} from '../../src/core/what-if.js';
import { INDUSTRY_BENCHMARK } from '../../src/data/industries.js';
import { COMPANY_PROFILES } from '../../src/data/company-profiles.js';

const BORROWER = {
     nama: 'PT Simulasi',
     sektor: 'IDX-BASIC-MATERIALS',
     profil_company: 'ukm_mapan',
     plafon_diajukan: 1_000_000_000,
     tenor_bulan: 36,
     bunga_tahunan: 0.14,
     keuangan: {
          ebit: 1_200_000_000,
          laba_bersih: 600_000_000,
          penjualan: 5_000_000_000,
          beban_bunga: 90_000_000,
          beban_bunga_lain: 50_000_000,
          total_aset: 4_000_000_000,
          aset_lancar: 1_500_000_000,
          liabilitas_jangka_pendek: 1_034_000_000,
          total_liabilitas: 1_534_000_000,
          ekuitas: 2_466_000_000,
          kas: 300_000_000,
          persediaan: 400_000_000,
          piutang: 500_000_000,
          arus_kas_operasional: 700_000_000,
          arrears_days: 0,
          ocf_negatif_periode: 0
     },
     bisnis_manajemen: {
          skor_model_bisnis: 0.7, skor_manajemen: 0.8, skor_industri_risk: 0.6,
          track_record_tahun: 8, cash_runway_bulan: 6,
          posisi_pasar: 0.7, skalabilitas: 0.7, ketergantungan: 0.7,
          pengalaman_tim: 0.8, rekam_jejak_bayar: 0.8, tata_kelola: 0.7,
          tren_keuangan: 0.7, ocf_positif: 1, prospek_industri: 0.6, sensitivitas_makro: 0.6
     },
     agunan: { nilai_agunan: 1_500_000_000, jenis: 'tanah_bangunan', personal_guarantee: false }
};

const OPTS = { benchmarkData: INDUSTRY_BENCHMARK, profiles: COMPANY_PROFILES };

test('applyWhatIf memetakan alias, mengabaikan null, & tidak memutasi aslinya', () => {
     const out = applyWhatIf(BORROWER, {
          plafon: 2_000_000_000,
          tenorBulan: 48,
          bungaTahunan: null,
          skemaAngsuran: 'flat'
     });
     assert.equal(out.plafon_diajukan, 2_000_000_000);
     assert.equal(out.tenor_bulan, 48);
     assert.equal(out.bunga_tahunan, 0.14, 'null diabaikan → nilai awal dipertahankan');
     assert.equal(out.skema_angsuran, 'flat');
     assert.equal(BORROWER.plafon_diajukan, 1_000_000_000, 'borrower asal tidak berubah');
     assert.equal(BORROWER.tenor_bulan, 36);
});

test('amortization anuitas: pokok terlunasi penuh, tenor = jumlah baris, bunga > 0', () => {
     const a = amortization({ principal: 120_000_000, annualRate: 0.12, tenorBulan: 24, scheme: 'annuity' });
     assert.equal(a.schedule.length, 24);
     const sumPrincipal = a.schedule.reduce((s, x) => s + x.principal, 0);
     assert.ok(Math.abs(sumPrincipal - 120_000_000) < 1, `pokok = ${sumPrincipal}`);
     assert.ok(a.total_interest > 0);
     assert.ok(a.total_payment > 120_000_000);
     assert.ok(a.interest_ratio > 0 && a.interest_ratio < 1);
});

test('amortization bullet: balloon = pokok & pokok dibayar di bulan terakhir', () => {
     const a = amortization({ principal: 100_000_000, annualRate: 0.12, tenorBulan: 12, scheme: 'bullet' });
     assert.equal(a.balloon, 100_000_000);
     const last = a.schedule[a.schedule.length - 1];
     assert.equal(last.principal, 100_000_000);
     assert.ok(a.schedule.slice(0, -1).every((x) => x.principal === 0));
});

test('amortization pokok 0 → jadwal kosong & total 0', () => {
     const a = amortization({ principal: 0, annualRate: 0.12, tenorBulan: 12 });
     assert.equal(a.schedule.length, 0);
     assert.equal(a.total_payment, 0);
     assert.equal(a.total_interest, 0);
});

test('amortizationForBorrower memakai field borrower + override', () => {
     const a = amortizationForBorrower(BORROWER);
     assert.equal(a.principal, 1_000_000_000);
     assert.equal(a.tenor_bulan, 36);
     const b = amortizationForBorrower(BORROWER, { plafon: 500_000_000, tenorBulan: 12 });
     assert.equal(b.principal, 500_000_000);
     assert.equal(b.tenor_bulan, 12);
});

test('compareScenario tanpa perubahan → delta nol', () => {
     const cmp = compareScenario(BORROWER, {}, OPTS);
     assert.equal(cmp.delta.score, 0);
     assert.equal(cmp.delta.dscr, 0);
     assert.equal(cmp.scenario.decision, cmp.base.decision);
     assert.ok(cmp.scenario.finalScore >= 0);
});

test('compareScenario plafon naik → DSCR & skor tidak membaik', () => {
     const cmp = compareScenario(BORROWER, { plafon: 2_000_000_000 }, OPTS);
     assert.ok(cmp.scenario.dscr < cmp.base.dscr, `DSCR turun (${cmp.scenario.dscr} < ${cmp.base.dscr})`);
     assert.ok(cmp.delta.dscr < 0);
     assert.ok(cmp.scenario.total_annual_ds > cmp.base.total_annual_ds);
     assert.equal(typeof cmp.scenario.decision, 'string');
     assert.ok(cmp.scenario.monthly_installment > cmp.base.monthly_installment);
});

test('maxPlafonForDscr menghormati target DSCR & kelipatan pembulatan', () => {
     const res = maxPlafonForDscr(BORROWER, { ...OPTS, targetDscr: 1.2 });
     assert.ok(res.recommended > 0);
     assert.equal(res.recommended % 50_000_000, 0, 'kelipatan Rp 50 juta');
     assert.ok(
          res.dscr_at_recommended >= res.target_dscr - 1e-6,
          `DSCR di rekomendasi (${res.dscr_at_recommended}) ≥ target (${res.target_dscr})`
     );
});

test('maxPlafonForDscr: agunan kecil → binding LTV', () => {
     const b = { ...BORROWER, agunan: { ...BORROWER.agunan, nilai_agunan: 100_000_000 } };
     const res = maxPlafonForDscr(b, { ...OPTS, targetDscr: 1.2 });
     assert.equal(res.binding, 'ltv');
     assert.equal(res.ltv_based, 75_000_000, '100jt × 75% LTV');
     assert.equal(res.recommended, 50_000_000, 'dibulatkan ke bawah Rp 50 juta');
});

test('scenarioSnapshot & dscrOf menangani input kosong', () => {
     assert.equal(scenarioSnapshot(null), null);
     assert.equal(dscrOf(null), null);
     assert.equal(dscrOf({}), null);
});
