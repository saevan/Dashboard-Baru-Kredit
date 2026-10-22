/** Validation shared by borrower and lender calculators; rates are annual fractions. */
export function installmentSimulationError({ principal, annualRate, tenorBulan, graceMonths = 0, scheme = 'annuity' }) {
     const present = (value) => value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value));
     if (!present(principal) || Number(principal) <= 0 || Number(principal) > Number.MAX_SAFE_INTEGER) return 'Isi plafon lebih dari Rp0 dengan angka yang valid.';
     if (!present(tenorBulan) || !Number.isInteger(Number(tenorBulan)) || Number(tenorBulan) < 1 || Number(tenorBulan) > 600) return 'Tenor harus berupa bilangan bulat antara 1–600 bulan.';
     if (!present(annualRate) || Number(annualRate) < 0) return 'Isi bunga tahunan 0% atau lebih dengan angka yang valid.';
     if (!present(graceMonths) || !Number.isInteger(Number(graceMonths)) || Number(graceMonths) < 0 || Number(graceMonths) >= Number(tenorBulan)) return 'Masa tenggang harus berupa bulan penuh, mulai 0 dan lebih pendek dari tenor.';
     if (!['annuity', 'flat', 'bullet', 'musiman'].includes(scheme)) return 'Pilih skema angsuran yang tersedia.';
     return null;
}
