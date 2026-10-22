/**
 * core/recommendation.js — Rekomendasi berapa uang yang diberikan (plain language).
 *
 * Menjawab masukan stakeholder: "harus ada rekomendasi berapa kasih uangnya".
 * Modul ini membungkus hasil `recommendNominal()` + keputusan + segmen + integritas
 * laporan menjadi satu rekomendasi tegas yang dapat dibaca pengambil keputusan:
 *   · disburse  : cairkan sejumlah nominal rekomendasi,
 *   · disburse_with_conditions : cairkan dengan syarat,
 *   · hold      : tahan — laporan keuangan belum beres,
 *   · review    : perlu review manual,
 *   · reject    : tidak disarankan membiayai.
 *
 * Pure function; tidak menyentuh DOM.
 */

const num = (v, d = 0) => {
     if (v === null || v === undefined || v === '') return d;
     const n = Number(v);
     return Number.isFinite(n) ? n : d;
};

/** Label gate rekomendasi. */
export const GATE_LABEL = {
     disburse: 'Cairkan',
     disburse_with_conditions: 'Cairkan dengan Syarat',
     hold: 'Tahan — Perbaiki Laporan',
     review: 'Perlu Review Manual',
     reject: 'Tidak Disarankan',
     unknown: 'Belum Tersedia'
};

const GATE_TONE = {
     disburse: 'success',
     disburse_with_conditions: 'warning',
     hold: 'warning',
     review: 'info',
     reject: 'danger',
     unknown: 'info'
};

/**
 * Susun rekomendasi pencairan.
 * @param {object} args
 * @param {object} [args.nominal] — keluaran recommendNominal()
 * @param {object} [args.decision] — blok keputusan hasil engine
 * @param {object} [args.segment] — keluaran classifyBorrower()
 * @param {object} [args.integrity] — keluaran checkStatementIntegrity()
 * @param {number} [args.plafonDiajukan]
 * @returns {object} rekomendasi
 */
export function recommendAmount({ nominal = null, decision = null, segment = null, integrity = null, plafonDiajukan = 0 } = {}) {
     const decisionKey = decision && decision.decision ? decision.decision : null;
     const recommended = nominal ? num(nominal.recommended_nominal, 0) : 0;
     const rangeNarrow = nominal && Array.isArray(nominal.range_narrow) ? nominal.range_narrow : [0, 0];
     const plafon = num(plafonDiajukan, 0);
     const binding = nominal ? nominal.binding_label || nominal.binding_constraint || null : null;
     const integrityInvalid = !!(integrity && integrity.status === 'invalid');

     let gate;
     if (decisionKey === 'TIDAK_LAYAK') gate = 'reject';
     else if (integrityInvalid) gate = 'hold';
     else if (decisionKey === 'LAYAK') gate = 'disburse';
     else if (decisionKey === 'LAYAK_BERSYARAT') gate = 'disburse_with_conditions';
     else if (decisionKey === 'REVIEW') gate = 'review';
     else gate = 'unknown';

     const approved = gate === 'disburse' || gate === 'disburse_with_conditions';
     const amount = gate === 'reject' || gate === 'hold' ? 0 : recommended;

     const rationale = [];
     if (binding) rationale.push(`Pembatas kapasitas: ${binding}.`);
     if (Number.isFinite(nominal?.dscr_at_recommended)) {
          rationale.push(`DSCR pada nominal ini ${Number(nominal.dscr_at_recommended).toFixed(2)}x.`);
     }
     if (segment) {
          rationale.push(`Segmen ${segment.label} — periodisitas laporan ${segment.treatment ? segment.treatment.cadence_label : segment.cadence}.`);
     }
     if (integrity) {
          rationale.push(`Integritas laporan: ${integrity.summary}`);
     }
     if (gate === 'reject') rationale.push('Keputusan kelayakan TIDAK LAYAK — pembiayaan tidak disarankan.');
     if (gate === 'hold') rationale.push('Neraca tidak seimbang/laporan tidak konsisten — tahan pencairan hingga diperbaiki.');

     const conditions = gate === 'disburse_with_conditions' && decision && Array.isArray(decision.conditions)
          ? [...decision.conditions]
          : [];

     const headline = buildHeadline(gate, amount);

     return {
          gate,
          gate_label: GATE_LABEL[gate] || gate,
          tone: GATE_TONE[gate] || 'info',
          headline,
          recommended_amount: amount,
          range_narrow: rangeNarrow,
          plafon_diajukan: plafon,
          approved,
          binding_constraint: binding,
          segment_key: segment ? segment.key : null,
          integrity_warning: integrityInvalid,
          rationale,
          conditions
     };
}

function buildHeadline(gate, amount) {
     switch (gate) {
          case 'disburse':
               return `Disarankan mencairkan ${fmtRp(amount)}`;
          case 'disburse_with_conditions':
               return `Disarankan mencairkan ${fmtRp(amount)} dengan syarat`;
          case 'hold':
               return 'Tahan pencairan — perbaiki laporan keuangan lebih dahulu';
          case 'review':
               return `Perlu review manual (indikasi ${fmtRp(amount)})`;
          case 'reject':
               return 'Tidak disarankan memberikan pinjaman';
          default:
               return 'Rekomendasi nominal belum tersedia';
     }
}

function fmtRp(v) {
     return `Rp ${Math.round(Number(v) || 0).toLocaleString('id-ID')}`;
}

export default { recommendAmount, GATE_LABEL };
