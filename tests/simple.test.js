import test from 'node:test';
import assert from 'node:assert/strict';

import { analyze, analyzeWithSuggestion } from '../src/simple/analyze.js';
import { toPlain, plainMetrics, gradeInfo, starsFor, plainRule, stressView, rupiah, GRADE_DISCLAIMER } from '../src/simple/translate.js';
import { parseAmount, validateStep, interviewToScore, scoreToInterview, INTERVIEW_QUESTIONS } from '../src/simple/form-schema.js';
import { demoBuSari } from '../src/simple/demo.js';
import { PEFINDO_SCALE } from '../src/core/rating.js';

test('Bu Sari: angka mesin sama dengan kompendium', () => {
     const r = analyze(demoBuSari());
     assert.equal(r.finalScore, 87.2);
     assert.equal(r.risk.pefindo.grade, 'idAA');
     assert.equal(r.decision.decision, 'REVIEW');
     assert.equal(r.nominal.recommended_nominal, 380_000_000);
     assert.equal(r.risk.pricing.recommended_rate, 0.1371);
});

test('Bu Sari: kartu hasil sederhana', () => {
     const { result, atSuggested } = analyzeWithSuggestion(demoBuSari());
     const v = toPlain(result, atSuggested);
     assert.equal(v.status.label, 'Perlu ditinjau');
     assert.equal(v.status.tone, 'kuning');
     assert.equal(v.grade.grade, 'idAA');
     assert.equal(v.grade.label, 'Sangat baik');
     assert.equal(v.grade.disclaimer, GRADE_DISCLAIMER);
     assert.match(v.reason, /63% uang usaha \(batas aman 60%\)/);
     assert.equal(v.amount.suggested, 380_000_000);
     assert.equal(v.amount.suggestedStatus.label, 'Layak dibiayai');
     assert.equal(rupiah(v.installment.monthly), 'Rp 13,7 jt');
     assert.equal(rupiah(v.amount.suggestedInstallment.monthly), 'Rp 13 jt');
     assert.equal(v.stress.passed, 3);
     assert.equal(v.stress.total, 8);
     assert.equal(v.stress.caution, 'Jika omzet turun 20%, usaha akan kesulitan membayar cicilan.');
     assert.deepEqual(v.pillars.map((p) => p.stars), [5, 5, 4, 4, 4, 4]);
     assert.ok(v.fixes.some((f) => f.key === 'amount' && f.text.includes('Rp 380 jt')));
});

test('hasil tetap sama: penerjemah tidak mengubah atau menghitung ulang hasil mesin', () => {
     const { result, atSuggested } = analyzeWithSuggestion(demoBuSari());
     const before = JSON.stringify(result);
     const v = toPlain(result, atSuggested);
     plainMetrics(result);
     assert.equal(JSON.stringify(result), before);
     assert.deepEqual(v.source, {
          decision: result.decision.decision,
          finalScore: result.finalScore,
          grade: result.risk.pefindo.grade,
          recommended_nominal: result.nominal.recommended_nominal,
          recommended_rate: result.risk.pricing.recommended_rate
     });
});

test('semua peringkat PEFINDO punya label awam sesuai PRD', () => {
     const expected = {
          idAAA: 'Sangat baik', 'idAA+': 'Sangat baik', idAA: 'Sangat baik', 'idAA-': 'Sangat baik',
          'idA+': 'Baik', idA: 'Baik', 'idA-': 'Baik',
          'idBBB+': 'Cukup', idBBB: 'Cukup', 'idBBB-': 'Cukup',
          'idBB+': 'Kurang', idBB: 'Kurang', 'idBB-': 'Kurang',
          'idB+': 'Berisiko tinggi', idB: 'Berisiko tinggi', 'idB-': 'Berisiko tinggi',
          idCCC: 'Berisiko tinggi', idD: 'Berisiko tinggi'
     };
     PEFINDO_SCALE.forEach((g, index) => {
          assert.equal(gradeInfo({ grade: g.grade, index }).label, expected[g.grade], g.grade);
          assert.equal(gradeInfo({ grade: g.grade }).label, expected[g.grade], `${g.grade} tanpa index`);
     });
     assert.equal(gradeInfo(null), null);
});

test('bintang per pilar: 90/75/60/45', () => {
     assert.deepEqual([95, 90, 89.9, 75, 74, 60, 59, 45, 44, 0].map(starsFor), [5, 5, 4, 4, 3, 3, 2, 2, 1, 1]);
     assert.equal(starsFor(null), 0);
});

test('aturan kebijakan diterjemahkan ke kalimat', () => {
     assert.equal(plainRule({ key: 'ds_ratio_max', value: 0.631, limit: 0.6 }), 'cicilan akan memakai 63% uang usaha (batas aman 60%)');
     assert.equal(plainRule({ key: 'dscr_min', value: 0.9, limit: 1.15 }), 'uang masuk usaha baru 0,9 kali cicilan, padahal minimal 1,15 kali');
     assert.equal(plainRule({ key: 'arrears_days_max', value: 120, limit: 90 }), 'ada tunggakan 120 hari (batas 90 hari)');
     assert.equal(plainRule({ key: 'altman_z_distress', value: 1.2, limit: 1.81 }), 'tanda-tanda risiko bangkrut tergolong tinggi');
});

test('tunggakan > 90 hari: merah, alasan dan perbaikan jelas', () => {
     const b = demoBuSari();
     b.keuangan.arrears_days = 120;
     const { result, atSuggested } = analyzeWithSuggestion(b);
     const v = toPlain(result, atSuggested);
     assert.equal(result.decision.decision, 'TIDAK_LAYAK');
     assert.equal(v.status.tone, 'merah');
     assert.match(v.reason, /^Belum bisa dibiayai karena .*tunggakan 120 hari/);
     assert.ok(v.fixes.some((f) => f.key === 'arrears'));
});

test('tanpa jaminan: tidak mengklaim jumlah aman Rp 0', () => {
     const b = demoBuSari();
     b.agunan = { jenis: null, nilai_agunan: 0, personal_guarantee: false };
     const v = toPlain(...Object.values(analyzeWithSuggestion(b)));
     assert.match(v.amount.sentence, /belum ada jaminan/);
     assert.ok(v.fixes.some((f) => f.key === 'collateral'));
});

test('uji kondisi sulit: semua tahan → tanpa peringatan', () => {
     const v = stressView({ scenarios: [{ id: 'S1', label: 'x', survives: true }, { id: 'S7', label: 'y', survives: true }] });
     assert.equal(v.caution, null);
     assert.equal(v.summary, 'Usaha tetap sanggup membayar di 2 dari 2 kondisi sulit yang diuji.');
     assert.equal(stressView(null), null);
});

test('rupiah ringkas', () => {
     assert.equal(rupiah(380_000_000), 'Rp 380 jt');
     assert.equal(rupiah(13_671_051), 'Rp 13,7 jt');
     assert.equal(rupiah(525_809), 'Rp 526 rb');
     assert.equal(rupiah(1_250_000_000), 'Rp 1,25 M');
     assert.equal(rupiah(null), '—');
});

test('parseAmount membaca cara orang menulis rupiah', () => {
     assert.equal(parseAmount('400.000.000'), 400_000_000);
     assert.equal(parseAmount('Rp 400 jt'), 400_000_000);
     assert.equal(parseAmount('1,2 M'), 1_200_000_000);
     assert.equal(parseAmount('7,5jt'), 7_500_000);
     assert.equal(parseAmount('(18 jt)'), -18_000_000);
     assert.equal(parseAmount('-5.000'), -5_000);
     assert.equal(parseAmount('abc'), null);
     assert.equal(parseAmount(''), null);
});

test('validasi langkah formulir', () => {
     const b = demoBuSari();
     for (let i = 0; i < 5; i += 1) assert.deepEqual(validateStep(i, b), [], `langkah ${i}`);
     b.nama = '';
     assert.equal(validateStep(0, b).length, 1);
     b.keuangan.ekuitas = null;
     assert.match(validateStep(2, b)[0], /modal sendiri/);
     b.agunan.nilai_agunan = 0;
     assert.equal(validateStep(3, b).length, 1);
});

test('skala wawancara 1–5 ↔ nilai mesin 0–1', () => {
     assert.deepEqual([1, 2, 3, 4, 5].map(interviewToScore), [0.2, 0.4, 0.6, 0.8, 1]);
     assert.deepEqual([0.2, 0.4, 0.6, 0.8, 1].map(scoreToInterview), [1, 2, 3, 4, 5]);
     const fields = INTERVIEW_QUESTIONS.flatMap((q) => q.fields);
     assert.equal(new Set(fields).size, fields.length, 'tiap parameter hanya diisi satu pertanyaan');
});
