import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectAttachment, parseFinancialCsv, financialCsvTemplate, MAX_FILE_BYTES, bytesToBase64, base64ToBytes } from '../../src/core/attachments.js';
import { automaticAudit } from '../../src/core/audit-automation.js';
import { score01, assertValidAuditScores, applyAuditToBorrower, auditProgress, INTERVIEW_QUESTIONS, FINANCIAL_CHECKLIST, COLLATERAL_CHECKLIST } from '../../src/core/audit.js';
import { computeConfidence, financialCompleteness } from '../../src/core/confidence.js';
import { VERIFICATION_SOURCES } from '../../src/core/intake-config.js';

const bytes = text => new TextEncoder().encode(text);
const csv = 'field,value\ntotal_aset,3000\ntotal_liabilitas,1000\nekuitas,2000\naset_lancar,2000\nliabilitas_jangka_pendek,800\npenjualan,5000\n';
const financials = parseFinancialCsv(csv).keuangan;

test('attachment extraction preserves Rupiah amounts, zero, losses and reports unsupported layouts honestly', async () => {
     const doc = await inspectAttachment(bytes(csv), 'keuangan.csv', 'laporan_keuangan');
     assert.equal(doc.byte_size, bytes(csv).length);
     assert.equal(doc.sha256.length, 64);
     assert.equal(doc.extraction.status, 'ready');
     assert.deepEqual(doc.extraction.candidates[0].keuangan, financials);
     assert.equal(parseFinancialCsv('field;value\nkas;0\nlaba_bersih;-100\n').keuangan.laba_bersih, -100);
     assert.equal(parseFinancialCsv('field,value\nkas,0').keuangan.kas, 0);
     assert.equal((await inspectAttachment(bytes('%PDF-1.4\n%%EOF'), 'laporan.pdf', 'laporan_keuangan')).extraction.status, 'manual');
     const invalid = await inspectAttachment(bytes('Nama,Jumlah\nKas,100'), 'lain.csv', 'laporan_keuangan');
     assert.equal(invalid.extraction.status, 'unrecognized');
     assert.equal(invalid.has_file, true, 'unrecognized documents remain available for manual review');
     assert.deepEqual(base64ToBytes(bytesToBase64(bytes(csv))), bytes(csv));
});

test('CSV rejects duplicates, ambiguous thousands, invalid numbers, unknown fields and empty templates', () => {
     for (const content of [financialCsvTemplate(), 'field,value\nkas,1\nkas,2', 'field,value\nkas,1,000', 'field,value\nkas,Infinity', 'field,value\nkas,NaN', 'field,value\nskor,1']) assert.throws(() => parseFinancialCsv(content));
});

test('upload validation rejects empty, oversized, unsupported and mismatched content', async () => {
     for (const [content, name] of [[new Uint8Array(), 'x.csv'], [new Uint8Array(MAX_FILE_BYTES + 1), 'x.csv'], [bytes('x'), 'x.exe'], [bytes('x'), 'x.pdf'], [bytes('x'), 'x.png'], [bytes('x'), 'x.xlsx'], [new Uint8Array([255]), 'x.csv']]) await assert.rejects(inspectAttachment(content, name, 'laporan_keuangan'));
});

test('stage 3 accepts zero/one and Indonesian decimal comma; malformed scores cannot fall back silently', () => {
     assert.equal(score01(0), 0);
     assert.equal(score01(1), 1);
     assert.equal(score01('0,75'), .75);
     for (const value of [1.01, 75, -1, Infinity, true, false, [], {}, ' ', 'NaN']) {
          assert.equal(score01(value), null);
          const audit = { interview: { scores: { [INTERVIEW_QUESTIONS[0].key]: value } } };
          assert.throws(() => assertValidAuditScores(audit), /tidak valid/);
          assert.throws(() => applyAuditToBorrower({ bisnis_manajemen: { [INTERVIEW_QUESTIONS[0].key]: .9 } }, audit));
     }
     const key = INTERVIEW_QUESTIONS[0].key;
     assert.equal(applyAuditToBorrower({ bisnis_manajemen: { [key]: .9 } }, { interview: { scores: { [key]: 0 } } }).bisnis_manajemen[key], 0);
});

test('automatic audit recalculates current values; checked boxes cannot conceal an unbalanced statement', async () => {
     const doc = { ...await inspectAttachment(bytes(csv), 'keuangan.csv', 'laporan_keuangan'), id: 'd', source_key: 'laporan_keuangan' };
     const borrower = { keuangan: financials, financial_import: { doc_id: 'd', sha256: doc.sha256, candidate_index: 0 } };
     const report = automaticAudit(borrower, [doc]);
     assert.ok(report.checks.every(c => c.passed === true));
     assert.equal(report.matched, 6);
     assert.equal(doc.verified, undefined, 'extraction does not verify authenticity');
     const changed = { ...borrower, keuangan: { ...financials, total_aset: 9000 } };
     assert.equal(automaticAudit(changed, [doc]).changed[0].key, 'total_aset');
     const audit = { financial: { checks: Object.fromEntries(FINANCIAL_CHECKLIST.map(c => [c.key, true])) }, collateral: { checks: Object.fromEntries(COLLATERAL_CHECKLIST.map(c => [c.key, true])) }, interview: { scores: Object.fromEntries(INTERVIEW_QUESTIONS.map(q => [q.key, .75])) } };
     assert.equal(auditProgress(audit, { borrower, documents: [doc] }).complete, true);
     assert.equal(auditProgress(audit, { borrower: changed, documents: [doc] }).complete, false);
     assert.equal(auditProgress(audit, { borrower: {} }).financial.done, 4, 'missing data never auto-passes');
     assert.equal(automaticAudit(borrower, [{ ...doc, id: 'replacement' }]).stale_import, true);
     assert.equal(automaticAudit(borrower, [{ ...doc, sha256: 'replaced-content' }]).comparisons.length, 0);
     assert.equal(automaticAudit(borrower, [doc, { ...doc, id: 'd2', source_key: 'identitas' }]).duplicate_sources.length, 1);
});

test('invalid/insufficient integrity never earns HIGH confidence or the integrity bonus', () => {
     const fin = { ...financials, ebit: 300, laba_bersih: 200, arus_kas_operasional: 400 };
     const verified = VERIFICATION_SOURCES.map(s => s.key);
     const good = computeConfidence({ verified, financials: fin });
     assert.equal(good.level, 'HIGH');
     for (const status of ['invalid', 'insufficient', 'warning', 'unexpected']) {
          const result = computeConfidence({ verified, financials: fin, integrity: { status } });
          assert.equal(result.level, 'MEDIUM');
          assert.equal(good.score - result.score, 10);
     }
     assert.equal(financialCompleteness({ kas: 'NaN' }, ['kas']), 0);
     assert.equal(financialCompleteness({ kas: true }, ['kas']), 0);
     assert.equal(financialCompleteness({ kas: ' ' }, ['kas']), 0);
     assert.equal(financialCompleteness({ kas: 0 }, ['kas']), 1);
});

test('changed financial inputs or replaced evidence invalidate human checks, preserving interview and notes', async () => {
     const { auditAfterInputChange } = await import('../../src/core/audit.js');
     const old = { financial: { checks: { penjualan_terverifikasi: true }, notes: 'Lihat rekening' }, collateral: { checks: { ada_fisik: true } }, interview: { scores: { [INTERVIEW_QUESTIONS[0].key]: .75 } } };
     const same = { keuangan: financials, agunan: { nilai_agunan: 1000 } };
     assert.equal(auditAfterInputChange(old, same, same).financial.checks.penjualan_terverifikasi, true);
     const changed = auditAfterInputChange(old, same, { ...same, keuangan: { ...financials, penjualan: 10000 } });
     assert.deepEqual(changed.financial.checks, {});
     assert.equal(changed.financial.notes, 'Lihat rekening');
     assert.equal(changed.collateral.checks.ada_fisik, true);
     assert.equal(changed.interview.scores[INTERVIEW_QUESTIONS[0].key], .75);
     const replaced = auditAfterInputChange(old, same, same, [{ id: 'd', source_key: 'agunan', sha256: 'old' }], [{ id: 'd2', source_key: 'agunan', sha256: 'new' }]);
     assert.deepEqual(replaced.collateral.checks, {});
});
