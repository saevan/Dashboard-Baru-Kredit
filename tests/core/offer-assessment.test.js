import test from 'node:test';
import assert from 'node:assert/strict';
import { runFullAnalysis } from '../../src/core/engine.js';
import { assessOffer, buildOfferOptions, validateOfferSelection, normalizeOffer, offerSizing } from '../../src/core/offer.js';
import { effectiveDscrTarget, recommendNominal } from '../../src/core/nominal.js';
import { computeDebtService } from '../../src/core/debt-service.js';
import { DEFAULT_CONFIG, resolveConfig } from '../../src/core/config.js';

const borrower = {
     nama:'Uji penawaran',profil_company:'ukm_mapan',plafon_diajukan:500e6,tenor_bulan:36,bunga_tahunan:.14,skema_angsuran:'flat',
     keuangan:{penjualan:5e9,ebit:1e9,laba_bersih:800e6,arus_kas_operasional:1e9,
          total_aset:2e9,total_liabilitas:500e6,ekuitas:1.5e9,aset_lancar:1e9,liabilitas_jangka_pendek:300e6,beban_bunga:50e6},
     agunan:{nilai_agunan:600e6,jenis:'tanah_bangunan',personal_guarantee:false},
     bisnis_manajemen:{skor_model_bisnis:1,posisi_pasar:1,skalabilitas:1,ketergantungan:1,tren_keuangan:1,
          pengalaman_tim:1,track_record_tahun:10,rekam_jejak_bayar:1,tata_kelola:1,skor_industri_risk:1,
          prospek_industri:1,sensitivitas_makro:1,ocf_positif:1,cash_runway_bulan:12}
};
const gate = {pass:false,grade_ok:false,confidence_ok:true,min_grade_index:9};
function fixture() {
     const result=runFullAnalysis(borrower);
     const options=buildOfferOptions(result,borrower);
     return {result,borrower:structuredClone(borrower),gate,amount:options.recommended.amount,rate:options.recommended.rate,basis:'principal'};
}

test('LTV 83% review resolves at 450m / 600m without forcing original failed gate', () => {
     const input=fixture(), before=JSON.stringify(input.result);
     assert.equal(input.result.decision.decision,'REVIEW');
     assert.equal(input.result.risk.pefindo.grade,input.result.risk.pefindo.score_band.grade);
     assert.equal(input.amount,450e6);
     const checked=validateOfferSelection(input);
     assert.equal(checked.allowed,true,JSON.stringify(checked.assessment));
     assert.equal(checked.assessment.ltv,.75);
     assert.equal(checked.assessment.decision,'LAYAK');
     assert.equal(JSON.stringify(input.result),before);
});

test('original 500m remains available, requires reason, and records actual residual risk', () => {
     const input={...fixture(),amount:500e6};
     assert.throws(()=>validateOfferSelection(input),/LTV/);
     assert.throws(()=>validateOfferSelection({...input,allowEligibilityOverride:true}),/Alasan/);
     const accepted=validateOfferSelection({...input,allowEligibilityOverride:true,overrideReason:'Agunan tambahan sebelum pencairan; lender menerima risiko sisa.'});
     assert.equal(accepted.assessment.override,true);
     assert.equal(accepted.assessment.automatic,false);
     assert.ok(accepted.assessment.reasons.some(r=>r.includes('LTV')));
     assert.ok(accepted.assessment.risk.pricing.recommended_rate>0);
     assert.equal(normalizeOffer({...input,assessment:accepted.assessment}).assessment,undefined);
});

test('raising interest reduces capacity; lender can explicitly accept low DSCR with valid terms', () => {
     const input=fixture();
     input.result.nominal.income_used=200e6;
     const low=assessOffer({...input,rate:.14}), high=assessOffer({...input,rate:.5});
     assert.ok(high.dscr<low.dscr);
     assert.ok(high.assessment.reasons.some(r=>r.includes('DSCR')));
     const accepted=validateOfferSelection({...input,rate:.5,allowEligibilityOverride:true,overrideReason:'Lender menerima proyeksi DSCR rendah dengan rencana setoran modal.'});
     assert.equal(accepted.assessment.override,true);
     assert.ok(accepted.assessment.dscr<1);
     for (const patch of [{amount:600e6},{amount:NaN},{rate:Infinity},{rate:-.1},{rate:1.1},{borrower:{...borrower,tenor_bulan:0}}]) {
          assert.throws(()=>validateOfferSelection({...input,...patch,allowEligibilityOverride:true,overrideReason:'Tidak boleh melewati validasi data'}));
     }
});

test('confidence, integrity and borrower hard rules survive loan restructuring', () => {
     const input=fixture();
     assert.ok(assessOffer({...input,gate:null}).assessment.reasons.some(r=>/Keyakinan/.test(r)));
     input.result.extra.arrears_days=120;
     input.result.integrity={status:'invalid'};
     const checked=assessOffer({...input,gate:{confidence_ok:false}});
     assert.equal(checked.allowed,false);
     assert.ok(checked.assessment.reasons.some(r=>/tunggakan|arrears/i.test(r)));
     assert.ok(checked.assessment.reasons.some(r=>/Keyakinan/.test(r)));
     assert.ok(checked.assessment.reasons.some(r=>/Integritas/.test(r)));
});

test('small loans stay positive and actual DSCR differs from policy target', () => {
     for(const amount of [500000,5e6,30e6,49e6]) {
          const n=recommendNominal({income:1e9,tenorBulan:12,bungaTahunan:.14,scheme:'flat',nilaiAgunan:100e6,ltvMax:.75,plafonDiajukan:amount});
          assert.ok(n.recommended_nominal>0 && n.recommended_nominal<=amount);
          assert.ok(n.dscr_at_recommended>n.dscr_target);
     }
     const result=runFullAnalysis(borrower);
     const config=resolveConfig(DEFAULT_CONFIG,{profileKey:'ukm_mapan'});
     assert.equal(result.nominal.dscr_target,effectiveDscrTarget(config));
     assert.equal(result.nominal.dscr_target,1/.6);
     const service=computeDebtService({borrower:{...borrower,plafon_diajukan:result.nominal.recommended_nominal},config});
     assert.equal(result.nominal.dscr_at_recommended,result.nominal.income_used/service.total_annual);
});

test('selected terms produce a usable new amount instead of reusing the old capacity limit', () => {
     const input=fixture();
     input.result.nominal.income_used=200e6;
     const sizing=offerSizing(input);
     assert.ok(sizing.recommended>0 && sizing.recommended<input.amount);
     const checked=validateOfferSelection({...input,amount:sizing.recommended});
     assert.equal(checked.allowed,true,JSON.stringify(checked.assessment));
     assert.ok(checked.dscr>=checked.target);
     const highRate=offerSizing({...input,rate:.5});
     assert.ok(highRate.recommended<sizing.recommended);
     const profit=offerSizing({...input,basis:'net_profit',rate:0,share_ratio:1});
     assert.equal(profit.recommended,0);
});
