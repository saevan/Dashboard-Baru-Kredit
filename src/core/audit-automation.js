import { checkStatementIntegrity } from './statement-integrity.js';
import { VERIFICATION_SOURCES } from './intake-config.js';

export function numericValue(value) {
     if (typeof value !== 'number' && typeof value !== 'string' || String(value).trim() === '') return null;
     const number = Number(value);
     return Number.isFinite(number) ? number : null;
}

/** Computed from CURRENT data every time; an old checkbox cannot override a failed check. */
export function automaticAudit(borrower = {}, documents = []) {
     const financials = borrower.keuangan || {};
     const integrity = checkStatementIntegrity(financials);
     const structureKeys = ['aset_lancar', 'total_aset', 'liabilitas_jangka_pendek', 'total_liabilitas', 'ekuitas', 'penjualan'];
     const enough = structureKeys.every(k => numericValue(financials[k]) !== null);
     const nonnegative = structureKeys.filter(k => k !== 'ekuitas').every(k => numericValue(financials[k]) >= 0);
     const structuralChecks = integrity.checks.filter(c => c.code !== 'balance');
     const structurePass = !enough ? null : nonnegative && structuralChecks.every(c => c.passed === true);
     const selected = borrower.financial_import;
     const document = documents.find(d => d.id === selected?.doc_id && d.sha256 === selected?.sha256 && d.has_file);
     const candidate = document?.extraction?.candidates?.[selected?.candidate_index];
     const comparisons = candidate ? Object.entries(candidate.keuangan).map(([key, source]) => {
          const current = numericValue(financials[key]);
          // Monetary rounding only. No tolerance as a percentage of loan amount.
          return { key, source, current, matches: current !== null && Math.abs(current - source) <= 1 };
     }) : [];
     const hashes = new Map();
     for (const doc of documents.filter(d => d.has_file && d.sha256)) {
          hashes.set(doc.sha256, [...(hashes.get(doc.sha256) || []), doc.source_key]);
     }
     return {
          integrity,
          checks: [
               { key: 'neraca_seimbang', label: 'Neraca seimbang', passed: integrity.is_balanced, detail: `${integrity.summary} Toleransi ${integrity.tolerance_pct}% dari total aset.` },
               { key: 'angka_wajar', label: 'Struktur angka konsisten', passed: structurePass, detail: 'Aset lancar ≤ total aset; utang jangka pendek ≤ total utang; komponen kas/piutang/persediaan diperiksa bila tersedia. Data inti wajib terisi.' }
          ],
          missing_files: VERIFICATION_SOURCES.filter(s => s.mandatory && !documents.some(d => d.source_key === s.key && d.has_file)).map(s => s.label),
          duplicate_sources: [...hashes.values()].filter(keys => keys.length > 1),
          document: document || null,
          comparisons,
          matched: comparisons.filter(c => c.matches).length,
          changed: comparisons.filter(c => !c.matches),
          stale_import: !!selected && !candidate
     };
}
