/**
 * tests/engine.test.js — Smoke test orkestrasi runFullAnalysis + benchmark asli.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { runFullAnalysis, emptyBorrower, summarize } from '../../src/core/engine.js';
import { INDUSTRY_BENCHMARK } from '../../src/data/industries.js';
import { COMPANY_PROFILES } from '../../src/data/company-profiles.js';
import { DEFAULT_CONFIG } from '../../src/core/config.js';

const borrower = {
     nama: 'PT Uji Analisis',
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

test('engine: runFullAnalysis menghasilkan struktur lengkap', () => {
     const res = runFullAnalysis(borrower, { benchmarkData: INDUSTRY_BENCHMARK, profiles: COMPANY_PROFILES });

     assert.ok(res.ratios.dscr !== null);
     assert.ok(res.finalScore >= 0 && res.finalScore <= 100);
     assert.equal(res.pillars.length, 6);
     assert.ok(['LAYAK', 'LAYAK_BERSYARAT', 'REVIEW', 'TIDAK_LAYAK'].includes(res.decision.decision));
     assert.ok(res.nominal.recommended_nominal >= 0);
     assert.ok(res.risk.rating >= 1 && res.risk.rating <= 10);
     assert.ok(res.benchmark.items.length > 0);
     assert.ok(res.coverage > 0 && res.coverage <= 1);
});

test('engine: tanpa benchmark tidak crash', () => {
     const res = runFullAnalysis(borrower, { benchmarkData: null, profiles: COMPANY_PROFILES });
     assert.ok(res.finalScore >= 0);
     assert.equal(res.benchmark.items.length, 0);
});

test('engine: hard rule DSCR rendah → TIDAK_LAYAK', () => {
     const bad = JSON.parse(JSON.stringify(borrower));
     bad.keuangan.ebit = 100_000_000; // DSCR < 1
     const res = runFullAnalysis(bad, { benchmarkData: INDUSTRY_BENCHMARK, profiles: COMPANY_PROFILES });
     assert.equal(res.decision.decision, 'TIDAK_LAYAK');
});

test('engine: emptyBorrower() punya struktur yang dibutuhkan form', () => {
     const b = emptyBorrower();
     assert.ok(b.keuangan && b.bisnis_manajemen && b.agunan);
     assert.ok('plafon_diajukan' in b && 'sektor' in b && 'profil_company' in b);
});

test('engine: summarize() meringkas hasil', () => {
     const res = runFullAnalysis(borrower, { benchmarkData: INDUSTRY_BENCHMARK, profiles: COMPANY_PROFILES });
     const s = summarize(res);
     assert.equal(s.nama, 'PT Uji Analisis');
     assert.ok(s.decision_label);
     assert.ok(Number.isFinite(s.finalScore));
});

test('engine passes numeric 12-month PD to rating, and applies its cap independently of score', () => {
     const normal = runFullAnalysis(borrower);
     assert.equal(normal.risk.pefindo.pd,normal.credit.pd.pd_12m);
     const config=structuredClone(DEFAULT_CONFIG);
     config.pd.anchors=[[0,.4],[100,.4]];
     const highPd=runFullAnalysis(borrower,{config});
     assert.ok(highPd.finalScore>56);
     assert.ok(highPd.credit.pd.pd_12m>=.35);
     assert.equal(highPd.risk.pefindo.grade,'idCCC');
     assert.ok(highPd.risk.pefindo.caps.some(c=>c.source==='PD'));
     assert.equal(highPd.finalScore,normal.finalScore);
});
