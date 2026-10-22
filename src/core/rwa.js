/**
 * core/rwa.js — ATMR risiko kredit pendekatan standar (SEOJK 24/SEOJK.03/2021, Basel III).
 * Pure functions; TIDAK menyentuh DOM.
 *
 * Rantai: kelas eksposur → bobot risiko (RW) pihak lawan → mitigasi risiko kredit
 *   · agunan keuangan (deposito): E* = max(0, E × (1 + He) − C × (1 − Hc − Hfx))
 *   · properti komersial: porsi ≤ 55% nilai properti memakai min(60%, RW pihak lawan)
 * → eksposur tertunggak > 90 hari: 150% (cadangan khusus < 20%) atau 100%
 * → komitmen belum ditarik × CCF → ATMR = Σ eksposur × RW → modal minimum = ATMR × KPMM.
 *
 * Bobot dapat diubah di config.rwa; angka bawaan mengikuti kerangka Basel III
 * yang diadopsi SEOJK 24/2021 dan perlu dicocokkan dengan ketentuan internal lender.
 */

import { DEFAULT_CONFIG } from './config.js';
import { classifyBorrower } from './segment.js';

const num = (v, d = 0) =>
     v === null || v === undefined || v === ''
          ? d
          : Number.isFinite(Number(v))
               ? Number(v)
               : d;
const r4 = (v) => Math.round(v * 1e4) / 1e4;

export const EXPOSURE_CLASS_LABEL = {
     retail: 'UMKM ritel (memenuhi kriteria)',
     sme_corporate: 'UMKM korporasi',
     corporate: 'Korporasi tanpa peringkat',
     financial_institution: 'Lembaga keuangan tanpa peringkat',
     past_due: 'Tagihan tertunggak > 90 hari'
};

/** Kelas eksposur & RW pihak lawan sebelum mitigasi. */
export function exposureClass({ borrower = {}, exposure = 0, config = DEFAULT_CONFIG } = {}) {
     const cfg = config.rwa || DEFAULT_CONFIG.rwa;
     const seg = classifyBorrower(borrower, config);
     if (seg.is_financial) return { key: 'financial_institution', risk_weight: num(cfg.riskWeights?.financial_institution, 1) };
     if (seg.is_umkm && num(exposure) <= num(cfg.retailMaxExposure, 5e9)) return { key: 'retail', risk_weight: num(cfg.riskWeights?.retail, 0.75) };
     if (num(borrower.keuangan?.penjualan) <= num(cfg.smeMaxSales, 50e9)) return { key: 'sme_corporate', risk_weight: num(cfg.riskWeights?.sme_corporate, 0.85) };
     return { key: 'corporate', risk_weight: num(cfg.riskWeights?.corporate, 1) };
}

/**
 * ATMR satu fasilitas.
 * @param {object} args
 * @param {object} args.borrower — memuat agunan & keuangan
 * @param {number} args.drawn — eksposur tertarik (outstanding; plafon untuk pengajuan)
 * @param {number} [args.undrawn] — komitmen belum ditarik
 * @param {number} [args.daysLate]
 * @param {number|null} [args.specificProvision] — CKPN fasilitas (untuk tagihan tertunggak)
 */
export function facilityRwa({ borrower = {}, drawn = 0, undrawn = 0, daysLate = 0, specificProvision = null, config = DEFAULT_CONFIG } = {}) {
     const cfg = config.rwa || DEFAULT_CONFIG.rwa;
     const ccf = num(cfg.ccfUndrawn, 0.4);
     const ead = Math.max(0, num(drawn)) + Math.max(0, num(undrawn)) * ccf;
     const cls = exposureClass({ borrower, exposure: ead, config });
     const ag = borrower.agunan || {};
     const collateral = ag.ketersediaan === 'tidak_ada' ? 0 : Math.max(0, num(ag.nilai_agunan));
     const notes = [];

     // 1) Agunan keuangan (deposito) — pendekatan komprehensif.
     let netExposure = ead;
     if (ag.jenis === 'deposito' && collateral > 0) {
          const hc = num(cfg.haircut?.deposito, 0);
          const hfx = ag.mata_uang && ag.mata_uang !== 'IDR' ? num(cfg.haircut?.fx, 0.08) : 0;
          const he = num(cfg.haircut?.exposure, 0);
          netExposure = Math.max(0, ead * (1 + he) - collateral * (1 - hc - hfx));
          notes.push(`Deposito mengurangi eksposur menjadi ${Math.round(netExposure).toLocaleString('id-ID')} (haircut ${Math.round((hc + hfx) * 100)}%).`);
     }

     // 2) Tagihan tertunggak > 90 hari: RW atas porsi tanpa agunan keuangan.
     const pastDue = num(daysLate) > num(cfg.pastDueDays, 90);
     let rwa;
     let riskWeight = cls.risk_weight;
     let classKey = cls.key;
     if (pastDue) {
          const provisionShare = netExposure > 0 && specificProvision !== null ? num(specificProvision) / netExposure : 0;
          riskWeight = provisionShare >= num(cfg.pastDueProvisionThreshold, 0.2) ? num(cfg.riskWeights?.past_due_provisioned, 1) : num(cfg.riskWeights?.past_due, 1.5);
          classKey = 'past_due';
          rwa = netExposure * riskWeight;
          notes.push(`Tertunggak > ${num(cfg.pastDueDays, 90)} hari; cadangan khusus ${Math.round(provisionShare * 100)}% → RW ${Math.round(riskWeight * 100)}%.`);
     } else if (ag.jenis === 'tanah_bangunan' && collateral > 0) {
          // 3) Properti komersial: loan-splitting hingga 55% nilai properti.
          const securedCap = collateral * num(cfg.cre?.splitShare, 0.55);
          const secured = Math.min(netExposure, securedCap);
          const securedRw = Math.min(num(cfg.cre?.riskWeight, 0.6), cls.risk_weight);
          rwa = secured * securedRw + (netExposure - secured) * cls.risk_weight;
          riskWeight = netExposure > 0 ? rwa / netExposure : cls.risk_weight;
          notes.push(`Properti komersial: ${Math.round(secured).toLocaleString('id-ID')} dijamin (≤ ${Math.round(num(cfg.cre?.splitShare, 0.55) * 100)}% nilai properti) ber-RW ${Math.round(securedRw * 100)}%.`);
     } else {
          rwa = netExposure * cls.risk_weight;
          if (collateral > 0) notes.push('Agunan jenis ini bukan agunan yang diakui untuk mengurangi ATMR; tetap menurunkan LGD.');
     }

     const minCar = num(cfg.minCar, 0.08);
     const buffer = num(cfg.capitalBuffer, 0.025);
     return {
          exposure_class: classKey,
          exposure_class_label: EXPOSURE_CLASS_LABEL[classKey],
          counterparty_risk_weight: cls.risk_weight,
          risk_weight: r4(riskWeight),
          ead: Math.round(ead),
          ccf_undrawn: ccf,
          net_exposure: Math.round(netExposure),
          rwa: Math.round(rwa),
          capital_min: Math.round(rwa * minCar),
          capital_with_buffer: Math.round(rwa * (minCar + buffer)),
          notes
     };
}

/** Ringkasan ATMR portofolio dari baris fasilitas yang sudah memuat `rwa`. */
export function portfolioRwa(facilities = [], config = DEFAULT_CONFIG) {
     const cfg = config.rwa || DEFAULT_CONFIG.rwa;
     const withRwa = facilities.filter((f) => f.rwa);
     const exposure = withRwa.reduce((a, f) => a + f.rwa.ead, 0);
     const total = withRwa.reduce((a, f) => a + f.rwa.rwa, 0);
     const byClass = Object.keys(EXPOSURE_CLASS_LABEL).map((key) => {
          const group = withRwa.filter((f) => f.rwa.exposure_class === key);
          const ead = group.reduce((a, f) => a + f.rwa.ead, 0);
          const rwa = group.reduce((a, f) => a + f.rwa.rwa, 0);
          return { key, label: EXPOSURE_CLASS_LABEL[key], count: group.length, ead, rwa, density: ead > 0 ? r4(rwa / ead) : 0 };
     }).filter((g) => g.count);
     return {
          ead: exposure,
          rwa: total,
          density: exposure > 0 ? r4(total / exposure) : 0,
          capital_min: Math.round(total * num(cfg.minCar, 0.08)),
          capital_with_buffer: Math.round(total * (num(cfg.minCar, 0.08) + num(cfg.capitalBuffer, 0.025))),
          min_car: num(cfg.minCar, 0.08),
          capital_buffer: num(cfg.capitalBuffer, 0.025),
          by_class: byClass
     };
}

export default { exposureClass, facilityRwa, portfolioRwa, EXPOSURE_CLASS_LABEL };
