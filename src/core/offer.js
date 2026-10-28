/**
 * core/offer.js — Penawaran kredit (mode lokal).
 *
 * Modul PURE (tanpa DOM / storage). Menurunkan OPSI plafon & suku bunga dari
 * hasil analisis (`runFullAnalysis`) supaya lender cukup MEMILIH di antara
 * saran, bukan mengetik bebas. Alur lengkap:
 *   audit → skoring otomatis (grade + plafon saran + bunga saran) → lender
 *   memilih & mengirim penawaran → pemohon menerima/menolak → tahap selesai.
 *
 * Data penawaran disimpan sebagai field `offer` pada record pengajuan lokal.
 */

import { computeDebtService, periodicInstallment } from './debt-service.js';
import { loanCostDisclosure, normalizeLoanCost } from './loan-cost.js';
import { DEFAULT_CONFIG } from './config.js';
import { effectiveDscrTarget, nominalRoundingStep } from './nominal.js';
import { decide, applyStressCap } from './eligibility.js';
import { computeRatios } from './ratios.js';
import { pefindoRating } from './rating.js';
import { lgdFromCollateral, expectedLoss, riskBasedPricing, rarocAtRate } from './pd.js';

function offerConfig(result) {
     const s = result?.meta?.snapshot || {};
     return { ...DEFAULT_CONFIG,
          hardRules: { ...DEFAULT_CONFIG.hardRules, ...s.hard_rules },
          thresholds: { ...DEFAULT_CONFIG.thresholds, ...s.thresholds },
          nominal: { ...DEFAULT_CONFIG.nominal, ...s.nominal },
          debtService: { ...DEFAULT_CONFIG.debtService, ...s.debt_service },
          pricing: { ...DEFAULT_CONFIG.pricing, ...s.pricing },
          lgd: { ...DEFAULT_CONFIG.lgd, ...s.lgd },
          gap: { ...DEFAULT_CONFIG.gap, ...s.gap },
          altman: { ...DEFAULT_CONFIG.altman, ...s.altman } };
}

/** Total bagi hasil proyeksi disetarakan ke tingkat tahunan flat atas pokok awal (sebanding dengan bunga flat). */
export function profitShareYield(terms, amount) {
     const years = num(terms?.tenor_bulan, 0) / 12;
     const share = num(terms?.total_interest, null);
     if (share === null || !(num(amount, 0) > 0) || !(years > 0)) return null;
     return Math.round(share / num(amount) / years * 1e6) / 1e6;
}

const pctText = (v) => `${(num(v, 0) * 100).toLocaleString('id-ID', { maximumFractionDigits: 2 })}%`;

/** Reprice collateral exposure while retaining the PD from the audited score. */
export function offerRisk(result, borrower, amount) {
     const pd = num(result?.risk?.pd?.pd_12m, null);
     if (pd === null || !result?.meta?.snapshot?.pricing) return null;
     const config = offerConfig(result);
     const ag = borrower.agunan || {};
     const lgd = lgdFromCollateral({ nilaiAgunan: ag.nilai_agunan, jenis: ag.jenis,
          plafon: amount, personalGuarantee: !!ag.personal_guarantee, config });
     const loss = expectedLoss({pd,lgd:lgd.lgd,ead:amount});
     return {pd,lgd:lgd.lgd,loss,pricing:riskBasedPricing({pd,lgd:lgd.lgd,ul_rate:loss.ul_rate,tenorBulan:borrower.tenor_bulan,config})};
}

function num(v, d = 0) {
     if (v === null || v === undefined || v === '') return d;
     const n = Number(v);
     return Number.isFinite(n) ? n : d;
}

/** Status penawaran. */
export const OFFER_STATUS = {
     PENDING: 'pending',
     ACCEPTED: 'accepted',
     DECLINED: 'declined'
};

/**
 * Bentuk apa pun → objek penawaran yang aman dipakai UI (atau `null` bila kosong).
 * `amount` = plafon (Rp), `rate` = suku bunga tahunan sebagai fraksi (0.145 = 14,5%).
 */
export function normalizeOffer(raw) {
     if (!raw || typeof raw !== 'object') return null;
     const amount = num(raw.amount, null);
     const rate = num(raw.rate, null);
     const status = ['pending', 'accepted', 'declined'].includes(raw.status)
          ? raw.status
          : OFFER_STATUS.PENDING;
     return {
          amount: amount === null ? null : amount,
          rate: rate === null ? null : rate,
          basis: raw.basis === 'net_profit' ? 'net_profit' : 'principal',
          share_ratio: num(raw.share_ratio, null),
          expected_profit_monthly: num(raw.expected_profit_monthly, null),
          note: typeof raw.note === 'string' ? raw.note : '',
          sent_at: raw.sent_at || null,
          status,
          responded_at: raw.responded_at || null,
          expires_at: raw.expires_at || null,
          terms: raw.terms ? {
               tenor_bulan: num(raw.terms.tenor_bulan, null), scheme: String(raw.terms.scheme || ''),
               scheme_label: String(raw.terms.scheme_label || ''), periodicity: String(raw.terms.periodicity || ''),
               periodicity_label: String(raw.terms.periodicity_label || ''), installment: num(raw.terms.installment, null),
               first_payment: num(raw.terms.first_payment, null), peak_payment: num(raw.terms.peak_payment, null),
               total_interest: num(raw.terms.total_interest, null), total_payment: num(raw.terms.total_payment, null),
               grace_months: num(raw.terms.grace_months, 0),
               projected: raw.terms.projected === true,
               principal_installment: num(raw.terms.principal_installment, null),
               cost_disclosure: normalizeLoanCost(raw.terms.cost_disclosure)
          } : null
     };
}

/**
 * Gate penawaran bersama untuk panel dan aksi simpan.
 * Hasil lama yang belum memiliki gate wajib diverifikasi dan dinilai ulang.
 */
export function offerEligibility(result = {}, gate = {}) {
     const decision = typeof result?.decision === 'string'
          ? result.decision
          : result?.decision?.decision || result?.decision?.verdict;
     const reasons = [];
     if (decision === 'TIDAK_LAYAK') reasons.push('Hasil analisis menyatakan tidak layak.');
     else if (!['LAYAK', 'LAYAK_BERSYARAT'].includes(decision)) {
          reasons.push('Hasil analisis belum layak untuk penawaran. Tinjau dan lakukan penilaian ulang.');
     }
     if (result?.decision?.hard_rules_triggered?.length) reasons.push('Masih ada hard rule yang terpicu.');
     if (gate?.auto_reject) reasons.push('Pengajuan berada di zona penolakan otomatis.');
     if (gate?.pass !== true) {
          reasons.push('Peringkat dan keyakinan data belum memenuhi gate penawaran.');
          for (const reason of gate?.reasons || []) {
               if (reason.message) reasons.push(String(reason.message));
          }
     }
     return { allowed: reasons.length === 0, reasons: [...new Set(reasons)] };
}

/** Validasi ulang sebelum menyimpan; nilai dari DOM bukan sumber kepercayaan. */
export function validateOfferSelection({ result, gate, borrower, amount, rate, basis, share_ratio, allowEligibilityOverride = false, overrideReason = '' } = {}) {
     const options = buildOfferOptions(result, borrower);
     if (!options.ready) throw new Error('Rekomendasi penawaran belum lengkap. Lakukan penilaian ulang.');
     const sizing = offerSizing({result,borrower,rate,basis,share_ratio});
     if (!options.amounts.some((o) => o.value === num(amount, null)) && num(amount,null) !== sizing?.recommended && !allowEligibilityOverride) {
          throw new Error('Plafon harus berasal dari opsi yang masih memenuhi batas analisis.');
     }
     if (basis !== undefined && !['principal', 'net_profit'].includes(basis)) throw new Error('Pilih dasar imbal hasil terlebih dahulu.');
     if (basis !== 'net_profit' && !options.rates.some((o) => o.value === num(rate, null)) && !allowEligibilityOverride) {
          throw new Error('Suku bunga harus berasal dari opsi penawaran yang tersedia.');
     }
     const checked = assessOffer({ result, gate, borrower, amount, rate, basis, share_ratio });
     if (!checked.allowed && !allowEligibilityOverride) throw new Error(`${checked.assessment.reasons.join(' ')} Gunakan keputusan manual dengan alasan untuk menerima risiko ini.`);
     if (allowEligibilityOverride && !String(overrideReason).trim()) throw new Error('Alasan keputusan manual wajib diisi.');
     checked.assessment.override = allowEligibilityOverride;
     checked.assessment.override_reason = allowEligibilityOverride ? String(overrideReason).trim().slice(0,4000) : null;
     return checked;
}

/** Hitung cicilan dan kapasitas ulang untuk jumlah/bunga terpilih memakai snapshot audit. */
export function offerTerms({ result = {}, borrower = {}, amount, rate, basis, share_ratio } = {}) {
     if (typeof amount === 'boolean' || !(num(amount) > 0) || num(amount) > num(borrower.plafon_diajukan, Infinity)) throw new Error('Nominal harus positif dan tidak melebihi pengajuan pemohon.');
     if (basis !== 'net_profit' && (typeof rate === 'boolean' || !(num(rate) > 0) || num(rate) > 1)) throw new Error('Bunga flat harus lebih dari 0 sampai 100% per tahun.');
     const tenor = num(borrower.tenor_bulan, 0);
     if (!Number.isInteger(tenor) || tenor <= 0 || tenor > 600) throw new Error('Tenor penawaran harus 1–600 bulan. Lengkapi dan nilai ulang data.');
     const snapshot = result.meta?.snapshot || {};
     const income = num(result.nominal?.income_used, null);
     const target = snapshot.hard_rules ? effectiveDscrTarget(offerConfig(result))
          : num(snapshot.nominal?.dscrTarget, num(result.nominal?.dscr_target, num(result.nominal?.dscr_at_recommended, null)));
     if (income === null || target === null || target <= 0) throw new Error('Basis kapasitas bayar belum tersedia. Lakukan skoring ulang.');
     const profit = basis === 'net_profit';
     const annualProfit = num(borrower.keuangan?.laba_bersih, null);
     if (profit && (annualProfit === null || annualProfit <= 0)) throw new Error('Bagi hasil memerlukan laba bersih tahunan positif yang telah diaudit.');
     const ratio = num(share_ratio, null);
     if (profit && (typeof share_ratio === 'boolean' || ratio === null || ratio <= 0 || ratio > 1)) throw new Error('Porsi net profit harus lebih dari 0 sampai 100%.');
     const expectedProfit = profit ? annualProfit / 12 : null;
     const contractBorrower = { ...borrower, plafon_diajukan: num(amount), bunga_tahunan: profit ? 0 : num(rate),
          ...(basis === 'principal' ? { skema_angsuran: 'flat', financing: null } : {}),
          ...(profit ? { skema_angsuran: 'profit_share', periode_angsuran: 'bulanan', grace_period_bulan: 0,
               financing: { share_ratio: ratio, expected_profit_monthly: expectedProfit } } : {}) };
     const debtService = computeDebtService({ borrower: contractBorrower,
          config: { debtService: snapshot.debt_service || {} } });
     const dscr = debtService.total_annual > 0 ? income / debtService.total_annual : 0;
     const periodic = periodicInstallment({ monthlyPayment: debtService.new_loan.monthly_avg,
          periodicity: debtService.periode_angsuran, tenorBulan: tenor });
     return { allowed: Number.isFinite(dscr) && dscr + 1e-9 >= target, dscr, target, debtService, contractBorrower, expected_profit_monthly: expectedProfit,
          terms: { tenor_bulan: tenor, scheme: debtService.scheme, scheme_label: debtService.scheme_label,
               periodicity: debtService.periode_angsuran, periodicity_label: debtService.periodicity_label,
               installment: periodic.per_period, first_payment: debtService.new_loan.first_payment,
               peak_payment: debtService.new_loan.peak_payment, total_interest: debtService.new_loan.total_interest,
               total_payment: debtService.new_loan.total_payment, grace_months: profit ? 0 : num(borrower.grace_period_bulan),
               projected: profit, principal_installment: profit ? num(amount) / tenor : null,
               cost_disclosure: profit ? null : loanCostDisclosure(debtService.new_loan.principal, debtService.new_loan.schedule) } };
}

/** Debt service is affine in principal for the offered flat/profit-share structures. */
export function offerSizing(args = {}) {
     const {result = {},borrower = {}} = args;
     const requested = num(borrower.plafon_diajukan);
     if (!result.meta?.snapshot?.hard_rules || requested <= 0) return null;
     const config = offerConfig(result);
     const full = offerTerms({...args,amount:requested});
     const half = offerTerms({...args,amount:requested/2});
     const slope = (full.debtService.total_annual-half.debtService.total_annual)/(requested/2);
     const fixed = full.debtService.total_annual-slope*requested;
     let budget = result.nominal.income_used/full.target;
     const sales = num(result.spread?.adjusted?.penjualan ?? borrower.keuangan?.penjualan);
     if (sales > 0 && config.hardRules.dti_max > 0) budget = Math.min(budget,sales*config.hardRules.dti_max);
     const capacity = slope > 0 ? Math.max(0,(budget-fixed)/slope) : 0;
     const ag = borrower.agunan || {};
     const ltvLimit = ag.personal_guarantee ? config.hardRules.ltv_max_with_guarantee : config.hardRules.ltv_max;
     const collateral = Math.max(0,num(ag.nilai_agunan)*num(ltvLimit));
     const maximum = Math.max(0,Math.min(requested,capacity,collateral));
     const step = nominalRoundingStep(maximum,config.nominal.rounding);
     return {maximum,recommended:Math.floor((maximum+1e-6)/step)*step,capacity,collateral,target:full.target};
}

/** Loan terms are rechecked independently of the immutable original assessment. */
export function assessOffer(args = {}) {
     const {result = {}, borrower = {}, gate = {}, amount, rate, basis} = args;
     const checked = offerTerms(args);
     const risk = offerRisk(result,borrower,amount);
     const reasons = [];
     let decision = null, rating = null, ratios = null;
     if (result.meta?.snapshot?.hard_rules && Number.isFinite(result.finalScore) && result.ratios) {
          const config = offerConfig(result);
          ratios = computeRatios(result.spread?.adjusted || borrower.keuangan || {}, {
               plafon:amount,tenorBulan:borrower.tenor_bulan,bungaTahunan:basis==='net_profit'?0:rate,
               nilaiAgunan:borrower.agunan?.nilai_agunan,debtService:checked.debtService,config });
          ratios.dscr = checked.dscr;
          ratios.ds_ratio = checked.dscr > 0 ? 1/checked.dscr : null;
          if (Number.isFinite(ratios.icr_real)) ratios.icr = ratios.icr_real;
          const collateral = num(borrower.agunan?.nilai_agunan);
          const ltv = collateral > 0 ? amount/collateral : null;
          ratios.ltv = ltv;
          // Struktur penawaran tetap tunduk pada batas stress test hasil analisis.
          decision = applyStressCap(decide({ratios,finalScore:result.finalScore,gapSummary:result.gap,
               extra:{...result.extra,ltv,personal_guarantee:!!borrower.agunan?.personal_guarantee},config}), result.stress, config);
          rating = pefindoRating(result.finalScore,decision.decision,risk?.pd ?? result.risk?.pd?.pd_12m,
               {scaleMode:result.risk?.pefindo?.scale_mode});
          reasons.push(...decision.hard_rules_triggered.map(r=>r.message),...decision.soft_notes.map(r=>r.message));
          if (!['LAYAK','LAYAK_BERSYARAT'].includes(decision.decision) && !reasons.length) reasons.push(`Keputusan struktur penawaran: ${decision.decision}.`);
          if (rating.index > num(gate?.min_grade_index,9)) reasons.push('Grade struktur penawaran di bawah ambang otomatis.');
          if (!(gate?.confidence_ok === true || (gate?.confidence_ok === undefined && gate?.pass === true))) reasons.push('Keyakinan data belum memenuhi gate otomatis.');
          if (collateral <= 0) reasons.push('Tidak ada nilai agunan terverifikasi untuk penawaran ini.');
     } else {
          reasons.push(...offerEligibility(result,gate).reasons);
     }
     if (!checked.allowed) reasons.push(`DSCR penawaran ${checked.dscr.toFixed(2)} di bawah target ${checked.target.toFixed(2)}.`);
     if (result.integrity?.status === 'invalid') reasons.push('Integritas laporan keuangan perlu ditinjau.');
     const sizing = offerSizing(args);
     const options = buildOfferOptions(result,borrower);
     const limit = sizing?.maximum ?? options.automaticMaximum;
     if (amount > limit + .01) reasons.push('Nominal melebihi batas rekomendasi otomatis; perlu keputusan lender.');
     if (basis !== 'net_profit' && risk && rate + .00005 < risk.pricing.breakeven_rate) reasons.push('Bunga terpilih di bawah titik impas risiko untuk struktur ini.');
     if (basis !== 'net_profit' && !options.rates.some(r=>r.value===num(rate,null))) reasons.push('Bunga pilihan lender di luar opsi model; perlu keputusan manual.');
     // Bagi hasil: proyeksi imbal hasil disetarakan ke tingkat tahunan flat lalu dibandingkan dengan titik impas risiko.
     const profitYield = basis === 'net_profit' ? profitShareYield(checked.terms, amount) : null;
     if (profitYield !== null && risk && profitYield + .00005 < risk.pricing.breakeven_rate) {
          reasons.push(`Proyeksi bagi hasil setara ${pctText(profitYield)} per tahun, di bawah titik impas risiko ${pctText(risk.pricing.breakeven_rate)}.`);
     }
     // Hurdle RAROC: imbal hasil di atas titik impas tetapi belum cukup membayar modal ekonomi.
     const yieldUsed = basis === 'net_profit' ? profitYield : num(rate, null);
     const offerRaroc = risk && yieldUsed !== null ? rarocAtRate(risk.pricing, yieldUsed, risk.loss.ul_rate) : null;
     const hurdleRate = num(risk?.pricing?.hurdle_rate, null);
     if (hurdleRate !== null && yieldUsed !== null && yieldUsed + .00005 >= risk.pricing.breakeven_rate && yieldUsed + .00005 < hurdleRate) {
          reasons.push(`RAROC pada ${basis === 'net_profit' ? 'proyeksi bagi hasil' : 'bunga'} ini ${offerRaroc === null ? '—' : pctText(offerRaroc)} di bawah hurdle ${pctText(risk.pricing.raroc_hurdle)}; struktur ulang (agunan, tenor, biaya) atau minta persetujuan komite.`);
     }
     const unique = [...new Set(reasons)];
     return {...checked,allowed:unique.length===0,assessment:{
          evaluated_at:new Date().toISOString(),policy_version:'offer-2',original_score:result.finalScore ?? null,
          decision:decision?.decision || null,grade:rating?.grade || null,dscr:checked.dscr,dscr_target:checked.target,
          ltv:ratios?.ltv ?? null,risk,sizing,reasons:unique,automatic:unique.length===0,profit_share_yield:profitYield,raroc:offerRaroc,
          basis_note:'Skor dan PD mengikuti penilaian tersimpan; rasio fasilitas, LGD dan harga dihitung untuk syarat terpilih.'
     }};
}

/**
 * Turunkan opsi penawaran dari hasil analisis + data pemohon.
 *
 * @param {object} result   Hasil `runFullAnalysis` (memuat `nominal` & `risk`).
 * @param {object} borrower Data pemohon (memuat `plafon_diajukan`).
 * @returns {{
 *   grade:(string|null), grade_index:(number|null), scale_mode:string, pd:(number|null),
 *   binding_label:(string|null), requested:(number|null),
 *   amounts:Array<{value:number,tag:string}>, rates:Array<{value:number,tag:string}>,
 *   recommended:{amount:(number|null), rate:(number|null)}, ready:boolean
 * }}
 */
export function buildOfferOptions(result = {}, borrower = {}) {
     const nom = (result && result.nominal) || {};
     const risk = (result && result.risk) || {};
     const pricing = offerRisk(result,borrower,nom.recommended_nominal)?.pricing || risk.pricing || {};
     const pefindo = risk.pefindo || {};
     const range = Array.isArray(nom.range_narrow) ? nom.range_narrow : [];
     const requested = num(borrower.plafon_diajukan, null);

     // Rentang rekomendasi tidak boleh melewati kapasitas bayar/agunan/diminta.
     const limits = [num(range[1], num(nom.recommended_nominal, 0)), requested,
          ...Object.values(nom.capacity || {}).map((v) => num(v, null))]
          .filter((v) => v !== null && Number.isFinite(v));
     const maximum = Math.max(0, Math.min(...limits));
     const amounts = [];
     const addAmount = (value, tag) => {
          const v = num(value, null);
          if (v === null || v <= 0 || v > maximum) return;
          if (amounts.some((x) => x.value === v)) return;
          amounts.push({ value: v, tag });
     };
     addAmount(nom.recommended_nominal, 'saran');
     addAmount(range[0], 'konservatif');
     addAmount(range[1], 'maksimum');
     addAmount(requested, 'diminta');
     if (requested > 0 && !amounts.some(o=>o.value===requested)) amounts.push({value:requested,tag:'diminta · tinjauan manual'});
     amounts.sort((a, b) => b.value - a.value);

     const baseRate = num(pricing.recommended_rate, null);
     const rates = [];
     const addRate = (value, tag) => {
          const v = num(value, null);
          if (v === null || v <= 0) return;
          const rounded = Math.round(v * 1e4) / 1e4;
          if (rates.some((x) => x.value === rounded)) return;
          rates.push({ value: rounded, tag });
     };
     addRate(pricing.breakeven_rate, 'break-even');
     if (num(pricing.hurdle_rate, Infinity) <= num(offerConfig(result).pricing.maxRate, 0.36)) addRate(pricing.hurdle_rate, 'batas RAROC');
     addRate(baseRate, 'saran');
     if (baseRate !== null) addRate(baseRate + 0.01, 'di atas saran');
     rates.sort((a, b) => a.value - b.value);

     return {
          grade: pefindo.grade || null,
          grade_index: Number.isFinite(pefindo.index) ? pefindo.index : null,
          scale_mode: pefindo.scale_mode || 'pefindo',
          pd: num(risk.pd && risk.pd.pd_12m, null),
          binding_label: nom.binding_label || null,
          requested,
          automaticMaximum: maximum,
          amounts,
          rates,
          recommended: {
               amount: num(nom.recommended_nominal, null),
               rate: baseRate
          },
          ready: amounts.length > 0 && rates.length > 0
     };
}

export default {
     OFFER_STATUS,
     normalizeOffer,
     buildOfferOptions
};
