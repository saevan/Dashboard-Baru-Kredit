/**
 * services/portfolio.js — Nasabah, fasilitas, pemantauan, dan portofolio (mode lokal).
 * Dipindahkan dari dashboard lama: ui/portfolio-data.js, ui/detail.js (facilityOf,
 * aksi fasilitas, syarat penarikan, 3R, covenant, hitung ulang), ui/ews-monitor-view.js
 * (prefill, simpan pemantauan), ui/form.js (calculate), ui/dashboard.js (ringkasan).
 */

import * as storage from '../data/storage.js';
import { loadWorkItems } from '../data/work-items.js';
import { applicationRecipient } from '../data/application-recipient.js';
import { FACILITY_STATUS } from '../core/config.js';
import { classifyFacility, applyObligorContagion, facilityEcl, facilityPpka, buildPortfolio } from '../core/portfolio.js';
import { buildConditionsPrecedent, conditionsStatus } from '../core/disbursement.js';
import { proposeRestructuring, restructuringStatus, monthsElapsed } from '../core/restructuring.js';
import { EWS_PARAMS } from '../core/ews-monitor.js';
import { queueRows, selectQueue, monitoringSummary, WORK_FOCUS, workFocus } from '../core/workflow.js';
import { processMetrics } from '../core/dashboard-insights.js';
import { analyze, analysisOptions, getConfig, evaluateEws } from './core.js';
import { compareScenario } from '../core/what-if.js';

const round2 = (v) => Math.round(Number(v) * 100) / 100;
const actorName = () => storage.loadSession()?.name || storage.loadSession()?.email || '';

/* -------------------------------------------------------------- data ----- */

/** Baris seragam {borrower, analysis, monitoring, facility} (portfolioRows lama). */
export function portfolioRows() {
     const analyses = new Map();
     for (const a of storage.loadAnalyses()) {
          const old = analyses.get(a.borrower_id);
          if (!old || String(a.saved_at || a.created_at || '') >= String(old.saved_at || old.created_at || '')) analyses.set(a.borrower_id, a);
     }
     const monitoring = new Map();
     for (const m of storage.loadMonitoring()) {
          if (!monitoring.has(m.borrower_id)) monitoring.set(m.borrower_id, []);
          monitoring.get(m.borrower_id).push(m);
     }
     for (const list of monitoring.values()) list.sort((a, b) => (Date.parse(a.created_at || a.tanggal) || 0) - (Date.parse(b.created_at || b.tanggal) || 0));
     return storage.loadBorrowers().map((borrower) => ({
          borrower,
          analysis: analyses.get(borrower.id)?.result || null,
          monitoring: monitoring.get(borrower.id) || [],
          facility: borrower.facility || null
     }));
}

export const monitoringFor = (borrowerId) =>
     storage.loadMonitoring().filter((m) => m.borrower_id === borrowerId).sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));

export const analysisFor = (borrowerId) => storage.getAnalysisForBorrower(borrowerId)?.result || null;

/** Klasifikasi fasilitas + aturan satu debitur satu kolektibilitas (facilityOf lama). */
export function facilityOf(borrower, analysis = analysisFor(borrower.id)) {
     const config = getConfig();
     const own = classifyFacility({ borrower, analysis, monitoring: monitoringFor(borrower.id) }, config);
     if (own.status !== FACILITY_STATUS.AKTIF || !own.obligor_key) return own;
     const peers = storage.loadBorrowers()
          .filter((b) => b.id !== borrower.id)
          .map((b) => classifyFacility({ borrower: b, analysis: null, monitoring: monitoringFor(b.id) }, config))
          .filter((f) => f.status === FACILITY_STATUS.AKTIF && f.outstanding > 0 && f.obligor_key === own.obligor_key);
     return peers.length ? applyObligorContagion([own, ...peers], config)[0] : own;
}

/** CKPN (PSAK 71) & PPKA (POJK 40) untuk fasilitas aktif. */
export function provisionOf(fac) {
     if (fac.status !== FACILITY_STATUS.AKTIF || !(fac.outstanding > 0)) return null;
     const config = getConfig();
     const ecl = facilityEcl(fac, config);
     const ppka = facilityPpka(fac, config);
     return { ecl, ppka, shortfall: ecl.ecl === null ? null : Math.max(0, ppka.amount - ecl.ecl) };
}

/** Daftar syarat penarikan & status kesiapan pencairan. */
export function conditionsOf(borrower, analysis = analysisFor(borrower.id)) {
     return conditionsStatus(buildConditionsPrecedent({ borrower, decision: analysis?.decision?.decision || null, config: getConfig() }), borrower.conditions_precedent || {});
}

/** Satu nasabah lengkap untuk layar Nasabah. */
export function customer(id) {
     const borrower = storage.getBorrower(id);
     if (!borrower) return null;
     const analysis = analysisFor(id);
     const facility = facilityOf(borrower, analysis);
     const application = borrower.application_id ? storage.getApplication(borrower.application_id) : null;
     return {
          borrower,
          analysis,
          facility,
          provision: provisionOf(facility),
          conditions: conditionsOf(borrower, analysis),
          monitoring: monitoringFor(id),
          covenants: storage.getCovenantsForBorrower(id),
          restructuring: borrower.restructuring ? restructuringStatus(borrower.restructuring, { config: getConfig() }) : null,
          application
     };
}

/** Daftar nasabah dengan lampu kesehatan. */
export function customerList() {
     return portfolioRows().map((row) => {
          const fac = facilityOf(row.borrower, row.analysis);
          const last = row.monitoring.length ? row.monitoring[row.monitoring.length - 1] : null;
          return { ...row, facilityInfo: fac, lastMonitoring: last };
     });
}

/* ----------------------------------------------------------- analisis ---- */

/** Analisis manual: simpan nasabah + hasil (calculate lama). */
export function saveManualAnalysis(borrower) {
     const id = borrower.id || storage.uid('bwr');
     const rec = { ...borrower, id };
     storage.upsertBorrower(rec);
     const result = analyze(rec);
     storage.saveAnalysis(id, result);
     return { id, result };
}

export function recalculate(id) {
     const borrower = storage.getBorrower(id);
     if (!borrower) throw new Error('Nasabah tidak ditemukan.');
     const fresh = analyze(borrower);
     storage.saveAnalysis(id, fresh);
     return fresh;
}

/** Simulasi "bagaimana jika" jumlah/lama/bunga/skema berubah (tab Simulasi lama). */
export function whatIf(borrower, changes) {
     return compareScenario(borrower, changes, analysisOptions());
}

export function removeCustomer(id) {
     storage.deleteAnalysisForBorrower(id);
     storage.deleteBorrower(id);
}

/* ---------------------------------------------------------- fasilitas ---- */

export function facilityAction(id, kind, { outstanding = null } = {}) {
     if (kind === 'disburse') return storage.disburse(id, { outstanding, catatan: 'Pencairan via detail borrower' });
     if (kind === 'update') return storage.setFacilityStatus(id, { status: FACILITY_STATUS.AKTIF, outstanding });
     if (kind === 'lunas') return storage.setFacilityStatus(id, { status: FACILITY_STATUS.LUNAS, outstanding: 0 });
     if (kind === 'ditolak') return storage.setFacilityStatus(id, { status: FACILITY_STATUS.DITOLAK });
     throw new Error('Aksi fasilitas tidak dikenal.');
}

export const setCondition = (id, code, done) => storage.setConditionPrecedent(id, code, { done, by: actorName() });

/** Input 3R bawaan dari fasilitas & analisis (restructuringInputs lama). */
export function restructuringInputs(borrower, r = analysisFor(borrower.id)) {
     const tenor = Number(borrower.tenor_bulan || 12);
     return {
          outstanding: Number(borrower.outstanding || 0),
          rate: Number(borrower.bunga_tahunan ?? r?.credit?.pricing?.recommended_rate ?? 0),
          remainingMonths: Math.max(1, tenor - monthsElapsed(borrower.disbursed_at)),
          annualCashFlow: Number(r?.nominal?.income_used ?? 0),
          otherAnnualDebtService: Number(r?.debtService?.existing_annual ?? 0),
          floorRate: r?.credit?.pricing?.breakeven_rate ?? null
     };
}

export function proposeRelief(id, { annualCashFlow, remainingMonths } = {}) {
     const borrower = storage.getBorrower(id);
     const base = restructuringInputs(borrower);
     const inputs = {
          ...base,
          ...(Number.isFinite(annualCashFlow) ? { annualCashFlow } : {}),
          ...(Number.isFinite(remainingMonths) ? { remainingMonths } : {})
     };
     const config = getConfig();
     return proposeRestructuring({ ...inputs, targetDscr: Number(config.restructuring?.targetDscr ?? 1.2), config });
}

export const applyRelief = (id, option, note = '') => storage.applyRestructuring(id, option, { note, by: actorName() });
export const recordReliefPayment = (id, onTime) => storage.recordRestructuringPayment(id, { on_time: onTime });

export function saveCovenantsFromAnalysis(id) {
     const list = analysisFor(id)?.covenant?.covenants || [];
     if (!list.length) throw new Error('Belum ada covenant untuk disimpan — jalankan analisis.');
     storage.saveCovenants(id, list);
     return list;
}

/* -------------------------------------------------------- pemantauan ---- */

export { EWS_PARAMS };

/** Isi awal parameter dari analisis (prefillFromAnalysis lama). */
export function ewsPrefill(analysis) {
     const out = {};
     if (!analysis) return out;
     const r = analysis.ratios || {};
     const ex = analysis.extra || {};
     if (r.dscr != null) out.P1_dscr = round2(r.dscr);
     if (r.icr != null) out.P2_icr = round2(r.icr);
     if (r.current_ratio != null) out.P3_cr = round2(r.current_ratio);
     if (r.altman_z != null) out.P8_altman_z = round2(r.altman_z);
     if (r.roa != null) out.P9_roa = Number(r.roa);
     if (ex.arrears_days != null) out.P11_days_late = Number(ex.arrears_days);
     const neg = Number(ex.negative_ocf_periods || 0);
     out.P4_ocf = neg >= 2 ? 'negatif_2_periode' : neg === 1 ? 'negatif_1_periode' : 'positif';
     return out;
}

export function currentPeriod(d = new Date()) {
     return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Bersihkan nilai form → parameter (collectParams lama). */
export function cleanParams(raw = {}) {
     const params = {};
     for (const p of EWS_PARAMS) {
          const v = raw[p.key];
          if (v === '' || v === null || v === undefined) continue;
          params[p.key] = p.type === 'number' ? Number(v) : v;
     }
     return params;
}

export function evaluateMonitoringFor(borrowerId, rawParams) {
     const borrower = storage.getBorrower(borrowerId);
     return evaluateEws(cleanParams(rawParams), borrower?.sektor);
}

/** Simpan pemantauan bulanan (save lama). */
export function saveMonitoring(borrowerId, rawParams, { period = currentPeriod(), note = '' } = {}) {
     const params = cleanParams(rawParams);
     if (!Object.keys(params).length) throw new Error('Isi minimal satu parameter sebelum menyimpan.');
     const ev = evaluateMonitoringFor(borrowerId, params);
     storage.addMonitoring(borrowerId, {
          period,
          note,
          params,
          ews_level: ev.ews_level,
          collectibility: ev.collectibility,
          recommended_action: ev.recommended_action,
          escalate_to: ev.escalate_to,
          judgements: ev.judgements,
          signals: ev.signals
     });
     return ev;
}

/* ------------------------------------------------------ ringkasan kerja ---- */

/** Beranda petugas: antrean prioritas, fokus kerja, risiko, portofolio (dashboard lama). */
export function lenderHome({ focus = '', actorId = '' } = {}) {
     const config = getConfig();
     const applications = storage.loadApplications().filter((a) => a.status !== 'draft').map((a) => ({ ...a, recipient: applicationRecipient(a) }));
     const tasks = queueRows(applications, storage.loadBorrowers(), Date.now(), loadWorkItems());
     const queue = selectQueue(tasks, { desk: 'all', scope: focus === 'waiting' ? 'borrower' : 'lender', focus, actorId, sort: 'priority', pageSize: 8 });
     const rows = portfolioRows();
     return {
          tasks,
          queue,
          focusCounts: WORK_FOCUS.map((f) => ({ ...f, count: tasks.filter((t) => workFocus(t) === f.key).length })),
          lenderCount: tasks.filter((t) => t.task.owner === 'lender').length,
          waitingCount: tasks.filter((t) => t.task.owner === 'borrower').length,
          portfolio: buildPortfolio({ rows, config }),
          risk: monitoringSummary(rows, config),
          process: processMetrics(storage.loadApplications())
     };
}

export function portfolioReport() {
     return buildPortfolio({ rows: portfolioRows(), config: getConfig() });
}

/* -------------------------------------------------------------- data ---- */

export const exportBackup = () => storage.exportAll();
export const importBackup = (payload, merge = true) => storage.importAll(payload, { merge });
export const clearAllData = () => storage.clearAll();
