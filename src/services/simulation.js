/**
 * services/simulation.js — Simulasi cicilan halaman depan & beranda pemohon
 * (ui/simulator.js lama): bunga flat, periodisitas saran per segmen, bunga efektif.
 */
import { installmentSimulationError } from '../core/installment-simulation.js';
import { loanCostDisclosure } from '../core/loan-cost.js';
import { classifyBorrower } from '../core/segment.js';
import { installmentFor, NEW_LOAN_SCHEME, periodicInstallment, suggestPeriodicity, normalizePeriodicity, PERIODICITY_LABELS } from '../core/debt-service.js';
import { DEFAULT_CONFIG } from '../core/config.js';

/** Batas yang dipublikasikan (landing lama: dari konfigurasi, bukan angka manual). */
export const POLICY = Object.freeze({
     minTenor: DEFAULT_CONFIG.nominal.minTenorBulan,
     maxTenor: DEFAULT_CONFIG.nominal.maxTenorBulan,
     maxPlafon: DEFAULT_CONFIG.segment.menengahMax
});

/**
 * @param {{plafon:number, tenor:number, bungaPersen:number, periodicity?:string, policy?:boolean}} input
 * @returns {{error:string}|{segment, suggested, periodicity, inst, periodic, cost}}
 */
export function simulate({ plafon, tenor, bungaPersen, periodicity = null, policy = true }) {
     const error = installmentSimulationError({ principal: plafon, tenorBulan: tenor, annualRate: bungaPersen === '' || bungaPersen === null ? '' : Number(bungaPersen) / 100 });
     if (error) return { error };
     if (policy && (Number(tenor) < POLICY.minTenor || Number(tenor) > POLICY.maxTenor)) return { error: `Lama pinjaman ${POLICY.minTenor}–${POLICY.maxTenor} bulan.` };
     if (policy && Number(plafon) > POLICY.maxPlafon) return { error: `Jumlah pinjaman maksimal Rp ${(POLICY.maxPlafon / 1e9).toLocaleString('id-ID')} miliar.` };
     const segment = classifyBorrower({ plafon_diajukan: Number(plafon) });
     const suggested = suggestPeriodicity(segment.key);
     const p = normalizePeriodicity(periodicity || suggested);
     const inst = installmentFor(NEW_LOAN_SCHEME, Number(plafon), Number(bungaPersen) / 100, Number(tenor), {});
     if (!Number.isFinite(inst.total_payment)) return { error: 'Angka terlalu besar untuk dihitung. Periksa jumlah dan bunga.' };
     const periodic = periodicInstallment({ monthlyPayment: inst.monthly_avg, periodicity: p, tenorBulan: Number(tenor) });
     return { segment, suggested, periodicity: p, periodicityLabel: PERIODICITY_LABELS[p], inst, periodic, cost: loanCostDisclosure(inst.principal, inst.schedule) };
}
