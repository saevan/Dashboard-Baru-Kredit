/**
 * tests/xlsx.test.js — Pembaca .xlsx tanpa dependensi (ZIP + OOXML).
 * Fixture dibangun manual (STORED & DEFLATE) agar tidak bergantung pustaka luar.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readXlsx, unzip } from '../../src/core/xlsx.js';

// ——————————————————— util fixture ZIP ———————————————————

function crc32(bytes) {
     let c = ~0;
     for (let i = 0; i < bytes.length; i++) {
          c ^= bytes[i];
          for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
     }
     return (~c) >>> 0;
}

async function deflateRaw(bytes) {
     if (typeof CompressionStream === 'undefined') return null;
     const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
     return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Bangun arsip ZIP dengan entri STORED/DEFLATE. */
function buildZip(entries) {
     const enc = new TextEncoder();
     const locals = [];
     const central = [];
     let offset = 0;
     for (const e of entries) {
          const nameBytes = enc.encode(e.name);
          const stored = e.stored || e.data;
          const crc = crc32(e.uncompressed || stored);
          const local = new Uint8Array(30 + nameBytes.length + stored.length);
          const dv = new DataView(local.buffer);
          dv.setUint32(0, 0x04034b50, true);
          dv.setUint16(4, 20, true);
          dv.setUint16(6, 0, true);
          dv.setUint16(8, e.method, true);
          dv.setUint32(14, crc, true);
          dv.setUint32(18, stored.length, true);
          dv.setUint32(22, (e.uncompressed || stored).length, true);
          dv.setUint16(26, nameBytes.length, true);
          local.set(nameBytes, 30);
          local.set(stored, 30 + nameBytes.length);
          locals.push(local);
          central.push({
               nameBytes,
               method: e.method,
               crc,
               comp: stored.length,
               uncomp: (e.uncompressed || stored).length,
               offset
          });
          offset += local.length;
     }
     const cdStart = offset;
     const cdChunks = central.map((c) => {
          const h = new Uint8Array(46 + c.nameBytes.length);
          const dv = new DataView(h.buffer);
          dv.setUint32(0, 0x02014b50, true);
          dv.setUint16(4, 20, true);
          dv.setUint16(6, 20, true);
          dv.setUint16(10, c.method, true);
          dv.setUint32(16, c.crc, true);
          dv.setUint32(20, c.comp, true);
          dv.setUint32(24, c.uncomp, true);
          dv.setUint16(28, c.nameBytes.length, true);
          dv.setUint32(42, c.offset, true);
          h.set(c.nameBytes, 46);
          return h;
     });
     const cdSize = cdChunks.reduce((a, b) => a + b.length, 0);
     const eocd = new Uint8Array(22);
     const dv = new DataView(eocd.buffer);
     dv.setUint32(0, 0x06054b50, true);
     dv.setUint16(8, entries.length, true);
     dv.setUint16(10, entries.length, true);
     dv.setUint32(12, cdSize, true);
     dv.setUint32(16, cdStart, true);
     const all = [...locals, ...cdChunks, eocd];
     const out = new Uint8Array(all.reduce((a, b) => a + b.length, 0));
     let p = 0;
     for (const a of all) { out.set(a, p); p += a.length; }
     return out;
}

// ——————————————————— konten XLSX minimal ———————————————————

const enc = new TextEncoder();

const SHARED = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="2" uniqueCount="2">
<si><t>Penjualan dan pendapatan usaha</t></si>
<si><r><t>Jumlah </t></r><r><t>aset</t></r></si>
</sst>`;

const WORKBOOK = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>
<sheet name="PROFITABILITAS" sheetId="1" r:id="rId1"/>
<sheet name="SOLVABILITAS" sheetId="2" r:id="rId2"/>
</sheets></workbook>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
</Relationships>`;

const SHEET1 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>
<row r="2"><c r="A2"><v>1000</v></c><c r="B2"><v>2000</v></c></row>
<row r="3"><c r="A3" t="inlineStr"><is><t>Halo & dunia</t></is></c><c r="B3" t="str"><v>FORMULA</v></c><c r="C3" t="b"><v>1</v></c></row>
<row r="5"><c r="A5"><v>55</v></c></row>
</sheetData></worksheet>`;

const SHEET2 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
<row r="1"><c r="A1"><v>7</v></c></row>
</sheetData></worksheet>`;

function makeWorkbookZip() {
     return buildZip([
          { name: 'xl/workbook.xml', method: 0, data: enc.encode(WORKBOOK) },
          { name: 'xl/_rels/workbook.xml.rels', method: 0, data: enc.encode(RELS) },
          { name: 'xl/sharedStrings.xml', method: 0, data: enc.encode(SHARED) },
          { name: 'xl/worksheets/sheet1.xml', method: 0, data: enc.encode(SHEET1) },
          { name: 'xl/worksheets/sheet2.xml', method: 0, data: enc.encode(SHEET2) }
     ]);
}

// ——————————————————— tes ———————————————————

test('xlsx: unzip membaca entri STORED', async () => {
     const files = await unzip(makeWorkbookZip());
     assert.equal(files.size, 5);
     assert.ok(files.has('xl/workbook.xml'));
});

test('xlsx: membaca lembar, shared string, inlineStr, formula & boolean', async () => {
     const wb = await readXlsx(makeWorkbookZip());
     assert.deepEqual(wb.sheets.map((s) => s.name), ['PROFITABILITAS', 'SOLVABILITAS']);
     const s1 = wb.sheets[0];
     assert.deepEqual(s1.rows[0], ['Penjualan dan pendapatan usaha', 'Jumlah aset']);
     assert.deepEqual(s1.rows[1], [1000, 2000]);
     assert.equal(s1.rows[2][0], 'Halo & dunia');
     assert.equal(s1.rows[2][1], 'FORMULA');
     assert.equal(s1.rows[2][2], true);
     assert.deepEqual(s1.rows[3], []); // celah baris r="5" diisi baris kosong
     assert.deepEqual(s1.rows[4], [55]);
     assert.deepEqual(wb.sheets[1].rows[0], [7]);
});

test('xlsx: filter lembar via options.sheets', async () => {
     const wb = await readXlsx(makeWorkbookZip(), { sheets: ['SOLVABILITAS'] });
     assert.equal(wb.sheets.length, 1);
     assert.equal(wb.sheets[0].name, 'SOLVABILITAS');
});

test('xlsx: menolak berkas bukan ZIP', async () => {
     const junk = new Uint8Array([1, 2, 3, 4, 5]);
     await assert.rejects(() => readXlsx(junk), /ZIP\/XLSX yang valid/);
});

test('xlsx: membaca entri DEFLATE bila CompressionStream tersedia', async (t) => {
     const raw = enc.encode(SHEET1);
     const deflated = await deflateRaw(raw);
     if (!deflated) {
          t.skip('CompressionStream tidak tersedia');
          return;
     }
     const zip = buildZip([
          { name: 'xl/workbook.xml', method: 0, data: enc.encode(WORKBOOK) },
          { name: 'xl/_rels/workbook.xml.rels', method: 0, data: enc.encode(RELS) },
          { name: 'xl/sharedStrings.xml', method: 0, data: enc.encode(SHARED) },
          { name: 'xl/worksheets/sheet1.xml', method: 8, data: deflated, uncompressed: raw },
          { name: 'xl/worksheets/sheet2.xml', method: 0, data: enc.encode(SHEET2) }
     ]);
     const wb = await readXlsx(zip);
     assert.equal(wb.sheets[0].rows[1][0], 1000);
     assert.equal(wb.sheets[0].rows[2][0], 'Halo & dunia');
});

test('xlsx: expansion limits reject both declared and misleading ZIP sizes', async () => {
     const enc = new TextEncoder();
     const small = buildZip([{ name: 'test.xml', method: 0, data: enc.encode('x') }]);
     const view = new DataView(small.buffer);
     const central = view.getUint32(small.length - 22 + 16, true);
     view.setUint32(central + 24, 30 * 1024 * 1024, true);
     await assert.rejects(unzip(small), /terlalu besar/);
     const expanded = new Uint8Array(26 * 1024 * 1024);
     const compressed = await deflateRaw(expanded);
     const zip = buildZip([{ name: 'large.xml', method: 8, stored: compressed, uncompressed: expanded }]);
     const zv = new DataView(zip.buffer);
     const zc = zv.getUint32(zip.length - 22 + 16, true);
     zv.setUint32(zc + 24, 1, true); // falsified central directory must not evade streaming limit
     await assert.rejects(unzip(zip), /terlalu besar/);
});

test('xlsx: absurd row and column indices cannot allocate unbounded arrays', async () => {
     const enc = new TextEncoder();
     for (const xml of ['<worksheet><sheetData><row r="999999999"/></sheetData></worksheet>', '<worksheet><sheetData><row r="1"><c r="ZZZZZZ1"><v>1</v></c></row></sheetData></worksheet>']) {
          const zip = buildZip([{ name: 'xl/worksheets/sheet1.xml', method: 0, data: enc.encode(xml) }]);
          await assert.rejects(readXlsx(zip), /baris|kolom/);
     }
});

test('xlsx attachment extracts financial values through ZIP reader and IDX mapper', async () => {
     const { inspectAttachment } = await import('../../src/core/attachments.js');
     const doc = await inspectAttachment(makeWorkbookZip(), 'laporan.xlsx', 'laporan_keuangan');
     assert.equal(doc.extraction.status, 'ready');
     assert.equal(doc.extraction.candidates[0].keuangan.penjualan, 1000);
     assert.equal(doc.extraction.candidates[0].keuangan.total_aset, 2000);
     assert.ok(doc.extraction.candidates[0].warnings.some(message => /Arus Kas Operasional/.test(message)));
});
