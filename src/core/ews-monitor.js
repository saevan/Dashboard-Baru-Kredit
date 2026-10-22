/**
 * core/ews-monitor.js — EWS pasca-pencairan: 20 parameter → sinyal + judgement.
 * Rujukan: ARCHITECTURE §6A.2 (parameter/threshold), §6A.3 (aturan judgement), §6.5 (kolektibilitas).
 * Pure function.
 */

import { DEFAULT_CONFIG, COLLECTIBILITY, EWS_SEVERITY_ORDER } from './config.js';
import { portfolioHealthScore } from './ews.js';
import { assessCollectibility } from './portfolio.js';

const num = (v) =>
     v === null || v === undefined || v === ''
          ? null
          : Number.isFinite(Number(v))
               ? Number(v)
               : null;

/** Deskripsi 20 parameter (untuk render form). */
export const EWS_PARAMS = [
     { key: 'P1_dscr', code: 'P1', label: 'DSCR aktual', type: 'number', step: 0.01, warning: '< 1.20x', critical: '< 1.00x', group: 'Keuangan' },
     { key: 'P2_icr', code: 'P2', label: 'ICR aktual', type: 'number', step: 0.01, warning: '< 1.50x', critical: '< 1.00x', group: 'Keuangan' },
     { key: 'P3_cr', code: 'P3', label: 'Current Ratio', type: 'number', step: 0.01, warning: '< 1.20', critical: '< 1.00', group: 'Keuangan' },
     { key: 'P4_ocf', code: 'P4', label: 'Arus kas operasional', type: 'select', options: ['positif', 'negatif_1_periode', 'negatif_2_periode'], warning: 'negatif 1 periode', critical: 'negatif 2 periode', group: 'Keuangan' },
     { key: 'P5_runway_months', code: 'P5', label: 'Cash runway (bulan)', type: 'number', step: 0.1, warning: '< 3 bulan', critical: '< 1 bulan', group: 'Keuangan' },
     { key: 'P6_omzet_yoy_pct', code: 'P6', label: 'Perubahan omzet YoY (%)', type: 'number', step: 1, warning: 'turun > 20%', critical: 'turun > 40%', group: 'Keuangan' },
     { key: 'P7_dtw_change_pct', code: 'P7', label: 'Perubahan Debt-to-Worth (%)', type: 'number', step: 1, warning: 'naik > 30%', critical: 'naik > 50%', group: 'Keuangan' },
     { key: 'P8_altman_z', code: 'P8', label: 'Altman Z-Score', type: 'number', step: 0.01, warning: '< 2.99', critical: '< 1.81', group: 'Keuangan' },
     { key: 'P9_roa', code: 'P9', label: 'ROA borrower', type: 'number', step: 0.001, warning: '< p25 industri', critical: '< p10 industri', group: 'Keuangan' },
     { key: 'P10_cash_change_pct', code: 'P10', label: 'Perubahan saldo kas (%)', type: 'number', step: 1, warning: 'turun > 30%', critical: 'turun > 50%', group: 'Keuangan' },
     { key: 'P11_days_late', code: 'P11', label: 'Keterlambatan bayar (hari)', type: 'number', step: 1, warning: '> 7 hari', critical: '> 30 hari', group: 'Perilaku' },
     { key: 'P12_response_days', code: 'P12', label: 'Lama respons ke lender (hari)', type: 'number', step: 1, warning: 'lambat > 7 hari', critical: 'tidak responsif > 30 hari', group: 'Perilaku' },
     { key: 'P13_exec_turnover', code: 'P13', label: 'Turnover eksekutif (posisi)', type: 'number', step: 1, warning: '1 posisi kunci', critical: '≥ 2 posisi kunci', group: 'Perilaku' },
     { key: 'P14_strategy_change', code: 'P14', label: 'Perubahan strategi tanpa modal', type: 'select', options: ['none', 'indicated', 'confirmed'], warning: 'terindikasi', critical: 'terkonfirmasi', group: 'Perilaku' },
     { key: 'P15_account_txn', code: 'P15', label: 'Transaksi rekening tidak wajar', type: 'select', options: ['normal', 'suspicious', 'sudden_large'], warning: 'pola mencurigakan', critical: 'penarikan besar mendadak', group: 'Perilaku' },
     { key: 'P16_volume_change_pct', code: 'P16', label: 'Perubahan volume produksi (%)', type: 'number', step: 1, warning: 'turun > 20%', critical: 'turun > 40%', group: 'Operasional' },
     { key: 'P17_inventory_turnover_change_pct', code: 'P17', label: 'Perubahan inventory turnover (%)', type: 'number', step: 1, warning: 'turun > 30%', critical: 'turun > 50%', group: 'Operasional' },
     { key: 'P18_receivable_aging_days', code: 'P18', label: 'Aging piutang (hari)', type: 'number', step: 1, warning: '> 60 hari naik', critical: '> 90 hari naik', group: 'Operasional' },
     { key: 'P19_payable_turnover_change_pct', code: 'P19', label: 'Perubahan payable turnover (%)', type: 'number', step: 1, warning: 'memanjang > 30%', critical: 'memanjang > 60%', group: 'Operasional' },
     { key: 'P20_covenant', code: 'P20', label: 'Kepatuhan covenant', type: 'select', options: ['compliant', 'minor', 'material'], warning: 'pelanggaran minor', critical: 'pelanggaran material', group: 'Operasional' }
];

const get = (params, keys) => {
     for (const k of keys) {
          if (params[k] !== undefined && params[k] !== null && params[k] !== '') return params[k];
     }
     return null;
};

/** Evaluasi satu parameter numerik. */
function evalNumeric(value, { warning, critical, dir = 'below', code }) {
     const v = num(value);
     if (v === null) return null;
     if (dir === 'below') {
          if (v < critical) return { severity: 'CRITICAL', threshold: critical };
          if (v < warning) return { severity: 'WARNING', threshold: warning };
     } else {
          if (v > critical) return { severity: 'CRITICAL', threshold: critical };
          if (v > warning) return { severity: 'WARNING', threshold: warning };
     }
     return null;
}

function evalCategorical(value, { warningVal, criticalVal, code }) {
     if (value === null) return null;
     if (value === criticalVal) return { severity: 'CRITICAL', threshold: criticalVal };
     if (value === warningVal) return { severity: 'WARNING', threshold: warningVal };
     return null;
}

/**
 * Evaluasi monitoring EWS.
 * @param {object} params — nilai 20 parameter (kunci P1_dscr, ... P20_covenant)
 * @param {object} [baseline] — { benchmark: { roa: {p25,p10} }, ... }
 * @param {object} [config]
 */
export function evaluateMonitoring(params = {}, baseline = {}, config = DEFAULT_CONFIG) {
     const signals = [];
     const push = (code, key, value, res) => {
          if (!res) return;
          signals.push({
               param: key,
               code,
               value,
               threshold: res.threshold,
               severity: res.severity
          });
     };

     const p1 = get(params, ['P1_dscr', 'P1']);
     push('P1', 'P1_dscr', num(p1), evalNumeric(p1, { warning: 1.2, critical: 1.0, dir: 'below' }));

     const p2 = get(params, ['P2_icr', 'P2']);
     push('P2', 'P2_icr', num(p2), evalNumeric(p2, { warning: 1.5, critical: 1.0, dir: 'below' }));

     const p3 = get(params, ['P3_cr', 'P3_current_ratio', 'P3']);
     push('P3', 'P3_cr', num(p3), evalNumeric(p3, { warning: 1.2, critical: 1.0, dir: 'below' }));

     const p4 = get(params, ['P4_ocf', 'P4_operating_cashflow', 'P4']);
     push('P4', 'P4_ocf', p4, evalCategorical(p4, { warningVal: 'negatif_1_periode', criticalVal: 'negatif_2_periode' }));

     const p5 = get(params, ['P5_runway_months', 'P5_runway', 'P5']);
     push('P5', 'P5_runway_months', num(p5), evalNumeric(p5, { warning: 3, critical: 1, dir: 'below' }));

     const p6 = get(params, ['P6_omzet_yoy_pct', 'P6_omzet_yoy', 'P6']);
     push('P6', 'P6_omzet_yoy_pct', num(p6), evalNumeric(p6, { warning: -20, critical: -40, dir: 'below' }));

     const p7 = get(params, ['P7_dtw_change_pct', 'P7_dtw', 'P7']);
     push('P7', 'P7_dtw_change_pct', num(p7), evalNumeric(p7, { warning: 30, critical: 50, dir: 'above' }));

     const p8 = get(params, ['P8_altman_z', 'P8']);
     push('P8', 'P8_altman_z', num(p8), evalNumeric(p8, { warning: 2.99, critical: 1.81, dir: 'below' }));

     // P9 — ROA vs benchmark p25/p10
     const p9 = get(params, ['P9_roa', 'P9']);
     const roaBench = baseline && baseline.benchmark && baseline.benchmark.roa;
     if (num(p9) !== null && roaBench && num(roaBench.p25) !== null) {
          const v = num(p9);
          let res = null;
          if (num(roaBench.p10) !== null && v < num(roaBench.p10)) res = { severity: 'CRITICAL', threshold: roaBench.p10 };
          else if (v < num(roaBench.p25)) res = { severity: 'WARNING', threshold: roaBench.p25 };
          push('P9', 'P9_roa', v, res);
     } else if (num(p9) !== null) {
          // fallback absolut bila benchmark tak tersedia
          push('P9', 'P9_roa', num(p9), evalNumeric(p9, { warning: 0.02, critical: 0.0, dir: 'below' }));
     }

     const p10 = get(params, ['P10_cash_change_pct', 'P10_cash_change', 'P10']);
     push('P10', 'P10_cash_change_pct', num(p10), evalNumeric(p10, { warning: -30, critical: -50, dir: 'below' }));

     const p11 = get(params, ['P11_days_late', 'P11']);
     push('P11', 'P11_days_late', num(p11), evalNumeric(p11, { warning: 7, critical: 30, dir: 'above' }));

     const p12 = get(params, ['P12_response_days', 'P12']);
     push('P12', 'P12_response_days', num(p12), evalNumeric(p12, { warning: 7, critical: 30, dir: 'above' }));

     const p13 = get(params, ['P13_exec_turnover', 'P13']);
     push('P13', 'P13_exec_turnover', num(p13), evalNumeric(p13, { warning: 1, critical: 2, dir: 'above' }));

     const p14 = get(params, ['P14_strategy_change', 'P14']);
     push('P14', 'P14_strategy_change', p14, evalCategorical(p14, { warningVal: 'indicated', criticalVal: 'confirmed' }));

     const p15 = get(params, ['P15_account_txn', 'P15']);
     push('P15', 'P15_account_txn', p15, evalCategorical(p15, { warningVal: 'suspicious', criticalVal: 'sudden_large' }));

     const p16 = get(params, ['P16_volume_change_pct', 'P16_volume_change', 'P16']);
     push('P16', 'P16_volume_change_pct', num(p16), evalNumeric(p16, { warning: -20, critical: -40, dir: 'below' }));

     const p17 = get(params, ['P17_inventory_turnover_change_pct', 'P17']);
     push('P17', 'P17_inventory_turnover_change_pct', num(p17), evalNumeric(p17, { warning: -30, critical: -50, dir: 'below' }));

     const p18 = get(params, ['P18_receivable_aging_days', 'P18']);
     push('P18', 'P18_receivable_aging_days', num(p18), evalNumeric(p18, { warning: 60, critical: 90, dir: 'above' }));

     const p19 = get(params, ['P19_payable_turnover_change_pct', 'P19']);
     push('P19', 'P19_payable_turnover_change_pct', num(p19), evalNumeric(p19, { warning: 30, critical: 60, dir: 'above' }));

     const p20 = get(params, ['P20_covenant', 'P20']);
     push('P20', 'P20_covenant', p20, evalCategorical(p20, { warningVal: 'minor', criticalVal: 'material' }));

     // ——— Aturan judgement (§6A.3) ———
     const judgements = [];
     const addJ = (cond, severity, message) => {
          if (cond) judgements.push({ severity, message: `${EMOJI[severity]} ${message}` });
     };
     const v1 = num(p1);
     const v2 = num(p2);
     const v3 = num(p3);
     const v5 = num(p5);
     const v6 = num(p6);
     const v7 = num(p7);
     const v8 = num(p8);
     const v10 = num(p10);
     const v11 = num(p11);
     const v12 = num(p12);
     const v13 = num(p13);
     const v16 = num(p16);
     const v17 = num(p17);
     const p9BelowP25 =
          num(p9) !== null && roaBench && num(roaBench.p25) !== null && num(p9) < num(roaBench.p25);

     addJ(v1 !== null && v1 < 1.0 || p4 === 'negatif_2_periode', 'CRITICAL',
          'JANGAN LANJUT — Borrower tidak mampu bayar cicilan. Hentikan pencairan bertahap, ajukan restrukturisasi.');
     addJ(v1 !== null && v1 < 1.2 || v3 !== null && v3 < 1.0, 'CRITICAL',
          'BAHAYA — Kemampuan bayar menipis. Minta laporan keuangan terbaru & jadwalkan kunjungan.');
     addJ(v11 !== null && v11 > 30, 'CRITICAL',
          'BAHAYA — Tunggakan > 30 hari. Kirim surat peringatan, siapkan penagihan.');
     addJ(v5 !== null && v5 < 1, 'CRITICAL',
          'BAHAYA — Kas hampir habis. Borrower berisiko gagal bayar dalam 1 bulan.');
     addJ(v6 !== null && v6 < -40 || v8 !== null && v8 < 1.81, 'WARNING',
          'WASPADA TINGGI — Bisnis menyusut tajam / masuk distress zone. Review menyeluruh.');
     addJ(v2 !== null && v2 < 1.5 || v7 !== null && v7 > 30, 'WARNING',
          'WASPADA — Beban utang meningkat. Pantau ketat, minta proyeksi arus kas.');
     addJ(v12 !== null && v12 > 30, 'WARNING',
          'WASPADA — Borrower tidak kooperatif. Tingkatkan intensitas komunikasi.');
     addJ(v13 !== null && v13 >= 2 || p14 === 'confirmed', 'WARNING',
          'WASPADA — Ketidakstabilan manajemen. Verifikasi keberlanjutan bisnis.');
     addJ(p9BelowP25 || v16 !== null && v16 < -20, 'WATCH',
          'PANTAU — Performa di bawah industri. Monitoring bulanan diperketat.');
     addJ(v10 !== null && v10 < -30 || v17 !== null && v17 < -30, 'WATCH',
          'PANTAU — Ada indikasi tekanan likuiditas/operasional.');
     if (judgements.length === 0) {
          judgements.push({ severity: 'NORMAL', message: `${EMOJI.NORMAL} NORMAL — Tidak ada sinyal risiko. Lanjutkan monitoring rutin.` });
     }

     // Urut severity menurun
     judgements.sort((a, b) => EWS_SEVERITY_ORDER.indexOf(a.severity) - EWS_SEVERITY_ORDER.indexOf(b.severity));

     const severities = [
          ...signals.map((s) => s.severity),
          ...judgements.map((j) => j.severity)
     ];
     let ews_level = 'NORMAL';
     for (const lvl of EWS_SEVERITY_ORDER) {
          if (severities.includes(lvl)) {
               ews_level = lvl;
               break;
          }
     }

     const collectibility = mapCollectibility(ews_level, v11, p20, config);

     const recommended_action = ACTION[ews_level] || ACTION.NORMAL;
     const escalate_to = ews_level === 'CRITICAL' ? 'Manajer Risiko' : ews_level === 'WARNING' ? 'Analis Senior' : null;

     return {
          signals,
          ews_level,
          collectibility,
          judgements,
          recommended_action,
          escalate_to
     };
}

const EMOJI = { CRITICAL: '🔴', WARNING: '🟠', WATCH: '🟡', NORMAL: '🟢' };

const ACTION = {
     CRITICAL: 'RESTRUKTURISASI / PENAGIHAN',
     WARNING: 'REVIEW & MINTA DATA TERBARU',
     WATCH: 'MONITORING DIPERKETAT',
     NORMAL: 'MONITORING RUTIN'
};

/** POJK 40: hari tunggakan menentukan tingkat; sinyal EWS/covenant saja paling jauh menjadikan DPK. */
function mapCollectibility(ewsLevel, daysLate, covenant, config) {
     const { key } = assessCollectibility({ daysLate: num(daysLate) ?? 0, ewsLevel, covenant, config });
     return COLLECTIBILITY[key.toUpperCase()];
}

export { portfolioHealthScore };

/** Label severity manusia. */
export const SEVERITY_LABEL = {
     CRITICAL: 'Critical',
     WARNING: 'Warning',
     WATCH: 'Watch',
     NORMAL: 'Normal'
};
