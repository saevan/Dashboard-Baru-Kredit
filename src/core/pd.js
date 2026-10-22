/**
 * core/pd.js — Skor → PD, LGD, EAD, Expected Loss, dan pricing berbasis risiko (W6).
 * Pure functions; TIDAK menyentuh DOM.
 *
 * Rantai: skor akhir → PD 12 bulan (interpolasi log-linear pada tabel anchor)
 *         → penyesuaian profil/sektor/coverage → PD lifetime
 *         → LGD (haircut agunan + uplift personal guarantee)
 *         → EAD (CCF) → Expected Loss (EL) & Unexpected Loss (UL)
 *         → build-up suku bunga (funding + EL + opex + capital charge + margin)
 *         → RAROC.
 */

import { DEFAULT_CONFIG, PROFILE_RULES, SECTOR_RULES } from './config.js';

const num = (v, d = 0) =>
     v === null || v === undefined || v === ''
          ? d
          : Number.isFinite(Number(v))
               ? Number(v)
               : d;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const r6 = (v) => Math.round(v * 1e6) / 1e6;

/* ----------------------------------------------------------- skor → PD ---- */

/** Interpolasi PD log-linear pada anchors [score, pd] (monoton turun). */
export function interpolatePd(score, anchors) {
     const s = clamp(num(score), 0, 100);
     const list = (anchors || [])
          .map(([sc, pd]) => ({ s: Number(sc), p: Number(pd) }))
          .filter((a) => Number.isFinite(a.s) && Number.isFinite(a.p) && a.p > 0)
          .sort((a, b) => b.s - a.s);
     if (!list.length) return 0.06;

     if (s >= list[0].s) return list[0].p;
     if (s <= list[list.length - 1].s) return list[list.length - 1].p;

     for (let i = 0; i < list.length - 1; i += 1) {
          const hi = list[i];
          const lo = list[i + 1];
          if (s <= hi.s && s >= lo.s) {
               const t = (hi.s - s) / (hi.s - lo.s || 1);
               const logPd = Math.log(hi.p) + t * (Math.log(lo.p) - Math.log(hi.p));
               return Math.exp(logPd);
          }
     }
     return list[list.length - 1].p;
}

/**
 * Skor → PD 12 bulan & lifetime dengan multiplier profil/sektor + penalti coverage.
 * @param {object} args — { score, config, profileKey, sectorKey, coverage, tenorBulan }
 */
export function scoreToPd({ score = 0, config = DEFAULT_CONFIG, profileKey = null, sectorKey = null, coverage = 1, tenorBulan = 12 } = {}) {
     const cfg = config.pd || DEFAULT_CONFIG.pd;
     const base = interpolatePd(score, cfg.anchors);

     const profileMult = num(PROFILE_RULES?.[profileKey]?.pdMultiplier, 1) || 1;
     const sectorMult = num(SECTOR_RULES?.[sectorKey]?.pdMultiplier, 1) || 1;

     const floorCov = num(cfg.coverageFloor, 0.6);
     const cov = clamp(num(coverage, 1), 0, 1);
     const coveragePenalty = cov >= floorCov ? 1 : 1 + num(cfg.coveragePenaltyMax, 0.35) * (1 - cov / floorCov);

     let pd12 = clamp(base * profileMult * sectorMult * coveragePenalty, num(cfg.floor, 0.0005), num(cfg.cap, 0.45));

     // Lifetime PD: blend ke rata-rata jangka panjang, lalu majemuk sepanjang tenor.
     const longRun = 0.06;
     const mr = clamp(num(cfg.meanReversion, 0.35), 0, 1);
     const pdAnnualBlended = mr * longRun + (1 - mr) * pd12;
     const years = Math.max(1 / 12, num(tenorBulan, 12) / 12);
     const pdLifetime = clamp(1 - Math.pow(1 - pdAnnualBlended, years), pd12, num(cfg.cap, 0.45));

     return {
          pd_12m: r6(pd12),
          pd_lifetime: r6(pdLifetime),
          base_pd: r6(base),
          profile_multiplier: profileMult,
          sector_multiplier: sectorMult,
          coverage_penalty: Math.round(coveragePenalty * 1e4) / 1e4,
          horizon_bulan: num(cfg.horizonBulan, 12)
     };
}

/* ------------------------------------------------------------------ LGD ---- */

/**
 * LGD dari agunan + personal guarantee.
 * Hasil pemulihan = nilai agunan × (1 − haircut) didiskonto selama masa pemulihan
 * (deposito segera; tanah/bangunan ±18 bulan), karena uang yang kembali terlambat bernilai lebih kecil.
 */
export function lgdFromCollateral({ nilaiAgunan = 0, jenis = 'tanpa_agunan', plafon = 0, personalGuarantee = false, config = DEFAULT_CONFIG } = {}) {
     const cfg = config.lgd || DEFAULT_CONFIG.lgd;
     const haircut = num(cfg.haircutByJenis?.[jenis], cfg.haircutByJenis?.lainnya ?? 0.55);
     const recoveryMonths = Math.max(0, num(cfg.recoveryMonthsByJenis?.[jenis], num(cfg.recoveryMonths, 0)));
     const discountFactor = 1 / Math.pow(1 + Math.max(0, num(cfg.discountRate, 0)), recoveryMonths / 12);
     const recoveryValue = Math.max(0, num(nilaiAgunan) * (1 - haircut) * discountFactor);
     const coverageRatio = num(plafon) > 0 ? clamp(recoveryValue / num(plafon), 0, 1) : 0;

     let lgd = 1 - coverageRatio;
     if (personalGuarantee) lgd = Math.max(0, lgd - num(cfg.pgUplift, 0.05));
     lgd = clamp(lgd, num(cfg.floor, 0.05), num(cfg.cap, 0.9));

     return {
          lgd: r6(lgd),
          haircut,
          recovery_months: recoveryMonths,
          discount_factor: r6(discountFactor),
          recovery_value: Math.round(recoveryValue),
          coverage_ratio: r6(coverageRatio),
          pg_uplift: personalGuarantee ? num(cfg.pgUplift, 0.05) : 0
     };
}

/* ------------------------------------------------------------------ EAD ---- */

/** EAD = plafon × CCF (1,0 untuk kredit berjangka yang dicairkan penuh). */
export function eadFromFacility({ plafon = 0, ccf = null, config = DEFAULT_CONFIG } = {}) {
     const factor = ccf === null || ccf === undefined ? num(config.debtService?.ccf, 1) : num(ccf, 1);
     const ead = num(plafon) * factor;
     return { ead: Math.round(ead), ccf: factor, plafon: num(plafon) };
}

/* ------------------------------------------------------------- EL & UL ---- */

/** Expected Loss & Unexpected Loss (proxy Basel tanpa korelasi). */
export function expectedLoss({ pd = 0, lgd = 0, ead = 0 } = {}) {
     const el_rate = num(pd) * num(lgd);
     const ul_rate = num(lgd) * Math.sqrt(Math.max(0, num(pd) * (1 - num(pd))));
     return {
          el_rate: r6(el_rate),
          ul_rate: r6(ul_rate),
          el_amount: Math.round(el_rate * num(ead)),
          ul_amount: Math.round(ul_rate * num(ead))
     };
}

/* --------------------------------------------------------------- pricing ---- */

/**
 * Build-up suku bunga berbasis risiko.
 * rate = funding + EL + opex + capital charge + target margin + premi tenor.
 */
export function riskBasedPricing({ pd = 0, lgd = 0, ul_rate = 0, tenorBulan = 12, config = DEFAULT_CONFIG } = {}) {
     const cfg = config.pricing || DEFAULT_CONFIG.pricing;
     const elRate = num(pd) * num(lgd);
     const funding = num(cfg.fundingCost, 0.085);
     const opex = num(cfg.opexRate, 0.02);
     const capitalCharge = num(cfg.capitalChargeRate, 0.11) * num(ul_rate);
     const margin = num(cfg.targetMargin, 0.03);
     const tenorSpread = (num(cfg.tenorSpreadBpsPerYear, 5) / 10000) * (num(tenorBulan, 12) / 12);

     const raw = funding + elRate + opex + capitalCharge + margin + tenorSpread;
     const recommended = clamp(raw, num(cfg.minRate, 0.08), num(cfg.maxRate, 0.36));
     const breakeven = funding + elRate + opex;

     // RAROC = (pendapatan − dana − opex − EL) × (1 − pajak) / modal ekonomi (UL).
     const capital = num(ul_rate) > 0 ? num(ul_rate) : num(cfg.capitalChargeRate, 0.11);
     const tax = clamp(num(cfg.taxRate, 0.22), 0, 0.9);
     const hurdle = num(cfg.rarocHurdle, 0.15);
     const rarocAt = (rate) => (capital > 0 ? ((rate - breakeven) * (1 - tax)) / capital : null);
     const raroc = rarocAt(recommended);
     // Bunga terendah yang masih memenuhi hurdle RAROC.
     const hurdleRate = breakeven + (hurdle * capital) / (1 - tax);
     const meetsHurdle = raroc === null ? null : raroc + 1e-9 >= hurdle;

     return {
          recommended_rate: Math.round(recommended * 1e4) / 1e4,
          breakeven_rate: Math.round(breakeven * 1e4) / 1e4,
          hurdle_rate: Math.round(hurdleRate * 1e4) / 1e4,
          build_up: {
               funding_cost: funding,
               expected_loss: r6(elRate),
               opex,
               capital_charge: r6(capitalCharge),
               target_margin: margin,
               tenor_spread: r6(tenorSpread)
          },
          raroc: raroc === null ? null : Math.round(raroc * 100) / 100,
          raroc_pre_tax: raroc === null ? null : Math.round((raroc / (1 - tax)) * 100) / 100,
          raroc_hurdle: hurdle,
          meets_hurdle: meetsHurdle,
          hurdle_actions: meetsHurdle === false ? hurdleActions() : [],
          tax_rate: tax,
          clamped: raw !== recommended
     };
}

/** Langkah restrukturisasi bila RAROC di bawah hurdle (menekan EL/UL, bukan menaikkan bunga di atas batas). */
function hurdleActions() {
     return [
          'Tambah agunan atau personal/corporate guarantee untuk menurunkan LGD.',
          'Perpendek tenor atau kurangi plafon agar eksposur dan PD lifetime turun.',
          'Kenakan biaya provisi/administrasi di muka sebagai tambahan pendapatan.',
          'Bila tidak dapat distruktur ulang, ajukan ke komite sebagai pengecualian harga.'
     ];
}

/** RAROC setelah pajak pada suku bunga tertentu, memakai komponen pricing yang sama. */
export function rarocAtRate(pricing = {}, rate = 0, ulRate = 0) {
     const capital = num(ulRate) > 0 ? num(ulRate) : null;
     if (!capital || !Number.isFinite(Number(rate))) return null;
     const tax = num(pricing.tax_rate, 0.22);
     return Math.round((((num(rate) - num(pricing.breakeven_rate)) * (1 - tax)) / capital) * 100) / 100;
}

/**
 * Model lengkap: skor → PD → LGD → EAD → EL/UL → pricing.
 * @param {object} args — { score, borrower, config, analysis, coverage, profileKey, sectorKey }
 */
export function creditRiskModel({ score = 0, borrower = {}, config = DEFAULT_CONFIG, coverage = 1 } = {}) {
     const agunan = borrower.agunan || {};
     const plafon = num(borrower.plafon_diajukan);
     const tenorBulan = num(borrower.tenor_bulan, 12);
     const profileKey = borrower.profil_company || null;
     const sectorKey = borrower.sektor || null;

     const pdModel = scoreToPd({ score, config, profileKey, sectorKey, coverage, tenorBulan });
     const lgdModel = lgdFromCollateral({
          nilaiAgunan: agunan.nilai_agunan,
          jenis: agunan.jenis || 'tanpa_agunan',
          plafon,
          personalGuarantee: !!agunan.personal_guarantee,
          config
     });
     const eadModel = eadFromFacility({ plafon, config });
     const loss = expectedLoss({ pd: pdModel.pd_12m, lgd: lgdModel.lgd, ead: eadModel.ead });
     // EL sepanjang tenor (PD lifetime) — informasi untuk pencadangan; pricing tetap memakai PD 12 bulan.
     const elLifetimeRate = pdModel.pd_lifetime * lgdModel.lgd;
     const pricing = riskBasedPricing({ pd: pdModel.pd_12m, lgd: lgdModel.lgd, ul_rate: loss.ul_rate, tenorBulan, config });

     return {
          pd: pdModel,
          lgd: lgdModel,
          ead: eadModel,
          loss: { ...loss, pd_lifetime: pdModel.pd_lifetime, el_lifetime_rate: r6(elLifetimeRate), el_lifetime_amount: Math.round(elLifetimeRate * eadModel.ead) },
          pricing
     };
}

export default {
     interpolatePd,
     scoreToPd,
     lgdFromCollateral,
     eadFromFacility,
     expectedLoss,
     riskBasedPricing,
     rarocAtRate,
     creditRiskModel
};
