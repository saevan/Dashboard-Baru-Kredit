import { FINANCIAL_FILE_FIELDS } from './attachments.js';

/** Laporan komparatif (2025 vs 2024): periode terbaru dipakai bila tahunnya tertulis jelas dan unik. */
function latestPeriod(candidates) {
     const years = candidates.map(c=>c.period);
     if (years.some(y=>!Number.isInteger(y)) || new Set(years).size !== years.length) return null;
     return years.indexOf(Math.max(...years));
}

/** Plan an import without modifying inputs. Ambiguous reports never overwrite typed figures. */
export function financialImportPlan(borrower, doc, { index = null, overwrite = false } = {}) {
     const candidates = doc?.extraction?.candidates || [];
     if (!doc?.has_file || !['laporan_keuangan','laporan_audited'].includes(doc.source_key) || !candidates.length) {
          return {status:'unavailable',message:doc?.extraction?.message || 'Angka belum dapat dibaca dari berkas ini.'};
     }
     const source = borrower.financial_import;
     if (!overwrite && index === null && source?.doc_id === doc.id && source.sha256 === doc.sha256 && candidates[source.candidate_index]) {
          return {status:'applied',message:'Angka laporan sudah diterapkan; pilihan periode dan koreksi Anda dipertahankan.'};
     }
     const latest = index === null && candidates.length > 1 ? latestPeriod(candidates) : null;
     if (index === null && candidates.length !== 1 && latest === null) return {status:'review',message:'Ada beberapa laporan/periode. Pilih laporan yang sesuai sebelum mengisi angka.'};
     const selected = index ?? latest ?? 0;
     const candidate = Number.isInteger(selected) ? candidates[selected] : null;
     if (!candidate) return {status:'review',message:'Pilihan laporan tidak tersedia.'};
     if (!overwrite && source?.doc_id === doc.id && source.sha256 === doc.sha256 && source.candidate_index === selected) {
          return {status:'applied',message:'Angka laporan sudah pernah diterapkan; perubahan manual Anda dipertahankan.'};
     }
     if (!overwrite && (candidate.warnings?.length || source && source.sha256 !== doc.sha256)) {
          return {status:'review',message:'Tinjau catatan pembacaan atau perubahan laporan sumber sebelum mengganti angka.'};
     }
     const entries = Object.entries(candidate.keuangan || {}).filter(([key])=>FINANCIAL_FILE_FIELDS.includes(key));
     if (!entries.length || entries.some(([,value])=>typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value)>Number.MAX_SAFE_INTEGER)) {
          return {status:'review',message:'Angka laporan belum valid untuk diterapkan. Periksa berkas sumber.'};
     }
     const current = borrower.keuangan || {};
     const conflicts = entries.filter(([key,value])=>current[key] != null && String(current[key]).trim() !== '' && Number(current[key]) !== value).map(([key])=>key);
     if (!overwrite && conflicts.length) return {status:'review',conflicts,message:`Ada ${conflicts.length} angka yang berbeda dengan isian Anda. Tinjau perbandingan, lalu pilih “Gunakan angka laporan ini” jika ingin menggantinya.`};
     return {status:'ready',count:entries.length,fields:entries.map(([key])=>key),period:latest === null ? null : candidate.label,borrower:{...borrower,keuangan:{...current,...Object.fromEntries(entries)},
          financial_import:{doc_id:doc.id,sha256:doc.sha256,candidate_index:selected,label:candidate.label,
               applied_at:new Date().toISOString(),mode:overwrite ? 'reviewed' : 'automatic'}}};
}
