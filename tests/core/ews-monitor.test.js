/**
 * tests/ews-monitor.test.js — Golden case PRD §11.5 (ARCHITECTURE §6A).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateMonitoring } from '../../src/core/ews-monitor.js';

test('ews: P1=0.95, P4=negatif_2_periode, P11=35 → CRITICAL / DPK (POJK 40) / JANGAN LANJUT', () => {
     const res = evaluateMonitoring({
          P1_dscr: 0.95,
          P4_ocf: 'negatif_2_periode',
          P11_days_late: 35
     });

     assert.equal(res.ews_level, 'CRITICAL');
     assert.equal(res.collectibility, 'Dalam Perhatian Khusus', 'tunggakan 35 hari: DPK, belum NPL');
     assert.equal(res.recommended_action, 'RESTRUKTURISASI / PENAGIHAN');
     assert.ok(res.judgements.some((j) => j.message.includes('JANGAN LANJUT')));
     assert.ok(res.signals.some((s) => s.code === 'P1' && s.severity === 'CRITICAL'));
     assert.equal(res.escalate_to, 'Manajer Risiko');
});

test('ews: semua normal → NORMAL / Lancar / monitoring rutin', () => {
     const res = evaluateMonitoring({
          P1_dscr: 1.6,
          P2_icr: 3.0,
          P3_cr: 1.8,
          P4_ocf: 'positif',
          P5_runway_months: 8,
          P6_omzet_yoy_pct: 10,
          P8_altman_z: 3.5,
          P11_days_late: 0,
          P20_covenant: 'compliant'
     });
     assert.equal(res.ews_level, 'NORMAL');
     assert.equal(res.collectibility, 'Lancar');
     assert.equal(res.recommended_action, 'MONITORING RUTIN');
     assert.ok(res.judgements[0].message.includes('NORMAL'));
});

test('ews: kesimpulan severity diurut menurun (CRITICAL lebih dulu)', () => {
     const res = evaluateMonitoring({ P1_dscr: 0.9, P6_omzet_yoy_pct: -45 });
     assert.equal(res.judgements[0].severity, 'CRITICAL');
});

test('ews: hari telat >180 + covenant material → Macet', () => {
     const res = evaluateMonitoring({ P11_days_late: 200, P20_covenant: 'material' });
     assert.equal(res.collectibility, 'Macet');
});
