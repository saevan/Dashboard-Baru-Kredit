/**
 * core/statement-integrity.js — Validasi integritas laporan keuangan.
 *
 * Menjawab masukan stakeholder: "kalau ada laporan keuangannya ga beres,
 * misalnya ga balance" — fitur ini menandai laporan yang tidak konsisten
 * SEBELUM rasio dipakai untuk keputusan kredit.
 *
 * Pemeriksaan (ARCHITECTURE §4.5 — validasi neraca):
 *   1. Neraca seimbang: Total Aset ≈ Total Liabilitas + Ekuitas (toleransi %).
 *   2. Aset lancar ≤ Total aset.
 *   3. Liabilitas jangka pendek ≤ Total liabilitas.
 *   4. Kas + Piutang + Persediaan ≤ Aset lancar.
 *   5. Nilai negatif yang tidak wajar (aset/penjualan negatif).
 *   6. Kelengkapan field inti.
 *
 * Pure function; tidak menyentuh DOM. Semua nominal dalam Rupiah.
 */

const num = (v) => {
     if (typeof v !== 'number' && typeof v !== 'string' || String(v).trim() === '') return null;
     const n = Number(v);
     return Number.isFinite(n) ? n : null;
};

/** Toleransi default ketidakseimbangan neraca (persen dari total aset). */
export const INTEGRITY_TOLERANCE_PCT = 1;

/** Tingkat keparahan temuan. */
export const INTEGRITY_SEVERITY = {
     CRITICAL: 'critical',
     WARNING: 'warning',
     INFO: 'info'
};

/** Label status integritas untuk UI. */
export const INTEGRITY_STATUS_LABEL = {
     ok: 'Laporan Seimbang',
     warning: 'Perlu Perhatian',
     invalid: 'Laporan Tidak Seimbang',
     insufficient: 'Data Belum Lengkap'
};

const SEVERITY_TONE = { critical: 'danger', warning: 'warning', info: 'info' };

function issue(code, severity, message, detail = {}) {
     return { code, severity, tone: SEVERITY_TONE[severity] || 'info', message, ...detail };
}

/**
 * Periksa integritas laporan keuangan.
 * @param {object} financials — blok keuangan borrower (total_aset, total_liabilitas, ekuitas, ...)
 * @param {object} [options] — { tolerancePct } persen toleransi (default 1%)
 * @returns {{
 *   status:'ok'|'warning'|'invalid'|'insufficient',
 *   status_label:string,
 *   is_balanced:boolean|null,
 *   balanced:boolean|null,
 *   difference:number|null,
 *   difference_pct:number|null,
 *   tolerance_amount:number|null,
 *   tolerance_pct:number,
 *   totals:{ assets:number|null, liabilities:number|null, equity:number|null, liabilities_plus_equity:number|null },
 *   issues:Array<object>,
 *   checks:Array<object>,
 *   summary:string
 * }}
 */
export function checkStatementIntegrity(financials = {}, options = {}) {
     const f = financials || {};
     const tolerancePct = Number.isFinite(Number(options.tolerancePct))
          ? Number(options.tolerancePct)
          : INTEGRITY_TOLERANCE_PCT;

     const totalAset = num(f.total_aset);
     const totalLiabilitas = num(f.total_liabilitas);
     const ekuitas = num(f.ekuitas);
     const asetLancar = num(f.aset_lancar);
     const liabJangkaPendek = num(f.liabilitas_jangka_pendek);
     const kas = num(f.kas);
     const piutang = num(f.piutang);
     const persediaan = num(f.persediaan);
     const penjualan = num(f.penjualan);

     const issues = [];
     const checks = [];

     const addCheck = (code, label, passed, detail = {}) => {
          checks.push({ code, label, passed, ...detail });
     };

     // ——— 0) Kelengkapan data inti ———
     const coreMissing = [
          ['total_aset', totalAset],
          ['total_liabilitas', totalLiabilitas],
          ['ekuitas', ekuitas]
     ].filter(([, v]) => v === null).map(([k]) => k);

     if (coreMissing.length) {
          issues.push(
               issue('incomplete', INTEGRITY_SEVERITY.WARNING, `Data inti neraca belum lengkap: ${coreMissing.join(', ')}.`, {
                    fields: coreMissing
               })
          );
     }

     // ——— 1) Neraca seimbang: Aset = Liabilitas + Ekuitas ———
     let difference = null;
     let differencePct = null;
     let toleranceAmount = null;
     let isBalanced = null;

     if (totalAset !== null && totalLiabilitas !== null && ekuitas !== null) {
          const rhs = totalLiabilitas + ekuitas;
          difference = totalAset - rhs;
          differencePct = totalAset !== 0 ? (difference / Math.abs(totalAset)) * 100 : null;
          toleranceAmount = (Math.abs(totalAset) * tolerancePct) / 100;
          isBalanced = Math.abs(difference) <= toleranceAmount;

          addCheck('balance', 'Aset = Liabilitas + Ekuitas', isBalanced, {
               actual: totalAset,
               expected: rhs,
               difference
          });

          if (!isBalanced) {
               issues.push(
                    issue(
                         'not_balanced',
                         INTEGRITY_SEVERITY.CRITICAL,
                         `Neraca tidak seimbang: Total Aset ${fmtRp(totalAset)} ≠ Liabilitas + Ekuitas ${fmtRp(rhs)} ` +
                         `(selisih ${fmtRp(difference)} / ${fmtPct(differencePct)}). Perbaiki laporan sebelum analisis final.`,
                         { difference, difference_pct: differencePct, tolerance_amount: toleranceAmount, tolerance_pct: tolerancePct }
                    )
               );
          }
     } else {
          addCheck('balance', 'Aset = Liabilitas + Ekuitas', null);
     }

     // ——— 2) Aset lancar ≤ Total aset ———
     if (asetLancar !== null && totalAset !== null) {
          const ok = asetLancar <= totalAset * (1 + tolerancePct / 100);
          addCheck('current_assets_le_total', 'Aset lancar ≤ Total aset', ok, { current_assets: asetLancar, total_assets: totalAset });
          if (!ok) {
               issues.push(
                    issue('current_assets_exceed_total', INTEGRITY_SEVERITY.CRITICAL,
                         `Aset lancar (${fmtRp(asetLancar)}) melebihi total aset (${fmtRp(totalAset)}) — kemungkinan salah input.`,
                         { current_assets: asetLancar, total_assets: totalAset })
               );
          }
     }

     // ——— 3) Liabilitas jangka pendek ≤ Total liabilitas ———
     if (liabJangkaPendek !== null && totalLiabilitas !== null) {
          const ok = liabJangkaPendek <= totalLiabilitas * (1 + tolerancePct / 100);
          addCheck('current_liabilities_le_total', 'Liabilitas jangka pendek ≤ Total liabilitas', ok, {
               current_liabilities: liabJangkaPendek,
               total_liabilities: totalLiabilitas
          });
          if (!ok) {
               issues.push(
                    issue('current_liabilities_exceed_total', INTEGRITY_SEVERITY.CRITICAL,
                         `Liabilitas jangka pendek (${fmtRp(liabJangkaPendek)}) melebihi total liabilitas (${fmtRp(totalLiabilitas)}).`,
                         { current_liabilities: liabJangkaPendek, total_liabilities: totalLiabilitas })
               );
          }
     }

     // ——— 4) Komponen aset lancar ≤ Aset lancar ———
     const liquidParts = [['kas', kas], ['piutang', piutang], ['persediaan', persediaan]].filter(([, v]) => v !== null);
     if (asetLancar !== null && liquidParts.length) {
          const sumParts = liquidParts.reduce((a, [, v]) => a + v, 0);
          const ok = sumParts <= asetLancar * (1 + tolerancePct / 100);
          addCheck('asset_parts_le_current', 'Kas + Piutang + Persediaan ≤ Aset lancar', ok, {
               parts_sum: sumParts,
               current_assets: asetLancar,
               parts: liquidParts.map(([k]) => k)
          });
          if (!ok) {
               issues.push(
                    issue('asset_parts_exceed_current', INTEGRITY_SEVERITY.WARNING,
                         `Kas + Piutang + Persediaan (${fmtRp(sumParts)}) melebihi aset lancar (${fmtRp(asetLancar)}).`,
                         { parts_sum: sumParts, current_assets: asetLancar })
               );
          }
     }

     // ——— 5) Nilai negatif tak wajar ———
     const negatives = [['total_aset', totalAset], ['penjualan', penjualan], ['ekuitas', ekuitas]].filter(
          ([, v]) => v !== null && v < 0
     );
     negatives.forEach(([k, v]) => {
          addCheck(`negative_${k}`, `${k} tidak negatif`, false, { value: v });
          issues.push(
               issue(`negative_${k}`, INTEGRITY_SEVERITY.WARNING, `Nilai "${k}" negatif (${fmtRp(v)}) — periksa kembali.`, { field: k, value: v })
          );
     });
     if (!negatives.length) addCheck('no_negative_core', 'Nilai inti tidak negatif', true);

     // ——— Kesimpulan status ———
     const hasCritical = issues.some((i) => i.severity === INTEGRITY_SEVERITY.CRITICAL);
     let status;
     if (isBalanced === null && issues.some((i) => i.code === 'incomplete')) status = 'insufficient';
     else if (hasCritical) status = 'invalid';
     else if (issues.length) status = 'warning';
     else status = 'ok';

     const summary = buildSummary({ status, isBalanced, difference, differencePct, issues });

     return {
          status,
          status_label: INTEGRITY_STATUS_LABEL[status] || status,
          is_balanced: isBalanced,
          balanced: isBalanced,
          difference,
          difference_pct: differencePct,
          tolerance_amount: toleranceAmount,
          tolerance_pct: tolerancePct,
          totals: {
               assets: totalAset,
               liabilities: totalLiabilitas,
               equity: ekuitas,
               liabilities_plus_equity: totalLiabilitas !== null && ekuitas !== null ? totalLiabilitas + ekuitas : null
          },
          issues,
          checks,
          summary
     };
}

function buildSummary({ status, isBalanced, difference, differencePct, issues }) {
     if (status === 'ok') return 'Laporan keuangan konsisten — neraca seimbang dan struktur wajar.';
     if (status === 'insufficient') return 'Sebagian data inti neraca belum diisi sehingga keseimbangan tidak dapat diverifikasi.';
     if (status === 'invalid') {
          if (isBalanced === false) {
               return `Neraca TIDAK SEIMBANG (selisih ${fmtRp(difference)} / ${fmtPct(differencePct)}). Laporan keuangan belum beres — minta perbaikan dari borrower.`;
          }
          return 'Ditemukan ketidakkonsistenan material pada laporan keuangan — verifikasi ulang sebelum mengambil keputusan.';
     }
     return `Laporan perlu perhatian: ${issues.length} temuan (${issues.map((i) => i.message).slice(0, 2).join('; ')}${issues.length > 2 ? '; …' : ''}).`;
}

function fmtRp(v) {
     if (v === null || v === undefined || Number.isNaN(Number(v))) return '—';
     const n = Number(v);
     const sign = n < 0 ? '-' : '';
     return `${sign}Rp ${Math.abs(Math.round(n)).toLocaleString('id-ID')}`;
}

function fmtPct(v) {
     if (v === null || v === undefined || Number.isNaN(Number(v))) return '—';
     return `${Number(v).toFixed(2)}%`;
}

export default { checkStatementIntegrity, INTEGRITY_TOLERANCE_PCT, INTEGRITY_SEVERITY, INTEGRITY_STATUS_LABEL };
