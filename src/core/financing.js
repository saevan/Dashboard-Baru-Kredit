/** Contract arithmetic. Net profit is after operating costs/tax, before this profit share. */
export function profitSharePayment(principal, months, ratio, netProfit) {
     if (![principal, months, ratio, netProfit].every(v => typeof v === 'number' && Number.isFinite(v)) ||
          principal <= 0 || !Number.isInteger(months) || months < 1 || months > 600 || ratio <= 0 || ratio > 1) {
          throw new Error('Pokok/tenor tidak valid atau porsi net profit harus lebih dari 0 sampai 100%.');
     }
     const principalPayment = principal / months;
     const share = Math.max(0, netProfit) * ratio;
     return { principal: principalPayment, share, payment: principalPayment + share };
}

/** Carry the agreed contract into a facility, rather than reusing the requested terms. */
export function borrowerWithOffer(borrower, offer) {
     const terms = offer?.terms;
     if (!(offer?.amount > 0) || !terms?.tenor_bulan) throw new Error('Syarat penawaran belum lengkap.');
     const profit = offer.basis === 'net_profit';
     if (profit) profitSharePayment(offer.amount, terms.tenor_bulan, offer.share_ratio, offer.expected_profit_monthly);
     else if (!(offer.rate > 0)) throw new Error('Suku bunga penawaran belum lengkap.');
     return { ...borrower, plafon_diajukan: offer.amount, bunga_tahunan: profit ? 0 : offer.rate,
          tenor_bulan: terms.tenor_bulan, skema_angsuran: profit ? 'profit_share' : terms.scheme,
          periode_angsuran: profit ? 'bulanan' : terms.periodicity, grace_period_bulan: profit ? 0 : terms.grace_months,
          financing: profit ? { basis: 'net_profit', share_ratio: offer.share_ratio, expected_profit_monthly: offer.expected_profit_monthly } : null,
          accepted_offer: structuredClone(offer) };
}
