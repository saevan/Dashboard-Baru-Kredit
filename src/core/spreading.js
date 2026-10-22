/**
 * core/spreading.js — Financial statement spreading (normalisasi pra-rasio).
 *
 * Rujukan: docs/ARCHITECTURE.md §4.5 (RMA/Docsumo spreading adjustments).
 *
 * Masalah: laporan keuangan mentah (GAAP) bisa MENYESATKAN likuiditas karena
 * mencampur aset yang tidak benar-benar likuid. Spreading me-reklasifikasi pos
 * berikut SEBELUM rasio dihitung:
 *   - Restricted cash & sinking fund  : Aset Lancar → Aset Tidak Lancar
 *   - Piutang related-party           : Aset Lancar → Aset Tidak Lancar
 *   - Utang related-party jangka panjang : Liabilitas Jangka Panjang → Jangka Pendek
 *   - Common-size statements          : tiap pos sebagai % penjualan / % total aset
 *
 * Pure functions; TIDAK menyentuh DOM. Semua penyesuaian bersifat OPSIONAL —
 * bila field mentah tidak diisi (0/undefined), hasil adjusted identik dengan raw
 * sehingga engine lama tetap kompatibel.
 */

const num = (v, d = 0) => {
     const n = Number(v);
     return Number.isFinite(n) ? n : d;
};

const safeDiv = (a, b) => {
     const x = Number(a);
     const y = Number(b);
     if (!Number.isFinite(x) || !Number.isFinite(y) || y === 0) return null;
     return x / y;
};

/** Field input spreading yang dikenali (digunakan juga oleh form wizard). */
export const SPREADING_INPUTS = [
     { key: 'restricted_cash', label: 'Kas dibatasi / sinking fund', group: 'aset', note: 'Aset Lancar → Aset Tidak Lancar' },
     { key: 'related_party_receivables', label: 'Piutang related-party', group: 'aset', note: 'Aset Lancar → Aset Tidak Lancar (repayment diskresioner)' },
     { key: 'sinking_fund', label: 'Sinking fund', group: 'aset', note: 'Aset Lancar → Aset Tidak Lancar' },
     { key: 'related_party_debt_lt', label: 'Utang related-party jangka panjang', group: 'liabilitas', note: 'Liabilitas Jangka Panjang → Jangka Pendek (risiko akselerasi)' }
];

/**
 * Common-size statement: setiap pos sebagai persentase penjualan / total aset.
 * @returns {{ pct_of_sales:object, pct_of_assets:object, basis:object }}
 */
export function commonSize(f = {}) {
     const sales = num(f.penjualan, 0);
     const assets = num(f.total_aset, 0);
     const ofSales = (v) => (sales > 0 ? safeDiv(num(v, 0), sales) : null);
     const ofAssets = (v) => (assets > 0 ? safeDiv(num(v, 0), assets) : null);
     return {
          pct_of_sales: {
               hpp: ofSales(f.hpp),
               ebit: ofSales(f.ebit),
               laba_bersih: ofSales(f.laba_bersih),
               beban_bunga: ofSales(f.beban_bunga),
               arus_kas_operasional: ofSales(f.arus_kas_operasional)
          },
          pct_of_assets: {
               aset_lancar: ofAssets(f.aset_lancar),
               kas: ofAssets(f.kas),
               piutang: ofAssets(f.piutang),
               persediaan: ofAssets(f.persediaan),
               liabilitas_jangka_pendek: ofAssets(f.liabilitas_jangka_pendek),
               total_liabilitas: ofAssets(f.total_liabilitas),
               ekuitas: ofAssets(f.ekuitas)
          },
          basis: { penjualan: sales, total_aset: assets }
     };
}

/**
 * Terapkan penyesuaian spreading pada blok keuangan mentah.
 *
 * @param {object} raw — blok keuangan borrower (mis. borrower.keuangan)
 * @param {object} [options] — { config }
 * @returns {{
 *   raw: object,
 *   adjusted: object,
 *   adjustments: Array<{key,label,amount,effect,note}>,
 *   changed: boolean,
 *   notes: string[],
 *   common_size: object,
 *   impact: { aset_lancar, liabilitas_jangka_pendek, current_ratio_before, current_ratio_after }
 * }}
 */
export function spreadFinancials(raw = {}, options = {}) {
     const cfg = (options.config && options.config.spreading) || {};
     const enabled = cfg.enabled !== false;
     const adjusted = { ...raw };
     const adjustments = [];
     const notes = [];

     const restrictedCash = num(raw.restricted_cash, 0);
     const sinkingFund = num(raw.sinking_fund, 0);
     const rpReceivables = num(raw.related_party_receivables, 0);
     const rpDebtLt = num(raw.related_party_debt_lt, 0);

     const currentRatioBefore = safeDiv(num(raw.aset_lancar, 0), num(raw.liabilitas_jangka_pendek, 0));

     if (enabled) {
          const cashLike = restrictedCash + sinkingFund;
          if (cfg.reclassRestrictedCash !== false && cashLike > 0) {
               adjusted.aset_lancar = Math.max(0, num(raw.aset_lancar, 0) - cashLike);
               adjustments.push({ key: 'kas_dibatasi', label: 'Kas dibatasi / sinking fund', amount: cashLike, effect: 'aset_lancar ↓', note: 'Dikeluarkan dari aset lancar.' });
               notes.push(`Kas dibatasi ${cashLike} dikeluarkan dari aset lancar (bukan likuid).`);
          }
          if (cfg.reclassRelatedPartyReceivables !== false && rpReceivables > 0) {
               adjusted.aset_lancar = Math.max(0, num(adjusted.aset_lancar, 0) - rpReceivables);
               adjustments.push({ key: 'piutang_related_party', label: 'Piutang related-party', amount: rpReceivables, effect: 'aset_lancar ↓', note: 'Repayment diskresioner → non-lancar.' });
               notes.push(`Piutang related-party ${rpReceivables} dikeluarkan dari aset lancar.`);
          }
          if (cfg.reclassRelatedPartyDebtLt !== false && rpDebtLt > 0) {
               adjusted.liabilitas_jangka_pendek = num(raw.liabilitas_jangka_pendek, 0) + rpDebtLt;
               adjustments.push({ key: 'utang_related_party_lt', label: 'Utang related-party jangka panjang', amount: rpDebtLt, effect: 'liabilitas_jangka_pendek ↑', note: 'Risiko akselerasi → jangka pendek.' });
               notes.push(`Utang related-party jangka panjang ${rpDebtLt} direklasifikasi ke jangka pendek.`);
          }
     }

     // Kas likuid juga dikurangi restricted cash (bila tersedia) agar cash_ratio jujur.
     if (enabled && cfg.reclassRestrictedCash !== false && restrictedCash > 0) {
          adjusted.kas = Math.max(0, num(raw.kas, 0) - restrictedCash);
     }

     const currentRatioAfter = safeDiv(num(adjusted.aset_lancar, 0), num(adjusted.liabilitas_jangka_pendek, 0));

     return {
          raw,
          adjusted,
          adjustments,
          changed: adjustments.length > 0,
          notes,
          common_size: commonSize(adjusted),
          impact: {
               aset_lancar: { before: num(raw.aset_lancar, 0), after: num(adjusted.aset_lancar, 0) },
               liabilitas_jangka_pendek: { before: num(raw.liabilitas_jangka_pendek, 0), after: num(adjusted.liabilitas_jangka_pendek, 0) },
               current_ratio_before: currentRatioBefore,
               current_ratio_after: currentRatioAfter
          }
     };
}

export default { spreadFinancials, commonSize, SPREADING_INPUTS };
