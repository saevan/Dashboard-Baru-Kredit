import { test } from 'node:test';
import assert from 'node:assert/strict';
import { profitSharePayment, borrowerWithOffer } from '../../src/core/financing.js';
import { offerTerms, validateOfferSelection, normalizeOffer } from '../../src/core/offer.js';
import { computeDebtService } from '../../src/core/debt-service.js';

const borrower = { plafon_diajukan: 120000000, tenor_bulan: 12, skema_angsuran: 'annuity', periode_angsuran: 'mingguan', keuangan: { laba_bersih: 120000000 } };
const result = { decision: 'LAYAK', nominal: { recommended_nominal: 120000000, range_narrow: [100000000,120000000], income_used: 200000000, dscr_at_recommended: 1.3 }, risk: { pricing: { recommended_rate: .14 } } };

test('net profit: laba, nol dan rugi tetap melunasi pokok; persentase bukan suku bunga tahunan', () => {
     assert.deepEqual(profitSharePayment(120000000, 12, .2, 10000000), { principal: 10000000, share: 2000000, payment: 12000000 });
     for (const net of [0, -10000000]) assert.deepEqual(profitSharePayment(120000000,12,.2,net), {principal:10000000,share:0,payment:10000000});
     for (const ratio of [-1, 0, 1.1, NaN, true]) assert.throws(() => profitSharePayment(120000000,12,ratio,100));
});

test('proyeksi penawaran net profit, normalisasi, dan fasilitas mempertahankan syarat yang sama', () => {
     const selection = { basis: 'net_profit', amount: 120000000, rate: 0, share_ratio: .2 };
     const checked = validateOfferSelection({ result, borrower, gate: {pass:true}, ...selection });
     assert.equal(checked.terms.scheme, 'profit_share');
     assert.equal(checked.terms.periodicity, 'bulanan');
     assert.equal(checked.terms.projected, true);
     assert.equal(checked.terms.principal_installment, 10000000);
     assert.equal(checked.terms.total_interest, 24000000);
     assert.equal(checked.terms.total_payment, 144000000);
     assert.equal(checked.terms.cost_disclosure, null);
     assert.equal(checked.dscr, 200000000 / 144000000);
     const offer = normalizeOffer({ ...selection, expected_profit_monthly: checked.expected_profit_monthly, terms: checked.terms });
     const facility = borrowerWithOffer(borrower, offer);
     assert.equal(facility.financing.share_ratio, .2);
     assert.equal(facility.bunga_tahunan, 0);
     const ds = computeDebtService({borrower:facility});
     assert.equal(ds.new_loan.total_payment, checked.terms.total_payment);
     assert.equal(ds.new_loan.schedule.reduce((n,r) => n+r.principal,0), selection.amount);
     assert.equal(borrower.skema_angsuran, 'annuity');
});

test('net profit menolak porsi kosong/di luar batas, laba tidak tersedia, gate gagal dan DSCR rendah', () => {
     const options = { result, borrower, gate: {pass:true}, basis:'net_profit', amount:120000000, rate:0, share_ratio:.2 };
     for (const share_ratio of [null, '', 0, -1, 2]) assert.throws(() => validateOfferSelection({...options,share_ratio}), /Porsi/);
     assert.throws(() => validateOfferSelection({...options,borrower:{...borrower,keuangan:{laba_bersih:0}}}), /laba bersih/);
     assert.throws(() => validateOfferSelection({...options,gate:{pass:false}}), /gate/);
     assert.throws(() => validateOfferSelection({...options,share_ratio:1}), /DSCR/);
});

test('pemilihan bunga pokok menghitung flat meski pengajuan awal anuitas', () => {
     const checked = offerTerms({result,borrower,amount:120000000,rate:.14,basis:'principal'});
     assert.equal(checked.terms.scheme,'flat');
     assert.ok(Math.abs(checked.terms.total_interest - 16800000)<.01);
     assert.equal(checked.terms.projected,false);
});

test('pengecualian gate menyimpan risiko DSCR dan tetap mematuhi validitas syarat', () => {
     const args = {result,borrower,gate:{pass:false,auto_reject:true},basis:'net_profit',amount:120000000,share_ratio:.2};
     assert.throws(()=>validateOfferSelection(args),/gate|penolakan/);
     assert.throws(()=>validateOfferSelection({...args,allowEligibilityOverride:true}),/Alasan/);
     const accepted=validateOfferSelection({...args,allowEligibilityOverride:true,overrideReason:'Diterima lender'});
     assert.equal(accepted.assessment.override,true);
     assert.throws(()=>validateOfferSelection({...args,allowEligibilityOverride:true,amount:130000000}),/Nominal|Plafon/);
     const low=validateOfferSelection({...args,allowEligibilityOverride:true,overrideReason:'DSCR rendah diterima dengan mitigasi',share_ratio:1});
     assert.ok(low.assessment.reasons.some(r=>r.includes('DSCR')));
});
