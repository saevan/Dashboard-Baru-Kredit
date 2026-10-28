/** Monthly end-of-period cash flows; no fees or upfront deductions assumed. */
export function presentValue(schedule, monthlyRate) {
     if (!Array.isArray(schedule) || !Number.isFinite(monthlyRate) || monthlyRate < 0) return null;
     let pv = 0;
     for (const row of schedule) {
          if (!Number.isFinite(row.payment) || row.payment < 0 || !Number.isInteger(row.month) || row.month < 1) return null;
          pv += row.payment * Math.exp(-row.month * Math.log1p(monthlyRate));
     }
     return Number.isFinite(pv) ? pv : null;
}

/** Solve P = sum(payment_t / (1+i)^t). i is an equivalent rate, not a discount. */
export function loanCostDisclosure(principal, schedule) {
     if (!Number.isFinite(principal) || principal <= 0 || !Array.isArray(schedule) || !schedule.length) return null;
     const total = presentValue(schedule, 0);
     if (total === null || total < principal - Math.max(1e-6, principal * 1e-12)) return null;
     let monthly = 0;
     if (total > principal + principal * 1e-12) {
          let low = 0;
          let high = 1;
          while (presentValue(schedule, high) > principal && high < 1e12) high *= 2;
          if (presentValue(schedule, high) > principal) return null;
          for (let iteration = 0; iteration < 100; iteration++) {
               const mid = (low + high) / 2;
               if (presentValue(schedule, mid) > principal) low = mid;
               else high = mid;
          }
          monthly = (low + high) / 2;
     }
     const annual = Math.expm1(12 * Math.log1p(monthly));
     if (!Number.isFinite(annual)) return null;
     return { version: 1, basis: 'monthly_end_of_period_no_fees', principal,
          total_payment: total, monthly_rate: monthly, effective_annual_rate: annual,
          present_value: presentValue(schedule, monthly) };
}

/** Whitelist saved disclosure data; legacy offers remain without a fabricated rate. */
export function normalizeLoanCost(raw) {
     if (raw?.version !== 1 || raw.basis !== 'monthly_end_of_period_no_fees') return null;
     const keys = ['principal', 'total_payment', 'monthly_rate', 'effective_annual_rate', 'present_value'];
     if (keys.some(key => !Number.isFinite(raw[key]) || raw[key] < 0)) return null;
     return { version: 1, basis: raw.basis, ...Object.fromEntries(keys.map(key => [key, raw[key]])) };
}
