/**
 * tests/rwa-restructuring.test.js — ATMR pendekatan standar (SEOJK 24/2021) dan
 * restrukturisasi 3R dengan masa tunggu kolektibilitas (POJK 40/2019).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { exposureClass, facilityRwa, portfolioRwa } from '../../src/core/rwa.js';
import { proposeRestructuring, restructuringStatus, validateRestructuring, restructuringRecord, annuityPayment } from '../../src/core/restructuring.js';
import { buildPortfolio } from '../../src/core/portfolio.js';
import { runFullAnalysis } from '../../src/core/engine.js';
import { clearAll, upsertBorrower, applyRestructuring, recordRestructuringPayment, getBorrower } from '../../src/data/storage.js';
import { DEFAULT_CONFIG } from '../../src/core/config.js';

const umkm = (extra = {}) => ({ nama: 'CV Uji', sektor: 'IDX-CONSUMER-NON-CYCLICALS', plafon_diajukan: 1e9, keuangan: { penjualan: 6e9 }, ...extra });

test('ATMR: kelas eksposur menentukan bobot risiko pihak lawan', () => {
     assert.deepEqual(exposureClass({ borrower: umkm(), exposure: 1e9 }), { key: 'retail', risk_weight: 0.75 });
     assert.equal(exposureClass({ borrower: umkm({ plafon_diajukan: 8e9 }), exposure: 8e9 }).key, 'sme_corporate');
     assert.equal(exposureClass({ borrower: umkm({ plafon_diajukan: 8e9, keuangan: { penjualan: 200e9 } }), exposure: 8e9 }).risk_weight, 1);
     assert.equal(exposureClass({ borrower: umkm({ profil_company: 'startup' }), exposure: 1e9 }).key, 'sme_corporate');
});

test('ATMR: properti komersial loan-splitting 55% / RW 60%', () => {
     const r = facilityRwa({ borrower: umkm({ agunan: { jenis: 'tanah_bangunan', nilai_agunan: 1.5e9 } }), drawn: 1e9 });
     assert.equal(r.rwa, Math.round(825e6 * 0.6 + 175e6 * 0.75));
     assert.equal(r.capital_min, Math.round(r.rwa * 0.08));
     assert.equal(r.capital_with_buffer, Math.round(r.rwa * 0.105));
});

test('ATMR: deposito mengurangi eksposur; kendaraan tidak', () => {
     assert.equal(facilityRwa({ borrower: umkm({ agunan: { jenis: 'deposito', nilai_agunan: 3e8 } }), drawn: 5e8 }).rwa, 2e8 * 0.75);
     assert.equal(facilityRwa({ borrower: umkm({ agunan: { jenis: 'deposito', nilai_agunan: 3e8, mata_uang: 'USD' } }), drawn: 5e8 }).net_exposure, 5e8 - 3e8 * 0.92);
     assert.equal(facilityRwa({ borrower: umkm({ agunan: { jenis: 'kendaraan', nilai_agunan: 1e9 } }), drawn: 5e8 }).rwa, 5e8 * 0.75);
});

test('ATMR: tertunggak > 90 hari dan komitmen belum ditarik', () => {
     const b = umkm();
     assert.equal(facilityRwa({ borrower: b, drawn: 1e9, daysLate: 120, specificProvision: 1e8 }).risk_weight, 1.5);
     assert.equal(facilityRwa({ borrower: b, drawn: 1e9, daysLate: 120, specificProvision: 2e8 }).risk_weight, 1);
     assert.equal(facilityRwa({ borrower: b, drawn: 1e9, daysLate: 60 }).risk_weight, 0.75);
     assert.equal(facilityRwa({ borrower: b, drawn: 6e8, undrawn: 4e8 }).ead, 6e8 + 4e8 * 0.4);
});

test('ATMR: ringkasan portofolio per kelas', () => {
     const p = portfolioRwa([{ rwa: { exposure_class: 'retail', ead: 1e9, rwa: 7.5e8 } }, { rwa: { exposure_class: 'corporate', ead: 1e9, rwa: 1e9 } }]);
     assert.equal(p.rwa, 1.75e9);
     assert.equal(p.density, 0.875);
     assert.equal(p.capital_min, 1.4e8);
     assert.equal(p.by_class.length, 2);
});

test('3R: rescheduling memperpanjang tenor, reconditioning tidak di bawah titik impas', () => {
     const base = { outstanding: 1e9, rate: 0.14, remainingMonths: 24, annualCashFlow: 5e8, floorRate: 0.11, targetDscr: 1.2 };
     const p = proposeRestructuring(base);
     assert.ok(p.current.dscr < 1.2);
     const resched = p.options.find((o) => o.type === 'rescheduling');
     assert.ok(resched.tenor_bulan > 24 && resched.meets_target);
     assert.ok(annuityPayment(1e9, 0.14, resched.tenor_bulan - 1) * 12 * 1.2 > 5e8, 'tenor terpendek yang mencapai target');
     const recond = p.options.find((o) => o.type === 'reconditioning');
     assert.ok(recond.rate >= 0.11 && recond.tenor_bulan === 24);
     assert.equal(p.needs_full_restructuring, false);
     const hopeless = proposeRestructuring({ ...base, annualCashFlow: 5e7 });
     assert.equal(hopeless.needs_full_restructuring, true);
     assert.equal(hopeless.recommended, 'restructuring');
});

test('3R: masa tunggu naik satu tingkat per 3 bayar tepat waktu; telat mengulang; tenggang membekukan', () => {
     const rec = (payments, extra = {}) => ({ collectibility_before: 'diragukan', payments: payments.map((on_time) => ({ on_time })), ...extra });
     assert.equal(restructuringStatus(rec([])).cap, 'diragukan');
     assert.equal(restructuringStatus(rec([1, 1])).next_upgrade_in, 1);
     assert.equal(restructuringStatus(rec([1, 1, 1])).cap, 'kurang_lancar');
     assert.equal(restructuringStatus(rec([1, 1, 1, 1, 1, 1, 1, 1, 1])).cap, 'lancar');
     const missed = restructuringStatus(rec([1, 1, 1, 0, 1]));
     assert.equal(missed.cap, 'diragukan');
     assert.equal(missed.consecutive_on_time, 1);
     const grace = restructuringStatus(rec([1, 1, 1], { grace_until: new Date(Date.now() + 864e5).toISOString() }));
     assert.equal(grace.cap, 'diragukan');
     assert.equal(grace.in_grace, true);
});

test('3R: validasi & record', () => {
     assert.match(validateRestructuring({ type: 'x' }), /tidak dikenal/);
     assert.match(validateRestructuring({ type: 'rescheduling', tenor_bulan: 200, rate: 0.1 }), /1–120/);
     assert.match(validateRestructuring({ type: 'kombinasi', tenor_bulan: 36, rate: 0.1, grace_bulan: 20 }), /tenggang/);
     assert.equal(validateRestructuring({ type: 'restructuring' }), null);
     const r = restructuringRecord({ option: { type: 'kombinasi', tenor_bulan: 36, rate: 0.11, grace_bulan: 3 }, collectibilityBefore: 'dpk', now: new Date('2026-01-15') });
     assert.equal(r.collectibility_before, 'dpk');
     assert.equal(r.grace_until.slice(0, 7), '2026-04');
});

test('portofolio: restrukturisasi membatasi kolektibilitas, menandai SICR, dan masuk ATMR', () => {
     const row = { borrower: { id: 'R1', nama: 'PT R', facility_status: 'aktif', plafon_diajukan: 1e9, outstanding: 8e8,
          restructuring: { collectibility_before: 'kurang_lancar', payments: [] } }, analysis: null, monitoring: [{ ews_level: 'NORMAL', params: { P11_days_late: 0 } }] };
     const p = buildPortfolio({ rows: [row] });
     const f = p.facilities[0];
     assert.equal(f.collectibility, 'kurang_lancar');
     assert.equal(f.collectibility_basis, 'masa_tunggu_restrukturisasi');
     assert.equal(f.ecl_stage, 3);
     assert.equal(p.restructured.length, 1);
     assert.equal(p.rwa.ead, 8e8);
     assert.ok(p.rwa.rwa > 0);
});

test('penyimpanan lokal: terapkan 3R lalu catat pembayaran', () => {
     clearAll();
     upsertBorrower({ id: 'L1', nama: 'UD L', facility_status: 'pipeline', plafon_diajukan: 5e8, outstanding: 0 });
     assert.throws(() => applyRestructuring('L1', { type: 'rescheduling', tenor_bulan: 36, rate: 0.12 }), /fasilitas aktif/);
     upsertBorrower({ id: 'L1', facility_status: 'aktif', outstanding: 4e8, days_late: 45 });
     applyRestructuring('L1', { type: 'rescheduling', tenor_bulan: 36, rate: 0.12 }, { note: 'omzet turun' });
     assert.equal(getBorrower('L1').restructuring.collectibility_before, 'dpk');
     recordRestructuringPayment('L1', { on_time: true });
     assert.equal(getBorrower('L1').restructuring.payments.length, 1);
     applyRestructuring('L1', { type: 'reconditioning', tenor_bulan: 36, rate: 0.11 });
     assert.equal(getBorrower('L1').restructuring_history.length, 1);
});

test('analisis: ATMR & imbal hasil modal regulasi untuk plafon yang diajukan', async () => {
     const d = JSON.parse(fs.readFileSync(new URL('../../data/demo/backtest-scenarios.json', import.meta.url)));
     const s = d.scenarios[0];
     const r = await runFullAnalysis({ nama: s.name, sektor: d.sector, profil_company: d.profile, plafon_diajukan: s.loan, tenor_bulan: 12, bunga_tahunan: d.annual_rate,
          keuangan: s.financials, agunan: { nilai_agunan: s.collateral, jenis: 'tanah_bangunan' } });
     assert.equal(r.credit.rwa.exposure_class, 'retail');
     assert.equal(r.credit.rwa.ead, s.loan);
     assert.ok(r.credit.rwa.risk_weight <= 0.75);
     assert.ok(r.credit.rwa.return_on_capital > 0);
     assert.equal(DEFAULT_CONFIG.rwa.minCar, 0.08);
});
