/**
 * tests/psak71-pojk40.test.js — Kolektibilitas POJK 40/2019 (contagion satu debitur,
 * PPKA) dan CKPN PSAK 71 (tahap, SICR, skenario makro), serta hurdle RAROC.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
     assessCollectibility,
     applyObligorContagion,
     classifyFacility,
     eclStage,
     facilityEcl,
     facilityPpka,
     scenarioPd,
     buildPortfolio
} from '../../src/core/portfolio.js';
import { riskBasedPricing, rarocAtRate } from '../../src/core/pd.js';
import { recommendNominal } from '../../src/core/nominal.js';
import { resolveConfig } from '../../src/core/config.js';

const cfg = resolveConfig();

const row = (id, extra = {}, monitoring = [], analysis = null) => ({
     borrower: { id, nama: `PT ${id}`, sektor: 'IDX-ENERGY', plafon_diajukan: 1_000_000_000, facility_status: 'aktif', outstanding: 1_000_000_000, ...extra },
     analysis,
     monitoring
});
const analysis = { decision: { decision: 'LAYAK' }, credit: { pd: { pd_12m: 0.02, pd_lifetime: 0.08 }, lgd: { lgd: 0.4, recovery_value: 300_000_000 }, loss: {} } };

test('POJK 40: sinyal EWS/covenant hanya menurunkan Lancar ke DPK, bukan NPL', () => {
     assert.equal(assessCollectibility({ daysLate: 0, ewsLevel: 'CRITICAL' }).key, 'dpk');
     assert.equal(assessCollectibility({ daysLate: 0, covenant: 'material' }).key, 'dpk');
     assert.equal(assessCollectibility({ daysLate: 0, ewsLevel: 'WATCH' }).key, 'lancar');
     assert.equal(assessCollectibility({ daysLate: 100, ewsLevel: 'NORMAL' }).key, 'kurang_lancar');
});

test('POJK 40: hari tunggakan dari form EWS (P11_days_late) terbaca oleh portofolio', () => {
     const f = classifyFacility(row('A', {}, [{ ews_level: 'NORMAL', params: { P11_days_late: 130 } }]), cfg);
     assert.equal(f.days_late, 130);
     assert.equal(f.collectibility, 'diragukan');
});

test('POJK 40: label tersimpan dipakai hanya bila hari tunggakan tidak tercatat', () => {
     const f = classifyFacility(row('A', {}, [{ ews_level: 'CRITICAL', collectibility: 'Macet' }]), cfg);
     assert.equal(f.collectibility, 'macet');
     assert.equal(f.collectibility_basis, 'tercatat');
});

test('POJK 40: satu debitur mengikuti fasilitas terburuk, kecuali ring-fenced', () => {
     const base = { obligor_key: 'id:01', ring_fenced: false };
     const list = [
          { ...base, id: 'KMK', nama: 'KMK', collectibility: 'lancar', collectibility_label: 'Lancar' },
          { ...base, id: 'KI', nama: 'KI', collectibility: 'lancar', collectibility_label: 'Lancar' },
          { ...base, id: 'OD', nama: 'Overdraft', collectibility: 'kurang_lancar', collectibility_label: 'Kurang Lancar' },
          { ...base, id: 'PRJ', nama: 'Proyek', collectibility: 'lancar', collectibility_label: 'Lancar', ring_fenced: true },
          { id: 'LAIN', nama: 'Debitur lain', obligor_key: 'id:02', collectibility: 'lancar' }
     ];
     const out = applyObligorContagion(list, cfg);
     assert.equal(out[0].collectibility, 'kurang_lancar');
     assert.equal(out[0].own_collectibility, 'lancar');
     assert.equal(out[0].contagion_from.id, 'OD');
     assert.equal(out[1].collectibility, 'kurang_lancar');
     assert.equal(out[2].contagion_from, undefined);
     assert.equal(out[3].collectibility, 'lancar', 'proyek dengan arus kas terpisah dikecualikan');
     assert.equal(out[4].collectibility, 'lancar');
});

test('PSAK 71: tahap dan pemicu SICR', () => {
     assert.equal(eclStage({ days_late: 0, collectibility: 'lancar' }, cfg).stage, 1);
     assert.equal(eclStage({ days_late: 31, collectibility: 'dpk' }, cfg).stage, 2);
     assert.equal(eclStage({ days_late: 0, collectibility: 'dpk', ews_level: 'WARNING' }, cfg).stage, 2);
     assert.equal(eclStage({ days_late: 0, collectibility: 'lancar', covenant: 'material' }, cfg).stage, 2);
     assert.equal(eclStage({ days_late: 0, collectibility: 'lancar', restructured: true }, cfg).stage, 2);
     assert.equal(eclStage({ days_late: 0, collectibility: 'lancar', rating_notches_down: 2 }, cfg).stage, 2);
     assert.equal(eclStage({ days_late: 0, collectibility: 'lancar', rating_notches_down: 1 }, cfg).stage, 1);
     assert.equal(eclStage({ days_late: 91, collectibility: 'kurang_lancar' }, cfg).stage, 3);
});

test('PSAK 71: ECL 12 bulan, seumur fasilitas, dan PD 100% di tahap 3', () => {
     const weighted = scenarioPd(0.02, cfg);
     assert.ok(Math.abs(weighted - (0.6 * 0.02 + 0.3 * 0.03 + 0.1 * 0.016)) < 1e-12);
     const f = { outstanding: 1_000_000_000, pd_12m: 0.02, pd_lifetime: 0.08, lgd: 0.4, days_late: 0, collectibility: 'lancar' };
     assert.equal(facilityEcl(f, cfg).ecl, Math.round(weighted * 0.4 * 1e9));
     const s2 = facilityEcl({ ...f, days_late: 45, collectibility: 'dpk' }, cfg);
     assert.equal(s2.stage, 2);
     assert.equal(s2.ecl, Math.round(scenarioPd(0.08, cfg) * 0.4 * 1e9));
     const s3 = facilityEcl({ ...f, days_late: 200, collectibility: 'macet' }, cfg);
     assert.equal(s3.ecl, Math.round(0.4 * 1e9));
     assert.equal(facilityEcl({ outstanding: 1e9, days_late: 0, collectibility: 'lancar' }, cfg).ecl, null);
});

test('POJK 40: PPKA umum atas bruto, khusus setelah agunan', () => {
     assert.equal(facilityPpka({ outstanding: 1e9, collectibility: 'lancar', collateral_deductible: 6e8 }, cfg).amount, 1e7);
     assert.equal(facilityPpka({ outstanding: 1e9, collectibility: 'dpk', collateral_deductible: 6e8 }, cfg).amount, 2e7);
     assert.equal(facilityPpka({ outstanding: 1e9, collectibility: 'diragukan', collateral_deductible: 6e8 }, cfg).amount, 2e8);
     assert.equal(facilityPpka({ outstanding: 1e9, collectibility: 'macet', collateral_deductible: 2e9 }, cfg).amount, 0);
});

test('portofolio: CKPN per tahap, selisih terhadap PPKA, dan contagion', () => {
     const p = buildPortfolio({ config: cfg, rows: [
          row('A', { npwp: '01.234' }, [{ ews_level: 'NORMAL', params: { P11_days_late: 0 } }], analysis),
          row('B', { npwp: '01234' }, [{ ews_level: 'NORMAL', params: { P11_days_late: 100 } }], analysis),
          row('C', {}, [{ ews_level: 'WARNING', params: { P11_days_late: 0 } }], analysis)
     ] });
     const a = p.facilities.find((f) => f.id === 'A');
     assert.equal(a.collectibility, 'kurang_lancar', 'NPWP sama → ikut fasilitas B');
     assert.equal(a.ecl_stage, 3);
     assert.equal(p.contagion.facilities, 1);
     assert.equal(p.ecl.by_stage[1].count, 1, 'C di watchlist → tahap 2');
     assert.equal(p.ecl.by_stage[2].count, 2);
     assert.equal(p.ecl.total, p.ecl.by_stage.reduce((n, g) => n + g.ecl, 0));
     assert.equal(p.provision.shortfall, Math.max(0, p.provision.total - p.ecl.total));
     assert.equal(p.npl.gross_exposure, 2_000_000_000);
});

test('RAROC: setelah pajak, hurdle rate, dan opsi struktur ulang', () => {
     const ok = riskBasedPricing({ pd: 0.02, lgd: 0.4, ul_rate: 0.056, tenorBulan: 24, config: cfg });
     assert.equal(ok.meets_hurdle, true);
     assert.deepEqual(ok.hurdle_actions, []);
     assert.ok(Math.abs(rarocAtRate(ok, ok.hurdle_rate, 0.056) - cfg.pricing.rarocHurdle) <= 0.01);
     assert.equal(rarocAtRate(ok, ok.breakeven_rate, 0.056), 0);

     const weak = riskBasedPricing({ pd: 0.4, lgd: 0.9, ul_rate: 0.9 * Math.sqrt(0.4 * 0.6), tenorBulan: 60, config: cfg });
     assert.equal(weak.meets_hurdle, false);
     assert.ok(weak.hurdle_rate > weak.recommended_rate);
     assert.ok(weak.hurdle_actions.length >= 3);
});

test('nominal: batas cicilan terhadap arus kas setara DSCR target', () => {
     const n = recommendNominal({ income: 1_300_000_000, dscrTarget: 1.3, bungaTahunan: 0.12, tenorBulan: 36, nilaiAgunan: 5e9, ltvMax: 0.75, plafonDiajukan: 9e9 });
     assert.equal(n.repayment_share_max, 0.7692);
     assert.match(n.explanation, /cicilan maks\. 77% arus kas/);
});
