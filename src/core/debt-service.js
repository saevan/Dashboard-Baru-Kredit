/**
 * core/debt-service.js — Debt service riil (tenor, skema angsuran, utang eksisting).
 * Pure functions; TIDAK menyentuh DOM.
 *
 * Tujuan (workstream "DSCR dari debt service riil"):
 *  - Menghitung jadwal angsuran per skema: anuitas | flat | bullet | musiman.
 *  - Menggabungkan angsuran kredit baru + seluruh utang eksisting.
 *  - Menyediakan DSCR/DTI/ICR/ds_ratio berbasis debt service riil yang transparan
 *    (basis numerator eksplisit: OCF → EBITDA → EBIT).
 *
 * Catatan: modul ini SENGAJA tidak mengimpor dari ratios.js agar tidak terjadi
 * circular import (ratios.js mengimpor modul ini).
 */

import { DEFAULT_CONFIG } from './config.js';
import { classifyBorrower } from './segment.js';
import { profitSharePayment } from './financing.js';

/* ---------------------------------------------------------------- angka ---- */

const num = (v, d = 0) =>
     v === null || v === undefined || v === ''
          ? d
          : Number.isFinite(Number(v))
               ? Number(v)
               : d;

/** Pembagian aman — null bila pembagi 0 / bukan angka. */
function safeDiv(a, b) {
     const x = Number(a);
     const y = Number(b);
     if (!Number.isFinite(x) || !Number.isFinite(y) || y === 0) return null;
     return x / y;
}

/** Angsuran anuitas bulanan. */
export function annuityMonthly(principal, monthlyRate, n) {
     const p = num(principal);
     const r = num(monthlyRate);
     const m = num(n);
     if (!Number.isFinite(p) || !Number.isFinite(m) || m <= 0) return 0;
     if (r === 0) return p / m;
     return (p * r) / -Math.expm1(-m * Math.log1p(r));
}

/* --------------------------------------------------------------- skema ---- */

export const INSTALLMENT_SCHEMES = ['annuity', 'flat', 'bullet', 'musiman'];

/** Policy for NEW drafts. Legacy records without a scheme retain the old fallback. */
export const NEW_LOAN_SCHEME = 'flat';

export const SCHEME_LABELS = {
     annuity: 'Anuitas (cicilan tetap)',
     flat: 'Flat (bunga tetap atas pokok awal)',
     profit_share: 'Pokok rutin + bagi hasil net profit (proyeksi)',
     bullet: 'Bullet (bunga saja, pokok di akhir)',
     musiman: 'Musiman (puncak di musim ramai)'
};

/* ---------------------------------------------------------- periodisitas ---- */

/**
 * Periodisitas pembayaran angsuran — TERPISAH dari skema (pola) angsuran.
 * Menentukan seberapa sering cicilan dibayar: bulanan / mingguan / harian.
 * UMKM dengan arus kas harian umumnya memakai cicilan harian.
 */
export const PERIODICITIES = ['bulanan', 'mingguan', 'harian'];

export const PERIODICITY_LABELS = {
     bulanan: 'Bulanan',
     mingguan: 'Mingguan',
     harian: 'Harian'
};

/** Jumlah periode per tahun (konvensi 30/360 untuk harian). */
export const PERIODS_PER_YEAR = {
     bulanan: 12,
     mingguan: 52,
     harian: 360
};

/** Faktor konversi periode → bulan. */
export const PERIODS_PER_MONTH = {
     bulanan: 1,
     mingguan: 52 / 12,
     harian: 30
};

/** Normalisasi kode periodisitas (default 'bulanan'). */
export function normalizePeriodicity(value) {
     const v = String(value === null || value === undefined ? '' : value).trim().toLowerCase();
     return PERIODICITIES.includes(v) ? v : 'bulanan';
}

/**
 * Saran periodisitas berdasar segmen peminjam.
 * UMKM mikro/kecil (arus kas harian) → 'harian'; segmen lain → 'bulanan'.
 */
export function suggestPeriodicity(segmentKey) {
     const key = String(segmentKey || '').trim().toLowerCase();
     if (key === 'umkm_mikro' || key === 'umkm_kecil') return 'harian';
     return 'bulanan';
}

/**
 * Estimasi penyisihan dana dari jadwal BULANAN, bukan amortisasi harian/mingguan.
 * Bulatkan jumlah periode dahulu, lalu bagi total pembayaran agar rekonsiliasi.
 * @returns {{ periodicity, periods_per_month, periods_per_year, per_period,
 *   monthly_equivalent, tenor_period }}
 */
export function periodicInstallment({ monthlyPayment = 0, periodicity = 'bulanan', tenorBulan = 0 } = {}) {
     const p = normalizePeriodicity(periodicity);
     const ppm = PERIODS_PER_MONTH[p];
     const ppy = PERIODS_PER_YEAR[p];
     const monthly = Math.max(0, num(monthlyPayment));
     const tenor = Math.max(0, Math.floor(num(tenorBulan)));
     const periods = Math.round(tenor * ppm);
     const perPeriod = periods > 0 ? monthly * tenor / periods : 0;
     return {
          periodicity: p,
          periods_per_month: ppm,
          periods_per_year: ppy,
          per_period: perPeriod,
          monthly_equivalent: monthly,
          tenor_period: periods,
          basis: 'monthly_budget_equivalent'
     };
}

/* ------------------------------------------------------------- schedule ---- */

/**
 * Bangun jadwal angsuran bulanan.
 * @param {string} scheme — annuity | flat | bullet | musiman
 * @param {number} principal
 * @param {number} annualRate
 * @param {number} tenorBulan
 * @param {object} opts — { graceMonths, seasonalityFactor, peakMonths[] }
 * @returns {{ scheme, principal, tenor_bulan, schedule:array, monthly_avg,
 *   first_payment, peak_payment, annual, total_interest, total_payment,
 *   balloon, seasonality_factor }}
 */
export function installmentFor(scheme, principal, annualRate, tenorBulan, opts = {}) {
     const p = Math.max(0, num(principal));
     const annual = Math.max(0, num(annualRate));
     const n = Math.max(0, Math.floor(num(tenorBulan)));
     const monthlyRate = annual / 12;
     const graceMonths = Math.max(0, Math.floor(num(opts.graceMonths)));
     const seasonalityFactor = num(opts.seasonalityFactor, 1.15) || 1.15;
     const peakMonths = Array.isArray(opts.peakMonths) && opts.peakMonths.length
          ? opts.peakMonths
          : [3, 4, 5, 9, 10];

     const schedule = [];
     const push = (month, interest, princ) => {
          const i = Math.max(0, interest);
          const pr = Math.max(0, princ);
          schedule.push({ month, payment: i + pr, interest: i, principal: pr });
     };

     if (p <= 0 || n <= 0) {
          return {
               scheme,
               principal: p,
               tenor_bulan: n,
               schedule: [],
               monthly_avg: 0,
               first_payment: 0,
               peak_payment: 0,
               annual: 0,
               total_interest: 0,
               total_payment: 0,
               balloon: 0,
               seasonality_factor: seasonalityFactor
          };
     }

     // Grace period: hanya bunga (interest-only) selama graceMonths pertama.
     const g = Math.min(graceMonths, n);
     if (scheme !== 'bullet' && g >= n) {
          throw new RangeError('Masa tenggang harus lebih pendek dari tenor agar pokok dapat dilunasi.');
     }

     if (scheme === 'profit_share') {
          const projected = profitSharePayment(p, n, opts.shareRatio, opts.expectedProfitMonthly);
          let remaining = p;
          for (let m = 1; m <= n; m++) {
               const principalPayment = m === n ? remaining : Math.min(remaining, projected.principal);
               push(m, projected.share, principalPayment);
               remaining = Math.max(0, remaining - principalPayment);
          }
     } else if (scheme === 'bullet') {
          // Bunga saja tiap bulan; pokok + bunga terakhir di bulan ke-n (balloon).
          for (let m = 1; m <= n; m += 1) {
               const interest = p * monthlyRate;
               const princ = m === n ? p : 0;
               push(m, interest, princ);
          }
     } else if (scheme === 'flat') {
          const totalInterest = p * annual * (n / 12);
          const monthlyPrincipal = p / (n - g);
          const monthlyInterest = totalInterest / n;
          let remaining = p;
          for (let m = 1; m <= n; m += 1) {
               const princ = m <= g ? 0 : m === n ? remaining : Math.min(remaining, monthlyPrincipal);
               push(m, monthlyInterest, princ);
               remaining = Math.max(0, remaining - princ);
          }
     } else if (scheme === 'musiman') {
          // Total DS tahunan = anuitas-konvensional; distribusi dibuat tidak rata:
          // bulan puncak × seasonalityFactor, bulan lain menutup sisanya.
          const pk = peakMonths.filter((x) => x >= 1 && x <= 12).length || 4;
          const annualTarget = annuityMonthly(p, monthlyRate, n) * 12;
          const denom = pk * seasonalityFactor + (12 - pk);
          const base = denom > 0 ? annualTarget / denom : annualTarget / 12;
          const peakPay = base * seasonalityFactor;
          const offPay = base;
          let remaining = p;
          for (let m = 1; m <= n; m += 1) {
               const interest = remaining * monthlyRate;
               const calendar = ((m - 1) % 12) + 1;
               const target = peakMonths.includes(calendar) ? peakPay : offPay;
               let princ = m <= g ? 0 : Math.max(0, target - interest);
               if (m === n || princ > remaining) princ = remaining;
               push(m, interest, princ);
               remaining = Math.max(0, remaining - princ);
          }
     } else {
          // annuity (default)
          // Tenor includes grace: amortize over the remaining repayment months.
          const pay = annuityMonthly(p, monthlyRate, n - g);
          let remaining = p;
          for (let m = 1; m <= n; m += 1) {
               const interest = remaining * monthlyRate;
               let princ = m <= g ? 0 : Math.max(0, pay - interest);
               if (m === n || princ > remaining) princ = remaining;
               push(m, interest, princ);
               remaining = Math.max(0, remaining - princ);
          }
     }

     const totalInterest = schedule.reduce((s, x) => s + x.interest, 0);
     const totalPayment = schedule.reduce((s, x) => s + x.payment, 0);
     const peak = schedule.reduce((mx, x) => Math.max(mx, x.payment), 0);
     const firstYear = schedule.slice(0, 12);

     return {
          scheme,
          principal: p,
          tenor_bulan: n,
          grace_bulan: g,
          schedule,
          monthly_avg: p > 0 ? totalPayment / n : 0,
          first_payment: schedule.length ? schedule[0].payment : 0,
          peak_payment: peak,
          annual: firstYear.reduce((s, x) => s + x.payment, 0),
          interest_year1: firstYear.reduce((s, x) => s + x.interest, 0),
          total_interest: totalInterest,
          total_payment: totalPayment,
          balloon: scheme === 'bullet' ? p : 0,
          seasonality_factor: seasonalityFactor
     };
}

/* -------------------------------------------------------- utang eksisting ---- */

/**
 * Jadwal/angsuran satu utang eksisting.
 * Bila `angsuran_bulanan` tersedia, pakai langsung; jika tidak, hitung dari sisa pokok.
 */
export function existingDebtService(debt = {}, config = DEFAULT_CONFIG) {
     const ds = config.debtService || {};
     const scheme = debt.skema || ds.defaultScheme || 'annuity';
     const outstanding = num(debt.outstanding);
     const rate = num(debt.bunga_tahunan);
     // Terima alias usang `tenor_sisa_bulan` (data lama/seed) agar utang eksisting
     // tidak diam-diam diabaikan bila field memakai nama versi lama.
     const remainingTenor = num(debt.tenor_bulan_sisa ?? debt.tenor_sisa_bulan);
     const given = num(debt.angsuran_bulanan, NaN);

     if (Number.isFinite(given) && given > 0) {
          return {
               nama: debt.nama || 'Utang eksisting',
               scheme,
               monthly_payment: given,
               annual: given * 12,
               outstanding,
               source: 'angsuran_diberikan'
          };
     }

     const inst = installmentFor(scheme, outstanding, rate, remainingTenor, {
          seasonalityFactor: ds.seasonalityFactor
     });
     return {
          nama: debt.nama || 'Utang eksisting',
          scheme,
          monthly_payment: inst.monthly_avg,
          annual: inst.annual,
          interest_year1: inst.interest_year1,
          peak_payment: inst.peak_payment,
          outstanding,
          source: 'dihitung_dari_sisa_pokok'
     };
}

/* -------------------------------------------------------- agregat DS ---- */

/**
 * Gabungkan debt service kredit baru + utang eksisting.
 * @param {object} args — { borrower, config, overrides }
 */
export function computeDebtService({ borrower = {}, config = DEFAULT_CONFIG, overrides = {} } = {}) {
     const ds = config.debtService || {};
     const scheme =
          overrides.scheme || borrower.skema_angsuran || ds.defaultScheme || 'annuity';
     const plafon = num(overrides.plafon ?? borrower.plafon_diajukan);
     const tenorBulan = num(overrides.tenorBulan ?? borrower.tenor_bulan);
     const bungaTahunan = num(overrides.bungaTahunan ?? borrower.bunga_tahunan);
     const graceMonths = num(
          overrides.graceMonths ?? borrower.grace_period_bulan ?? 0
     );

     const newLoan = installmentFor(scheme, plafon, bungaTahunan, tenorBulan, {
          graceMonths,
          shareRatio: borrower.financing?.share_ratio,
          expectedProfitMonthly: borrower.financing?.expected_profit_monthly,
          seasonalityFactor: ds.seasonalityFactor,
          peakMonths: ds.peakMonths
     });

     // Periodisitas: '' (kosong) = otomatis mengikuti saran segmen; selain itu
     // dinormalisasi (default 'bulanan').
     const rawPeriod =
          overrides.periodicity !== undefined ? overrides.periodicity : borrower.periode_angsuran;
     const periodicity =
          rawPeriod === ''
               ? suggestPeriodicity(classifyBorrower(borrower).key)
               : normalizePeriodicity(rawPeriod);

     const list = Array.isArray(borrower.utang_eksisting) ? borrower.utang_eksisting : [];
     const existing = list.map((d) => existingDebtService(d, config));
     const existingAnnual = existing.reduce((s, x) => s + (x.annual || 0), 0);
     const existingMonthly = existing.reduce((s, x) => s + (x.monthly_payment || 0), 0);

     // Jadwal gabungan (panjang = tenor kredit baru, utang eksisting dianggap berjalan).
     const horizon = Math.max(
          newLoan.schedule.length,
          ...existing.map((x) => num(x.monthly_payment) > 0 ? 12 : 0),
          0
     );
     const scheduleCombined = [];
     for (let m = 1; m <= horizon; m += 1) {
          const nl = newLoan.schedule[m - 1] || { payment: 0, interest: 0, principal: 0 };
          scheduleCombined.push({
               month: m,
               new_loan: nl.payment,
               existing: existingMonthly,
               payment: nl.payment + existingMonthly
          });
     }

     const totalAnnual = (newLoan.annual || 0) + existingAnnual;
     const totalInterestAnnual =
          (newLoan.interest_year1 || 0) +
          existing.reduce((s, x) => s + (x.interest_year1 ?? (x.annual || 0) * 0.5), 0); // fallback estimasi untuk angsuran eksisting yang diberikan tanpa rincian

     const periodic = periodicInstallment({
          monthlyPayment: (newLoan.monthly_avg || 0) + existingMonthly,
          periodicity,
          tenorBulan
     });

     return {
          scheme,
          scheme_label: SCHEME_LABELS[scheme] || scheme,
          periode_angsuran: periodicity,
          periodicity_label: PERIODICITY_LABELS[periodicity],
          periodic,
          new_loan: newLoan,
          existing,
          existing_count: existing.length,
          existing_annual: existingAnnual,
          existing_monthly: existingMonthly,
          total_annual: totalAnnual,
          total_monthly_avg: newLoan.monthly_avg + existingMonthly,
          annual_basis: 'first_12_months',
          peak_monthly: (newLoan.peak_payment || 0) + existingMonthly,
          total_interest_year1: totalInterestAnnual,
          schedule_combined: scheduleCombined,
          seasonality_factor: ds.seasonalityFactor
     };
}

/* --------------------------------------------------------- DSCR riil ---- */

/**
 * Hitung rasio berbasis debt service riil.
 * Basis numerator mengikuti config.debtService.basis (default OCF → EBITDA → EBIT).
 * @returns {{ dscr_real, dti_real, icr_real, ds_ratio, basis, numerator,
 *   numerator_source, annual_debt_service, annual_interest }}
 */
export function realDscr({ ocf, ebit, ebitda, penjualan, debtService, config = DEFAULT_CONFIG } = {}) {
     const order = (config.debtService?.basis || 'ocf_then_ebitda_then_ebit').split('_then_');
     const sources = {
          ocf: { value: num(ocf, NaN), label: 'Arus Kas Operasional (OCF)' },
          ebitda: { value: num(ebitda, NaN), label: 'EBITDA' },
          ebit: { value: num(ebit, NaN), label: 'EBIT' }
     };

     let numerator = 0;
     let basis = null;
     let numeratorSource = '—';
     for (const key of order) {
          const s = sources[key];
          if (s && Number.isFinite(s.value) && s.value !== 0) {
               numerator = s.value;
               basis = key;
               numeratorSource = s.label;
               break;
          }
     }

     const annualDebtService = num(debtService?.total_annual);
     const annualInterest = debtService
          ? num(
               debtService.total_interest_year1 ??
               (num(debtService.new_loan?.total_interest) /
                    Math.max(1, Math.ceil(num(debtService.new_loan?.tenor_bulan) / 12)))
          )
          : 0;

     return {
          dscr_real: safeDiv(numerator, annualDebtService),
          dti_real: safeDiv(annualDebtService, num(penjualan)),
          icr_real: safeDiv(num(ebit), num(annualInterest) || num(annualDebtService)),
          ds_ratio: safeDiv(annualDebtService, numerator),
          basis,
          numerator,
          numerator_source: numeratorSource,
          annual_debt_service: annualDebtService,
          annual_interest: annualInterest
     };
}

export default {
     installmentFor,
     existingDebtService,
     computeDebtService,
     realDscr,
     INSTALLMENT_SCHEMES,
     SCHEME_LABELS,
     PERIODICITIES,
     PERIODICITY_LABELS,
     PERIODS_PER_YEAR,
     PERIODS_PER_MONTH,
     normalizePeriodicity,
     suggestPeriodicity,
     periodicInstallment
};
