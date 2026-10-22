/**
 * tests/pd.test.js — Skor → PD, LGD, EAD, Expected Loss, dan risk-based pricing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
     interpolatePd,
     scoreToPd,
     lgdFromCollateral,
     eadFromFacility,
     expectedLoss,
     riskBasedPricing,
     creditRiskModel
} from '../../src/core/pd.js';
import { DEFAULT_CONFIG } from '../../src/core/config.js';

function closeTo(actual, expected, tol = 1e-6, msg = '') {
     assert.ok(
          Math.abs(actual - expected) <= tol,
          `${msg} — diharapkan ≈ ${expected}, diperoleh ${actual}`
     );
}

test('pd: interpolatePd monoton turun & di-clamp di tepi anchor', () => {
     const anchors = [
          [90, 0.0035],
          [75, 0.0165],
          [60, 0.06]
     ];
     assert.equal(interpolatePd(95, anchors), 0.0035, 'di atas anchor tertinggi');
     assert.equal(interpolatePd(90, anchors), 0.0035);
     assert.equal(interpolatePd(60, anchors), 0.06);
     assert.equal(interpolatePd(30, anchors), 0.06, 'di bawah anchor terendah');

     const mid = interpolatePd(67.5, anchors);
     assert.ok(mid > 0.0165 && mid < 0.06, 'interpolasi log-linear di antara anchor');
     assert.ok(interpolatePd(80, anchors) < interpolatePd(65, anchors), 'PD naik saat skor turun');
});

test('pd: interpolatePd tanpa anchor mengembalikan fallback', () => {
     assert.equal(interpolatePd(70, []), 0.06);
});

test('pd: scoreToPd — skor lebih tinggi → PD lebih rendah & lifetime ≥ 12 bulan', () => {
     const good = scoreToPd({ score: 85 });
     const bad = scoreToPd({ score: 50 });
     assert.ok(good.pd_12m < bad.pd_12m);
     assert.ok(good.pd_lifetime >= good.pd_12m);
     assert.equal(good.horizon_bulan, 12);
     assert.ok(good.pd_12m >= DEFAULT_CONFIG.pd.floor && good.pd_12m <= DEFAULT_CONFIG.pd.cap);
});

test('pd: scoreToPd menerapkan multiplier profil & sektor', () => {
     const base = scoreToPd({ score: 70 });
     const startup = scoreToPd({ score: 70, profileKey: 'startup' });
     const health = scoreToPd({ score: 70, sectorKey: 'IDX-HEALTHCARE' });

     assert.equal(startup.profile_multiplier, 1.35);
     assert.equal(health.sector_multiplier, 0.9);
     assert.ok(startup.pd_12m > base.pd_12m, 'startup lebih berisiko');
     assert.ok(health.pd_12m < base.pd_12m, 'healthcare lebih defensif');
});

test('pd: coverage rendah menaikkan PD via penalti kualitas data', () => {
     const full = scoreToPd({ score: 70, coverage: 1 });
     const low = scoreToPd({ score: 70, coverage: 0.3 });
     assert.equal(full.coverage_penalty, 1);
     assert.ok(low.coverage_penalty > 1);
     assert.ok(low.pd_12m > full.pd_12m);
});

test('pd: tenor lebih panjang menaikkan PD lifetime (dibatasi cap)', () => {
     const short = scoreToPd({ score: 70, tenorBulan: 12 });
     const long = scoreToPd({ score: 70, tenorBulan: 60 });
     assert.ok(long.pd_lifetime > short.pd_lifetime);
     assert.ok(long.pd_lifetime <= DEFAULT_CONFIG.pd.cap);
});

test('pd: LGD turun tajam bila agunan menutup plafon (haircut deposito 5%)', () => {
     const r = lgdFromCollateral({ nilaiAgunan: 100_000_000, jenis: 'deposito', plafon: 100_000_000 });
     assert.equal(r.haircut, 0.05);
     assert.equal(r.recovery_value, 95_000_000);
     assert.equal(r.coverage_ratio, 0.95);
     assert.equal(r.lgd, 0.05);
});

test('pd: personal guarantee menurunkan LGD sebesar uplift', () => {
     const plain = lgdFromCollateral({
          nilaiAgunan: 40_000_000,
          jenis: 'tanah_bangunan',
          plafon: 100_000_000
     });
     // 40 jt × (1 − 20%) didiskonto 18 bulan @12% → coverage ≈ 27%.
     const df = 1 / Math.pow(1.12, 18 / 12);
     closeTo(plain.coverage_ratio, 0.32 * df, 1e-6, 'coverage setelah diskonto waktu pemulihan');
     closeTo(plain.lgd, 1 - 0.32 * df, 1e-6, 'LGD tanpa PG');

     const pg = lgdFromCollateral({
          nilaiAgunan: 40_000_000,
          jenis: 'tanah_bangunan',
          plafon: 100_000_000,
          personalGuarantee: true
     });
     closeTo(pg.lgd, 1 - 0.32 * df - 0.05, 1e-6, 'PG mengurangi LGD 5 poin');
     assert.equal(pg.pg_uplift, 0.05);
});

test('pd: tanpa agunan LGD menyentuh cap; agunan berlebih menyentuh floor', () => {
     const none = lgdFromCollateral({ nilaiAgunan: 0, jenis: 'tanpa_agunan', plafon: 100_000_000 });
     assert.equal(none.lgd, DEFAULT_CONFIG.lgd.cap);

     const over = lgdFromCollateral({ nilaiAgunan: 500_000_000, jenis: 'deposito', plafon: 100_000_000 });
     assert.equal(over.coverage_ratio, 1, 'coverage dibatasi 100%');
     assert.equal(over.lgd, DEFAULT_CONFIG.lgd.floor);
});

test('pd: EAD memakai CCF default 1,0 (kredit berjangka cair penuh) dan bisa dioverride untuk revolving', () => {
     const def = eadFromFacility({ plafon: 200_000_000 });
     assert.equal(def.ccf, 1);
     assert.equal(def.ead, 200_000_000);

     const revolving = eadFromFacility({ plafon: 200_000_000, ccf: 0.75 });
     assert.equal(revolving.ead, 150_000_000);

     assert.equal(eadFromFacility({ plafon: 0 }).ead, 0);
});

test('pd: Expected Loss & Unexpected Loss dari PD × LGD × EAD', () => {
     const r = expectedLoss({ pd: 0.02, lgd: 0.5, ead: 100_000_000 });
     assert.equal(r.el_rate, 0.01);
     assert.equal(r.el_amount, 1_000_000);
     assert.ok(r.ul_rate > 0 && r.ul_amount > 0);
     assert.ok(r.ul_amount > r.el_amount, 'UL > EL pada PD rendah');
});

test('pd: pricing build-up = funding + EL + opex + modal + margin + premi tenor', () => {
     const r = riskBasedPricing({ pd: 0.02, lgd: 0.5, ul_rate: 0.07, tenorBulan: 24 });
     const b = r.build_up;

     assert.equal(b.funding_cost, DEFAULT_CONFIG.pricing.fundingCost);
     assert.equal(b.opex, DEFAULT_CONFIG.pricing.opexRate);
     assert.equal(b.target_margin, DEFAULT_CONFIG.pricing.targetMargin);
     closeTo(b.expected_loss, 0.01, 1e-9, 'porsi EL');
     closeTo(b.capital_charge, DEFAULT_CONFIG.pricing.capitalChargeRate * 0.07, 1e-9, 'beban modal');
     closeTo(b.tenor_spread, 0.0005 * 2, 1e-9, 'premi tenor 2 tahun');

     const sum =
          b.funding_cost + b.expected_loss + b.opex + b.capital_charge + b.target_margin + b.tenor_spread;
     closeTo(r.recommended_rate, sum, 1e-4, 'rekomendasi = jumlah build-up');
     assert.ok(r.breakeven_rate < r.recommended_rate);
     assert.equal(r.clamped, false);
     assert.ok(Number.isFinite(r.raroc));
});

test('pd: pricing dibatasi pada maxRate saat risiko ekstrem', () => {
     const high = riskBasedPricing({ pd: 0.45, lgd: 0.9, ul_rate: 0.5, tenorBulan: 120 });
     assert.equal(high.recommended_rate, DEFAULT_CONFIG.pricing.maxRate);
     assert.equal(high.clamped, true);
});

test('pd: creditRiskModel merangkai PD → LGD → EAD → EL → pricing', () => {
     const borrower = {
          plafon_diajukan: 500_000_000,
          tenor_bulan: 36,
          profil_company: 'ukm_mapan',
          sektor: 'IDX-ENERGY',
          agunan: { nilai_agunan: 700_000_000, jenis: 'tanah_bangunan', personal_guarantee: false }
     };
     const m = creditRiskModel({ score: 78, borrower, coverage: 0.9 });

     assert.ok(m.pd.pd_12m > 0);
     assert.ok(m.pd.pd_lifetime >= m.pd.pd_12m);
     assert.ok(m.lgd.lgd > 0 && m.lgd.lgd <= DEFAULT_CONFIG.lgd.cap);
     assert.equal(m.ead.ccf, 1);
     assert.equal(m.ead.ead, 500_000_000);
     closeTo(m.loss.el_lifetime_rate, m.pd.pd_lifetime * m.lgd.lgd, 1e-5, 'EL lifetime = PD lifetime × LGD');
     assert.ok(m.loss.el_lifetime_amount >= m.loss.el_amount, 'EL sepanjang tenor ≥ EL 12 bulan');
     closeTo(m.loss.el_rate, m.pd.pd_12m * m.lgd.lgd, 1e-5, 'EL rate = PD × LGD');
     assert.equal(m.loss.pd_lifetime, m.pd.pd_lifetime);
     assert.ok(m.pricing.recommended_rate >= DEFAULT_CONFIG.pricing.minRate);
     assert.ok(m.pricing.recommended_rate <= DEFAULT_CONFIG.pricing.maxRate);
});

test('pd: deposito dipulihkan segera (tanpa diskonto); tanah/bangunan didiskonto masa pemulihan', () => {
     const dep = lgdFromCollateral({ nilaiAgunan: 100_000_000, jenis: 'deposito', plafon: 100_000_000 });
     assert.equal(dep.recovery_months, 0);
     assert.equal(dep.discount_factor, 1);
     const land = lgdFromCollateral({ nilaiAgunan: 130_000_000, jenis: 'tanah_bangunan', plafon: 100_000_000 });
     assert.equal(land.recovery_months, 18);
     assert.ok(land.discount_factor < 1);
     // 130 jt × 0,8 = 104 jt nominal (dulu menutup penuh) → setelah diskonto ±87,7 jt: LGD ±12%, bukan floor 5%.
     closeTo(land.lgd, 1 - 104_000_000 * land.discount_factor / 100_000_000, 1e-6, 'LGD tanah setelah diskonto');
     assert.ok(land.lgd > DEFAULT_CONFIG.lgd.floor);
});
