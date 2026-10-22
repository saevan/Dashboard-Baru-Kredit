/**
 * core/application.js — State machine pengajuan & gate keputusan.
 *
 * Mengelola transisi status pengajuan pemohon (draft → submitted → verified →
 * scored → decided) dan **gate** yang menggabungkan peringkat risiko dengan
 * tingkat keyakinan data. Grade tidak pernah bergantung pada jumlah yang diminta.
 */

import { APPLICATION_STAGES, BORROWER_STATUS_LABEL, INTAKE_CONFIG } from './intake-config.js';

/** Aksi yang memicu transisi status. */
export const APPLICATION_ACTIONS = {
     SUBMIT: 'submit',
     REQUEST_FIX: 'request_fix',
     VERIFY: 'verify',
     SCORE: 'score',
     REASSESS: 'reassess',
     DECIDE: 'decide',
     OFFER: 'offer',
     ACCEPT_OFFER: 'accept_offer',
     DECLINE_OFFER: 'decline_offer',
     REJECT: 'reject'
};

/** Peta transisi: status → { aksi: status tujuan }. */
export const TRANSITIONS = {
     draft: { submit: 'submitted' },
     submitted: { request_fix: 'need_fix', verify: 'verified', reject: 'rejected' },
     need_fix: { submit: 'submitted', reject: 'rejected' },
     verified: { score: 'scored', reject: 'rejected' },
     scored: { reassess: 'verified', offer: 'offered', decide: 'decided', request_fix: 'need_fix', reject: 'rejected' },
     offered: { accept_offer: 'accepted', decline_offer: 'declined', request_fix: 'need_fix', reject: 'rejected' },
     accepted: {},
     declined: {},
     decided: {},
     rejected: {}
};

/** Status akhir (tidak ada transisi keluar). */
export const TERMINAL_STATUSES = ['accepted', 'declined', 'decided', 'rejected'];

function num(v, d = 0) {
     if (v === null || v === undefined || v === '') return d;
     const n = Number(v);
     return Number.isFinite(n) ? n : d;
}

/** Apakah transisi `action` sah dari `status`. */
export function canTransition(status, action) {
     const map = TRANSITIONS[String(status)] || {};
     return !!map[String(action)];
}

/** Status tujuan sebuah transisi (melempar bila tidak sah). */
export function applyApplicationAction(status, action) {
     const map = TRANSITIONS[String(status)] || {};
     const next = map[String(action)];
     if (!next) {
          const err = new Error(`Transisi "${action}" tidak sah dari status "${status}"`);
          err.code = 'invalid_transition';
          throw err;
     }
     return next;
}

/** Daftar aksi yang tersedia dari sebuah status. */
export function actionsFor(status) {
     return Object.keys(TRANSITIONS[String(status)] || {});
}

/** Apakah status sudah final. */
export function isTerminal(status) {
     return TERMINAL_STATUSES.includes(String(status));
}

/** Tahap linimasa dari sebuah status. */
export function stageOf(status) {
     const s = String(status);
     const found = APPLICATION_STAGES.find((st) => st.statuses.includes(s));
     return found ? found.key : 'submitted';
}

/** Linimasa tahap dengan penanda state (done | current | todo). */
export function timeline(status) {
     const order = APPLICATION_STAGES.map((s) => s.key);
     const current = stageOf(status);
     const idx = Math.max(0, order.indexOf(current));
     const closed = isTerminal(status);
     return APPLICATION_STAGES.map((st, i) => {
          let state;
          if (closed) state = i <= idx ? 'done' : 'todo';
          else if (i < idx) state = 'done';
          else if (i === idx) state = 'current';
          else state = 'todo';
          return { key: st.key, label: st.label, state };
     });
}

/**
 * Tampilan status untuk pemohon — SENGAJA tanpa istilah penilaian/peringkat.
 * Pemohon hanya melihat progres dan konfirmasi.
 */
export function borrowerStatusView(status) {
     const s = String(status);
     return {
          code: s,
          label: BORROWER_STATUS_LABEL[s] || BORROWER_STATUS_LABEL.submitted,
          stage: stageOf(s),
          timeline: timeline(s),
          terminal: isTerminal(s),
          awaiting: ['submitted', 'need_fix', 'verified', 'scored'].includes(s),
          needs_borrower: s === 'offered'
     };
}

/**
 * Gate keputusan: gabungan peringkat risiko (index grade, 0 = terbaik) dan
 * tingkat keyakinan data. Skor/gate TIDAK dipengaruhi plafon yang diminta.
 *
 * @param {object} [opts]
 * @param {number} [opts.gradeIndex]      Index grade PEFINDO (0 = idAAA … 17 = idD).
 * @param {string} [opts.confidenceLevel] LOW | MEDIUM | HIGH.
 * @param {object} [opts.config]          Konfigurasi intake (default INTAKE_CONFIG).
 */
export function gateDecision({ gradeIndex = null, confidenceLevel = null, config = INTAKE_CONFIG } = {}) {
     const gate = (config && config.gate) || {};
     const ranks = { LOW: 0, MEDIUM: 1, HIGH: 2 };
     const minConf = String(gate.min_confidence || 'MEDIUM').toUpperCase();
     const minConfRank = Object.prototype.hasOwnProperty.call(ranks, minConf) ? ranks[minConf] : 1;
     const confKey = String(confidenceLevel || 'LOW').toUpperCase();
     const confRank = Object.prototype.hasOwnProperty.call(ranks, confKey) ? ranks[confKey] : 0;

     const idx = gradeIndex === null || gradeIndex === undefined || gradeIndex === '' ? null : num(gradeIndex, null);
     const minIdx = num(gate.min_grade_index, 9);
     const autoIdx = num(gate.auto_reject_grade_index, 17);

     const gradeOk = idx !== null && Number.isFinite(idx) && idx <= minIdx;
     const confOk = confRank >= minConfRank;
     const autoReject = idx !== null && Number.isFinite(idx) && idx >= autoIdx;

     const reasons = [];
     if (!gradeOk) {
          reasons.push({
               code: 'grade',
               message: idx === null ? 'Peringkat belum tersedia' : 'Peringkat risiko di bawah ambang'
          });
     }
     if (!confOk) {
          reasons.push({ code: 'confidence', message: `Keyakinan data minimal ${minConf}` });
     }

     const pass = gradeOk && confOk && !autoReject;
     return {
          pass,
          grade_ok: gradeOk,
          confidence_ok: confOk,
          auto_reject: autoReject,
          requires_manual: !pass && !autoReject,
          grade_index: idx,
          min_grade_index: minIdx,
          min_confidence: minConf,
          reasons
     };
}

export default {
     APPLICATION_ACTIONS,
     TRANSITIONS,
     TERMINAL_STATUSES,
     canTransition,
     applyApplicationAction,
     actionsFor,
     isTerminal,
     stageOf,
     timeline,
     borrowerStatusView,
     gateDecision
};
