/**
 * core/daily-cashflow.js — Analisis arus kas HARIAN (khusus segmen UMKM).
 *
 * Menjawab masukan stakeholder: "umkm kalau bisa cuma perhari".
 * Omzet & arus kas tahunan/bulanan dipecah ke granularitas harian memakai
 * asumsi hari kerja, lalu dibandingkan dengan kebutuhan setoran angsuran per hari.
 *
 *   hari kerja/tahun      = hari kerja/bulan × 12
 *   omzet harian          = penjualan tahunan / hari kerja/tahun
 *   arus kas harian       = arus kas operasional tahunan / hari kerja/tahun
 *   setoran harian        = total debt service tahunan / hari kerja/tahun
 *   net harian            = arus kas harian − setoran harian
 *   coverage harian       = arus kas harian / setoran harian
 *
 * Pure function; tidak menyentuh DOM. Nominal dalam Rupiah.
 */

const num = (v, d = 0) => {
     if (v === null || v === undefined || v === '') return d;
     const n = Number(v);
     return Number.isFinite(n) ? n : d;
};

const numOrNull = (v) => {
     if (v === null || v === undefined || v === '') return null;
     const n = Number(v);
     return Number.isFinite(n) ? n : null;
};

/** Asumsi harian default (dapat ditimpa via config.dailyCashflow). */
export const DAILY_CASHFLOW_DEFAULTS = {
     workingDaysPerMonth: 26,
     weekendFactor: 0.6,
     transactionsPerDay: 10
};

const DAY_NAMES = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

/** Ambil total debt service tahunan dari blok debt service (fleksibel antar skema). */
function annualDebtService(debtService = {}, override) {
     const o = numOrNull(override);
     if (o !== null) return o;
     const direct = numOrNull(debtService.total_annual);
     if (direct !== null) return direct;
     const monthly = numOrNull(debtService.total_monthly_avg);
     if (monthly !== null) return monthly * 12;
     const existing = num(debtService.existing_annual, 0);
     const baru = num(debtService.new_loan && debtService.new_loan.total_annual, 0);
     return existing + baru;
}

/**
 * Bangun analisis arus kas harian.
 * @param {object} borrower — data borrower (memakai keuangan.penjualan & arus_kas_operasional)
 * @param {object} [analysis] — hasil runFullAnalysis (memakai debtService) — opsional
 * @param {object} [options] — { config, segment, applicable, annualDs }
 * @returns {object} analisis harian (selalu objek; `applicable` menandai relevansi segmen)
 */
export function buildDailyCashflow(borrower = {}, analysis = {}, options = {}) {
     const config = options.config || {};
     const cfg = { ...DAILY_CASHFLOW_DEFAULTS, ...(config.dailyCashflow || {}) };
     const keuangan = borrower.keuangan || {};
     const segment = options.segment || null;
     const applicable =
          options.applicable !== undefined ? !!options.applicable : !!(segment && segment.treatment && segment.treatment.daily_cashflow);

     const workingDaysPerMonth = Math.max(1, Math.round(num(cfg.workingDaysPerMonth, 26)));
     const workingDaysPerYear = workingDaysPerMonth * 12;
     const weekendFactor = Math.min(1, Math.max(0, num(cfg.weekendFactor, 0.6)));
     const transactionsPerDay = Math.max(1, Math.round(num(cfg.transactionsPerDay, 10)));

     const annualRevenue = num(keuangan.penjualan, 0);
     const annualOcf = num(keuangan.arus_kas_operasional, 0);
     const annualDs = annualDebtService(analysis.debtService || {}, options.annualDs);

     const dailyRevenue = annualRevenue / workingDaysPerYear;
     const dailyOcf = annualOcf / workingDaysPerYear;
     const dailySetAside = annualDs / workingDaysPerYear;
     const dailyNet = dailyOcf - dailySetAside;
     const coverage = dailySetAside > 0 ? dailyOcf / dailySetAside : null;
     const avgTransaction = dailyRevenue / transactionsPerDay;

     const weeklyWeights = DAY_NAMES.map((day, i) => {
          const weekend = i >= 5;
          const weight = weekend ? weekendFactor : 1;
          return { day, weekend, weight, revenue: dailyRevenue * weight };
     });
     const weeklyRevenue = weeklyWeights.reduce((a, d) => a + d.revenue, 0);

     let status;
     if (!applicable) status = 'tidak_relevan';
     else if (annualDs <= 0 || (annualRevenue <= 0 && annualOcf <= 0)) status = 'tidak_ada_data';
     else if (dailyNet < 0) status = 'defisit';
     else if (coverage !== null && coverage < 1.2) status = 'ketat';
     else status = 'sehat';

     const notes = [];
     if (!applicable) {
          notes.push('Segmen ini tidak mewajibkan analisis harian; data disajikan sebagai referensi.');
     }
     if (status === 'tidak_ada_data') {
          notes.push('Data omzet/arus kas belum cukup untuk proyeksi harian.');
     } else if (status === 'defisit') {
          notes.push(`Arus kas harian TIDAK cukup menutup setoran angsuran (kurang ${fmtRp(Math.abs(dailyNet))}/hari).`);
     } else if (status === 'ketat') {
          notes.push(`Arus kas harian hanya menutup ${coverage.toFixed(2)}x setoran angsuran — margin tipis.`);
     } else if (status === 'sehat') {
          notes.push(`Arus kas harian menutup ${coverage !== null ? coverage.toFixed(2) : '—'}x setoran angsuran.`);
     }
     if (applicable && weekdayOfUmkm(segment)) {
          notes.push('Disarankan pencairan/monitoring bertahap mengikuti pola arus kas harian.');
     }

     return {
          applicable,
          segment_key: segment ? segment.key : null,
          period: 'harian',
          status,
          assumptions: {
               working_days_per_month: workingDaysPerMonth,
               working_days_per_year: workingDaysPerYear,
               weekend_factor: weekendFactor,
               transactions_per_day: transactionsPerDay
          },
          daily: {
               revenue: round2(dailyRevenue),
               ocf: round2(dailyOcf),
               debt_service_set_aside: round2(dailySetAside),
               net: round2(dailyNet),
               avg_transaction: round2(avgTransaction)
          },
          monthly: {
               revenue: round2(annualRevenue / 12),
               ocf: round2(annualOcf / 12),
               debt_service: round2(annualDs / 12)
          },
          annual: { revenue: annualRevenue, ocf: annualOcf, debt_service: annualDs },
          coverage_ratio: coverage === null ? null : round2(coverage),
          weekly_weights: weeklyWeights.map((d) => ({ ...d, revenue: round2(d.revenue) })),
          weekly_revenue: round2(weeklyRevenue),
          notes
     };
}

function weekdayOfUmkm(segment) {
     return segment && (segment.key === 'umkm_mikro' || segment.key === 'umkm_kecil');
}

function round2(v) {
     return Math.round(Number(v) * 100) / 100;
}

function fmtRp(v) {
     return `Rp ${Math.round(Number(v) || 0).toLocaleString('id-ID')}`;
}

export default { buildDailyCashflow, DAILY_CASHFLOW_DEFAULTS };
