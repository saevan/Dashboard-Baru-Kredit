/**
 * core/restructuring.js — Restrukturisasi 3R & masa tunggu kolektibilitas (POJK 40/2019).
 * Pure functions; TIDAK menyentuh DOM.
 *
 *  · Rescheduling    — ubah jadwal: perpanjang tenor / sesuaikan angsuran.
 *  · Reconditioning  — ubah syarat tanpa tambahan utang: turunkan bunga (tidak di
 *                      bawah titik impas), tenggang bunga, hapus denda.
 *  · Restructuring   — perombakan menyeluruh: tambahan fasilitas / konversi utang
 *                      menjadi penyertaan modal sementara (PMS) — keputusan komite.
 *
 * Masa tunggu: kualitas kredit hasil restrukturisasi paling tinggi sama dengan
 * sebelum restrukturisasi; naik satu tingkat setiap 3 pembayaran tepat waktu
 * berturut-turut; dibekukan selama masa tenggang; satu kali telat mengulang hitungan.
 */

import { DEFAULT_CONFIG, COLLECTIBILITY_ORDER } from './config.js';

const num = (v, d = 0) =>
     v === null || v === undefined || v === ''
          ? d
          : Number.isFinite(Number(v))
               ? Number(v)
               : d;
const round4 = (v) => Math.round(v * 1e4) / 1e4;

export const RESTRUCTURE_TYPE_LABEL = {
     rescheduling: 'Rescheduling — perpanjangan tenor',
     reconditioning: 'Reconditioning — penurunan bunga',
     kombinasi: 'Rescheduling + reconditioning',
     restructuring: 'Restructuring menyeluruh'
};

/** Angsuran anuitas bulanan. */
export function annuityPayment(principal, annualRate, months) {
     const p = Math.max(0, num(principal));
     const n = Math.max(1, Math.round(num(months)));
     const r = num(annualRate) / 12;
     if (p <= 0) return 0;
     if (r <= 0) return p / n;
     return (p * r) / (1 - Math.pow(1 + r, -n));
}

/** Bulan berjalan sejak tanggal pencairan. */
export function monthsElapsed(from, now = Date.now()) {
     const start = Date.parse(from || '');
     if (!Number.isFinite(start)) return 0;
     const a = new Date(start);
     const b = new Date(now);
     return Math.max(0, (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()));
}

/**
 * Simulasi opsi 3R untuk fasilitas aktif.
 * @param {object} args
 * @param {number} args.outstanding — sisa pokok
 * @param {number} args.rate — bunga tahunan berjalan
 * @param {number} args.remainingMonths — sisa tenor
 * @param {number} args.annualCashFlow — arus kas tahunan tersedia untuk membayar utang (kondisi terkini)
 * @param {number} [args.otherAnnualDebtService] — angsuran utang lain per tahun
 * @param {number} [args.floorRate] — titik impas risiko (batas bawah reconditioning)
 * @param {number} [args.targetDscr]
 */
export function proposeRestructuring({ outstanding = 0, rate = 0, remainingMonths = 12, annualCashFlow = 0, otherAnnualDebtService = 0,
     floorRate = null, targetDscr = 1.2, config = DEFAULT_CONFIG } = {}) {
     const cfg = config.restructuring || DEFAULT_CONFIG.restructuring;
     const remaining = Math.max(1, Math.round(num(remainingMonths, 12)));
     const maxTenor = Math.min(num(cfg.maxTenorBulan, 120), remaining + num(cfg.maxTenorExtensionBulan, 60));
     const floor = Math.min(num(rate), Math.max(0, floorRate === null ? num(rate) : num(floorRate)));
     const cash = num(annualCashFlow);
     const other = num(otherAnnualDebtService);
     const dscrOf = (monthly) => (monthly * 12 + other > 0 ? cash / (monthly * 12 + other) : null);
     const option = (type, tenor, r) => {
          const monthly = annuityPayment(outstanding, r, tenor);
          const dscr = dscrOf(monthly);
          return {
               type,
               label: RESTRUCTURE_TYPE_LABEL[type],
               tenor_bulan: tenor,
               rate: round4(r),
               monthly_installment: Math.round(monthly),
               annual_debt_service: Math.round(monthly * 12),
               total_interest: Math.round(monthly * tenor - num(outstanding)),
               dscr: dscr === null ? null : Math.round(dscr * 100) / 100,
               feasible: dscr !== null && dscr >= 1,
               meets_target: dscr !== null && dscr >= targetDscr
          };
     };
     // Tenor terpendek (rescheduling) atau bunga tertinggi (reconditioning) yang mencapai target.
     const shortestTenor = (r) => {
          for (let n = remaining; n <= maxTenor; n += 1) if ((dscrOf(annuityPayment(outstanding, r, n)) ?? 0) >= targetDscr) return n;
          return maxTenor;
     };
     const highestRate = (n) => {
          if ((dscrOf(annuityPayment(outstanding, floor, n)) ?? 0) < targetDscr) return floor;
          let lo = floor;
          let hi = num(rate);
          for (let i = 0; i < 40; i += 1) {
               const mid = (lo + hi) / 2;
               if ((dscrOf(annuityPayment(outstanding, mid, n)) ?? 0) >= targetDscr) lo = mid; else hi = mid;
          }
          return lo;
     };

     const current = option('berjalan', remaining, num(rate));
     current.label = 'Syarat berjalan';
     const options = [
          option('rescheduling', shortestTenor(num(rate)), num(rate)),
          option('reconditioning', remaining, highestRate(remaining)),
          option('kombinasi', shortestTenor(floor), floor)
     ];
     const best = options.find((o) => o.meets_target) || options.find((o) => o.feasible) || null;
     return {
          current,
          options,
          recommended: best ? best.type : 'restructuring',
          needs_full_restructuring: !options.some((o) => o.feasible),
          full_restructuring_note: 'Bila tidak ada opsi yang mencapai DSCR ≥ 1,0: pertimbangkan tambahan fasilitas modal kerja, konversi tunggakan menjadi penyertaan modal sementara (PMS), atau penyelesaian melalui agunan — keputusan komite.',
          inputs: { outstanding: Math.round(num(outstanding)), rate: num(rate), remaining_months: remaining, annual_cash_flow: Math.round(cash),
               other_annual_debt_service: Math.round(other), floor_rate: round4(floor), target_dscr: targetDscr, max_tenor: maxTenor }
     };
}

/**
 * Batas kolektibilitas fasilitas hasil restrukturisasi (masa tunggu POJK 40).
 * @param {object} record — { at, collectibility_before, grace_until, payments: [{ at, on_time }] }
 * @returns {{ cap:string, consecutive_on_time:number, notches:number, next_upgrade_in:(number|null), in_grace:boolean }}
 */
export function restructuringStatus(record = {}, { now = Date.now(), config = DEFAULT_CONFIG } = {}) {
     const per = Math.max(1, num(config.restructuring?.gestationPayments, 3));
     const before = COLLECTIBILITY_ORDER.includes(record.collectibility_before) ? record.collectibility_before : 'lancar';
     const graceEnd = Date.parse(record.grace_until || '');
     const inGrace = Number.isFinite(graceEnd) && now < graceEnd;
     const payments = Array.isArray(record.payments) ? record.payments : [];
     let consecutive = 0;
     for (let i = payments.length - 1; i >= 0 && payments[i]?.on_time; i -= 1) consecutive += 1;
     const notches = inGrace ? 0 : Math.floor(consecutive / per);
     const capIndex = Math.max(0, COLLECTIBILITY_ORDER.indexOf(before) - notches);
     return {
          cap: COLLECTIBILITY_ORDER[capIndex],
          collectibility_before: before,
          consecutive_on_time: consecutive,
          notches,
          next_upgrade_in: capIndex === 0 || inGrace ? null : per - (consecutive % per),
          in_grace: inGrace,
          missed_last: payments.length > 0 && !payments[payments.length - 1]?.on_time
     };
}

/** Validasi opsi yang dipilih sebelum disimpan (dipakai lokal & server). */
export function validateRestructuring(option = {}, config = DEFAULT_CONFIG) {
     const cfg = config.restructuring || DEFAULT_CONFIG.restructuring;
     if (!['rescheduling', 'reconditioning', 'kombinasi', 'restructuring'].includes(option.type)) return 'Jenis restrukturisasi tidak dikenal.';
     const tenor = num(option.tenor_bulan, NaN);
     if (option.type !== 'restructuring' && (!Number.isFinite(tenor) || tenor < 1 || tenor > num(cfg.maxTenorBulan, 120))) return `Tenor baru harus 1–${num(cfg.maxTenorBulan, 120)} bulan.`;
     const rate = num(option.rate, NaN);
     if (option.type !== 'restructuring' && (!Number.isFinite(rate) || rate < 0 || rate > 1)) return 'Suku bunga baru tidak valid.';
     const grace = num(option.grace_bulan, 0);
     if (grace < 0 || grace > num(cfg.maxGraceBulan, 12)) return `Masa tenggang maksimal ${num(cfg.maxGraceBulan, 12)} bulan.`;
     return null;
}

/** Record restrukturisasi baru dari opsi terpilih. */
export function restructuringRecord({ option = {}, collectibilityBefore = 'lancar', termsBefore = {}, note = '', by = '', now = new Date() } = {}) {
     const at = now.toISOString();
     const grace = Math.max(0, Math.round(num(option.grace_bulan, 0)));
     const graceUntil = grace ? new Date(new Date(now).setMonth(now.getMonth() + grace)).toISOString() : null;
     return {
          type: option.type,
          label: RESTRUCTURE_TYPE_LABEL[option.type],
          at,
          by,
          note: String(note || '').trim().slice(0, 500),
          collectibility_before: collectibilityBefore,
          terms_before: termsBefore,
          terms_after: option.type === 'restructuring' ? null : { tenor_bulan: num(option.tenor_bulan), rate: num(option.rate), monthly_installment: num(option.monthly_installment, null) },
          grace_until: graceUntil,
          payments: []
     };
}

export default { annuityPayment, monthsElapsed, proposeRestructuring, restructuringStatus, validateRestructuring, restructuringRecord, RESTRUCTURE_TYPE_LABEL };
