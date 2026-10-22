/**
 * tests/offer.test.js — Penawaran kredit (core/offer.js).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { OFFER_STATUS, normalizeOffer, buildOfferOptions, offerEligibility, validateOfferSelection } from '../../src/core/offer.js';

test('OFFER_STATUS memuat tiga status', () => {
     assert.equal(OFFER_STATUS.PENDING, 'pending');
     assert.equal(OFFER_STATUS.ACCEPTED, 'accepted');
     assert.equal(OFFER_STATUS.DECLINED, 'declined');
});

test('normalizeOffer mengembalikan null untuk input kosong', () => {
     assert.equal(normalizeOffer(null), null);
     assert.equal(normalizeOffer(undefined), null);
     assert.equal(normalizeOffer('bukan objek'), null);
     assert.equal(normalizeOffer(42), null);
});

test('normalizeOffer mengisi default aman', () => {
     const o = normalizeOffer({});
     assert.equal(o.amount, null);
     assert.equal(o.rate, null);
     assert.equal(o.note, '');
     assert.equal(o.sent_at, null);
     assert.equal(o.status, OFFER_STATUS.PENDING);
     assert.equal(o.responded_at, null);
});

test('normalizeOffer mengkoersi jumlah/bunga & menormalkan status', () => {
     const o = normalizeOffer({
          amount: '150000000',
          rate: '0.145',
          status: 'accepted',
          note: 'Disetujui',
          sent_at: '2026-01-01T00:00:00.000Z',
          responded_at: '2026-01-02T00:00:00.000Z'
     });
     assert.equal(o.amount, 150000000);
     assert.equal(o.rate, 0.145);
     assert.equal(o.status, 'accepted');
     assert.equal(o.note, 'Disetujui');
     assert.equal(o.sent_at, '2026-01-01T00:00:00.000Z');
     assert.equal(o.responded_at, '2026-01-02T00:00:00.000Z');

     const bogus = normalizeOffer({ status: 'entah' });
     assert.equal(bogus.status, OFFER_STATUS.PENDING);

     const badNote = normalizeOffer({ note: 123 });
     assert.equal(badNote.note, '');
});

test('buildOfferOptions menurunkan opsi plafon menurun (unik)', () => {
     const result = {
          nominal: {
               recommended_nominal: 200_000_000,
               range_narrow: [150_000_000, 250_000_000],
               binding_label: 'DSCR'
          },
          risk: {
               pricing: { recommended_rate: 0.145, breakeven_rate: 0.12 },
               pefindo: { grade: 'idBBB', index: 6, scale_mode: 'pefindo' },
               pd: { pd_12m: 0.0321 }
          }
     };
     const opts = buildOfferOptions(result, { plafon_diajukan: 300_000_000 });

     assert.equal(opts.grade, 'idBBB');
     assert.equal(opts.grade_index, 6);
     assert.equal(opts.scale_mode, 'pefindo');
     assert.equal(opts.pd, 0.0321);
     assert.equal(opts.binding_label, 'DSCR');
     assert.equal(opts.requested, 300_000_000);
     assert.equal(opts.ready, true);

     assert.deepEqual(
          opts.amounts.map((a) => a.value),
          [300_000_000, 250_000_000, 200_000_000, 150_000_000]
     );
     assert.deepEqual(
          opts.amounts.map((a) => a.tag),
          ['diminta · tinjauan manual', 'maksimum', 'saran', 'konservatif']
     );
     assert.equal(opts.recommended.amount, 200_000_000);
});

test('buildOfferOptions menurunkan opsi bunga menaik (unik + margin)', () => {
     const result = {
          nominal: { recommended_nominal: 100_000_000, range_narrow: [80_000_000, 120_000_000] },
          risk: {
               pricing: { recommended_rate: 0.145, breakeven_rate: 0.12 },
               pefindo: { grade: 'idA', index: 3 },
               pd: { pd_12m: 0.01 }
          }
     };
     const opts = buildOfferOptions(result, {});
     assert.deepEqual(
          opts.rates.map((r) => r.value),
          [0.12, 0.145, 0.155]
     );
     assert.deepEqual(
          opts.rates.map((r) => r.tag),
          ['break-even', 'saran', 'di atas saran']
     );
     assert.equal(opts.recommended.rate, 0.145);
});

test('buildOfferOptions menyingkirkan duplikat plafon', () => {
     const result = {
          nominal: { recommended_nominal: 150_000_000, range_narrow: [150_000_000, 250_000_000] },
          risk: { pricing: { recommended_rate: 0.14, breakeven_rate: 0.11 }, pefindo: {} }
     };
     const opts = buildOfferOptions(result, { plafon_diajukan: 250_000_000 });
     assert.deepEqual(opts.amounts.map((a) => a.value), [250_000_000, 150_000_000]);
});

test('buildOfferOptions aman untuk hasil kosong', () => {
     const opts = buildOfferOptions({}, {});
     assert.equal(opts.grade, null);
     assert.equal(opts.grade_index, null);
     assert.equal(opts.scale_mode, 'pefindo');
     assert.equal(opts.pd, null);
     assert.deepEqual(opts.amounts, []);
     assert.deepEqual(opts.rates, []);
     assert.equal(opts.recommended.amount, null);
     assert.equal(opts.recommended.rate, null);
     assert.equal(opts.ready, false);
});


test('gate penawaran menolak hasil kosong, review, hard rule, dan gate gagal', () => {
     for (const decision of [undefined, 'REVIEW', 'TIDAK_LAYAK']) {
          assert.equal(offerEligibility({ decision }, { pass: true }).allowed, false);
     }
     for (const gate of [undefined, {}, { pass: false }, { pass: true, auto_reject: true }]) {
          assert.equal(offerEligibility({ decision: 'LAYAK' }, gate).allowed, false);
     }
     assert.equal(offerEligibility({ decision: { decision: 'LAYAK', hard_rules_triggered: ['dscr'] } }, { pass: true }).allowed, false);
     for (const decision of ['LAYAK', 'LAYAK_BERSYARAT']) {
          assert.equal(offerEligibility({ decision }, { pass: true }).allowed, true);
     }
});

test('opsi plafon mematuhi kapasitas walaupun rentang lebih tinggi', () => {
     const result = { nominal: { recommended_nominal: 100, range_narrow: [90, 120],
          capacity: { dscr_based: 110, ltv_based: 105, requested: 1000 } } };
     const opts = buildOfferOptions(result, { plafon_diajukan: 1000 });
     assert.deepEqual(opts.amounts.map((o) => o.value), [1000, 100, 90]);
     assert.equal(opts.automaticMaximum,105);
     result.nominal.capacity.ltv_based = 0;
     assert.deepEqual(buildOfferOptions(result, { plafon_diajukan: 1000 }).amounts, [{value:1000,tag:'diminta · tinjauan manual'}]);
});

test('validasi penyimpanan menolak gate terblokir dan opsi yang dimanipulasi', () => {
     const input = { result: { decision: 'LAYAK', nominal: { recommended_nominal: 100, range_narrow: [90, 120], income_used: 10000, dscr_at_recommended: 1.3 },
          risk: { pricing: { recommended_rate: 0.14, breakeven_rate: 0.12 } } },
          gate: { pass: true }, borrower: { plafon_diajukan: 1000, tenor_bulan: 12 }, amount: 100, rate: 0.14 };
     assert.doesNotThrow(() => validateOfferSelection(input));
     assert.throws(() => validateOfferSelection({ ...input, gate: { pass: false, auto_reject: true } }));
     for (const amount of [0, -1, NaN, Infinity, 1000, 101]) {
          assert.throws(() => validateOfferSelection({ ...input, amount }));
     }
     for (const rate of [null, 0, -1, NaN, Infinity, 0.01]) {
          assert.throws(() => validateOfferSelection({ ...input, rate }));
     }
});
