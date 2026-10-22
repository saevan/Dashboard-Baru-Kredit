/**
 * services/core.js — Konfigurasi, analisis, dan sesi.
 *
 * Dipindahkan apa adanya dari dashboard lama (ui/state.js, ui/context.js,
 * ui/login.js, ui/register.js, ui/team.js) supaya tampilan baru memakai
 * logika yang sama: config = DEFAULT_CONFIG + override Pengaturan; analisis =
 * runFullAnalysis + benchmark IDX (dengan override) + profil perusahaan.
 */

import * as storage from '../data/storage.js';
import { DEFAULT_CONFIG } from '../core/config.js';
import { runFullAnalysis } from '../core/engine.js';
import { applyBenchmarkOverrides, listSectors } from '../core/benchmark.js';
import { evaluateMonitoring } from '../core/ews-monitor.js';
import { authenticate, effectiveUsers, normalizeEmail, isLender, DEMO_USERS } from '../core/auth-local.js';
import { INDUSTRY_BENCHMARK, SECTORS, getSector } from '../data/industries.js';
import COMPANY_PROFILES, { PROFILE_LIST, getProfile } from '../data/company-profiles.js';

/* ----------------------------------------------------------- config ----- */

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function deepMerge(base, over) {
     if (!isPlainObject(over)) return over === undefined ? base : over;
     const out = isPlainObject(base) ? { ...base } : {};
     for (const [k, v] of Object.entries(over)) out[k] = isPlainObject(v) && isPlainObject(out[k]) ? deepMerge(out[k], v) : v;
     return out;
}

/** Konfigurasi efektif: default mesin + override dari Pengaturan. */
export function getConfig(settings = storage.loadSettings()) {
     const base = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
     return settings ? deepMerge(base, settings) : base;
}

/** Simpan override pengaturan (sebagian). */
export function persistSettings(partial) {
     const next = deepMerge(storage.loadSettings() || {}, partial || {});
     storage.saveSettings(next);
     return next;
}

export function resetSettings() {
     storage.saveSettings(null);
}

/* ---------------------------------------------------------- analisis ---- */

/** Benchmark IDX dengan override yang tersimpan. */
export function benchmarkData() {
     return applyBenchmarkOverrides(INDUSTRY_BENCHMARK, storage.loadBenchmarkOverrides());
}

/** Analisis lengkap memakai config aktif + benchmark + profil (sama dengan dashboard lama). */
export function analyze(borrower) {
     const config = getConfig();
     const profiles = config && config.profiles ? { ...COMPANY_PROFILES, ...config.profiles } : COMPANY_PROFILES;
     return runFullAnalysis(borrower, { config, benchmarkData: benchmarkData(), profiles });
}

/** Baseline benchmark untuk EWS (ROA p25/p10 sektor). */
export function baselineFor(sectorKey) {
     const roa = benchmarkData()?.sectors?.[sectorKey]?.benchmarks?.roa;
     return roa ? { benchmark: { roa } } : {};
}

export function evaluateEws(params, sectorKey) {
     return evaluateMonitoring(params, baselineFor(sectorKey), getConfig());
}

export function sectorOptions() {
     const list = listSectors(benchmarkData());
     return list.length ? list : SECTORS.map((s) => ({ key: s.key, label: s.label }));
}

export function sectorLabel(key) {
     const found = SECTORS.find((s) => s.key === key) || getSector(key);
     return found ? found.label : key || '—';
}

export function profileLabel(key) {
     return getProfile(key)?.label || key || '—';
}

export { PROFILE_LIST, COMPANY_PROFILES };

/* ------------------------------------------------------------- sesi ----- */

export const session = () => storage.loadSession();
export const sessionIsLender = () => isLender(storage.loadSession());

export function login(email, password) {
     const s = authenticate(effectiveUsers(storage.loadUsers()), email, password);
     if (!s) throw new Error('Email atau kata sandi salah. Periksa kembali lalu coba lagi.');
     storage.saveSession(s);
     return s;
}

/** Masuk cepat dengan akun demo sesuai peran (mode lokal). */
export function loginDemo(role) {
     const user = effectiveUsers(storage.loadUsers()).find((u) => u.role === role && u.active !== false) || DEMO_USERS.find((u) => u.role === role);
     return login(user.email, user.password);
}

export function logout() {
     storage.clearSession();
}

/** Daftar akun pemohon baru (registrasi publik hanya untuk pemohon). */
export function registerBorrower({ name, email, password }) {
     const n = String(name || '').trim();
     const e = normalizeEmail(email);
     if (!n) throw new Error('Isi nama lengkap Anda.');
     if (!/^\S+@\S+\.\S+$/.test(e)) throw new Error('Format email belum benar.');
     if (String(password || '').length < 6) throw new Error('Kata sandi minimal 6 karakter.');
     const users = effectiveUsers(storage.loadUsers());
     if (users.some((u) => normalizeEmail(u.email) === e)) throw new Error('Email sudah terdaftar. Gunakan halaman masuk atau email lain.');
     const next = [...users, { id: storage.uid('usr'), name: n, email: e, password, role: 'borrower', active: true }];
     storage.saveUsers(next);
     return login(e, password);
}

/* -------------------------------------------------------------- tim ----- */

export function teamMembers() {
     return effectiveUsers(storage.loadUsers()).filter((u) => u.role !== 'borrower');
}

export function addTeamMember({ name, email, password }) {
     const n = String(name || '').trim();
     const e = normalizeEmail(email);
     if (!n || !e || String(password || '').length < 8) throw new Error('Lengkapi nama, email, dan kata sandi minimal 8 karakter.');
     const latest = storage.loadUsers() || DEMO_USERS;
     if (latest.some((u) => normalizeEmail(u.email) === e)) throw new Error('Email sudah terdaftar.');
     storage.saveUsers([...latest, { name: n, email: e, password, role: 'lender', id: storage.uid('usr'), active: true }]);
}
