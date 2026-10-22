import test from 'node:test';
import assert from 'node:assert/strict';
import { applyStressCap } from '../../src/core/eligibility.js';
import { runFullAnalysis } from '../../src/core/engine.js';
import { assessOffer, buildOfferOptions, profitShareYield } from '../../src/core/offer.js';

const stress = (passed, total = 8) => ({ passed, failed: total - passed, survival_rate: passed / total, scenarios: Array.from({ length: total }, (_, i) => ({ id: `S${i + 1}` })) });
const decision = (key) => ({ decision: key, decision_label: key, soft_notes: [], reasons: [], conditions: ['DSCR ≥ 1,3'] });

test('stress test caps very fragile approvals at REVIEW but never upgrades or touches resilient cases', () => {
     const capped = applyStressCap(decision('LAYAK'), stress(2));
     assert.equal(capped.decision, 'REVIEW');
     assert.equal(capped.stress_capped, true);
     assert.match(capped.soft_notes.at(-1).message, /2\/8 skenario tahan .*maksimal REVIEW/);
     assert.deepEqual(capped.conditions, []);
     assert.equal(applyStressCap(decision('LAYAK_BERSYARAT'), stress(1)).decision, 'REVIEW');
     assert.equal(applyStressCap(decision('LAYAK'), stress(3)).decision, 'LAYAK', '37,5% is the threshold, not below it');
     assert.equal(applyStressCap(decision('TIDAK_LAYAK'), stress(0)).decision, 'TIDAK_LAYAK');
     assert.equal(applyStressCap(decision('LAYAK'), { scenarios: [] }).decision, 'LAYAK', 'no scenarios → no cap');
});

const borrower = {
     nama: 'Uji metodologi', profil_company: 'ukm_mapan', plafon_diajukan: 500e6, tenor_bulan: 36, bunga_tahunan: .14, skema_angsuran: 'flat',
     keuangan: { penjualan: 5e9, ebit: 1e9, laba_bersih: 800e6, arus_kas_operasional: 1e9, total_aset: 2e9, total_liabilitas: 500e6, ekuitas: 1.5e9,
          aset_lancar: 1e9, liabilitas_jangka_pendek: 300e6, beban_bunga: 50e6 },
     agunan: { nilai_agunan: 600e6, jenis: 'tanah_bangunan', personal_guarantee: false },
     bisnis_manajemen: { skor_model_bisnis: 1, posisi_pasar: 1, skalabilitas: 1, ketergantungan: 1, tren_keuangan: 1, pengalaman_tim: 1, track_record_tahun: 10,
          rekam_jejak_bayar: 1, tata_kelola: 1, skor_industri_risk: 1, prospek_industri: 1, sensitivitas_makro: 1, ocf_positif: 1, cash_runway_bulan: 12 }
};

test('engine: stress test runs before downstream steps; EAD is the full plafon; lifetime EL and discounted LGD are reported', () => {
     const r = runFullAnalysis(borrower);
     assert.equal(r.decision.stress_capped, false);
     assert.equal(r.stress.limits_decision, false);
     assert.equal(r.risk.ead.ccf, 1);
     assert.equal(r.risk.ead.ead, 500e6);
     assert.ok(r.risk.loss.el_lifetime_amount > r.risk.loss.el_amount);
     assert.equal(r.risk.lgd.recovery_months, 18);
     assert.ok(r.risk.lgd.lgd > .05, '600 jt land for 500 jt no longer counts as full immediate cover');
     assert.equal(r.stress.scenarios.find((s) => s.id === 'S5').aging_piutang_hari, 60, 'S5 "+60 hari" is applied');
});

test('profit-share offers are checked against the risk break-even rate', () => {
     assert.equal(profitShareYield({ tenor_bulan: 12, total_interest: 24e6 }, 120e6), .2);
     assert.equal(profitShareYield({ tenor_bulan: 0, total_interest: 1 }, 1), null);
     const result = runFullAnalysis(borrower);
     const amount = buildOfferOptions(result, borrower).recommended.amount;
     const base = { result, borrower: structuredClone(borrower), gate: { pass: true, confidence_ok: true, min_grade_index: 9 }, amount, rate: 0, basis: 'net_profit' };
     const thin = assessOffer({ ...base, share_ratio: .01 });
     assert.ok(thin.assessment.profit_share_yield < thin.assessment.risk.pricing.breakeven_rate);
     assert.ok(thin.assessment.reasons.some((r) => /Proyeksi bagi hasil setara .* di bawah titik impas/.test(r)), JSON.stringify(thin.assessment.reasons));
     const fair = assessOffer({ ...base, share_ratio: .5 });
     assert.ok(fair.assessment.profit_share_yield > fair.assessment.risk.pricing.breakeven_rate);
     assert.equal(fair.assessment.reasons.some((r) => /Proyeksi bagi hasil/.test(r)), false);
});
