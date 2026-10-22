/**
 * tests/recommendation.test.js — Rekomendasi pencairan (bahasa awam).
 *
 * Masukan stakeholder: "harus ada rekomendasi berapa kasih uangnya".
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recommendAmount, GATE_LABEL } from '../../src/core/recommendation.js';
import { classifyBorrower } from '../../src/core/segment.js';
import { runFullAnalysis, emptyBorrower } from '../../src/core/engine.js';

const nominal = {
     recommended_nominal: 500_000_000,
     range_narrow: [450_000_000, 550_000_000],
     binding_label: 'Kapasitas DSCR',
     dscr_at_recommended: 1.3
};
const segment = classifyBorrower({ plafon_diajukan: 30_000_000 });

test('recommendation: LAYAK → cairkan penuh', () => {
     const rec = recommendAmount({
          nominal,
          decision: { decision: 'LAYAK' },
          segment,
          plafonDiajukan: 500_000_000
     });
     assert.equal(rec.gate, 'disburse');
     assert.equal(rec.approved, true);
     assert.equal(rec.recommended_amount, 500_000_000);
     assert.deepEqual(rec.range_narrow, [450_000_000, 550_000_000]);
     assert.match(rec.headline, /Disarankan mencairkan/);
});

test('recommendation: LAYAK_BERSYARAT → cairkan dengan syarat', () => {
     const rec = recommendAmount({
          nominal,
          decision: { decision: 'LAYAK_BERSYARAT', conditions: ['Sertakan agunan tambahan', 'Covenant DSCR ≥ 1,2x'] },
          segment,
          plafonDiajukan: 500_000_000
     });
     assert.equal(rec.gate, 'disburse_with_conditions');
     assert.equal(rec.approved, true);
     assert.equal(rec.conditions.length, 2);
     assert.match(rec.gate_label, /Syarat/);
});

test('recommendation: TIDAK_LAYAK → tolak (amount 0)', () => {
     const rec = recommendAmount({ nominal, decision: { decision: 'TIDAK_LAYAK' }, segment });
     assert.equal(rec.gate, 'reject');
     assert.equal(rec.approved, false);
     assert.equal(rec.recommended_amount, 0);
     assert.match(rec.headline, /Tidak disarankan/);
});

test('recommendation: REVIEW → perlu review manual', () => {
     const rec = recommendAmount({ nominal, decision: { decision: 'REVIEW' }, segment });
     assert.equal(rec.gate, 'review');
     assert.equal(rec.approved, false);
});

test('recommendation: neraca tidak seimbang menahan pencairan walau LAYAK', () => {
     const rec = recommendAmount({
          nominal,
          decision: { decision: 'LAYAK' },
          segment,
          integrity: { status: 'invalid', summary: 'Neraca TIDAK SEIMBANG' }
     });
     assert.equal(rec.gate, 'hold');
     assert.equal(rec.integrity_warning, true);
     assert.equal(rec.recommended_amount, 0);
     assert.ok(rec.rationale.some((t) => /Integritas laporan/.test(t)));
});

test('recommendation: TIDAK_LAYAK menang atas integritas invalid', () => {
     const rec = recommendAmount({
          nominal,
          decision: { decision: 'TIDAK_LAYAK' },
          segment,
          integrity: { status: 'invalid', summary: 'x' }
     });
     assert.equal(rec.gate, 'reject');
});

test('recommendation: tanpa keputusan → unknown', () => {
     const rec = recommendAmount({ nominal, decision: null, segment });
     assert.equal(rec.gate, 'unknown');
     assert.equal(GATE_LABEL.unknown, 'Belum Tersedia');
});

test('recommendation: engine melampirkan rekomendasi pencairan', () => {
     const b = emptyBorrower();
     b.plafon_diajukan = 30_000_000;
     b.tenor_bulan = 12;
     Object.assign(b.keuangan, {
          penjualan: 600_000_000,
          arus_kas_operasional: 120_000_000,
          total_aset: 500_000_000,
          total_liabilitas: 200_000_000,
          ekuitas: 300_000_000,
          ebit: 100_000_000
     });
     const r = runFullAnalysis(b);
     assert.ok(r.amount_recommendation);
     assert.equal(r.amount_recommendation.segment_key, r.segment.key);
     assert.equal(r.amount_recommendation.plafon_diajukan, 30_000_000);
     assert.ok(['disburse', 'disburse_with_conditions', 'hold', 'review', 'reject', 'unknown'].includes(r.amount_recommendation.gate));
});
