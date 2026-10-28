/**
 * core/parameters.js — Penjelasan (help) untuk SEMUA parameter penilaian.
 *
 * Menyatukan penjelasan dalam satu sumber kebenaran dan **menandai setiap
 * parameter dengan salah satu 5C** (Character, Capacity, Capital, Collateral,
 * Conditions) sehingga "tiap pertanyaan mengandung 5C".
 *
 * Sumber label diambil dari `BISNIS_MANAJEMEN_META` (kualitatif), `RATIO_META`
 * (rasio), dan `COMPONENT_DEFS` (komponen terhitung), lalu dilengkapi teks
 * bantuan bahasa awam di sini.
 */

import { BISNIS_MANAJEMEN_META, RATIO_META, COMPONENT_DEFS } from './config.js';
import { COMPONENT_TO_C, FIVE_C_DEFS } from './five-c.js';

/** Judul tiap kelompok parameter menurut 5C. */
export const PARAMETER_GROUPS = {
     character: 'Character — Karakter & Manajemen',
     capacity: 'Capacity — Kapasitas Bayar & Bisnis',
     capital: 'Capital — Modal & Kekuatan Neraca',
     collateral: 'Collateral — Agunan',
     conditions: 'Conditions — Kondisi Makro & Sektor'
};

/** Pemetaan parameter kualitatif (BISNIS_MANAJEMEN_META) → 5C. */
export const BM_PARAM_TO_C = {
     skor_model_bisnis: 'capacity',
     posisi_pasar: 'capacity',
     skalabilitas: 'capacity',
     ketergantungan: 'capacity',
     tren_keuangan: 'capital',
     pengalaman_tim: 'character',
     rekam_jejak_bayar: 'character',
     tata_kelola: 'character',
     track_record_tahun: 'character',
     cash_runway_bulan: 'capacity',
     ocf_positif: 'capacity',
     skor_industri_risk: 'conditions',
     prospek_industri: 'conditions',
     sensitivitas_makro: 'conditions'
};

/** Pemetaan rasio (RATIO_META) → 5C. */
export const RATIO_TO_C = {
     gpm: 'capital',
     opm: 'capital',
     npm: 'capital',
     roa: 'capital',
     roe: 'capital',
     dar: 'capital',
     der: 'capital',
     ltd_to_equity: 'capital',
     debt_to_capital: 'capital',
     icr: 'capacity',
     current_ratio: 'capital',
     quick_ratio: 'capital',
     cash_ratio: 'capital',
     cash_turnover: 'capacity',
     tato: 'capacity',
     fato: 'capacity',
     inventory_turnover: 'capacity',
     receivable_turnover: 'capacity',
     working_capital_turnover: 'capacity',
     payable_turnover: 'capacity'
};

/** Penjelasan bahasa awam untuk setiap rasio benchmark. */
export const RATIO_HELP = {
     gpm: 'Gross Profit Margin — laba kotor / penjualan. Makin tinggi, makin besar sisa untuk menutup biaya operasional.',
     opm: 'Operating Profit Margin — laba operasi / penjualan. Mengukur efisiensi operasi inti.',
     npm: 'Net Profit Margin — laba bersih / penjualan. Profitabilitas akhir setelah seluruh biaya & pajak.',
     roa: 'Return on Assets — laba bersih / total aset. Seberapa efisien aset menghasilkan laba.',
     roe: 'Return on Equity — laba bersih / ekuitas. Imbal hasil bagi pemilik modal.',
     dar: 'Debt to Assets Ratio — total utang / total aset. Porsi aset yang dibiayai utang.',
     der: 'Debt to Equity Ratio — total utang / ekuitas. Rasio leverage; makin rendah makin aman.',
     ltd_to_equity: 'Long-Term Debt to Equity — utang jangka panjang / ekuitas. Menggambarkan struktur modal jangka panjang.',
     debt_to_capital: 'Debt to Capital — total utang / (utang + ekuitas). Komposisi pendanaan.',
     icr: 'Interest Coverage Ratio — EBIT / beban bunga. Kemampuan menutup bunga; di bawah 1x berisiko.',
     current_ratio: 'Current Ratio — aset lancar / liabilitas jangka pendek. Likuiditas jangka pendek.',
     quick_ratio: 'Quick Ratio — (aset lancar − persediaan) / liabilitas jangka pendek. Likuiditas lebih ketat.',
     cash_ratio: 'Cash Ratio — kas & setara kas / liabilitas jangka pendek. Likuiditas paling konservatif.',
     cash_turnover: 'Cash Turnover — penjualan / kas. Seberapa cepat kas berputar dalam operasi.',
     tato: 'Total Asset Turnover — penjualan / total aset. Efisiensi penggunaan seluruh aset.',
     fato: 'Fixed Asset Turnover — penjualan / aset tetap. Produktivitas aset tetap.',
     inventory_turnover: 'Inventory Turnover — HPP / persediaan. Kecepatan persediaan terjual.',
     receivable_turnover: 'Receivable Turnover — penjualan / piutang. Kecepatan penagihan piutang.',
     working_capital_turnover: 'Working Capital Turnover — penjualan / modal kerja. Efisiensi modal kerja.',
     payable_turnover: 'Payable Turnover — pembelian / utang usaha. Kecepatan pembayaran ke pemasok.'
};

/** Penjelasan komponen terhitung yang tidak ada di RATIO_META. */
export const COMPONENT_HELP = {
     dscr: 'Debt Service Coverage Ratio — arus kas operasi / total kewajiban (bunga + pokok). Di atas 1,2x dianggap aman.',
     dti: 'Debt-to-Income — total cicilan / pendapatan. Target di bawah 35%.',
     altman_z: 'Altman Z-Score — indeks risiko kebangkrutan. Di atas 2,99 aman; di bawah 1,81 berpotensi distress.',
     ltv: 'Loan-to-Value — plafon / nilai agunan. Makin rendah, makin aman bagi kreditur (LGD lebih kecil).'
};

function bmEntries() {
     return Object.entries(BISNIS_MANAJEMEN_META).map(([key, m]) => ({
          key,
          label: m.label,
          kind: 'kualitatif',
          c5: BM_PARAM_TO_C[key] || null,
          help: m.help
     }));
}

function ratioEntries() {
     return Object.entries(RATIO_META).map(([key, m]) => ({
          key,
          label: m.label,
          kind: 'rasio',
          c5: RATIO_TO_C[key] || null,
          help: RATIO_HELP[key] || ''
     }));
}

function componentEntries() {
     const extra = ['dscr', 'dti', 'altman_z', 'ltv'];
     return COMPONENT_DEFS.filter((d) => extra.includes(d.key)).map((d) => ({
          key: d.key,
          label: d.label,
          kind: 'komponen',
          c5: COMPONENT_TO_C[d.key] || null,
          help: COMPONENT_HELP[d.key] || ''
     }));
}

/** Daftar lengkap parameter + penjelasan + tag 5C. */
export const PARAMETER_GUIDE = [...bmEntries(), ...ratioEntries(), ...componentEntries()];

/** Peta cepat key → entri parameter. */
export const PARAMETER_BY_KEY = Object.fromEntries(PARAMETER_GUIDE.map((p) => [p.key, p]));

const C_ORDER = FIVE_C_DEFS.map((c) => c.key);
const C_BY_KEY = Object.fromEntries(FIVE_C_DEFS.map((c) => [c.key, c]));

/**
 * Kelompokkan panduan parameter menurut 5C.
 * @returns {Array<{key:string,name:string,id:string,ico:string,title:string,params:Array}>}
 */
export function groupedParameterGuide() {
     return C_ORDER.map((ck) => {
          const c = C_BY_KEY[ck];
          return {
               key: ck,
               name: c.name,
               id: c.id,
               ico: c.ico,
               title: PARAMETER_GROUPS[ck] || `${c.name} · ${c.id}`,
               params: PARAMETER_GUIDE.filter((p) => p.c5 === ck)
          };
     });
}

export default { PARAMETER_GUIDE, PARAMETER_GROUPS, groupedParameterGuide, PARAMETER_BY_KEY };
