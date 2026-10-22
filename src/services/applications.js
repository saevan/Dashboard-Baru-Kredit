/**
 * services/applications.js — Siklus pengajuan (mode lokal), dipindahkan dari
 * dashboard lama tanpa mengubah aturan:
 *   pemohon : ui/apply.js (draf, lampiran, isi otomatis laporan, konsen, kirim),
 *             ui/borrower-offer.js (terima / tolak penawaran)
 *   lender  : ui/applications.js (normalizeLocal, scoreLocal, applyLocalAction,
 *             verifikasi dokumen, lembar audit, catatan perbaikan)
 * Status & transisi tetap dari core/application.js.
 */

import {
     uid,
     loadApplications,
     getApplication,
     upsertApplication,
     deleteApplication,
     saveConsent,
     getConsentForApplication,
     loadSession,
     loadBorrowers,
     prepareFacility
} from '../data/storage.js';
import { saveLocalFile, removeLocalFile, readLocalFile } from '../data/attachments.js';
import { myApplications, myApplication } from '../data/applicant-local.js';
import { applicationRecipient } from '../data/application-recipient.js';
import { loadWorkItems } from '../data/work-items.js';
import { inspectAttachment, MAX_FILE_BYTES, FINANCIAL_EXTRACTION_VERSION } from '../core/attachments.js';
import { financialImportPlan } from '../core/financial-import.js';
import { applyApplicationAction, actionsFor, gateDecision, borrowerStatusView } from '../core/application.js';
import { VERIFICATION_SOURCES, REQUIRED_FINANCIAL_FIELDS, INTAKE_CONFIG } from '../core/intake-config.js';
import { computeConfidence } from '../core/confidence.js';
import { pefindoRating } from '../core/rating.js';
import { checkStatementIntegrity } from '../core/statement-integrity.js';
import { identityErrors } from '../core/disbursement.js';
import { collateralError } from '../core/collateral-intake.js';
import { NEW_LOAN_SCHEME } from '../core/debt-service.js';
import {
     normalizeAudit,
     assertValidAuditScores,
     isAuditComplete,
     applyAuditToBorrower,
     auditAfterInputChange,
     score01
} from '../core/audit.js';
import { reopenAssessment } from '../core/reassessment.js';
import { improvementNote, IMPROVEMENT_NOTE_STAGES } from '../core/improvement-note.js';
import { validateOfferSelection, normalizeOffer } from '../core/offer.js';
import { queueRows } from '../core/workflow.js';
import { applicantFeedback } from '../core/applicant-feedback.js';
import { analyze } from './core.js';

const nowIso = () => new Date().toISOString();
const numOrNull = (v) => (v === '' || v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));

/* ============================================================ PEMOHON ===== */

/** Field keuangan minimal agar pengajuan dapat dikirim (sama dengan apply.js lama). */
export const MIN_FIN_FIELDS = ['penjualan', 'total_aset', 'ekuitas', 'arus_kas_operasional'];

export function blankBorrower() {
     return {
          nama: '',
          sektor: '',
          profil_company: 'ukm_mapan',
          plafon_diajukan: null,
          tenor_bulan: 36,
          bunga_tahunan: 0.14,
          skema_angsuran: NEW_LOAN_SCHEME,
          periode_angsuran: '',
          tujuan_kredit: '',
          utang_eksisting: [],
          keuangan: Object.fromEntries(REQUIRED_FINANCIAL_FIELDS.map((k) => [k, null])),
          bisnis_manajemen: {},
          agunan: {}
     };
}

export const blankDraft = () => ({ id: null, status: 'draft', borrower: blankBorrower(), documents: [], consent: null });

/** Draf dari record tersimpan (normalizeFromLocal lama). */
export function draftFrom(rec) {
     const d = blankDraft();
     if (!rec) return d;
     d.id = rec.id || null;
     d.status = rec.status || 'draft';
     const src = (rec.payload && rec.payload.borrower) || rec.borrower || {};
     d.borrower = {
          ...blankBorrower(),
          ...src,
          skema_angsuran: src.skema_angsuran || 'annuity',
          keuangan: { ...Object.fromEntries(REQUIRED_FINANCIAL_FIELDS.map((k) => [k, null])), ...(src.keuangan || {}) }
     };
     d.documents = Array.isArray(rec.documents) ? rec.documents.slice() : [];
     d.consent = getConsentForApplication(d.id) || null;
     return d;
}

/** Validasi per langkah (validate() lama). 0 usaha · 1 keuangan & agunan · 2 dokumen · 3 konsen. */
export function validateDraftStep(step, draft, { consentChecked = false } = {}) {
     const b = draft.borrower;
     if (step === 0) {
          if (!String(b.nama || '').trim()) return 'Nama usaha wajib diisi.';
          if (!b.sektor) return 'Bidang usaha wajib dipilih.';
          if (!b.plafon_diajukan || b.plafon_diajukan <= 0) return 'Jumlah pinjaman harus lebih dari 0.';
          if (!b.tenor_bulan || b.tenor_bulan <= 0) return 'Lama pinjaman harus lebih dari 0 bulan.';
          const idErr = identityErrors(b);
          return idErr.npwp || idErr.nib || null;
     }
     if (step === 1) {
          const missing = MIN_FIN_FIELDS.filter((k) => numOrNull(b.keuangan?.[k]) === null);
          if (missing.length) return 'missing-finance';
          return collateralError(b.agunan);
     }
     if (step === 3 && !consentChecked && !draft.consent?.accepted) return 'Centang persetujuan pemeriksaan data sebelum mengirim.';
     return null;
}

/** Simpan draf (persist() lama). Hanya pemohon; hanya status draft / perlu perbaikan. */
export function saveDraft(draft) {
     const session = loadSession();
     if (session?.role !== 'borrower') throw new Error('Masuk sebagai pemohon untuk menyimpan pengajuan.');
     const previous = draft.id ? myApplication(draft.id) : null;
     if (draft.id && (!previous || !['draft', 'need_fix'].includes(previous.status))) throw new Error('Pengajuan tidak dapat diubah lagi. Muat ulang status pengajuan.');
     const payload = { borrower: draft.borrower, tenor_bulan: draft.borrower.tenor_bulan, purpose: draft.borrower.tujuan_kredit };
     const rec = upsertApplication({
          id: draft.id || undefined,
          applicant_id: previous ? previous.applicant_id || 'usr_umkm' : session.user_id || session.id,
          status: draft.status || 'draft',
          amount_requested: draft.borrower.plafon_diajukan,
          tenor_bulan: draft.borrower.tenor_bulan,
          purpose: draft.borrower.tujuan_kredit,
          borrower: draft.borrower,
          payload,
          documents: draft.documents,
          ...(previous?.audit ? { audit: auditAfterInputChange(previous.audit, previous.borrower || previous.payload?.borrower, draft.borrower, previous.documents, draft.documents) } : {})
     });
     draft.id = rec.id;
     draft.status = rec.status;
     return draft;
}

/** Isi otomatis angka keuangan dari laporan (autoFill lama). Mengembalikan pesan untuk pengguna. */
export function autoFill(draft, doc) {
     if (!['laporan_keuangan', 'laporan_audited'].includes(doc?.source_key)) return { applied: false, message: '' };
     const plan = financialImportPlan(draft.borrower, doc);
     if (plan.status !== 'ready') return { applied: false, message: plan.message || '', plan };
     const previous = draft.borrower;
     draft.borrower = plan.borrower;
     try {
          saveDraft(draft);
     } catch (err) {
          draft.borrower = previous;
          return { applied: false, message: `Berkas tersimpan, tetapi angka belum tersimpan: ${err.message}` };
     }
     const formFields = plan.fields.filter((k) => REQUIRED_FINANCIAL_FIELDS.includes(k)).length;
     const extra = plan.count - formFields;
     return {
          applied: true,
          message: `${formFields} angka terisi otomatis dari ${doc.filename}${plan.period ? ` (${plan.period}, periode terbaru)` : ''}.${extra ? ` ${extra} pos pendukung (mis. kas, HPP) juga tersimpan.` : ''}`
     };
}

/** Lampirkan berkas (addDoc lama, mode lokal): simpan isi ke IndexedDB, metadata ke pengajuan. */
export async function attachDocument(draft, sourceKey, bytes, filename) {
     if (!bytes?.length || bytes.length > MAX_FILE_BYTES) throw new Error('Ukuran berkas harus lebih dari 0 dan maksimal 5 MB.');
     const previous = draft.documents || [];
     saveDraft(draft);
     const meta = await inspectAttachment(bytes, filename, sourceKey);
     const id = uid('doc');
     await saveLocalFile(draft.id, id, bytes);
     const document = { ...meta, id, source_key: sourceKey, verified: 0, created_at: nowIso() };
     draft.documents = [...previous.filter((x) => x.source_key !== sourceKey), document];
     try {
          saveDraft(draft);
     } catch (err) {
          draft.documents = previous;
          try { await removeLocalFile(draft.id, id); } catch { /* penyimpanan tidak tersedia */ }
          throw err;
     }
     for (const old of previous.filter((d) => d.source_key === sourceKey && d.has_file)) {
          try { await removeLocalFile(draft.id, old.id); } catch { /* sisa berkas dapat dihapus bersama data browser */ }
     }
     const fill = autoFill(draft, document);
     return { document, ...fill };
}

/** Foto / PDF hasil scan yang belum menghasilkan angka → layak dibaca OCR. */
export const ocrEligible = (doc) =>
     ['laporan_keuangan', 'laporan_audited'].includes(doc?.source_key) && doc.has_file && /\.(pdf|png|jpe?g)$/i.test(doc.filename || '') && !doc.extraction?.candidates?.length;

/** Simpan hasil OCR ke dokumen lalu isi otomatis. */
export function applyOcrResult(draft, docId, extraction) {
     const doc = draft.documents.find((d) => d.id === docId);
     if (!doc) throw new Error('Lampiran tidak ditemukan.');
     const refreshed = { ...doc, extraction: { ...extraction, version: FINANCIAL_EXTRACTION_VERSION } };
     draft.documents = draft.documents.map((d) => (d.id === docId ? refreshed : d));
     saveDraft(draft);
     return autoFill(draft, refreshed);
}

/** Pemohon memilih periode / menimpa isian dengan angka laporan (applyExtraction lama). */
export function applyExtraction(draft, docId, index) {
     const doc = draft.documents.find((d) => d.id === docId);
     const plan = financialImportPlan(draft.borrower, doc, { index, overwrite: true });
     if (plan.status !== 'ready') throw new Error(plan.message);
     const previous = structuredClone(draft.borrower);
     draft.borrower = plan.borrower;
     try { saveDraft(draft); } catch (err) { draft.borrower = previous; throw err; }
     return `${plan.count} angka laporan diterapkan.`;
}

export const readAttachment = (applicationId, docId) => readLocalFile(applicationId, docId);

/** Kirim pengajuan: simpan, catat konsen, status → submitted (doSubmit lama). */
export function submitDraft(draft, { consentChecked }) {
     for (let i = 0; i < 4; i += 1) {
          const err = validateDraftStep(i, draft, { consentChecked });
          if (err) return { ok: false, step: i, error: err };
     }
     saveDraft(draft);
     if (consentChecked) {
          draft.consent = saveConsent(draft.id, { version: INTAKE_CONFIG.consent.version, clause: INTAKE_CONFIG.consent.clause, accepted: true });
     }
     const rec = getApplication(draft.id) || {};
     const to = applyApplicationAction(rec.status || 'draft', 'submit');
     upsertApplication({ ...rec, status: to, submitted_at: nowIso(), events: [...(rec.events || []), { from: rec.status, to, action: 'submit', at: nowIso(), note: '' }] });
     return { ok: true, id: draft.id };
}

/** Pemohon menerima / menolak penawaran (respondToOffer lama). */
export function respondToOffer(id, accept) {
     const rec = myApplication(id);
     if (!rec) throw new Error('Pengajuan tidak ditemukan.');
     const action = accept ? 'accept_offer' : 'decline_offer';
     if (accept && (!rec.offer?.terms || (rec.offer.expires_at && (!Number.isFinite(Date.parse(rec.offer.expires_at)) || Date.parse(rec.offer.expires_at) <= Date.now())))) {
          throw new Error('Penawaran belum lengkap atau kedaluwarsa. Hubungi lender untuk penawaran baru.');
     }
     const from = rec.status || 'draft';
     const to = applyApplicationAction(from, action);
     const at = nowIso();
     const patch = {
          status: to,
          events: [...(rec.events || []), { from, to, action, note: '', at }],
          offer: { ...(rec.offer || {}), status: to === 'accepted' ? 'accepted' : 'declined', responded_at: at }
     };
     if (to === 'accepted') patch.decided_at = at;
     const { facility_summary: _ignored, ...stored } = rec;
     upsertApplication({ ...stored, ...patch });
     return to;
}

/** Pengajuan milik pemohon yang masuk + ringkasan status ramah pemohon. */
export function myApplicationList() {
     return myApplications()
          .map((app) => ({ ...app, feedback: applicantFeedback(app), view: borrowerStatusView(app.status || 'draft'), offerView: normalizeOffer(app.offer) }))
          .sort((a, b) => String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || '')));
}

export function myApplicationDetail(id) {
     const app = myApplication(id);
     if (!app) return null;
     return { ...app, feedback: applicantFeedback(app), view: borrowerStatusView(app.status || 'draft'), offerView: normalizeOffer(app.offer), draft: draftFrom(app) };
}

export function deleteDraft(id) {
     const app = myApplication(id);
     if (!app || app.status !== 'draft') throw new Error('Hanya draf yang belum dikirim yang dapat dihapus.');
     deleteApplication(id);
}

/* ============================================================== LENDER ===== */

const localBorrower = (rec) => (rec && ((rec.payload && rec.payload.borrower) || rec.borrower)) || {};

function decisionOf(result) {
     const d = result && result.decision;
     if (!d) return '';
     return typeof d === 'string' ? d : d.decision || d.verdict || '';
}

/** Bentuk record lokal → struktur peninjauan (normalizeLocal lama). */
export function reviewDetail(id) {
     const rec = getApplication(id);
     if (!rec) return null;
     const b = localBorrower(rec);
     const consent = getConsentForApplication(rec.id) || rec.consent || null;
     return {
          id: rec.id,
          borrower_id: rec.borrower_id || null,
          status: rec.status || 'draft',
          amount_requested: rec.amount_requested === undefined ? b.plafon_diajukan ?? null : rec.amount_requested,
          borrower: b,
          recipient: applicationRecipient(rec),
          documents: (rec.documents || []).map((d) => ({ ...d, verified: d.verified === 1 || d.verified === true })),
          consent: consent ? { accepted: !!consent.accepted, accepted_at: consent.accepted_at, version: consent.version } : null,
          events: Array.isArray(rec.events) ? rec.events.slice() : [],
          grade: rec.grade || null,
          grade_index: rec.grade_index === undefined ? null : rec.grade_index,
          confidence_level: rec.confidence_level || null,
          confidence_score: rec.confidence_score === undefined ? null : rec.confidence_score,
          decision: rec.decision || null,
          decided_at: rec.decided_at || null,
          intake: rec.intake || {},
          result: rec.result || null,
          offer: normalizeOffer(rec.offer),
          offer_assessment: rec.offer?.assessment || null,
          improvement_note: rec.improvement_note || null,
          audit: normalizeAudit(rec.audit),
          analysis_history: rec.analysis_history || [],
          submitted_at: rec.submitted_at || null,
          updated_at: rec.updated_at || rec.created_at || null,
          actions: actionsFor(rec.status || 'draft')
     };
}

/** Penilaian lokal (scoreLocal lama). */
function scoreLocal(rec) {
     const b = applyAuditToBorrower(localBorrower(rec), rec.audit);
     const result = analyze(b);
     const decision = decisionOf(result);
     const pefindo = (result && result.risk && result.risk.pefindo) || pefindoRating(result.finalScore, decision, null, { scaleMode: INTAKE_CONFIG.scaleMode });
     const docs = rec.documents || [];
     const verified = docs.filter((d) => d.verified === 1 || d.verified === true).map((d) => d.source_key);
     const declared = docs.map((d) => d.source_key);
     const integrity = (result && result.integrity) || checkStatementIntegrity(b.keuangan || {}, {});
     const confidence = computeConfidence({ verified, declared, financials: b.keuangan || {}, integrity, config: INTAKE_CONFIG });
     const gradeIndex = Number.isFinite(pefindo.index) ? pefindo.index : null;
     const gate = gateDecision({ gradeIndex, confidenceLevel: confidence.level, config: INTAKE_CONFIG });
     return { result, decision, pefindo, confidence, gate };
}

const actor = () => {
     const s = loadSession();
     return s?.email || s?.name || s?.user_id || 'local-lender';
};

/** Aksi lender pada record lokal (applyLocalAction lama). */
export function lenderAction(id, kind, { note = '', decision = 'LAYAK', force = false, overrideReason = '', amount = null, rate = null, basis, share_ratio } = {}) {
     const rec = getApplication(id);
     if (!rec) throw new Error('Pengajuan tidak ditemukan.');
     const from = rec.status || 'draft';
     const to = applyApplicationAction(from, kind);
     if (['reject', 'request_fix'].includes(kind) && !String(note).trim()) throw new Error('Isi catatan untuk menjelaskan keputusan atau perbaikan kepada pemohon.');
     if (kind === 'decide') {
          const gate = (rec.intake && rec.intake.gate) || {};
          if (gate.auto_reject && !force) throw new Error('Zona auto-reject: centang keputusan manual untuk memutuskan.');
          if (gate.auto_reject && force && !String(note).trim()) throw new Error('Justifikasi wajib diisi saat memaksa keputusan di zona auto-reject.');
     }
     const events = [...(rec.events || []), { from, to, action: kind, note, at: nowIso() }];
     const patch = { status: to, events };
     if (kind === 'reassess') Object.assign(patch, reopenAssessment({ ...rec, borrower: localBorrower(rec) }, { note, actor: actor() }));
     if (kind === 'verify') {
          assertValidAuditScores(rec.audit);
          if (!isAuditComplete(rec.audit, { borrower: localBorrower(rec), documents: rec.documents })) {
               if (!String(note).trim()) throw new Error('Lembar audit belum lengkap. Lengkapi 3 bagian, atau tulis catatan sebagai justifikasi untuk tetap melanjutkan.');
               patch.audit_override = true;
          }
          patch.verified_at = nowIso();
     }
     if (kind === 'score') {
          assertValidAuditScores(rec.audit);
          const scored = scoreLocal(rec);
          Object.assign(patch, {
               result: scored.result,
               scored_at: nowIso(),
               grade: String(scored.pefindo.grade || ''),
               grade_index: Number.isFinite(scored.pefindo.index) ? scored.pefindo.index : null,
               confidence_level: scored.confidence.level,
               confidence_score: scored.confidence.score,
               gate_pass: scored.gate.pass,
               intake: { scale_mode: scored.pefindo.scale_mode || INTAKE_CONFIG.scaleMode, confidence: scored.confidence, gate: scored.gate }
          });
     }
     if (kind === 'offer') {
          if (!applicationRecipient(rec).valid) throw new Error('Perbaiki akun pemohon penerima sebelum mengirim penawaran.');
          const checked = validateOfferSelection({
               result: rec.result, gate: rec.intake?.gate, borrower: applyAuditToBorrower(localBorrower(rec), rec.audit),
               amount, rate, basis, share_ratio, allowEligibilityOverride: force === true, overrideReason
          });
          const amt = Number(amount);
          const r = Number(rate);
          if (!Number.isFinite(amt) || amt <= 0) throw new Error('Pilih plafon penawaran terlebih dahulu.');
          if (basis !== 'net_profit' && (!Number.isFinite(r) || r <= 0)) throw new Error('Pilih suku bunga penawaran terlebih dahulu.');
          patch.offer = {
               amount: amt,
               rate: basis === 'net_profit' ? 0 : r,
               basis: basis || 'principal',
               share_ratio: basis === 'net_profit' ? Number(share_ratio) : null,
               expected_profit_monthly: checked.expected_profit_monthly,
               note: String(note || '').trim(),
               sent_at: nowIso(),
               status: 'pending',
               responded_at: null,
               terms: checked.terms,
               assessment: { ...checked.assessment, actor: actor() },
               expires_at: new Date(Date.now() + 14 * 86400000).toISOString()
          };
     }
     if (kind === 'decide') Object.assign(patch, { decision, decided_at: nowIso(), force: !!force });
     if (kind === 'reject') patch.decided_at = nowIso();
     upsertApplication({ ...rec, ...patch });
     return to;
}

/** Verifikasi lalu nilai otomatis bila lembar audit lengkap (verifyAndScore lama). */
export function verifyAndScore(id, note = '') {
     let to = lenderAction(id, 'verify', { note });
     const d = reviewDetail(id);
     if (d.status === 'verified' && isAuditComplete(d.audit, d)) {
          try {
               to = lenderAction(id, 'score', { note: 'Penilaian otomatis setelah audit lengkap diverifikasi' });
          } catch (err) {
               return { to, warning: `Verifikasi berhasil, tetapi penilaian belum selesai: ${err.message}. Jalankan penilaian dari pengajuan terverifikasi.` };
          }
     }
     return { to };
}

const EDITABLE = ['submitted', 'need_fix', 'verified'];

/** Tandai dokumen terverifikasi / batal (toggle-doc lama). */
export function setDocumentVerified(id, docId, verified) {
     const rec = getApplication(id);
     if (!rec) throw new Error('Pengajuan tidak ditemukan.');
     if (!EDITABLE.includes(rec.status)) throw new Error('Verifikasi dikunci pada tahap ini.');
     const target = (rec.documents || []).find((doc) => doc.id === docId);
     const isVerified = (doc) => doc.verified === 1 || doc.verified === true;
     // Rekening koran baru sah setelah dicocokkan dengan surat keterangan bank yang terverifikasi.
     if (verified && target?.source_key === 'rekening_koran' && !(rec.documents || []).some((doc) => doc.source_key === 'surat_keterangan_bank' && isVerified(doc))) {
          throw new Error('Verifikasi surat keterangan bank lebih dulu: rekening koran divalidasi dengan surat tersebut. Bila belum dilampirkan, minta perbaikan ke pemohon.');
     }
     // Membatalkan surat keterangan bank ikut membatalkan rekening koran yang divalidasinya.
     const unlinkStatement = !verified && target?.source_key === 'surat_keterangan_bank';
     const documents = (rec.documents || []).map((doc) => (doc.id === docId || (unlinkStatement && doc.source_key === 'rekening_koran') ? { ...doc, verified: verified ? 1 : 0, verified_at: verified ? nowIso() : null } : doc));
     upsertApplication({ ...rec, documents });
}

/** Ubah lembar audit (saveAudit lama). */
function saveAudit(id, mutate) {
     const rec = getApplication(id);
     if (!rec) throw new Error('Pengajuan tidak ditemukan.');
     if (!EDITABLE.includes(rec.status)) throw new Error('Lembar audit dikunci pada tahap ini.');
     const audit = normalizeAudit(rec.audit);
     mutate(audit);
     upsertApplication({ ...rec, audit });
}

export const setAuditCheck = (id, section, key, checked) => saveAudit(id, (a) => { a[section].checks[key] = !!checked; });
export const setAuditNote = (id, section, text) => saveAudit(id, (a) => { a[section].notes = String(text || ''); });
export function setAuditScore(id, key, raw) {
     if (raw !== '' && raw !== null && score01(raw) === null) throw new Error('Nilai harus antara 0 dan 1.');
     saveAudit(id, (a) => {
          if (raw === '' || raw === null) delete a.interview.scores[key];
          else a.interview.scores[key] = score01(raw);
     });
}

/** Catatan perbaikan untuk pemohon setelah penilaian (bindImprovementNote lama). */
export function sendImprovementNote(id, text) {
     const current = getApplication(id);
     if (!IMPROVEMENT_NOTE_STAGES.includes(current?.status)) throw new Error('Catatan dapat dikirim setelah penilaian selesai.');
     upsertApplication({ ...current, improvement_note: improvementNote(text) });
}

/** Antrean petugas: tahap, pemilik tugas, lama di tahap (core/workflow.queueRows). */
export function lenderQueue(now = Date.now()) {
     const apps = loadApplications().filter((a) => a.status !== 'draft').map((a) => ({ ...a, recipient: applicationRecipient(a) }));
     return queueRows(apps, loadBorrowers(), now, loadWorkItems());
}

export { prepareFacility, VERIFICATION_SOURCES, REQUIRED_FINANCIAL_FIELDS };
