/**
 * tests/disbursement.test.js — Syarat penarikan (conditions precedent), borrowing base,
 * dan validasi identitas usaha.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
     identityErrors,
     maskId,
     legalForm,
     facilityPurpose,
     borrowingBase,
     buildConditionsPrecedent,
     conditionsStatus,
     disbursementBlocker
} from '../../src/core/disbursement.js';

const codes = (list) => list.map((c) => c.code);

test('identitas: NPWP 15/16 digit, NIB 13 digit, tanda baca diabaikan', () => {
     assert.deepEqual(identityErrors({ npwp: '01.234.567.8-901.000', nib: '1234567890123' }), { npwp: null, nib: null });
     assert.equal(identityErrors({ npwp: '3201234567890001' }).npwp, null);
     assert.match(identityErrors({ npwp: '12345' }).npwp, /15 atau 16/);
     assert.match(identityErrors({ nib: '12AB' }).nib, /13 digit/);
     assert.deepEqual(identityErrors({}), { npwp: null, nib: null });
     assert.equal(maskId('01.234.567.8-901.000'), '•••••••••••1000');
});

test('bentuk usaha & jenis kredit: isian eksplisit diutamakan, lalu nama/tujuan', () => {
     assert.equal(legalForm({ nama: 'PT Maju Jaya' }), 'pt');
     assert.equal(legalForm({ nama: 'CV Sinar' }), 'cv');
     assert.equal(legalForm({ nama: 'Toko Bu Ani' }), 'perorangan');
     assert.equal(legalForm({ nama: 'PT X', bentuk_usaha: 'cv' }), 'cv');
     assert.equal(facilityPurpose({ tujuan_kredit: 'Pembelian mesin produksi baru' }), 'investasi');
     assert.equal(facilityPurpose({ tujuan_kredit: 'modal kerja pembelian bahan baku' }), 'modal_kerja');
     assert.equal(facilityPurpose({ tujuan_kredit: '' }), 'tidak_diketahui');
     assert.equal(facilityPurpose({ tujuan_kredit: 'beli mesin', jenis_kredit: 'modal_kerja' }), 'modal_kerja');
});

test('borrowing base: piutang related-party & lewat 90 hari dikeluarkan', () => {
     const bb = borrowingBase({ piutang: 50e9, related_party_receivables: 5e9, persediaan: 20e9 });
     assert.equal(bb.piutang_eligible, 45e9);
     assert.equal(bb.availability, 45e9 * 0.75 + 20e9 * 0.5);
     const aged = borrowingBase({ piutang: 120e6, aging_piutang_hari: 120 });
     assert.equal(aged.piutang_eligible, 90e6, '30/120 piutang diperkirakan lewat 90 hari');
     assert.equal(borrowingBase({}), null);
});

test('syarat penarikan menyesuaikan bentuk usaha, agunan, jenis kredit, dan keputusan', () => {
     const pt = buildConditionsPrecedent({ borrower: { nama: 'PT A', agunan: { jenis: 'tanah_bangunan', nilai_agunan: 1e9 }, jenis_kredit: 'investasi' }, decision: 'LAYAK_BERSYARAT' });
     assert.deepEqual(codes(pt), ['PERJANJIAN_KREDIT', 'PERSETUJUAN_ORGAN', 'LEGALITAS', 'SLIK', 'PENGIKATAN_AGUNAN', 'ASURANSI_AGUNAN', 'SETORAN_MODAL', 'COVENANT', 'REKENING_OPERASIONAL']);
     assert.match(pt.find((c) => c.code === 'PERSETUJUAN_ORGAN').description, /RUPS/);
     assert.match(pt.find((c) => c.code === 'PENGIKATAN_AGUNAN').description, /Hak Tanggungan/);

     const deposito = buildConditionsPrecedent({ borrower: { nama: 'UD B', agunan: { jenis: 'deposito', nilai_agunan: 1e8 }, jenis_kredit: 'modal_kerja', keuangan: { piutang: 1e8 } } });
     assert.ok(!codes(deposito).includes('ASURANSI_AGUNAN'), 'deposito tidak perlu asuransi');
     assert.match(deposito.find((c) => c.code === 'PENGIKATAN_AGUNAN').description, /gadai/);
     assert.equal(deposito.find((c) => c.code === 'BORROWING_BASE').mandatory, true);

     const unknownPurpose = buildConditionsPrecedent({ borrower: { nama: 'Bu Ani' } });
     assert.equal(unknownPurpose.find((c) => c.code === 'BORROWING_BASE').mandatory, false);
     assert.ok(!codes(unknownPurpose).includes('PENGIKATAN_AGUNAN'));
});

test('pencairan ditahan sampai syarat wajib lengkap dan dalam borrowing base', () => {
     const borrower = { nama: 'CV C', jenis_kredit: 'modal_kerja', keuangan: { piutang: 400e6, persediaan: 200e6 }, plafon_diajukan: 500e6 };
     assert.match(disbursementBlocker({ borrower, amount: 300e6 }), /Persetujuan organ perusahaan/);
     const mandatory = buildConditionsPrecedent({ borrower }).filter((c) => c.mandatory).map((c) => c.code);
     const done = Object.fromEntries(mandatory.map((c) => [c, { done: true }]));
     const status = conditionsStatus(buildConditionsPrecedent({ borrower }), done);
     assert.equal(status.ready, true);
     assert.equal(status.done, mandatory.length);
     const ready = { ...borrower, conditions_precedent: done };
     assert.equal(disbursementBlocker({ borrower: ready, amount: 400e6 }), null, 'batas tarik 300 + 100 = 400 jt');
     assert.match(disbursementBlocker({ borrower: ready, amount: 450e6 }), /borrowing base/);
});
