/**
 * core/confidence.js — Model **Tingkat Keyakinan Data** (data confidence).
 *
 * Output kedua dari analisis: selain peringkat risiko, sistem melaporkan seberapa
 * yakin data yang dilaporkan pemohon. Tingkat keyakinan dihitung dari jumlah
 * sumber yang **terverifikasi** lender, kelengkapan field keuangan, dan status
 * integritas laporan keuangan (neraca balance, dsb.).
 *
 * Tiga tingkat: LOW (rendah), MEDIUM (sedang), HIGH (tinggi).
 */

import {
     INTAKE_CONFIG,
     VERIFICATION_SOURCES,
     REQUIRED_FINANCIAL_FIELDS,
     mandatorySourceKeys,
     sourceByKey
} from './intake-config.js';

import { numericValue } from './audit-automation.js';
import { checkStatementIntegrity } from './statement-integrity.js';

export const CONFIDENCE_LEVEL = { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH' };

export const CONFIDENCE_LABEL = { LOW: 'Rendah', MEDIUM: 'Sedang', HIGH: 'Tinggi' };

/** Nada visual untuk badge (ok | warn | risk). */
export const CONFIDENCE_TONE = { LOW: 'risk', MEDIUM: 'warn', HIGH: 'ok' };

/** Peringkat ordinal tingkat keyakinan (untuk perbandingan). */
export const CONFIDENCE_RANK = { LOW: 0, MEDIUM: 1, HIGH: 2 };

function num(v, d = 0) {
     if (v === null || v === undefined || v === '') return d;
     const n = Number(v);
     return Number.isFinite(n) ? n : d;
}

/** Peringkat ordinal dari sebuah tingkat keyakinan. */
export function confidenceRank(level) {
     const key = String(level || '').toUpperCase();
     return Object.prototype.hasOwnProperty.call(CONFIDENCE_RANK, key) ? CONFIDENCE_RANK[key] : -1;
}

/** Rasio field keuangan yang terisi (0..1). */
export function financialCompleteness(financials = {}, fields = REQUIRED_FINANCIAL_FIELDS) {
     const list = Array.isArray(fields) && fields.length ? fields : REQUIRED_FINANCIAL_FIELDS;
     if (!list.length) return 0;
     let filled = 0;
     for (const key of list) {
          const v = financials ? financials[key] : null;
          if (numericValue(v) !== null) filled += 1;
     }
     return filled / list.length;
}

/**
 * Hitung tingkat keyakinan data.
 *
 * @param {object}   [opts]
 * @param {string[]} [opts.verified]  Sumber yang sudah diverifikasi lender.
 * @param {string[]} [opts.declared]  Sumber yang diklaim pemohon (belum tentu terverifikasi).
 * @param {object}   [opts.financials] Data keuangan (untuk kelengkapan).
 * @param {object}   [opts.integrity]  Hasil statement-integrity ({ status }).
 * @param {object}   [opts.config]     Konfigurasi intake (default INTAKE_CONFIG).
 * @returns {{
 *   level: string, level_label: string, tone: string, rank: number, score: number,
 *   verified_count: number, weight_sum: number, weight_max: number,
 *   mandatory_missing: string[], meets_mandatory: boolean,
 *   completeness: number, integrity_status: (string|null), factors: object[], notes: string[]
 * }}
 */
export function computeConfidence({
     verified = [],
     declared = [],
     financials = {},
     integrity = null,
     config = INTAKE_CONFIG
} = {}) {
     const cfg = (config && config.confidence) || {};
     const vSet = new Set((Array.isArray(verified) ? verified : []).map(String));
     const dSet = new Set((Array.isArray(declared) ? declared : []).map(String));
     const allKeys = new Set([...vSet, ...dSet]);

     let weightSum = 0;
     let weightMax = 0;
     const factors = [];
     for (const meta of VERIFICATION_SOURCES) {
          const w = num(meta.weight, 1);
          weightMax += w;
          const declaredKey = allKeys.has(meta.key);
          const ok = vSet.has(meta.key);
          if (ok) weightSum += w;
          if (declaredKey || ok) {
               factors.push({
                    key: meta.key,
                    label: meta.label,
                    verified: ok,
                    mandatory: !!meta.mandatory,
                    weight: w
               });
          }
     }

     const mandatory = mandatorySourceKeys();
     const mandatoryMissing = mandatory.filter((k) => !vSet.has(k));
     const verifiedCount = factors.filter((f) => f.verified).length;

     const completeness = financialCompleteness(financials);
     const integrityStatus = String((integrity || checkStatementIntegrity(financials)).status || 'INSUFFICIENT').toUpperCase();
     const penalty = (cfg.integrity_penalty || []).map((s) => String(s).toUpperCase());
     const integrityBad = !['OK', 'PASS'].includes(integrityStatus) || penalty.includes(integrityStatus);

     const mediumOK =
          mandatoryMissing.length === 0 &&
          verifiedCount >= num(cfg.medium_min_verified, 4) &&
          completeness >= num(cfg.medium_min_completeness, 0.6);
     const highOK =
          mediumOK &&
          verifiedCount >= num(cfg.high_min_verified, 6) &&
          weightSum >= num(cfg.high_min_weight, 12) &&
          completeness >= num(cfg.high_min_completeness, 0.85) &&
          !integrityBad;

     let level = CONFIDENCE_LEVEL.LOW;
     if (highOK) level = CONFIDENCE_LEVEL.HIGH;
     else if (mediumOK) level = CONFIDENCE_LEVEL.MEDIUM;

     // Skor komposit 0..100 (bobot sumber 55, kelengkapan 35, integritas 10).
     const wPart = weightMax ? Math.min(1, weightSum / weightMax) : 0;
     const score = Math.round((wPart * 55 + completeness * 35 + (integrityBad ? 0 : 10)) * 100) / 100;

     const notes = [];
     if (mandatoryMissing.length) {
          notes.push(`Sumber wajib belum terverifikasi: ${mandatoryMissing.join(', ')}.`);
     }
     if (verifiedCount < num(cfg.medium_min_verified, 4)) {
          notes.push('Jumlah sumber terverifikasi masih sedikit; verifikasi lebih lanjut menaikkan keyakinan.');
     }
     if (completeness < num(cfg.medium_min_completeness, 0.6)) {
          notes.push('Data keuangan belum lengkap.');
     }
     if (integrityBad) {
          notes.push('Laporan keuangan belum lolos pemeriksaan integritas.');
     }

     return {
          level,
          level_label: CONFIDENCE_LABEL[level] || level,
          tone: CONFIDENCE_TONE[level] || 'warn',
          rank: confidenceRank(level),
          score,
          verified_count: verifiedCount,
          weight_sum: weightSum,
          weight_max: weightMax,
          mandatory_missing: mandatoryMissing,
          meets_mandatory: mandatoryMissing.length === 0,
          completeness: Math.round(completeness * 1000) / 1000,
          integrity_status: integrityStatus,
          factors,
          notes
     };
}

/** Label sumber verifikasi (untuk UI checklist). */
export function sourceLabel(key) {
     const meta = sourceByKey(key);
     return meta ? meta.label : String(key);
}

export default {
     CONFIDENCE_LEVEL,
     CONFIDENCE_LABEL,
     CONFIDENCE_TONE,
     CONFIDENCE_RANK,
     confidenceRank,
     financialCompleteness,
     computeConfidence,
     sourceLabel
};
