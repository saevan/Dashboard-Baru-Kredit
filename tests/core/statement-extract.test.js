import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractStatement, parseAmount, normalizeLabel, detectUnit } from '../../src/core/statement-extract.js';
import { readPdfText } from '../../src/core/pdf-text.js';
import { inspectAttachment } from '../../src/core/attachments.js';
import { financialImportPlan } from '../../src/core/financial-import.js';
import { automaticAudit } from '../../src/core/audit-automation.js';

const fixture = (name) => new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
const enc = new TextEncoder();
const LATEST = { penjualan: 2450000000, laba_bersih: 200000000, ebit: 330000000, total_aset: 1600000000, aset_lancar: 735000000,
     total_liabilitas: 650000000, liabilitas_jangka_pendek: 350000000, ekuitas: 950000000, arus_kas_operasional: 260000000 };

async function deflate(bytes) {
     const out = await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer();
     return new Uint8Array(out);
}

/** PDF minimal: font Type0 Identity-H dengan ToUnicode (seperti ekspor Word/Chrome), content FlateDecode. */
async function type0Pdf(lines) {
     const chars = [...new Set(lines.join(''))];
     const code = (ch) => (chars.indexOf(ch) + 1).toString(16).padStart(4, '0');
     const content = lines.map((line, i) => `BT /F1 10 Tf 1 0 0 1 40 ${780 - i * 16} Tm <${[...line.split('|')[0]].map(code).join('')}> Tj ET` +
          line.split('|').slice(1).map((v, k) => ` BT /F1 10 Tf 1 0 0 1 ${330 + k * 110} ${780 - i * 16} Tm [<${[...v].map(code).join('')}>] TJ ET`).join('')).join('\n');
     const cmap = `begincmap\n${chars.length} beginbfchar\n${chars.map((ch) => `<${code(ch)}> <${ch.charCodeAt(0).toString(16).padStart(4, '0')}>`).join('\n')}\nendbfchar\nendcmap`;
     const streams = { 5: await deflate(enc.encode(content)), 6: enc.encode(cmap) };
     const objs = {
          1: '<< /Type /Catalog /Pages 2 0 R >>', 2: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
          3: '<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
          4: '<< /Type /Font /Subtype /Type0 /BaseFont /Arial /Encoding /Identity-H /ToUnicode 6 0 R >>'
     };
     const parts = [enc.encode('%PDF-1.7\n')];
     for (let n = 1; n <= 6; n++) {
          if (streams[n]) parts.push(enc.encode(`${n} 0 obj\n<< /Length ${streams[n].length}${n === 5 ? ' /Filter /FlateDecode' : ''} >>\nstream\n`), streams[n], enc.encode('\nendstream\nendobj\n'));
          else parts.push(enc.encode(`${n} 0 obj\n${objs[n]}\nendobj\n`));
     }
     parts.push(enc.encode('trailer\n<< /Root 1 0 R >>\n%%EOF'));
     return new Uint8Array(await new Blob(parts).arrayBuffer());
}

test('amount parser reads Indonesian/English formats, brackets, dashes and Rp', () => {
     for (const [raw, value] of [['1.250.000.000', 1250000000], ['1.250.000,50', 1250000.5], ['1,250,000', 1250000], ['(25.000)', -25000],
          ['-25.000', -25000], ['Rp5.000', 5000], ['-', 0], ['12,5', 12.5], [42, 42]]) assert.equal(parseAmount(raw), value, String(raw));
     for (const raw of ['abc', '1.2.3', '', 'Catatan']) assert.equal(parseAmount(raw), null, raw);
     assert.equal(normalizeLabel('4. Jumlah Aset Lancar (Rp)'), 'jumlah aset lancar');
     assert.equal(detectUnit('Laporan (dalam ribuan Rupiah)').factor, 1000);
     assert.equal(detectUnit('Per 31 Desember 2025 (dalam Rupiah)').factor, 1);
});

test('free-form rows: exact labels, note column skipped, totals preferred, expenses positive', () => {
     const { candidates } = extractStatement([
          ['Keterangan', 'Catatan', '2025', '2024'],
          ['Aset lancar'], ['Kas', '4', 100, 90], ['Jumlah aset lancar', null, 500, 400],
          ['Jumlah aset', null, 900, 800], ['Jumlah liabilitas', null, 300, 350],
          ['Jumlah ekuitas', null, 600, 450], ['Jumlah liabilitas dan ekuitas', null, 900, 800],
          ['Penjualan', '10', 2000, 1500], ['Beban pokok penjualan', '11', '(1.200)', '(900)']
     ]);
     assert.deepEqual(candidates.map((c) => c.period), [2025, 2024]);
     assert.deepEqual(candidates[0].keuangan, { kas: 100, aset_lancar: 500, total_aset: 900, total_liabilitas: 300, ekuitas: 600, penjualan: 2000, hpp: 1200 });
     assert.equal(candidates[1].keuangan.ekuitas, 450, '"Jumlah liabilitas dan ekuitas" is not equity');
     assert.equal(extractStatement([['Kas', 100]]).candidates.length, 0, 'a single matched line is not a statement');
});

test('text PDF exported by a browser fills all nine fields and picks the latest period automatically', async () => {
     const pdf = await readPdfText(fixture('laporan-keuangan-cv-fiktif.pdf'));
     assert.ok(pdf.lines.includes('Keterangan Catatan 2025 2024'));
     const doc = { ...await inspectAttachment(fixture('laporan-keuangan-cv-fiktif.pdf'), 'laporan.pdf', 'laporan_keuangan'), id: 'doc', source_key: 'laporan_keuangan' };
     assert.equal(doc.extraction.status, 'ready');
     assert.deepEqual(doc.extraction.candidates.map((c) => c.period), [2025, 2024]);
     const plan = financialImportPlan({ keuangan: {} }, doc);
     assert.equal(plan.status, 'ready');
     assert.match(plan.period, /2025/);
     for (const [key, value] of Object.entries(LATEST)) assert.equal(plan.borrower.keuangan[key], value, key);
     assert.equal(plan.borrower.keuangan.hpp, 1600000000);
     assert.equal(plan.borrower.financial_import.candidate_index, 0);
     assert.equal(automaticAudit(plan.borrower, [doc]).matched >= 9, true);
     assert.equal(financialImportPlan({}, doc, { index: 1, overwrite: true }).borrower.keuangan.penjualan, 2100000000);
});

test('free-form Excel without the IDX template is read from labels', async () => {
     const doc = { ...await inspectAttachment(fixture('laporan-keuangan-cv-fiktif.xlsx'), 'laporan.xlsx', 'laporan_keuangan'), id: 'x', source_key: 'laporan_keuangan' };
     assert.equal(doc.extraction.status, 'ready');
     const plan = financialImportPlan({}, doc);
     assert.equal(plan.status, 'ready');
     for (const [key, value] of Object.entries(LATEST)) assert.equal(plan.borrower.keuangan[key], value, key);
});

test('Type0/ToUnicode PDF and free-form CSV in thousands are read; unit conversion asks for review', async () => {
     const pdf = await type0Pdf(['Uraian|2025', 'Penjualan|850.000.000', 'Laba bersih|(15.000.000)', 'Jumlah aset|1.200.000.000', 'Jumlah ekuitas|700.000.000']);
     const fromPdf = await inspectAttachment(pdf, 'neraca.pdf', 'laporan_keuangan');
     assert.deepEqual(fromPdf.extraction.candidates[0].keuangan, { penjualan: 850000000, laba_bersih: -15000000, total_aset: 1200000000, ekuitas: 700000000 });
     const csv = 'PT Contoh\nLaporan keuangan (dalam ribuan Rupiah)\nPos;2025\nPenjualan;"2.450.000"\nJumlah aset;1.600.000\nJumlah ekuitas;950.000\n';
     const doc = { ...await inspectAttachment(enc.encode(csv), 'ekspor.csv', 'laporan_keuangan'), id: 'c', source_key: 'laporan_keuangan' };
     assert.equal(doc.extraction.candidates[0].keuangan.penjualan, 2450000000);
     assert.match(doc.extraction.candidates[0].warnings[0], /ribuan/);
     assert.equal(financialImportPlan({}, doc).status, 'review', 'converted units are never applied silently');
});

test('scanned PDFs, photos and ambiguous periods stay manual or reviewed', async () => {
     const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0]);
     const photo = await inspectAttachment(png, 'foto.png', 'laporan_keuangan');
     assert.equal(photo.extraction.status, 'manual');
     assert.match(photo.extraction.message, /Foto/);
     const scan = await inspectAttachment(enc.encode('%PDF-1.4\n1 0 obj\n<< /Type /Page >>\nendobj\n%%EOF'), 'scan.pdf', 'laporan_keuangan');
     assert.equal(scan.extraction.status, 'manual');
     assert.match(scan.extraction.message, /scan/);
     const base = { has_file: true, source_key: 'laporan_keuangan', id: 'd', sha256: 'x' };
     const c = (period) => ({ period, label: String(period), keuangan: { penjualan: 1, total_aset: 2 }, warnings: [] });
     assert.equal(financialImportPlan({}, { ...base, extraction: { candidates: [c(2024), c(2024)] } }).status, 'review');
     assert.equal(financialImportPlan({}, { ...base, extraction: { candidates: [c(null), c(null)] } }).status, 'review');
     assert.equal(financialImportPlan({}, { ...base, extraction: { candidates: [c(2023), c(2025)] } }).borrower.financial_import.candidate_index, 1);
});

test('integrated 2024–2025 CSV exports fill the form with the latest year, whatever their layout', async () => {
     const want = { penjualan: 1200000000, laba_bersih: 150000000, total_aset: 500000000, ekuitas: 400000000, arus_kas_operasional: 300000000 };
     const layouts = {
          section: 'Laporan,Pos,2024,2025\nLaba Rugi,Penjualan,1.000.000.000,1.200.000.000\nLaba Rugi,Laba bersih,120.000.000,150.000.000\nNeraca,Total aset,450.000.000,500.000.000\nNeraca,Ekuitas,340.000.000,400.000.000\nArus Kas,Arus kas operasional,250.000.000,300.000.000\n',
          wide: 'tahun;penjualan;laba_bersih;total_aset;ekuitas;arus_kas_operasional\n2024;1000000000;120000000;450000000;340000000;250000000\n2025;1200000000;150000000;500000000;400000000;300000000\n',
          keys: 'field,2024,2025\npenjualan,1000000000,1200000000\nlaba_bersih,120000000,150000000\ntotal_aset,450000000,500000000\nekuitas,340000000,400000000\narus_kas_operasional,250000000,300000000\n',
          dottedTemplate: 'field,value\npenjualan,1.200.000.000\nlaba_bersih,150.000.000\ntotal_aset,500.000.000\nekuitas,400.000.000\narus_kas_operasional,300.000.000\n',
          accountCodes: 'Kode,Akun,Tahun 2024,Tahun 2025\n4100,Pendapatan usaha,"1,000,000,000","1,200,000,000"\n3000,Laba bersih tahun berjalan,"120,000,000","150,000,000"\n1000,Jumlah aset,"450,000,000","500,000,000"\n3900,Jumlah ekuitas,"340,000,000","400,000,000"\n5000,Arus kas bersih dari aktivitas operasi,"250,000,000","300,000,000"\n'
     };
     for (const [name, csv] of Object.entries(layouts)) {
          const doc = { ...await inspectAttachment(enc.encode(csv), `${name}.csv`, 'laporan_keuangan'), id: name, source_key: 'laporan_keuangan' };
          const plan = financialImportPlan({}, doc);
          assert.equal(plan.status, 'ready', name);
          assert.deepEqual(Object.fromEntries(Object.keys(want).map((k) => [k, plan.borrower.keuangan[k]])), want, name);
     }
});

test('comparative tables preserve blank and small figures in their original year columns', () => {
     for (const value of ['', 0, 50]) {
          const {candidates} = extractStatement([
               ['Pos','Catatan','2025','2024'], ['Penjualan','4.1',value,10000],
               ['Total aset','',20000,19000], ['Ekuitas','',15000,14000],
          ]);
          assert.equal(candidates[0].keuangan.penjualan, value === '' ? undefined : value);
          assert.equal(candidates[1].keuangan.penjualan, 10000);
     }
});

test('each statement section follows its own year order and note columns', () => {
     const {candidates} = extractStatement([
          ['Pos','2025','2024'], ['Penjualan',10000,9000], ['Laba bersih',500,400],
          ['Pos','Catatan','2024','2025'], ['Total aset','5',19000,20000], ['Ekuitas','6',14000,15000],
     ]);
     assert.equal(candidates.find(c=>c.period===2025).keuangan.total_aset,20000);
     assert.equal(candidates.find(c=>c.period===2024).keuangan.ekuitas,14000);
});

test('CSV quoted newlines do not break columns and malformed templates are not rescued as valid reports', async () => {
     const csv='Keterangan;2025;2024\n"Penjualan\nbersih";10000;9000\nTotal aset;20000;19000\n';
     const doc = await inspectAttachment(enc.encode(csv),'laporan.csv','laporan_keuangan');
     assert.equal(doc.extraction.candidates[0].keuangan.penjualan,10000);
     for(const broken of [
          'field,value\npenjualan,10000\ntotal_aset,20000\npenjualan,100',
          'field,value\npenjualan,10,000\ntotal_aset,20000',
          'Pos;2025\n"Penjualan;10000\nTotal aset;20000',
     ]) assert.equal((await inspectAttachment(enc.encode(broken),'laporan.csv','laporan_keuangan')).extraction.status,'unrecognized');
});

test('monthly integrated CSV becomes one choice per year instead of one per row', async () => {
     const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
     const table = (label, years, count = 12) => 'bulan,penjualan,laba_bersih,total_aset,ekuitas\n' + years.flatMap((y) => months.slice(0, count).map((m, i) =>
          `${label(y, i + 1, m)},${y === 2025 ? 100000000 : 80000000},10000000,${(400 + i) * 1000000},${(300 + i) * 1000000}`)).join('\n') + '\n';
     const read = async (csv) => ({ ...await inspectAttachment(enc.encode(csv), 'bulanan.csv', 'laporan_keuangan'), id: 'm', source_key: 'laporan_keuangan' });
     for (const label of [(y, n, m) => `${m} ${y}`, (y, n) => `${y}-${String(n).padStart(2, '0')}`, (y, n) => `${String(n).padStart(2, '0')}/${y}`]) {
          const doc = await read(table(label, [2024, 2025]));
          assert.deepEqual(doc.extraction.candidates.map((c) => c.label), ['CSV · periode 2025 (12 bulan)', 'CSV · periode 2024 (12 bulan)']);
          const plan = financialImportPlan({}, doc);
          assert.equal(plan.status, 'ready');
          assert.equal(plan.borrower.keuangan.penjualan, 1200000000, 'flows are summed over the year');
          assert.equal(plan.borrower.keuangan.total_aset, 411000000, 'balances use the last month');
     }
     const partial = await read(table((y, n, m) => `${m} ${y}`, [2025], 6));
     assert.match(partial.extraction.candidates[0].warnings.join(' '), /hanya 6 bulan/);
     assert.equal(financialImportPlan({}, partial).status, 'review');
     const long = 'tahun,laporan,pos,nilai\n' + [[2024, 'Penjualan', 1000], [2025, 'Penjualan', 1200], [2024, 'Total aset', 450], [2025, 'Total aset', 500]].map(([y, p, v]) => `${y},Laporan,${p},${v}`).join('\n');
     const plan = financialImportPlan({}, await read(long));
     assert.deepEqual([plan.period, plan.borrower.keuangan.penjualan], ['CSV · periode 2025', 1200]);
     const keyLabel = await read('field,label,2024,2025\npenjualan,Penjualan,1000,1200\ntotal_aset,Total aset,450,500\n');
     assert.equal(keyLabel.extraction.candidates.length, 2, 'key + label columns are not a wide header');
});

test('OCR text: digit confusions are repaired, note-column noise ignored, results always reviewed', async () => {
     const { normalizeOcrLine, ocrCandidates, OCR_WARNING } = await import('../../src/core/ocr-text.js');
     assert.equal(normalizeOcrLine('Kas 1.25O.OOO (1.2l0. 000) Ilham 2O25 SBI'), 'Kas 1.250.000 (1.210.000) Ilham 2025 SBI');
     const text = 'CV CONTOH\nPer 31 Desember 2025 dan 2024 (dalam Rupiah)\nKeterangan Catatan 2025 2024\n' +
          'Penjualan bersih 10 2.45O.000.000 2.100.000.000\nBeban pokok penjualan di. (1.600.000.000) (1.390.000.000)\n' +
          'Laba bersih tahun berjalan 200.000.000 140.000.000\nJUMLAH ASET 1.600.000.000 1.510.000.000\nJumlah ekuitas 950.000.000 800.000.000\n';
     const candidates = ocrCandidates(text);
     assert.deepEqual(candidates.map((c) => c.period), [2025, 2024]);
     assert.deepEqual(candidates[0].keuangan, { penjualan: 2450000000, hpp: 1600000000, laba_bersih: 200000000, total_aset: 1600000000, ekuitas: 950000000 });
     assert.equal(candidates[0].warnings[0], OCR_WARNING);
     const doc = { has_file: true, source_key: 'laporan_keuangan', id: 'o', sha256: 'x', extraction: { candidates } };
     assert.equal(financialImportPlan({}, doc).status, 'review', 'OCR figures are never applied silently');
     assert.equal(financialImportPlan({}, doc, { index: 0, overwrite: true }).borrower.keuangan.penjualan, 2450000000);
});

test('scanned PDF pages yield their JPEG image for OCR', async () => {
     const { readPdfImages } = await import('../../src/core/pdf-text.js');
     const jpeg = Uint8Array.from([255, 216, 255, 224, ...new Array(64).fill(7), 255, 217]);
     const parts = [enc.encode('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n' +
          '3 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n' +
          `4 0 obj\n<< /Type /XObject /Subtype /Image /Width 1200 /Height 1600 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`),
          jpeg, enc.encode('\nendstream\nendobj\n5 0 obj\n<< /Length 30 >>\nstream\nq 595 0 0 842 0 0 cm /Im0 Do Q\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF')];
     const pdf = new Uint8Array(await new Blob(parts).arrayBuffer());
     const { images, pages } = await readPdfImages(pdf);
     assert.equal(pages, 1);
     assert.deepEqual([...images[0].bytes], [...jpeg]);
     assert.equal((await readPdfText(pdf)).lines.length, 0, 'no text layer → OCR path');
     const meta = await inspectAttachment(pdf, 'scan.pdf', 'laporan_keuangan');
     assert.equal(meta.extraction.status, 'manual');
     assert.match(meta.extraction.message, /OCR/);
});
