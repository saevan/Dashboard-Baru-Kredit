import { borrowerWithOffer } from '../core/financing.js';
import { applyAuditToBorrower } from '../core/audit.js';
import { buildConditionsPrecedent, disbursementBlocker } from '../core/disbursement.js';
import { validateRestructuring, restructuringRecord } from '../core/restructuring.js';
import { classifyFacility } from '../core/portfolio.js';
/**
 * data/storage.js — Persistensi localStorage (Fase 1, tanpa backend).
 * Menyediakan fallback in-memory agar tetap jalan di Node/test.
 *
 * Rujukan: PRD_PEMBUATAN §4 (data/storage.js), §5 (schema).
 */

const KEYS = {
     workItems: 'pla.work-items.v1',
     borrowers: 'pla.borrowers.v1',
     analyses: 'pla.analyses.v1',
     monitoring: 'pla.monitoring.v1',
     covenants: 'pla.covenants.v1',
     documents: 'pla.documents.v1',
     applications: 'pla.applications.v1',
     consents: 'pla.consents.v1',
     settings: 'pla.settings.v1',
     benchmarkOverrides: 'pla.benchmark_overrides.v1',
     users: 'pla.users.v1',
     session: 'pla.session.v1'
};

const memory = {};

const hasLS = typeof localStorage !== 'undefined' && localStorage !== null;

function readRaw(key) {
     try {
          if (hasLS) return localStorage.getItem(key);
          return memory[key] === undefined ? null : memory[key];
     } catch {
          return null;
     }
}

function writeRaw(key, value) {
     try {
          if (hasLS) localStorage.setItem(key, value);
          else memory[key] = value;
     } catch {
          memory[key] = value;
     }
}

function removeRaw(key) {
     try {
          if (hasLS) localStorage.removeItem(key);
          else delete memory[key];
     } catch {
          delete memory[key];
     }
}

function readJSON(key, fallback) {
     const raw = readRaw(key);
     if (!raw) return fallback;
     try {
          return JSON.parse(raw);
     } catch {
          return fallback;
     }
}

function writeJSON(key, value) {
     if (hasLS && [KEYS.applications, KEYS.documents].includes(key)) {
          try { localStorage.setItem(key, JSON.stringify(value)); }
          catch { throw new Error('Data gagal disimpan. Periksa ruang penyimpanan dan izin browser, lalu coba lagi.'); }
          return;
     }
     writeRaw(key, JSON.stringify(value));
}

/** ID unik sederhana (timestamp + random). */
export function uid(prefix = 'id') {
     return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ——— Borrowers ———
export function loadBorrowers() {
     return readJSON(KEYS.borrowers, []);
}

export function saveBorrowers(list) {
     writeJSON(KEYS.borrowers, list || []);
     return list;
}

export function getBorrower(id) {
     return loadBorrowers().find((b) => b.id === id) || null;
}

export function upsertBorrower(borrower) {
     const list = loadBorrowers();
     const now = new Date().toISOString();
     const idx = list.findIndex((b) => b.id === borrower.id);
     if (idx >= 0) {
          list[idx] = { ...list[idx], ...borrower, updated_at: now };
     } else {
          list.push({ ...borrower, id: borrower.id || uid('bwr'), created_at: now, updated_at: now });
     }
     saveBorrowers(list);
     return idx >= 0 ? list[idx] : list[list.length - 1];
}

export function deleteBorrower(id) {
     saveBorrowers(loadBorrowers().filter((b) => b.id !== id));
}

// ——— Analyses (hasil runFullAnalysis) ———
export function loadAnalyses() {
     return readJSON(KEYS.analyses, []);
}

export function getAnalysisForBorrower(borrowerId) {
     return loadAnalyses().find((a) => a.borrower_id === borrowerId) || null;
}

export function saveAnalysis(borrowerId, result) {
     const list = loadAnalyses().filter((a) => a.borrower_id !== borrowerId);
     const rec = { borrower_id: borrowerId, result, saved_at: new Date().toISOString() };
     list.push(rec);
     writeJSON(KEYS.analyses, list);
     return rec;
}

export function deleteAnalysisForBorrower(borrowerId) {
     writeJSON(KEYS.analyses, loadAnalyses().filter((a) => a.borrower_id !== borrowerId));
}

// ——— Monitoring (EWS pasca-pencairan) ———
export function loadMonitoring() {
     return readJSON(KEYS.monitoring, []);
}

export function getMonitoringForBorrower(borrowerId) {
     return loadMonitoring().filter((m) => m.borrower_id === borrowerId);
}

export function addMonitoring(borrowerId, entry) {
     const list = loadMonitoring();
     const rec = { ...entry, id: entry.id || uid('mon'), borrower_id: borrowerId, created_at: new Date().toISOString() };
     list.push(rec);
     writeJSON(KEYS.monitoring, list);
     return rec;
}

// ——— Covenant (per borrower, hasil generateCovenants saat LAYAK BERSYARAT) ———
export function loadCovenants() {
     return readJSON(KEYS.covenants, []);
}

export function getCovenantsForBorrower(borrowerId) {
     return loadCovenants().find((c) => c.borrower_id === borrowerId) || null;
}

export function saveCovenants(borrowerId, covenants) {
     const list = loadCovenants().filter((c) => c.borrower_id !== borrowerId);
     const rec = { borrower_id: borrowerId, covenants, saved_at: new Date().toISOString() };
     list.push(rec);
     writeJSON(KEYS.covenants, list);
     return rec;
}

// ——— Dokumen pendukung (metadata kelengkapan berkas — offline-first, tanpa upload) ———
export function loadDocuments() {
     return readJSON(KEYS.documents, []);
}

export function getDocumentsForBorrower(borrowerId) {
     return loadDocuments().filter((d) => d.borrower_id === borrowerId);
}

/**
 * Tambah metadata dokumen pendukung untuk seorang borrower.
 * @param {string} borrowerId
 * @param {{nama:string, jenis?:string, tanggal?:string, tautan?:string, catatan?:string}} entry
 */
export function addDocument(borrowerId, entry = {}) {
     const list = loadDocuments();
     const rec = {
          ...entry,
          id: entry.id || uid('doc'),
          borrower_id: borrowerId,
          created_at: new Date().toISOString()
     };
     list.push(rec);
     writeJSON(KEYS.documents, list);
     return rec;
}

export function deleteDocument(id) {
     writeJSON(KEYS.documents, loadDocuments().filter((d) => d.id !== id));
}

// ——— Pengajuan pemohon (mode lokal; cermin domain `applications` di backend) ———
export function loadApplications() {
     return readJSON(KEYS.applications, []);
}

export function getApplication(id) {
     return loadApplications().find((a) => a.id === id) || null;
}

export function saveApplications(list) {
     writeJSON(KEYS.applications, list || []);
     return list;
}

export function upsertApplication(app) {
     const list = loadApplications();
     const now = new Date().toISOString();
     const idx = list.findIndex((a) => a.id === app.id);
     if (idx >= 0) {
          list[idx] = { ...list[idx], ...app, updated_at: now };
          writeJSON(KEYS.applications, list);
          return list[idx];
     }
     const rec = { ...app, id: app.id || uid('app'), created_at: now, updated_at: now };
     list.push(rec);
     writeJSON(KEYS.applications, list);
     return rec;
}

export function deleteApplication(id) {
     saveApplications(loadApplications().filter((a) => a.id !== id));
}

// ——— Konsen audit finansial (satu per pengajuan) ———
export function loadConsents() {
     return readJSON(KEYS.consents, []);
}

export function saveConsents(list) {
     writeJSON(KEYS.consents, list || []);
     return list;
}

export function getConsentForApplication(applicationId) {
     return loadConsents().find((c) => c.application_id === applicationId) || null;
}

export function saveConsent(applicationId, consent = {}) {
     const list = loadConsents().filter((c) => c.application_id !== applicationId);
     const rec = { ...consent, application_id: applicationId, accepted_at: new Date().toISOString() };
     list.push(rec);
     writeJSON(KEYS.consents, list);
     return rec;
}

/** Siapkan fasilitas dari offer diterima; ID tetap membuat pengulangan aman. */
export function prepareFacility(applicationId) {
     const app = getApplication(applicationId);
     if (!app || app.status !== 'accepted' || app.offer?.status !== 'accepted') throw new Error('Penawaran harus diterima pemohon terlebih dahulu.');
     const existing = loadBorrowers().find((b) => b.application_id === app.id || b.id === app.borrower_id);
     if (existing) {
          if (app.borrower_id !== existing.id) upsertApplication({ ...app, borrower_id: existing.id });
          return existing;
     }
     const terms = app.offer.terms;
     if (!terms?.tenor_bulan) throw new Error('Syarat penawaran belum lengkap. Rekonsiliasi penawaran lama diperlukan.');
     const borrower = applyAuditToBorrower(app.payload?.borrower || app.borrower || {},app.audit);
     const id = `facility_${app.id}`;
     const facility = upsertBorrower({ ...borrowerWithOffer(borrower, app.offer), id, application_id: app.id,
          facility_status: 'pipeline', outstanding: 0, accepted_offer: { ...app.offer } });
     // Simpan snapshot asli untuk jejak audit; tampilan memberi penanda syarat final.
     if (app.result) saveAnalysis(id, app.result);
     upsertApplication({ ...app, borrower_id: id, events: [...(app.events || []),
          { action: 'prepare_facility', at: new Date().toISOString(), note: 'Fasilitas disiapkan, belum dicairkan.' }] });
     return facility;
}

// ——— Lifecycle fasilitas (pipeline → aktif → lunas/ditolak) ———
/**
 * Ubah status/lifecycle fasilitas + data pencairan pada record borrower.
 * @param {string} borrowerId
 * @param {{status?:string, outstanding?:number, disbursed_at?:string, tanggal_pencairan?:string, catatan?:string}} patch
 */
export function setFacilityStatus(borrowerId, patch = {}) {
     const list = loadBorrowers();
     const idx = list.findIndex((b) => b.id === borrowerId);
     if (idx < 0) return null;
     const now = new Date().toISOString();
     const cur = list[idx];
     if (patch.outstanding !== undefined && (!Number.isFinite(Number(patch.outstanding)) || Number(patch.outstanding) < 0 || Number(patch.outstanding) > Number(cur.plafon_diajukan))) {
          throw new Error('Outstanding harus antara nol dan plafon fasilitas.');
     }
     list[idx] = {
          ...cur,
          facility_status: patch.status || cur.facility_status || 'pipeline',
          outstanding: patch.outstanding !== undefined ? patch.outstanding : cur.outstanding,
          disbursed_at: patch.disbursed_at || patch.tanggal_pencairan || cur.disbursed_at || null,
          lifecycle_note: patch.catatan !== undefined ? patch.catatan : cur.lifecycle_note || null,
          updated_at: now
     };
     saveBorrowers(list);
     return list[idx];
}

/** Tandai satu syarat penarikan terpenuhi / dibuka kembali (hanya sebelum pencairan). */
export function setConditionPrecedent(borrowerId, code, { done = true, note = '', by = '' } = {}) {
     const borrower = getBorrower(borrowerId);
     if (!borrower) throw new Error('Fasilitas tidak ditemukan.');
     if (borrower.facility_status && borrower.facility_status !== 'pipeline') throw new Error('Syarat penarikan hanya dapat diubah sebelum pencairan.');
     const decision = getAnalysisForBorrower(borrowerId)?.result?.decision?.decision || null;
     if (!buildConditionsPrecedent({ borrower, decision }).some((c) => c.code === code)) throw new Error('Kode syarat penarikan tidak dikenal.');
     const record = { done: !!done, at: new Date().toISOString(), by, note: String(note || '').trim().slice(0, 500) };
     return upsertBorrower({ id: borrowerId, conditions_precedent: { ...(borrower.conditions_precedent || {}), [code]: record } });
}

/** Catat pencairan: set status aktif + outstanding + tanggal. Ditolak bila syarat penarikan wajib belum lengkap. */
export function disburse(borrowerId, { outstanding = null, tanggal_pencairan = null, catatan = '' } = {}) {
     const borrower = getBorrower(borrowerId);
     if (!borrower) throw new Error('Fasilitas tidak ditemukan.');
     if (borrower.facility_status !== 'pipeline' && borrower.facility_status) throw new Error('Pencairan hanya dapat dicatat sekali dari tahap persiapan.');
     const amount = outstanding !== null ? outstanding : borrower ? Number(borrower.plafon_diajukan || 0) : 0;
     if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) throw new Error('Nominal pencairan harus positif.');
     const blocker = disbursementBlocker({ borrower, decision: getAnalysisForBorrower(borrowerId)?.result?.decision?.decision || null, amount: Number(amount) });
     if (blocker) throw new Error(blocker);
     return setFacilityStatus(borrowerId, {
          status: 'aktif',
          outstanding: amount,
          tanggal_pencairan: tanggal_pencairan || new Date().toISOString(),
          catatan
     });
}

// ——— Restrukturisasi 3R (POJK 40) ———
/**
 * Catat restrukturisasi fasilitas aktif. Kolektibilitas saat ini disimpan sebagai
 * batas atas selama masa tunggu; restrukturisasi sebelumnya dipindah ke riwayat.
 */
export function applyRestructuring(borrowerId, option = {}, { note = '', by = '' } = {}) {
     const borrower = getBorrower(borrowerId);
     if (!borrower) throw new Error('Fasilitas tidak ditemukan.');
     if (borrower.facility_status !== 'aktif') throw new Error('Restrukturisasi hanya untuk fasilitas aktif.');
     const error = validateRestructuring(option);
     if (error) throw new Error(error);
     const facility = classifyFacility({ borrower, analysis: getAnalysisForBorrower(borrowerId)?.result || null, monitoring: getMonitoringForBorrower(borrowerId) });
     const record = restructuringRecord({ option, collectibilityBefore: facility.collectibility, note, by,
          termsBefore: { outstanding: Number(borrower.outstanding || 0), tenor_bulan: borrower.tenor_bulan ?? null, rate: borrower.bunga_tahunan ?? null } });
     const history = borrower.restructuring ? [...(borrower.restructuring_history || []), borrower.restructuring] : borrower.restructuring_history || [];
     return upsertBorrower({ id: borrowerId, restructuring: record, restructuring_history: history });
}

/** Catat satu pembayaran pada masa tunggu restrukturisasi (tepat waktu / terlambat). */
export function recordRestructuringPayment(borrowerId, { on_time = true, note = '' } = {}) {
     const borrower = getBorrower(borrowerId);
     if (!borrower?.restructuring) throw new Error('Fasilitas belum direstrukturisasi.');
     const payments = [...(borrower.restructuring.payments || []), { at: new Date().toISOString(), on_time: !!on_time, note: String(note || '').slice(0, 200) }];
     return upsertBorrower({ id: borrowerId, restructuring: { ...borrower.restructuring, payments } });
}

// ——— Settings ———
export function loadSettings() {
     return readJSON(KEYS.settings, null);
}

export function saveSettings(settings) {
     writeJSON(KEYS.settings, settings);
     return settings;
}

// ——— Pengguna & sesi (login lokal: penentu peran lender vs borrower) ———
/** Daftar pengguna tersimpan; `null` berarti belum ada (UI pakai akun demo). */
export function loadUsers() {
     const raw = readJSON(KEYS.users, null);
     return Array.isArray(raw) ? raw : null;
}

export function saveUsers(list) {
     const value = Array.isArray(list) ? list : [];
     if (hasLS) localStorage.setItem(KEYS.users, JSON.stringify(value));
     else writeJSON(KEYS.users, value);
     return list;
}

/** Sesi aktif (login) atau `null`. */
export function loadSession() {
     const raw = readJSON(KEYS.session, null);
     return raw && typeof raw === 'object' ? raw : null;
}

export function saveSession(session) {
     if (session && typeof session === 'object') writeJSON(KEYS.session, session);
     else removeRaw(KEYS.session);
     return session || null;
}

export function clearSession() {
     removeRaw(KEYS.session);
}

// ——— Benchmark overrides (F-19: kustomisasi ambang benchmark per sektor/rasio) ———
// Bentuk: { [sectorKey]: { [ratioKey]: { p01?, p10?, p25?, median?, p75?, p90?, p99?, mean?, direction? } } }
export function loadBenchmarkOverrides() {
     const raw = readJSON(KEYS.benchmarkOverrides, {});
     return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
}

export function saveBenchmarkOverrides(overrides) {
     const clean = overrides && typeof overrides === 'object' && !Array.isArray(overrides) ? overrides : {};
     writeJSON(KEYS.benchmarkOverrides, clean);
     return clean;
}

/** Set/merge satu override per (sektor, rasio). */
export function setBenchmarkOverride(sectorKey, ratioKey, patch = {}) {
     if (!sectorKey || !ratioKey) return loadBenchmarkOverrides();
     const all = loadBenchmarkOverrides();
     const sector = { ...(all[sectorKey] || {}) };
     sector[ratioKey] = { ...(sector[ratioKey] || {}), ...patch };
     all[sectorKey] = sector;
     return saveBenchmarkOverrides(all);
}

/** Hapus override satu rasio (atau seluruh sektor bila ratioKey = null). */
export function removeBenchmarkOverride(sectorKey, ratioKey = null) {
     const all = loadBenchmarkOverrides();
     if (!sectorKey) return all;
     if (ratioKey === null) {
          delete all[sectorKey];
     } else if (all[sectorKey]) {
          const sector = { ...all[sectorKey] };
          delete sector[ratioKey];
          if (Object.keys(sector).length) all[sectorKey] = sector;
          else delete all[sectorKey];
     }
     return saveBenchmarkOverrides(all);
}

export function clearBenchmarkOverrides() {
     return saveBenchmarkOverrides({});
}

export function loadWorkItems() { return readJSON(KEYS.workItems, {}) || {}; }
export function writeWorkItems(items) {
     const raw = JSON.stringify(items);
     if (hasLS) localStorage.setItem(KEYS.workItems, raw);
     else memory[KEYS.workItems] = raw;
}

// ——— Import/Export ———
export function exportAll() {
     return {
          version: 6,
          exported_at: new Date().toISOString(),
          work_items: loadWorkItems(),
          borrowers: loadBorrowers(),
          analyses: loadAnalyses(),
          monitoring: loadMonitoring(),
          covenants: loadCovenants(),
          documents: loadDocuments(),
          applications: loadApplications(),
          consents: loadConsents(),
          settings: loadSettings(),
          benchmark_overrides: loadBenchmarkOverrides(),
          users: loadUsers() || []
     };
}

export function importAll(payload, { merge = true } = {}) {
     if (!payload || typeof payload !== 'object') throw new Error('Payload import tidak valid.');
     if (!merge) {
          writeWorkItems(payload.work_items || {});
          saveBorrowers(payload.borrowers || []);
          writeJSON(KEYS.analyses, payload.analyses || []);
          writeJSON(KEYS.monitoring, payload.monitoring || []);
          writeJSON(KEYS.covenants, payload.covenants || []);
          writeJSON(KEYS.documents, payload.documents || []);
          writeJSON(KEYS.applications, payload.applications || []);
          writeJSON(KEYS.consents, payload.consents || []);
          writeJSON(KEYS.settings, payload.settings || null);
          writeJSON(KEYS.benchmarkOverrides, payload.benchmark_overrides || {});
          writeJSON(KEYS.users, Array.isArray(payload.users) && payload.users.length ? payload.users : null);
          return exportAll();
     }
     writeWorkItems({ ...loadWorkItems(), ...(payload.work_items || {}) });
     const byId = new Map(loadBorrowers().map((b) => [b.id, b]));
     for (const b of payload.borrowers || []) byId.set(b.id, b);
     saveBorrowers([...byId.values()]);

     const aByB = new Map(loadAnalyses().map((a) => [a.borrower_id, a]));
     for (const a of payload.analyses || []) aByB.set(a.borrower_id, a);
     writeJSON(KEYS.analyses, [...aByB.values()]);

     const mon = [...loadMonitoring(), ...(payload.monitoring || [])];
     writeJSON(KEYS.monitoring, mon);

     const cByB = new Map(loadCovenants().map((c) => [c.borrower_id, c]));
     for (const c of payload.covenants || []) cByB.set(c.borrower_id, c);
     writeJSON(KEYS.covenants, [...cByB.values()]);

     const dById = new Map(loadDocuments().map((d) => [d.id, d]));
     for (const d of payload.documents || []) dById.set(d.id, d);
     writeJSON(KEYS.documents, [...dById.values()]);

     const appById = new Map(loadApplications().map((a) => [a.id, a]));
     for (const a of payload.applications || []) appById.set(a.id, a);
     writeJSON(KEYS.applications, [...appById.values()]);

     const consByApp = new Map(loadConsents().map((c) => [c.application_id, c]));
     for (const c of payload.consents || []) consByApp.set(c.application_id, c);
     writeJSON(KEYS.consents, [...consByApp.values()]);

     if (payload.settings) saveSettings(payload.settings);
     if (payload.benchmark_overrides && typeof payload.benchmark_overrides === 'object') {
          const merged = { ...loadBenchmarkOverrides() };
          for (const [sk, ratioMap] of Object.entries(payload.benchmark_overrides)) {
               merged[sk] = { ...(merged[sk] || {}), ...(ratioMap || {}) };
          }
          writeJSON(KEYS.benchmarkOverrides, merged);
     }
     if (Array.isArray(payload.users) && payload.users.length) {
          const uById = new Map((loadUsers() || []).map((u) => [u.id || u.email, u]));
          for (const u of payload.users) uById.set(u.id || u.email, u);
          writeJSON(KEYS.users, [...uById.values()]);
     }
     return exportAll();
}

export function clearAll() {
     Object.values(KEYS).forEach((k) => writeRaw(k, null));
}

export { KEYS };
