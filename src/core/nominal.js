/**
 * core/nominal.js — Rekomendasi nominal pinjaman.
 * Pure function. Rujukan: ARCHITECTURE §3A.2, §3.6.H.
 *
 * Algoritma 3 langkah:
 *  1. Kapasitas bayar (DSCR-based) — berbasis debt service riil:
 *     annual DS tersedia = (income / target) − DS utang eksisting − beban DS lain.
 *     Invers per skema angsuran (anuitas/flat/bullet/musiman).
 *  2. Batas agunan (LTV-based)
 *  3. min(kapasitas, agunan, plafon) → dibulatkan ke bawah Rp 50jt → range sempit ±5%
 *
 * Backward-compatible: tanpa `scheme`/`existingAnnualDs`/`income`, hasil identik
 * dengan formula proxy lama (EBIT / target).
 */

const num = (v, d = 0) =>
     v === null || v === undefined || v === ''
          ? d
          : Number.isFinite(Number(v))
               ? Number(v)
               : d;

/** Use the strictest configured coverage requirement when sizing a facility. */
export function effectiveDscrTarget(config = {}) {
     const ratioLimit = num(config.hardRules?.ds_ratio_max);
     return Math.max(num(config.nominal?.dscrTarget, 1.3), num(config.hardRules?.dscr_min),
          ratioLimit > 0 ? 1 / ratioLimit : 0);
}

export function nominalRoundingStep(amount, configured = 50000000) {
     const step = Math.max(1,num(configured,50000000) || 50000000);
     const adaptive = amount > 0 ? Math.max(1,10 ** Math.floor(Math.log10(amount*.05))) : 1;
     return Math.min(step,amount < step*20 ? adaptive : step);
}

/**
 * Invers: pokok maksimum dari kapasitas debt service tahunan, sadar-skema.
 * @returns {number} principal
 */
export function principalFromAnnualDs(annualDs, scheme = 'annuity', annualRate = 0, tenorBulan = 0) {
     const ds = Math.max(0, num(annualDs));
     const rate = num(annualRate);
     const n = num(tenorBulan);
     const years = n / 12;

     if (ds <= 0) return 0;

     if (scheme === 'bullet') {
          // Hanya bunga yang dibayar; pokok di akhir. DS tahunan ≈ pokok × rate.
          return rate > 0 ? ds / rate : 0;
     }
     if (scheme === 'flat') {
          // DS tahunan = pokok/years + pokok×rate.
          const denom = (years > 0 ? 1 / years : 0) + rate;
          return denom > 0 ? ds / denom : 0;
     }
     // annuity & musiman → total DS tahunan identik dengan anuitas
     const r = rate / 12;
     if (n <= 0) return 0;
     if (r <= 0) return (ds / 12) * n;
     const monthly = ds / 12;
     return (monthly * (1 - Math.pow(1 + r, -n))) / r;
}

/**
 * @returns {{
 *   recommended_nominal:number, range_narrow:[number,number],
 *   binding_constraint:string, capacity:object, dscr_at_recommended:number,
 *   explanation:string
 * }}
 */
export function recommendNominal({
     ebit,
     income,
     bebanBungaLain = 0,
     existingAnnualDs = 0,
     dscrTarget = 1.3,
     bungaTahunan,
     tenorBulan,
     nilaiAgunan,
     ltvMax = 0.8,
     plafonDiajukan,
     rounding = 50000000,
     rangeWidth = 0.05,
     scheme = 'annuity',
     seasonalityFactor = 1
}) {
     const base = income === undefined || income === null ? num(ebit) : num(income);
     const lain = num(bebanBungaLain) + num(existingAnnualDs);
     const target = num(dscrTarget, 1.3) || 1.3;
     const rate = num(bungaTahunan);
     const n = num(tenorBulan);
     const agunan = num(nilaiAgunan);
     const ltv = num(ltvMax, 0.8);
     const requested = num(plafonDiajukan);
     const configuredRound = Math.max(1, num(rounding, 50000000) || 50000000);

     // Langkah 1 — kapasitas bayar (DSCR-based) dari DS riil
     const annualDebtServiceCapacity = base / target - lain;
     let dscrBased = principalFromAnnualDs(annualDebtServiceCapacity, scheme, rate, n);
     // Musiman: bulan puncak lebih besar → principal efektif sedikit dikurangi.
     if (scheme === 'musiman' && seasonalityFactor > 1) {
          dscrBased = dscrBased / seasonalityFactor;
     }
     if (!Number.isFinite(dscrBased) || dscrBased < 0) dscrBased = 0;

     // Langkah 2 — batas agunan (LTV-based)
     const ltvBased = agunan * ltv;

     // Langkah 3 — nominal final = min(...)
     let nominal = dscrBased;
     let binding = 'dscr_based';
     if (ltvBased < nominal) {
          nominal = ltvBased;
          binding = 'ltv_based';
     }
     if (requested < nominal) {
          nominal = requested;
          binding = 'requested';
     }

     // At most 5% of the candidate amount, preserving the existing increment for large loans.
     const round = nominalRoundingStep(nominal,configuredRound);
     const rounded = Math.max(0, Math.floor(nominal / round) * round);
     // Invert the same amortization model used for capacity; include existing service.
     const principalPerAnnualDs = principalFromAnnualDs(1, scheme, rate, n);
     const proposedDs = principalPerAnnualDs > 0 ? rounded / principalPerAnnualDs : 0;
     const actualDscr = proposedDs + lain > 0 ? base / (proposedDs + lain) : null;
     const range_narrow = [
          Math.round(rounded * (1 - rangeWidth)),
          Math.round(rounded * (1 + rangeWidth))
     ];

     // Label ramah-spek (ARCHITECTURE §3A.2 / PRD §6.7): nilai binding_constraint.
     const BINDING_CONSTRAINT = {
          dscr_based: 'kapasitas_dscr',
          ltv_based: 'nilai_agunan',
          requested: 'plafon_diajukan'
     };
     const BINDING_LABEL = {
          dscr_based: 'kapasitas bayar (DSCR)',
          ltv_based: 'nilai agunan (LTV)',
          requested: 'plafon yang diajukan'
     };

     // DSCR target t setara batas cicilan ≤ 1/t arus kas (mis. 1,30x → 77%; RPC 75% ≈ 1,33x).
     const repaymentShareMax = 1 / target;
     const explanation =
          `Nominal dibatasi oleh ${BINDING_LABEL[binding]}. ` +
          `Kapasitas bayar Rp ${fmtShort(dscrBased)} (cicilan maks. ${Math.round(repaymentShareMax * 100)}% arus kas), ` +
          `dukungan agunan Rp ${fmtShort(ltvBased)} (LTV maks. ${Math.round(ltv * 100)}%), ` +
          `plafon diajukan Rp ${fmtShort(requested)}. Plafon tidak melebihi batas terendah; agunan tidak menggantikan kapasitas bayar.`;

     return {
          recommended_nominal: rounded,
          range_narrow,
          binding_constraint: BINDING_CONSTRAINT[binding],
          binding_code: binding,
          binding_label: BINDING_LABEL[binding],
          capacity: {
               dscr_based: Math.round(dscrBased),
               ltv_based: Math.round(ltvBased),
               requested: Math.round(requested)
          },
          dscr_at_recommended: actualDscr,
          dscr_target: target,
          repayment_share_max: Math.round(repaymentShareMax * 1e4) / 1e4,
          ltv_max: ltv,
          rounding_used: round,
          scheme,
          income_used: base,
          existing_annual_ds: num(existingAnnualDs),
          explanation
     };
}

function fmtShort(v) {
     const n = Number(v);
     if (!Number.isFinite(n)) return '—';
     const abs = Math.abs(n);
     if (abs >= 1e12) return (n / 1e12).toFixed(2) + ' T';
     if (abs >= 1e9) return (n / 1e9).toFixed(2) + ' M';
     if (abs >= 1e6) return (n / 1e6).toFixed(1) + ' jt';
     return n.toLocaleString('id-ID');
}
