/**
 * core/covenant.js — Covenant otomatis (W5b).
 * Pure functions; TIDAK menyentuh DOM.
 *
 * Dua bagian:
 *  1. generateCovenants() — susun daftar covenant (maintenance / reporting /
 *     affirmative / negative) dari konfigurasi efektif. Fokus untuk keputusan LAYAK BERSYARAT.
 *  2. checkCovenants()   — nilai kepatuhan terhadap metrik monitoring terkini dan
 *     hasilkan nilai P20_covenant ('compliant' | 'minor' | 'material') untuk EWS.
 */

import { DEFAULT_CONFIG } from './config.js';

const num = (v) =>
     v === null || v === undefined || v === ''
          ? null
          : Number.isFinite(Number(v))
               ? Number(v)
               : null;

/**
 * Bangun daftar covenant.
 * @param {object} args — { borrower, analysis, config }
 * @returns {{ applicable:boolean, decision:string, categories:object,
 *   covenants:Array, summary:string }}
 */
export function generateCovenants({ borrower = {}, analysis = null, config = DEFAULT_CONFIG } = {}) {
     const cv = config.covenant || {};
     const decision = analysis?.decision || null;
     const applicable =
          decision === 'LAYAK_BERSYARAT' || (!!cv.includeForReview && decision === 'REVIEW');

     const covenants = [
          // ——— MAINTENANCE (rasio keuangan wajib dijaga) ———
          {
               code: 'DSCR_MIN',
               category: 'maintenance',
               label: 'DSCR minimum',
               metric: 'dscr',
               comparator: 'gte',
               threshold: cv.dscrMin ?? 1.15,
               unit: 'x',
               description: `DSCR aktual wajib ≥ ${cv.dscrMin ?? 1.15}x setiap periode pelaporan.`
          },
          {
               code: 'DER_MAX',
               category: 'maintenance',
               label: 'DER maksimum',
               metric: 'der',
               comparator: 'lte',
               threshold: cv.derMax ?? 3.0,
               unit: 'x',
               description: `Debt-to-Equity Ratio wajib ≤ ${cv.derMax ?? 3.0}x.`
          },
          {
               code: 'LTV_MAX',
               category: 'maintenance',
               label: 'LTV maksimum',
               metric: 'ltv',
               comparator: 'lte',
               threshold: cv.ltvMax ?? 0.8,
               unit: 'x',
               description: `LTV wajib ≤ ${((cv.ltvMax ?? 0.8) * 100).toFixed(0)}% dari nilai agunan.`
          },
          {
               code: 'ICR_MIN',
               category: 'maintenance',
               label: 'ICR minimum',
               metric: 'icr',
               comparator: 'gte',
               threshold: cv.icrMin ?? 1.5,
               unit: 'x',
               description: `EBIT wajib ≥ ${cv.icrMin ?? 1.5}x beban bunga.`
          },
          {
               code: 'CURRENT_RATIO_MIN',
               category: 'maintenance',
               label: 'Current ratio minimum',
               metric: 'current_ratio',
               comparator: 'gte',
               threshold: cv.currentRatioMin ?? 1.0,
               unit: 'x',
               description: `Aset lancar wajib ≥ ${cv.currentRatioMin ?? 1.0}x liabilitas jangka pendek.`
          },
          {
               code: 'OCF_POSITIF',
               category: 'maintenance',
               label: 'Arus kas operasional positif',
               metric: 'ocf',
               comparator: 'gt',
               threshold: 0,
               unit: 'Rp',
               description: 'Arus kas operasional wajib positif pada setiap periode pelaporan.'
          },
          {
               code: 'AGING_PIUTANG_MAX',
               category: 'maintenance',
               label: 'Aging piutang maksimum',
               metric: 'aging_piutang_hari',
               comparator: 'lte',
               threshold: cv.agingPiutangMaxHari ?? 60,
               unit: 'hari',
               description: `Rata-rata aging piutang wajib ≤ ${cv.agingPiutangMaxHari ?? 60} hari.`
          },

          // ——— REPORTING (kewajiban pelaporan) ———
          {
               code: 'LAPORAN_BULANAN',
               category: 'reporting',
               label: 'Laporan keuangan bulanan',
               frequency: 'bulanan',
               withinDays: cv.reportingMaxHari ?? 15,
               description: `Menyerahkan laporan keuangan bulanan maksimal ${cv.reportingMaxHari ?? 15} hari setelah tutup buku.`
          },
          {
               code: 'LAPORAN_AUDITED',
               category: 'reporting',
               label: 'Laporan keuangan tahunan',
               frequency: 'tahunan',
               withinDays: cv.annualReportMaxHari ?? 120,
               description: `Menyerahkan laporan keuangan tahunan (diaudit KAP bila disyaratkan) maksimal ${cv.annualReportMaxHari ?? 120} hari setelah tutup tahun buku.`
          },

          // ——— AFFIRMATIVE (kewajiban positif) ———
          {
               code: 'AFF_IZIN_PAJAK',
               category: 'affirmative',
               label: 'Izin usaha & kepatuhan pajak',
               description: 'Menjaga izin usaha (NIB, izin lingkungan bila wajib) tetap berlaku dan tidak memiliki tunggakan pajak.'
          },
          ...(hasInsurableCollateral(borrower)
               ? [{
                    code: 'AFF_ASURANSI',
                    category: 'affirmative',
                    label: "Asuransi agunan dengan banker's clause",
                    description: "Agunan fisik diasuransikan 100% dengan banker's clause untuk lender dan diperpanjang sebelum jatuh tempo."
               }]
               : []),
          {
               code: 'AFF_NOTIFIKASI',
               category: 'affirmative',
               label: 'Pemberitahuan kejadian material',
               withinDays: cv.notificationMaxHariKerja ?? 5,
               description: `Memberi tahu lender secara tertulis maksimal ${cv.notificationMaxHariKerja ?? 5} hari kerja atas gugatan hukum, sengketa tenaga kerja, kerusakan aset material, atau pemeriksaan pajak.`
          },
          {
               code: 'AFF_REKENING',
               category: 'affirmative',
               label: 'Penerimaan usaha melalui rekening di lender',
               description: 'Penerimaan penjualan dialirkan ke rekening operasional di lender agar omzet dapat dicocokkan dengan laporan keuangan.'
          },

          // ——— NEGATIVE (larangan) ———
          {
               code: 'NEG_AGUNAN',
               category: 'negative',
               label: 'Negative pledge',
               description: 'Tidak menjaminkan atau memindahtangankan agunan fasilitas ini, maupun aset usaha lain, kepada pihak lain tanpa persetujuan tertulis lender.'
          },
          {
               code: 'NEG_UTANG_BARU',
               category: 'negative',
               label: 'Pembatasan utang baru',
               description: 'Menambah utang berbunga baru wajib dengan persetujuan tertulis lender.'
          },
          {
               code: 'NEG_OWNERSHIP',
               category: 'negative',
               label: 'Larangan perubahan kepemilikan material',
               description: 'Perubahan struktur kepemilikan/pengendalian tanpa persetujuan tertulis lender.'
          },
          {
               code: 'NEG_DIVIDEN',
               category: 'negative',
               label: 'Pembatasan dividen/prive',
               description: 'Tidak membagikan dividen/prive, membeli kembali saham, atau melunasi pinjaman pemegang saham selama ada covenant yang dilanggar atau tunggakan angsuran.'
          },
          {
               code: 'NEG_MERGER',
               category: 'negative',
               label: 'Larangan merger & penjualan aset material',
               description: 'Tidak melakukan merger, akuisisi, atau penjualan aset di luar kegiatan usaha normal tanpa persetujuan tertulis lender.'
          }
     ];

     const categories = covenants.reduce((acc, c) => {
          acc[c.category] = (acc[c.category] || 0) + 1;
          return acc;
     }, {});

     const summary = applicable
          ? `${covenants.length} covenant disusun (${categories.maintenance || 0} maintenance, ` +
          `${categories.reporting || 0} reporting, ${categories.affirmative || 0} affirmative, ${categories.negative || 0} negative) untuk fasilitas LAYAK BERSYARAT.`
          : 'Covenant otomatis hanya aktif untuk keputusan LAYAK BERSYARAT (atau REVIEW bila diaktifkan).';

     return { applicable, decision, categories, covenants, summary, breach_consequences: BREACH_CONSEQUENCES };
}

/** Akibat pelanggaran covenant yang dicantumkan dalam perjanjian kredit. */
export const BREACH_CONSEQUENCES = [
     'Pelanggaran covenant merupakan cidera janji (wanprestasi) menurut perjanjian kredit.',
     'Lender dapat membekukan sisa plafon yang belum ditarik.',
     'Lender dapat mengenakan marjin penalti atau meminta agunan tambahan.',
     'Lender dapat mempercepat jatuh tempo seluruh pinjaman.',
     'Pelanggaran material menempatkan debitur di watchlist EWS dan tahap 2 PSAK 71 (SICR); kolektibilitas Lancar menjadi DPK.'
];

function hasInsurableCollateral(borrower = {}) {
     const ag = borrower.agunan || {};
     return Number(ag.nilai_agunan) > 0 && ag.ketersediaan !== 'tidak_ada' && !['deposito', 'piutang', 'tanpa_agunan'].includes(ag.jenis);
}

/**
 * Nilai kepatuhan covenant terhadap metrik terkini.
 * @param {object} args — { covenants, metrics, config }
 * @returns {{ results:Array, breaches:number, minor:number, status:'compliant'|'minor'|'material', ews_p20:string }}
 */
export function checkCovenants({ covenants = [], metrics = {}, config = DEFAULT_CONFIG } = {}) {
     const tol = config.covenant?.toleranceWarn ?? 0.1;
     const results = [];

     for (const c of covenants) {
          if (c.category !== 'maintenance') {
               results.push({ code: c.code, label: c.label, status: 'n/a', actual: null, threshold: c.threshold ?? null });
               continue;
          }
          const v = num(metrics[c.metric]);
          if (v === null) {
               results.push({ code: c.code, label: c.label, status: 'unknown', actual: null, threshold: c.threshold });
               continue;
          }

          const limit = num(c.threshold) ?? 0;
          let compliant;
          let breach;
          switch (c.comparator) {
               case 'gte':
                    compliant = v >= limit;
                    breach = v < limit * (1 - tol);
                    break;
               case 'lte':
                    compliant = v <= limit;
                    breach = v > limit * (1 + tol);
                    break;
               case 'gt':
                    compliant = v > limit;
                    breach = v <= limit;
                    break;
               default:
                    compliant = true;
                    breach = false;
          }

          const status = compliant ? 'compliant' : breach ? 'breach' : 'warning';
          results.push({
               code: c.code,
               label: c.label,
               metric: c.metric,
               comparator: c.comparator,
               actual: v,
               threshold: limit,
               unit: c.unit,
               status
          });
     }

     const breaches = results.filter((r) => r.status === 'breach').length;
     const warnings = results.filter((r) => r.status === 'warning').length;

     let status = 'compliant';
     if (breaches > 0) status = 'material';
     else if (warnings > 0) status = 'minor';

     return {
          results,
          breaches,
          minors: warnings,
          checked: results.filter((r) => r.status !== 'n/a').length,
          status,
          ews_p20: status === 'compliant' ? 'compliant' : status === 'minor' ? 'minor' : 'material'
     };
}

export default { generateCovenants, checkCovenants, BREACH_CONSEQUENCES };
