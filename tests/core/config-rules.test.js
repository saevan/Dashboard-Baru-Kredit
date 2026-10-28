/**
 * tests/config-rules.test.js — Registry aturan tunggal, override per profil,
 * resolusi konfigurasi efektif, hash snapshot, dan evaluator aturan.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
     DEFAULT_CONFIG,
     HARD_RULE_DEFS,
     PROFILE_RULES,
     resolveConfig,
     evaluateRules,
     ruleSummary,
     configHash,
     deepMergeConfig
} from '../../src/core/config.js';

test('config: resolveConfig() default = baseline konservatif ukm_mapan', () => {
     const cfg = resolveConfig();
     assert.equal(cfg.hardRules.dscr_min, 1.15);
     assert.equal(cfg.hardRules.icr_min, 1.2);
     assert.equal(cfg.hardRules.dti_max, 0.35);
     assert.equal(cfg.hardRules.ltv_max, 0.75);
     assert.equal(cfg.thresholds.layak, 75);
     assert.equal(cfg.resolvedFor.profile_key, null);
     assert.equal(cfg.resolvedFor.config_version, cfg.version);
     assert.equal(cfg.profile.pdMultiplier, 1);
});

test('config: resolveConfig() membuang profiles & profileRules dari hasil', () => {
     const cfg = resolveConfig(DEFAULT_CONFIG, { profileKey: 'ukm_mapan', sectorKey: 'IDX-ENERGY' });
     assert.equal('profiles' in cfg, false);
     assert.equal('profileRules' in cfg, false);
});

test('config: profil startup mengetatkan aturan, ambang, dan covenant', () => {
     const cfg = resolveConfig(DEFAULT_CONFIG, { profileKey: 'startup' });
     assert.equal(cfg.hardRules.dscr_min, 1.25);
     assert.equal(cfg.hardRules.icr_min, 1.35);
     assert.equal(cfg.hardRules.dti_max, 0.3);
     assert.equal(cfg.hardRules.ltv_max, 0.6);
     assert.equal(cfg.thresholds.layak, 78);
     assert.equal(cfg.covenant.dscrMin, 1.25);
     assert.equal(cfg.covenant.reportingMaxHari, 10);
     assert.equal(cfg.profile.pdMultiplier, 1.35);
});

test('config: profil trade melonggarkan DSCR & LTV', () => {
     const cfg = resolveConfig(DEFAULT_CONFIG, { profileKey: 'trade' });
     assert.equal(cfg.hardRules.dscr_min, 1.1);
     assert.equal(cfg.hardRules.ltv_max, 0.85);
     assert.equal(cfg.thresholds.layak, 72);
});

test('config: profil ukm_mapan identik dengan hard rules default', () => {
     const def = resolveConfig();
     const ukm = resolveConfig(DEFAULT_CONFIG, { profileKey: 'ukm_mapan' });
     for (const key of Object.keys(def.hardRules)) {
          assert.equal(ukm.hardRules[key], def.hardRules[key], `hardRules.${key} harus sama`);
     }
});

test('config: merge mendalam — override profil tidak menghapus field default lain', () => {
     const cfg = resolveConfig(DEFAULT_CONFIG, { profileKey: 'trade' });
     assert.equal(cfg.nominal.dscrTarget, 1.25); // override profil
     assert.equal(cfg.nominal.rounding, 50000000); // default tetap utuh
     assert.equal(cfg.nominal.maxTenorBulan, 120);
     assert.equal(cfg.covenant.derMax, 4.0); // override profil
     assert.equal(cfg.covenant.agingPiutangMaxHari, 60); // default tetap utuh
     assert.equal(cfg.covenant.toleranceWarn, 0.1);
});

test('config: overlay sektor mengubah LTV & multiplier PD', () => {
     const cfg = resolveConfig(DEFAULT_CONFIG, { sectorKey: 'IDX-PROPERTY-REALESTATE' });
     assert.equal(cfg.hardRules.ltv_max, 0.7);
     assert.equal(cfg.resolvedFor.sector_pd_multiplier, 1.15);
     assert.equal(cfg.resolvedFor.sector_key, 'IDX-PROPERTY-REALESTATE');
});

test('config: altman_z_distress selalu sinkron dengan altman.z_distress', () => {
     const cfg = resolveConfig(DEFAULT_CONFIG, { profileKey: 'manufacturing' });
     assert.equal(cfg.hardRules.altman_z_distress, cfg.altman.z_distress);
});

test('config: base kustom dari Pengaturan menang, tapi override profil tetap berlaku', () => {
     const base = { hardRules: { dscr_min: 2.0 } };
     const noProfile = resolveConfig(base);
     assert.equal(noProfile.hardRules.dscr_min, 2.0);
     const withProfile = resolveConfig(base, { profileKey: 'ukm_mapan' });
     assert.equal(withProfile.hardRules.dscr_min, 1.15);
});

test('config: profileRules kustom di base ikut di-merge', () => {
     const base = { profileRules: { ukm_mapan: { hardRules: { dscr_min: 1.5 } } } };
     const cfg = resolveConfig(base, { profileKey: 'ukm_mapan' });
     assert.equal(cfg.hardRules.dscr_min, 1.5);
     assert.equal(cfg.hardRules.ltv_max, 0.75); // sisanya tetap dari profil
});

test('config: deepMergeConfig mengganti array, bukan menggabung', () => {
     const merged = deepMergeConfig({ a: [1, 2, 3], b: { x: 1 } }, { a: [9], b: { y: 2 } });
     assert.deepEqual(merged.a, [9]);
     assert.equal(merged.b.x, 1);
     assert.equal(merged.b.y, 2);
});

test('config: setiap hard rule punya nilai default angka & key unik', () => {
     const keys = HARD_RULE_DEFS.map((d) => d.key);
     assert.equal(new Set(keys).size, keys.length, 'key aturan harus unik');
     for (const key of keys) {
          assert.ok(Number.isFinite(DEFAULT_CONFIG.hardRules[key]), `default hardRules.${key} harus angka`);
     }
});

test('config: setiap profil mendefinisikan seluruh hard rule (tanpa bolong)', () => {
     // altman_z_distress selalu disinkronkan dari config.altman.z_distress
     // (bukan di-override per profil), jadi tidak wajib ada di hardRules profil.
     const keys = HARD_RULE_DEFS.map((d) => d.key).filter((k) => k !== 'altman_z_distress');
     for (const [name, profile] of Object.entries(PROFILE_RULES)) {
          const missing = keys.filter((key) => !(key in profile.hardRules));
          assert.deepEqual(missing, [], `profil ${name} kehilangan aturan`);
     }
});

test('config: evaluateRules menandai pelanggaran hard rule', () => {
     const res = evaluateRules({ metrics: { dscr: 1.0, icr: 2.0 } });
     assert.equal(res.triggered.length, 1);
     assert.equal(res.triggered[0].key, 'dscr_min');
     assert.equal(res.triggered[0].violated, true);
     assert.equal(res.passed, false);
});

test('config: evaluateRules memisahkan hard vs soft (LTV) dan menghormati personal guarantee', () => {
     const noPg = evaluateRules({ metrics: { ltv: 0.9 } });
     assert.equal(noPg.triggered.length, 0);
     assert.equal(noPg.softNotes.length, 1);
     assert.equal(noPg.softNotes[0].key, 'ltv_max');

     const withPg = evaluateRules({ metrics: { ltv: 0.9 }, options: { personal_guarantee: true } });
     assert.equal(withPg.softNotes.length, 0, '0,90x masih di bawah batas 0,95x dengan PG');

     const withPgViolating = evaluateRules({ metrics: { ltv: 0.99 }, options: { personal_guarantee: true } });
     assert.equal(withPgViolating.watched.length, 1, 'melewati batas PG tercatat sebagai watch');
});

test('config: evaluateRules menghormati skipKeys & metrik kosong', () => {
     const skipped = evaluateRules({ metrics: { dscr: 1.0 }, options: { skipKeys: ['dscr_min'] } });
     assert.equal(skipped.triggered.length, 0);

     const empty = evaluateRules({ metrics: {} });
     assert.equal(empty.evaluated.length, 0);
     assert.equal(empty.passed, true);
});

test('config: ruleSummary mencerminkan nilai efektif per profil', () => {
     const cfg = resolveConfig(DEFAULT_CONFIG, { profileKey: 'manufacturing' });
     const rules = ruleSummary(cfg);
     assert.equal(rules.length, HARD_RULE_DEFS.length);
     const dscr = rules.find((r) => r.key === 'dscr_min');
     assert.equal(dscr.value, 1.2);
     assert.equal(dscr.value, cfg.hardRules.dscr_min);
     assert.ok(dscr.label && dscr.description);
});

test('config: configHash stabil untuk konfigurasi sama & berbeda antar profil', () => {
     const a = configHash(resolveConfig(DEFAULT_CONFIG, { profileKey: 'ukm_mapan' }));
     const b = configHash(resolveConfig(DEFAULT_CONFIG, { profileKey: 'ukm_mapan' }));
     const c = configHash(resolveConfig(DEFAULT_CONFIG, { profileKey: 'startup' }));
     assert.equal(typeof a, 'string');
     assert.ok(a.length > 0);
     assert.equal(a, b);
     assert.notEqual(a, c);
});
