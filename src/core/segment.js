/**
 * core/segment.js — Segmentasi & diferensiasi borrower.
 *
 * Menjawab masukan stakeholder: "setiap peminjam harus dibedabedakan".
 * Setiap borrower diklasifikasikan ke satu segmen yang menentukan:
 *   · periodisitas laporan (harian / bulanan / kuartalan),
 *   · apakah template rasio bank dipakai,
 *   · apakah analisis arus kas harian (khusus UMKM) relevan,
 *   · target DSCR & dokumen wajib.
 *
 * Dasar segmentasi (plafon diajukan, Rupiah):
 *   · mikro    ≤ 50 juta
 *   · kecil    ≤ 500 juta
 *   · menengah ≤ 5 miliar
 *   · korporasi > 5 miliar
 * Override: sektor/neraca bank → Lembaga Keuangan; profil startup → Startup.
 *
 * Pure function; tidak menyentuh DOM.
 */

import { isBankSector, hasBankData } from './bank-ratios.js';

/** Ambang batas plafon default per segmen (Rupiah). */
export const SEGMENT_THRESHOLDS = {
     mikroMax: 50_000_000,
     kecilMax: 500_000_000,
     menengahMax: 5_000_000_000
};

/** Definisi segmen + perlakukan (treatment) bawaannya. */
export const SEGMENTS = {
     financial_institution: {
          key: 'financial_institution',
          label: 'Lembaga Keuangan / Bank',
          short: 'Bank',
          is_umkm: false,
          is_financial: true,
          cadence: 'bulanan',
          statement_period: 'bulanan',
          daily_cashflow: false,
          bank_template: true,
          required_reports: ['Neraca bank', 'Laba rugi', 'Rasio NIM/NPL/CAR/LDR/CASA/BOPO', 'CKPN / kredit bermasalah'],
          notes: ['Gunakan template rasio bank.', 'Pantau TINGKAT NPL (P1–P5) sesuai peringkat kesehatan OJK.']
     },
     corporate: {
          key: 'corporate',
          label: 'Korporasi',
          short: 'Korporasi',
          is_umkm: false,
          is_financial: false,
          cadence: 'kuartalan',
          statement_period: 'kuartalan',
          daily_cashflow: false,
          bank_template: false,
          required_reports: ['Laporan keuangan audited', 'Laporan arus kas', 'Proyeksi keuangan'],
          notes: ['Laporan kuartalan dengan analisis rasio penuh.']
     },
     umkm_menengah: {
          key: 'umkm_menengah',
          label: 'UMKM Menengah',
          short: 'UMKM Menengah',
          is_umkm: true,
          is_financial: false,
          cadence: 'bulanan',
          statement_period: 'bulanan',
          daily_cashflow: false,
          bank_template: false,
          required_reports: ['Neraca & laba rugi bulanan', 'Rekening koran'],
          notes: ['Monitoring bulanan; analisis arus kas harian opsional.']
     },
     umkm_kecil: {
          key: 'umkm_kecil',
          label: 'UMKM Kecil',
          short: 'UMKM Kecil',
          is_umkm: true,
          is_financial: false,
          cadence: 'harian',
          statement_period: 'harian',
          daily_cashflow: true,
          bank_template: false,
          required_reports: ['Catatan kas harian', 'Rekening koran', 'Ringkasan penjualan harian'],
          notes: ['Prioritaskan arus kas HARIAN — cocokkan setoran/omzet per hari.']
     },
     umkm_mikro: {
          key: 'umkm_mikro',
          label: 'UMKM Mikro',
          short: 'UMKM Mikro',
          is_umkm: true,
          is_financial: false,
          cadence: 'harian',
          statement_period: 'harian',
          daily_cashflow: true,
          bank_template: false,
          required_reports: ['Catatan kas harian', 'Rekening koran / mutasi harian'],
          notes: ['Wajib arus kas HARIAN sederhana.', 'Pertimbangkan pencairan bertahap sesuai arus kas.']
     },
     startup: {
          key: 'startup',
          label: 'Startup / Perusahaan Rintisan',
          short: 'Startup',
          is_umkm: false,
          is_financial: false,
          cadence: 'bulanan',
          statement_period: 'bulanan',
          daily_cashflow: true,
          bank_template: false,
          required_reports: ['Laporan kas bulanan', 'Runway & burn rate', 'Proyeksi kas'],
          notes: ['Fokus pada cash runway & burn rate; arus kas harian relevan.']
     }
};

/** Daftar segmen untuk dropdown UI. */
export const SEGMENT_LIST = Object.values(SEGMENTS).map((s) => ({
     key: s.key,
     label: s.label,
     short: s.short
}));

function num(v, d = 0) {
     if (v === null || v === undefined || v === '') return d;
     const n = Number(v);
     return Number.isFinite(n) ? n : d;
}

/**
 * Klasifikasikan borrower ke segmen.
 * @param {object} borrower — { sektor, profil_company, plafon_diajukan, keuangan }
 * @param {object} [config] — konfigurasi efektif; membaca config.segment bila ada
 * @returns {{
 *   key:string, label:string, short:string, is_umkm:boolean, is_financial:boolean,
 *   cadence:string, statement_period:string, plafon:number,
 *   criteria:Array<string>, treatment:object
 * }}
 */
export function classifyBorrower(borrower = {}, config = {}) {
     const th = { ...SEGMENT_THRESHOLDS, ...(config && config.segment ? config.segment : {}) };
     const sektor = borrower.sektor || '';
     const keuangan = borrower.keuangan || {};
     const profil = borrower.profil_company || '';
     const plafon = num(borrower.plafon_diajukan, 0);
     const criteria = [];

     let key;
     if (isBankSector(sektor) || hasBankData(keuangan)) {
          key = 'financial_institution';
          criteria.push(isBankSector(sektor) ? `Sektor "${sektor}" dikenali sebagai lembaga keuangan.` : 'Neraca memuat field khas bank.');
     } else if (profil === 'startup') {
          key = 'startup';
          criteria.push('Profil company = startup.');
     } else if (plafon > th.menengahMax) {
          key = 'corporate';
          criteria.push(`Plafon ${fmtRp(plafon)} > batas segmen menengah (${fmtRp(th.menengahMax)}).`);
     } else if (plafon > th.kecilMax) {
          key = 'umkm_menengah';
          criteria.push(`Plafon ${fmtRp(plafon)} dalam rentang UMKM menengah.`);
     } else if (plafon > th.mikroMax) {
          key = 'umkm_kecil';
          criteria.push(`Plafon ${fmtRp(plafon)} dalam rentang UMKM kecil.`);
     } else {
          key = 'umkm_mikro';
          criteria.push(`Plafon ${fmtRp(plafon)} ≤ batas UMKM mikro (${fmtRp(th.mikroMax)}).`);
     }

     const seg = SEGMENTS[key];
     const dscrTarget = num(config && config.nominal ? config.nominal.dscrTarget : undefined, 1.25);

     const treatment = {
          cadence: seg.cadence,
          cadence_label: seg.cadence === 'harian' ? 'Harian' : seg.cadence === 'kuartalan' ? 'Kuartalan' : 'Bulanan',
          statement_period: seg.statement_period,
          daily_cashflow: seg.daily_cashflow,
          bank_template: seg.bank_template,
          required_reports: [...seg.required_reports],
          dscr_target: dscrTarget,
          notes: [...seg.notes]
     };

     return {
          key,
          label: seg.label,
          short: seg.short,
          is_umkm: seg.is_umkm,
          is_financial: seg.is_financial,
          cadence: seg.cadence,
          statement_period: seg.statement_period,
          plafon,
          criteria,
          treatment
     };
}

function fmtRp(v) {
     return `Rp ${Math.round(Number(v) || 0).toLocaleString('id-ID')}`;
}

export default { SEGMENTS, SEGMENT_LIST, SEGMENT_THRESHOLDS, classifyBorrower };
