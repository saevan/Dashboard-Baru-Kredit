import { VERIFICATION_SOURCES } from './intake-config.js';
import { auditProgress } from './audit.js';
import { offerEligibility } from './offer.js';

/** Temuan yang bisa ditindaklanjuti, bukan pengganti validasi keputusan kredit. */
export function reviewGaps(d, now = Date.now()) {
     const findings = [];
     const add = (label, section, action) => findings.push({ label, section, action });
     const docs = d.documents || [];
     for (const source of VERIFICATION_SOURCES.filter((s) => s.mandatory)) {
          const doc = docs.find((item) => item.source_key === source.key);
          if (!doc) add(`${source.label}: bukti belum tersedia`, 'evidence', 'Tinjau dokumen');
          else if (!(doc.verified === true || doc.verified === 1)) add(`${source.label}: belum diverifikasi`, 'evidence', 'Verifikasi bukti');
     }
     if (!d.consent?.accepted) add('Persetujuan audit pemohon belum tercatat', 'evidence', 'Periksa persetujuan');
     if (['submitted', 'need_fix', 'verified'].includes(d.status)) {
          const progress = auditProgress(d.audit, d);
          for (const [key, label] of [['financial', 'Audit keuangan'], ['collateral', 'Verifikasi agunan'], ['interview', 'Wawancara']]) {
               if (!progress[key].complete) add(`${label}: ${progress[key].done}/${progress[key].total} terisi`, 'audit', 'Lengkapi audit');
          }
     }
     if (d.status === 'scored' && d.local) {
          const eligibility = offerEligibility(d.result, d.intake?.gate);
          if (!eligibility.allowed) add(eligibility.reasons.join(' ') || 'Hasil analisis belum memenuhi syarat penawaran', 'decision', 'Tinjau keputusan');
     }
     if (d.status === 'offered' && d.offer?.expires_at && Date.parse(d.offer.expires_at) < now) add('Penawaran telah kedaluwarsa; perlu peninjauan ulang', 'decision', 'Tinjau penawaran');
     return findings;
}
