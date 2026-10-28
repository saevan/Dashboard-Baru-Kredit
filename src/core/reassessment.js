import { applyApplicationAction } from './application.js';

/** Archive a deep snapshot before unlocking the next assessment. Never reuse its gate. */
export function reopenAssessment(record, { note = '', at = new Date().toISOString(), actor = '' } = {}) {
     const status = applyApplicationAction(record.status, 'reassess');
     if (record.borrower_id || record.analysis_id || record.offer || record.decided_at) throw new Error('Penilaian dengan penawaran, keputusan, atau fasilitas terkait tidak dapat dibuka ulang.');
     if (!record.result) throw new Error('Hasil penilaian sebelumnya tidak tersedia untuk diarsipkan.');
     const history = Array.isArray(record.analysis_history) ? record.analysis_history : [];
     const snapshot = structuredClone({
          revision: history.length + 1, archived_at: at, actor, note: String(note).trim(),
          borrower: record.borrower || record.payload?.borrower || {}, audit: record.audit || null,
          documents: record.documents || [], result: record.result,
          grade: record.grade ?? null, confidence_level: record.confidence_level ?? null,
          confidence_score: record.confidence_score ?? null, intake: record.intake || {},
          scored_at: record.scored_at || record.updated_at || null
     });
     return { status, analysis_history: [...history, snapshot], result: null, grade: null,
          grade_index: null, confidence_level: null, confidence_score: null, gate_pass: null,
          intake: null, decision: null, scored_at: null };
}
