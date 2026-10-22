/**
 * core/ews.js — Kerangka Early Warning System 4-stage + kesehatan portofolio.
 * Rujukan: ARCHITECTURE §6.1–§6.6. Pure functions.
 */

import { EWS_SEVERITY_ORDER } from './config.js';

/** 4 stage waterfall. */
export const EWS_STAGES = [
     { key: 1, name: 'Industry / Market', severity: 'WATCH', color: '#b87d00' },
     { key: 2, name: 'Behavioral / Management', severity: 'WARNING', color: '#b4500a' },
     { key: 3, name: 'Operational', severity: 'WARNING', color: '#b4500a' },
     { key: 4, name: 'Financial Distress', severity: 'CRITICAL', color: '#c42b2b' }
];

const STAGE_BY_PARAM = {
     P6: 1, P7: 1, P8: 1,
     P11: 2, P12: 2, P13: 2, P14: 2, P15: 2,
     P16: 3, P17: 3, P18: 3, P19: 3,
     P1: 4, P2: 4, P3: 4, P4: 4, P5: 4, P9: 4, P10: 4, P20: 4
};

/** Tentukan stage dari kunci parameter (mis. "P1_dscr" → 4). */
export function classifyStage(paramKey) {
     const m = /^P(\d+)/.exec(String(paramKey || ''));
     if (!m) return null;
     return STAGE_BY_PARAM['P' + m[1]] || null;
}

/** Level tertinggi dari kumpulan severity. */
export function highestLevel(severities = []) {
     for (const level of EWS_SEVERITY_ORDER) {
          if (severities.includes(level)) return level;
     }
     return 'NORMAL';
}

/** Skor kesehatan portofolio: 100 − Σ(bobot_sinyal × deviasi). Sederhana & explainable. */
export function portfolioHealthScore(borrowers = []) {
     if (!borrowers.length) return 100;
     const weights = { CRITICAL: 40, WARNING: 20, WATCH: 8, NORMAL: 0 };
     const total = borrowers.reduce((a, b) => a + (weights[(b.ews_level || 'NORMAL').toUpperCase()] || 0), 0);
     return Math.max(0, Math.round(100 - total / borrowers.length));
}
