/**
 * tests/portfolio.test.js — Pipeline pengajuan & portofolio (eksposur, NPL,
 * provisi, konsentrasi, migrasi) berbasis kolektibilitas OJK 5 tingkat.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
     normalizeCollectibility,
     collectibilityFromDays,
     classifyFacility,
     buildPipeline,
     buildPortfolio
} from '../../src/core/portfolio.js';
import { resolveConfig } from '../../src/core/config.js';

test('portfolio: collectibilityFromDays memetakan hari tunggakan ke 5 tingkat POJK 40/2019', () => {
     assert.equal(collectibilityFromDays(0), 'lancar');
     assert.equal(collectibilityFromDays(1), 'dpk');
     assert.equal(collectibilityFromDays(90), 'dpk');
     assert.equal(collectibilityFromDays(91), 'kurang_lancar');
     assert.equal(collectibilityFromDays(120), 'kurang_lancar');
     assert.equal(collectibilityFromDays(121), 'diragukan');
     assert.equal(collectibilityFromDays(180), 'diragukan');
     assert.equal(collectibilityFromDays(181), 'macet');
     assert.equal(collectibilityFromDays(400), 'macet');
});

test('portfolio: normalizeCollectibility menerima key maupun label manusia', () => {
     assert.equal(normalizeCollectibility('Macet'), 'macet');
     assert.equal(normalizeCollectibility('Dalam Perhatian Khusus'), 'dpk');
     assert.equal(normalizeCollectibility('KURANG_LANCAR'), 'kurang_lancar');
     assert.equal(normalizeCollectibility('lancar'), 'lancar');
     assert.equal(normalizeCollectibility(''), null);
     assert.equal(normalizeCollectibility('entah-apa'), null);
});

test('portfolio: classifyFacility menghitung eksposur, keterlambatan, & EL proporsional', () => {
     const cfg = resolveConfig();
     const row = {
          borrower: {
               id: 'X',
               nama: 'PT X',
               sektor: 'IDX-ENERGY',
               plafon_diajukan: 1_000_000_000,
               facility_status: 'aktif',
               outstanding: 800_000_000
          },
          analysis: {
               decision: { decision: 'LAYAK' },
               finalScore: 70,
               borrower: { sektor_label: 'Energy' },
               credit: {
                    loss: { el_amount: 12_500_000, ul_amount: 25_000_000 },
                    pd: { pd_12m: 0.02 },
                    lgd: { lgd: 0.5 }
               }
          },
          monitoring: [{ ews_level: 'WARNING', params: { p11: 45 } }]
     };

     const f = classifyFacility(row, cfg);
     assert.equal(f.status, 'aktif');
     assert.equal(f.outstanding, 800_000_000);
     assert.equal(f.days_late, 45);
     assert.equal(f.collectibility, 'dpk', 'tunggakan 45 hari masih DPK (performing) menurut POJK 40');
     assert.equal(f.collectibility_label, 'Dalam Perhatian Khusus');
     assert.equal(f.ews_level, 'WARNING');
     assert.equal(f.el_amount, Math.round(12_500_000 * (800_000_000 / 1_000_000_000)));
     assert.equal(f.pd_12m, 0.02);
     assert.equal(f.lgd, 0.5);
});

test('portfolio: fasilitas ditolak / belum cair punya eksposur 0', () => {
     const cfg = resolveConfig();
     const ditolak = classifyFacility(
          {
               borrower: { id: 'Y', nama: 'PT Y', plafon_diajukan: 500_000_000, facility_status: 'ditolak' },
               analysis: null,
               monitoring: []
          },
          cfg
     );
     assert.equal(ditolak.status, 'ditolak');
     assert.equal(ditolak.outstanding, 0);
     assert.equal(ditolak.collectibility, 'lancar');
     assert.equal(ditolak.ews_level, 'NORMAL');

     const pipeline = classifyFacility(
          {
               borrower: { id: 'Z', nama: 'PT Z', plafon_diajukan: 100_000_000 },
               analysis: { decision: { decision: 'LAYAK_BERSYARAT' } },
               monitoring: []
          },
          cfg
     );
     assert.equal(pipeline.status, 'pipeline');
     assert.equal(pipeline.outstanding, 0);
});

test('portfolio: buildPipeline memisahkan hasil model dari keputusan eksplisit', () => {
     const rows = [
          { id: 'A', nama: 'PT A', plafon_diajukan: 1_000_000_000, analysis: { decision: { decision: 'LAYAK' } } },
          {
               id: 'B',
               nama: 'PT B',
               plafon_diajukan: 500_000_000,
               analysis: { decision: { decision: 'LAYAK_BERSYARAT' } }
          },
          { id: 'C', nama: 'PT C', plafon_diajukan: 300_000_000, analysis: { decision: { decision: 'TIDAK_LAYAK' } } },
          { id: 'D', nama: 'PT D', plafon_diajukan: 200_000_000 }
     ];
     const pipe = buildPipeline(rows, resolveConfig());

     assert.equal(pipe.stages.length, 5);
     const byKey = Object.fromEntries(pipe.stages.map((s) => [s.key, s]));
     assert.equal(byKey.disetujui.count, 0);
     assert.equal(byKey.disetujui.amount, 0);
     assert.equal(byKey.review.count, 3);
     assert.equal(byKey.ditolak.count, 0);
     assert.equal(byKey.draft.count, 1);

     assert.equal(pipe.totals.count, 4);
     assert.equal(pipe.totals.amount, 2_000_000_000);
     assert.equal(pipe.totals.approved, 0);
     assert.equal(pipe.totals.rejected, 0);
     assert.equal(pipe.totals.conversion_rate, 0);
     assert.equal(pipe.totals.approval_rate_all, 0);
});

test('portfolio: buildPipeline menghormati tahap eksplisit pada borrower', () => {
     const rows = [
          { id: 'A', nama: 'PT A', plafon_diajukan: 100_000_000, stage: 'dianalisis' },
          { id: 'B', nama: 'PT B', plafon_diajukan: 200_000_000, pipeline_stage: 'disetujui' }
     ];
     const pipe = buildPipeline(rows);
     const byKey = Object.fromEntries(pipe.stages.map((s) => [s.key, s]));
     assert.equal(byKey.dianalisis.count, 1);
     assert.equal(byKey.disetujui.count, 1);
     assert.equal(pipe.totals.approved, 1);
     assert.equal(pipe.totals.approval_rate_all, 0.5);
});

test('portfolio: buildPortfolio menghitung eksposur, NPL, provisi, & konsentrasi', () => {
     const cfg = resolveConfig();
     const rows = [
          {
               borrower: {
                    id: 'A',
                    nama: 'PT A',
                    sektor: 'IDX-ENERGY',
                    plafon_diajukan: 1_000_000_000,
                    facility_status: 'aktif',
                    outstanding: 1_000_000_000
               },
               analysis: {
                    decision: { decision: 'LAYAK' },
                    borrower: { sektor_label: 'Energy' },
                    credit: { loss: { el_amount: 10_000_000, ul_amount: 20_000_000 }, pd: { pd_12m: 0.01 }, lgd: { lgd: 0.45 } }
               },
               monitoring: [{ collectibility: 'Lancar', ews_level: 'NORMAL' }]
          },
          {
               borrower: {
                    id: 'B',
                    nama: 'PT B',
                    sektor: 'IDX-TECHNOLOGY',
                    plafon_diajukan: 500_000_000,
                    facility_status: 'aktif',
                    outstanding: 300_000_000
               },
               analysis: { decision: { decision: 'LAYAK' }, borrower: { sektor_label: 'Technology' } },
               monitoring: [
                    { collectibility: 'Lancar', ews_level: 'NORMAL' },
                    { collectibility: 'Macet', ews_level: 'CRITICAL' }
               ]
          }
     ];

     const p = buildPortfolio({ rows, config: cfg });

     // Eksposur
     assert.equal(p.totals.facilities, 2);
     assert.equal(p.totals.active, 2);
     assert.equal(p.totals.borrowers, 2);
     assert.equal(p.totals.exposure, 1_300_000_000);
     assert.equal(p.by_collectibility.length, 5);

     // NPL (kurang_lancar, diragukan, macet)
     assert.equal(p.npl.gross_exposure, 300_000_000);
     assert.equal(p.npl.gross_ratio, 0.2308);
     assert.equal(p.npl.status, 'tinggi');

     // PPKA POJK 40: lancar 1% (umum) + macet 100% (tanpa agunan yang diperhitungkan)
     assert.equal(p.provision.total, Math.round(1_000_000_000 * 0.01 + 300_000_000 * 1.0));
     assert.equal(p.provision.coverage_ratio, 1.0333);
     assert.equal(p.npl.net_exposure, 0, 'provisi menutup seluruh eksposur NPL');
     assert.equal(p.npl.net_ratio, 0);

     // Expected Loss agregat dari analisis per borrower
     assert.equal(p.loss.el_total, 10_000_000);
     assert.equal(p.loss.ul_total, 20_000_000);
     assert.ok(p.loss.el_rate > 0);

     // Konsentrasi sektor (HHI dari 2 sektor 76,92% / 23,08%)
     assert.ok(Math.abs(p.concentration.hhi - 0.6449) < 0.001, `HHI ≈ 0.6449, diperoleh ${p.concentration.hhi}`);
     assert.equal(p.concentration.status, 'terkonsentrasi');
     assert.equal(p.concentration.by_sector.length, 2);
     assert.equal(p.concentration.top_n.n, 10);
     assert.equal(p.concentration.top_n.share, 1);

     // Watchlist memuat fasilitas macet
     assert.equal(p.watchlist.length, 1);
     assert.equal(p.watchlist[0].id, 'B');

     // Migrasi: B turun dari Lancar → Macet; A belum punya ≥2 periode → no_history
     assert.equal(p.migration.downgrades, 1);
     assert.equal(p.migration.upgrades, 0);
     assert.equal(p.migration.stable, 0);
     assert.equal(p.migration.no_history, 1);
     assert.equal(p.migration.comparable, 1);
     assert.equal(p.migration.net, -1);
     assert.equal(p.migration.moves.length, 1);
     assert.equal(p.migration.moves[0].direction, 'downgrade');
});

test('portfolio: buildPortfolio dengan data kosong aman & netral', () => {
     const p = buildPortfolio({ rows: [] });
     assert.equal(p.totals.facilities, 0);
     assert.equal(p.totals.active, 0);
     assert.equal(p.totals.exposure, 0);
     assert.equal(p.npl.gross_ratio, 0);
     assert.equal(p.provision.total, 0);
     assert.equal(p.provision.coverage_ratio, null);
     assert.equal(p.concentration.status, 'terdiversifikasi');
     assert.deepEqual(p.watchlist, []);
     assert.equal(p.by_collectibility.length, 5);
     assert.equal(p.migration.stable, 0);
     assert.equal(p.migration.no_history, 0);
});
