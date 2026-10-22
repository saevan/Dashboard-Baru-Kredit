/**
 * core/ratios.js — Perhitungan rasio keuangan + Altman Z-Score.
 * Pure functions; TIDAK menyentuh DOM. Rujukan: ARCHITECTURE §3.2, §3.6.J.
 */

import { ALTMAN_Z } from './config.js';
import { realDscr, annuityMonthly } from './debt-service.js';

/** Pembagian aman — kembalikan null bila pembagi 0 / bukan angka (bukan Infinity). */
export function safeDiv(a, b) {
     const x = Number(a);
     const y = Number(b);
     if (!Number.isFinite(x) || !Number.isFinite(y) || y === 0) return null;
     return x / y;
}

/** Angsuran anuitas bulanan. */
export function annuityPayment(principal, monthlyRate, n) {
     const p = Number(principal);
     const r = Number(monthlyRate);
     const m = Number(n);
     if (!Number.isFinite(p) || !Number.isFinite(m) || m <= 0) return null;
     if (!Number.isFinite(r) || r < 0) return null;
     return annuityMonthly(p, r, m);
}

/**
 * Altman Z-Score.
 * Z = 1.2·X1 + 1.4·X2 + 3.3·X3 + 0.6·X4 + 1.0·X5
 *   X1 = (aset lancar − liabilitas jangka pendek) / total aset
 *   X2 = laba ditahan / total aset        (fallback: laba bersih — didokumentasikan)
 *   X3 = EBIT / total aset
 *   X4 = ekuitas buku / total liabilitas  (proxy nilai pasar untuk perusahaan privat)
 *   X5 = penjualan / total aset
 */
export function altmanZ(f = {}) {
     const ta = Number(f.total_aset);
     if (!Number.isFinite(ta) || ta === 0) return null;
     const ca = Number(f.aset_lancar ?? 0);
     const cl = Number(f.liabilitas_jangka_pendek ?? 0);
     const ebit = Number(f.ebit ?? 0);
     const equity = Number(f.ekuitas ?? 0);
     const tl = Number(f.total_liabilitas ?? 0);
     const sales = Number(f.penjualan ?? 0);
     const re = Number(f.laba_ditahan ?? f.laba_bersih ?? 0);
     const X1 = (ca - cl) / ta;
     const X2 = re / ta;
     const X3 = ebit / ta;
     const X4 = tl === 0 ? 0 : equity / tl;
     const X5 = sales / ta;
     return 1.2 * X1 + 1.4 * X2 + 3.3 * X3 + 0.6 * X4 + 1.0 * X5;
}

/** Klasifikasi zona Altman Z. */
export function altmanZone(z) {
     if (z === null || z === undefined || Number.isNaN(z)) return null;
     if (z >= ALTMAN_Z.safe) return 'safe';
     if (z >= ALTMAN_Z.distress) return 'gray';
     return 'distress';
}

/**
 * DuPont decomposition 5-komponen (ARCHITECTURE §3.2 — explainability):
 *   ROE = Tax Burden × Interest Burden × Operating Margin × Asset Turnover × Equity Multiplier
 *
 *   Tax Burden        = Laba Bersih / EBT
 *   Interest Burden   = EBT / EBIT
 *   Operating Margin  = EBIT / Penjualan
 *   Asset Turnover    = Penjualan / Total Aset
 *   Equity Multiplier = Total Aset / Ekuitas   (financial leverage)
 *
 * EBT ≈ EBIT − beban bunga. Bila salah satu komponen tidak dapat dihitung
 * (pembagi 0), produk `computed_roe` = null. `reconciliation_gap` = computed − roe.
 * @param {object} f — blok keuangan
 * @returns {{ ebt:number, tax_burden:number|null, interest_burden:number|null,
 *   operating_margin:number|null, asset_turnover:number|null, equity_multiplier:number|null,
 *   roe:number|null, computed_roe:number|null, reconciliation_gap:number|null }}
 */
export function dupont(f = {}) {
     const sales = Number(f.penjualan ?? 0);
     const ebit = Number(f.ebit ?? 0);
     const ni = Number(f.laba_bersih ?? 0);
     const interest = Number(f.beban_bunga ?? 0);
     const assets = Number(f.total_aset ?? 0);
     const equity = Number(f.ekuitas ?? 0);

     const ebt = ebit - interest;
     // Beban pajak & beban bunga hanya bermakna bila laba sebelum pajak positif.
     const profitable = ebt > 0;
     const tax_burden = profitable ? safeDiv(ni, ebt) : null;
     const interest_burden = profitable ? safeDiv(ebt, ebit) : null;
     const operating_margin = safeDiv(ebit, sales);
     const asset_turnover = safeDiv(sales, assets);
     const equity_multiplier = safeDiv(assets, equity);
     const roe = safeDiv(ni, equity);

     const parts = [tax_burden, interest_burden, operating_margin, asset_turnover, equity_multiplier];
     const computed_roe = parts.every((v) => v !== null) ? parts.reduce((a, b) => a * b, 1) : null;

     return {
          ebt,
          tax_burden,
          interest_burden,
          operating_margin,
          asset_turnover,
          equity_multiplier,
          roe,
          computed_roe,
          reconciliation_gap: roe !== null && computed_roe !== null ? computed_roe - roe : null
     };
}

/**
 * Hitung seluruh rasio utama.
 * @param {object} financials — blok keuangan borrower
 * @param {object} opts — { plafon, tenorBulan, bungaTahunan, nilaiAgunan }
 */
export function computeRatios(financials = {}, opts = {}) {
     const f = financials;
     const plafon = Number(opts.plafon ?? 0);
     const tenorBulan = Number(opts.tenorBulan ?? 0);
     const bungaTahunan = Number(opts.bungaTahunan ?? 0);
     const nilaiAgunan = Number(opts.nilaiAgunan ?? 0);

     const ebit = Number(f.ebit ?? 0);
     const labaBersih = Number(f.laba_bersih ?? 0);
     const penjualan = Number(f.penjualan ?? 0);
     const bebanBunga = Number(
          f.beban_bunga ?? (Number.isFinite(plafon) ? plafon * bungaTahunan : 0)
     );

     const pokokTahunan = tenorBulan > 0 ? (plafon * 12) / tenorBulan : 0;
     const monthlyRate = bungaTahunan / 12;
     const angsuranBulanan =
          plafon > 0 && tenorBulan > 0 ? annuityPayment(plafon, monthlyRate, tenorBulan) : 0;
     const totalAngsuranTahunan = (angsuranBulanan || 0) * 12;

     const totalAset = Number(f.total_aset ?? 0);
     const ekuitas = Number(f.ekuitas ?? 0);
     const totalLiabilitas = Number(f.total_liabilitas ?? 0);
     const asetLancar = Number(f.aset_lancar ?? 0);
     const liabJangkaPendek = Number(f.liabilitas_jangka_pendek ?? 0);
     const persediaan = Number(f.persediaan ?? 0);
     const kas = Number(f.kas ?? 0);
     const piutang = Number(f.piutang ?? 0);
     const hpp = Number(f.hpp ?? NaN);

     const z = altmanZ(f);

     // --- debt service riil (opsional) -------------------------------------
     // Bila engine menyuplai opts.debtService (jadwal angsuran aktual + utang
     // eksisting), DSCR/DTI dihitung dari debt service riil; jika tidak, jatuh
     // ke proxy lama (EBIT / (beban bunga + pokok)) agar backward-compatible.
     const debtService = opts.debtService || null;
     const proxyDscr = safeDiv(ebit, bebanBunga + pokokTahunan);
     const proxyDti = safeDiv(totalAngsuranTahunan, penjualan);
     let dscrReal = null;
     let dsRatio = null;
     let dtiReal = null;
     let icrReal = null;
     let dsBasis = 'proxy';
     let dsNumeratorSource = '—';
     let annualDebtService = null;
     if (debtService) {
          const rd = realDscr({
               ocf: f.arus_kas_operasional,
               ebit,
               ebitda: opts.ebitda,
               penjualan,
               debtService,
               config: opts.config
          });
          dscrReal = rd.dscr_real;
          dsRatio = rd.ds_ratio;
          dtiReal = rd.dti_real;
          icrReal = rd.icr_real;
          dsBasis = rd.basis ? `real:${rd.basis}` : 'real';
          dsNumeratorSource = rd.numerator_source;
          annualDebtService = rd.annual_debt_service;
     }

     return {
          // likuiditas & leverage
          current_ratio: safeDiv(asetLancar, liabJangkaPendek),
          quick_ratio: safeDiv(asetLancar - persediaan, liabJangkaPendek),
          cash_ratio: safeDiv(kas, liabJangkaPendek),
          der: safeDiv(totalLiabilitas, ekuitas),
          dar: safeDiv(totalLiabilitas, totalAset),
          debt_to_capital: safeDiv(totalLiabilitas, totalLiabilitas + ekuitas),
          // profitabilitas
          roa: safeDiv(labaBersih, totalAset),
          roe: safeDiv(labaBersih, ekuitas),
          npm: safeDiv(labaBersih, penjualan),
          opm: safeDiv(ebit, penjualan),
          gpm: Number.isFinite(hpp) ? safeDiv(penjualan - hpp, penjualan) : null,
          // coverage & debt service — dscr/dti memakai DS riil bila tersedia
          icr: safeDiv(ebit, bebanBunga),
          dscr: dscrReal ?? proxyDscr,
          dti: dtiReal ?? proxyDti,
          dscr_real: dscrReal,
          dti_real: dtiReal,
          icr_real: icrReal,
          ds_ratio: dsRatio,
          // aktivitas
          tato: safeDiv(penjualan, totalAset),
          inventory_turnover: safeDiv(penjualan, persediaan),
          receivable_turnover: safeDiv(penjualan, piutang),
          payable_turnover: safeDiv(penjualan, totalLiabilitas),
          // turunan
          working_capital: asetLancar - liabJangkaPendek,
          altman_z: z,
          altman_zone: altmanZone(z),
          dupont: dupont(f),
          // basis perhitungan (untuk audit/explanation)
          _basis: {
               ebit,
               beban_bunga: bebanBunga,
               pokok_tahunan: pokokTahunan,
               angsuran_bulanan: angsuranBulanan,
               total_angsuran_tahunan: totalAngsuranTahunan,
               plafon,
               nilai_agunan: nilaiAgunan,
               tenor_bulan: tenorBulan,
               bunga_tahunan: bungaTahunan,
               dscr_basis: dsBasis,
               dscr_numerator_source: dsNumeratorSource,
               annual_debt_service: annualDebtService,
               dscr_proxy: proxyDscr
          }
     };
}

/** Rasio yang dibandingkan ke benchmark (subset yang tersedia di benchmark IDX). */
export const RATIOS_FOR_BENCHMARK = [
     'gpm',
     'opm',
     'npm',
     'roa',
     'roe',
     'dar',
     'der',
     'ltd_to_equity',
     'debt_to_capital',
     'icr',
     'current_ratio',
     'quick_ratio',
     'cash_ratio',
     'tato',
     'inventory_turnover',
     'receivable_turnover',
     'payable_turnover',
     'cash_turnover',
     'fato',
     'working_capital_turnover'
];
