import test from 'node:test';
import assert from 'node:assert/strict';
import { debtorSize, SMALL_MAX_OMZET } from '../src/services/segment-size.js';
import { feedbackPasar, STATUS_PASAR } from '../src/services/pasar.js';
import { BORROWER_STATUS_LABEL } from '../src/core/intake-config.js';

test('segmen debitur dari omzet laporan (PP 7/2021): ≤ Rp15 M kecil, di atasnya besar', () => {
     assert.equal(debtorSize({}), null);
     assert.equal(debtorSize({ penjualan: null }), null);
     assert.deepEqual([1_800_000_000, 2_000_000_000, 2_000_000_001, SMALL_MAX_OMZET, SMALL_MAX_OMZET + 1, 50_000_000_000, 60_000_000_000].map((o) => {
          const s = debtorSize({ penjualan: o });
          return `${s.key}/${s.klas}`;
     }), ['kecil/mikro', 'kecil/mikro', 'kecil/kecil', 'kecil/kecil', 'besar/menengah', 'besar/menengah', 'besar/besar']);
});

test('bahasa pasar: semua status punya label, tanpa istilah bank', () => {
     const jargon = /lender|plafon|tenor|agunan|verifikasi|fasilitas/i;
     for (const s of Object.keys(BORROWER_STATUS_LABEL)) {
          assert.ok(STATUS_PASAR[s], s);
          const f = feedbackPasar({ status: s, decision: s === 'decided' ? 'LAYAK' : undefined });
          assert.doesNotMatch(`${STATUS_PASAR[s]} ${f.title} ${f.message}`, jargon, s);
     }
     assert.equal(feedbackPasar({ status: 'rejected' }).tone, 'danger');
     assert.equal(feedbackPasar({ status: 'need_fix', events: [{ to: 'need_fix', note: 'Lampirkan rekening koran' }] }).note, 'Lampirkan rekening koran');
     assert.equal(feedbackPasar({ status: 'accepted', facility_summary: { status: 'aktif' } }).title, 'Dana sudah dicairkan');
});
