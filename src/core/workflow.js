/**
 * core/workflow.js — Tahap operasional, prioritas antrean, dan cakupan monitoring.
 * Rekomendasi model tidak dianggap sebagai keputusan lender atau pencairan.
 */
import { matchesWork, workAttention } from './work-items.js';
import { APPLICATION_STATUS_LABEL } from './intake-config.js';
import { classifyFacility, normalizeCollectibility, applyObligorContagion } from './portfolio.js';

export function applicationTask(app, borrowers = []) {
     const linked = borrowers.find((b) => b.id === app.borrower_id || b.application_id === app.id);
     if (linked && ['aktif', 'lunas'].includes(linked.facility_status)) {
          return { owner: 'none', label: linked.facility_status === 'aktif' ? 'Sudah dicairkan' : 'Lunas', stage: 'disbursed', href: `#/borrower/${encodeURIComponent(linked.id)}` };
     }
     if (app.recipient?.valid === false && ['draft','need_fix','submitted','verified','scored','offered'].includes(app.status)) {
          return {owner:'lender',label:'Perbaiki akun borrower penerima',stage:app.status,recipient_blocked:true,href:`#/applications/${encodeURIComponent(app.id)}`};
     }
     const next = {
          submitted: ['lender', 'Verifikasi dan audit'], verified: ['lender', 'Jalankan skoring'],
          scored: ['lender', 'Tinjau hasil dan penawaran'], offered: ['borrower', 'Menunggu respons pemohon'],
          draft: ['borrower', 'Lengkapi draf'], need_fix: ['borrower', 'Perbaiki data'],
          accepted: ['lender', linked ? 'Catat pencairan' : 'Siapkan fasilitas']
     };
     if (app.status === 'decided' && ['LAYAK', 'LAYAK_BERSYARAT', 'DISETUJUI'].includes(app.decision)) {
          next.decided = ['lender', linked ? 'Catat pencairan' : 'Siapkan fasilitas'];
     }
     const [owner, label] = next[app.status] || ['none', 'Arsip'];
     return { owner, label, stage: app.status || 'draft', href: linked && owner === 'lender' && ['accepted', 'decided'].includes(app.status)
          ? `#/borrower/${encodeURIComponent(linked.id)}` : `#/applications/${encodeURIComponent(app.id)}` };
}

/** Lama tahap dihitung dari transisi terakhir ke status saat ini, bukan aktivitas di tahap yang sama. */
export function queueRows(applications, borrowers = [], now = Date.now(), workItems = {}) {
     const linked = new Map();
     for (const b of borrowers) { linked.set(b.id, b); if (b.application_id) linked.set(b.application_id, b); }
     return applications.map((a) => {
          const events = a.events || [];
          const entered = events.findLast((event) => {
               const from = event.from_status || event.from;
               const to = event.to_status || event.to;
               return to === (a.status || 'draft') && to !== from;
          })?.at || a.created_at || a.updated_at;
          const stamp = Date.parse(entered);
          return { ...a, work: workItems[`application:${a.id}`] || a.work || {}, task: applicationTask(a, [linked.get(a.borrower_id) || linked.get(a.id)].filter(Boolean)),
               age_days: Number.isFinite(stamp) ? Math.max(0, Math.floor((now - stamp) / 86400000)) : null };
     });
}

export const WORK_FOCUS = [
     { key: 'review', label: 'Audit data', hint: 'Pengajuan masuk untuk diverifikasi' },
     { key: 'analysis', label: 'Analisis & keputusan', hint: 'Jalankan skor atau tinjau hasil' },
     { key: 'funding', label: 'Persiapan pencairan', hint: 'Siapkan fasilitas dan catat pencairan' },
     { key: 'waiting', label: 'Menunggu pemohon', hint: 'Kelengkapan data atau respons penawaran' }
];

export function workFocus(row) {
     if (row.task.recipient_blocked) return 'review';
     if (row.task.owner === 'borrower') return 'waiting';
     if (row.task.owner !== 'lender') return 'archive';
     if (row.task.stage === 'submitted') return 'review';
     if (['verified', 'scored'].includes(row.task.stage)) return 'analysis';
     return 'funding';
}

export function selectQueue(rows, { desk = 'all', status = '', scope = '', focus = '', work = '', actorId = '', q = '', sort = 'oldest', page = 1, pageSize = 25 } = {}) {
     const needle = q.trim().toLowerCase();
     const filtered = rows.filter((a) => (desk === 'checker' ? a.status === 'scored' : desk === 'analyst' ? ['submitted', 'verified', 'need_fix'].includes(a.status) : true) && (!status || a.task.stage === status) && (!scope || a.task.owner === scope) && (!focus || workFocus(a) === focus) && matchesWork(a.work, work, actorId, a.task.owner === 'none') &&
          (!needle || [a.id, a.borrower?.nama, a.payload?.borrower?.nama, a.applicant?.name, a.applicant?.email].join(' ').toLowerCase().includes(needle)));
     const priorityRank = (a) => {
          const rank = ({ overdue: 0, blocked: 1, today: 2, unassigned: 4, scheduled: 5, closed: 6 })[workAttention(a.work, Date.now(), a.task.owner === 'none')];
          const expiry = Date.parse(a.offer?.expires_at);
          const expiring = a.status === 'offered' && Number.isFinite(expiry) && expiry - Date.now() <= 2 * 86400000;
          return rank >= 4 && rank < 6 && (a.work?.priority === 'high' || expiring) ? 3 : rank;
     };
     filtered.sort((a, b) => sort === 'priority' ? priorityRank(a) - priorityRank(b) || Number(b.work?.priority === 'high') - Number(a.work?.priority === 'high') || (b.age_days ?? -1) - (a.age_days ?? -1) : sort === 'newest' ? String(b.updated_at || '').localeCompare(String(a.updated_at || ''))
          : (b.age_days ?? -1) - (a.age_days ?? -1) || String(a.id).localeCompare(String(b.id)));
     const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
     const current = Math.min(pages, Math.max(1, Number(page) || 1));
     return { items: filtered.slice((current - 1) * pageSize, current * pageSize), total: filtered.length, page: current, pages };
}

export function applicationPipeline(rows) {
     const labels = { ...APPLICATION_STATUS_LABEL, disbursed: 'Sudah dicairkan / lunas' };
     return Object.entries(labels).map(([key, label]) => ({ key, label,
          count: rows.filter((a) => a.task.stage === key).length }));
}

/** Fenomena belum dimonitor/kedaluwarsa berbeda dari hasil NORMAL. */
export function monitoringSummary(rows, config, { now = Date.now(), maxAgeDays = 30 } = {}) {
     const rank = { CRITICAL: 0, WARNING: 1, WATCH: 2, UNKNOWN: 3, NORMAL: 4 };
     let items = rows.map((row) => {
          const f = classifyFacility(row, config);
          const last = row.monitoring?.at(-1);
          const stamp = Date.parse(last?.created_at || last?.tanggal || '');
          const rawDays = row.borrower?.days_late ?? last?.params?.p11 ?? last?.params?.P11 ?? last?.params?.P11_days_late ?? last?.params?.days_late;
          const daysKnown = rawDays !== null && rawDays !== undefined && String(rawDays).trim() !== '' && Number.isFinite(Number(rawDays)) && Number(rawDays) >= 0;
          const collectibilityKnown = !!normalizeCollectibility(last?.collectibility) || daysKnown;
          const loss = row.analysis?.credit?.loss?.el_amount;
          const analysisKnown = loss !== null && loss !== undefined && Number.isFinite(Number(loss));
          const known = !!last && ['NORMAL', 'WATCH', 'WARNING', 'CRITICAL'].includes(last.ews_level);
          const fresh = known && Number.isFinite(stamp) && stamp <= now && now - stamp <= maxAgeDays * 86400000;
          return { ...f, collectibility_known: collectibilityKnown, analysis_known: analysisKnown, level: known ? last.ews_level : 'UNKNOWN', fresh, monitored_at: Number.isFinite(stamp) ? new Date(stamp).toISOString() : null,
               monitoring_status: !known ? 'Belum dimonitor' : !fresh ? 'Monitoring perlu diperbarui' : 'Monitoring mutakhir' };
     }).filter((f) => f.status === 'aktif' && f.outstanding > 0);
     // Satu debitur, satu kolektibilitas: fasilitas lain ikut kualitas terburuk (POJK 40).
     items = applyObligorContagion(items, config);
     items.sort((a, b) => rank[a.level] - rank[b.level] || Number(a.fresh) - Number(b.fresh) || b.outstanding - a.outstanding);
     const freshCount = items.filter((f) => f.fresh).length;
     const atRisk = items.filter((f) => ['WATCH', 'WARNING', 'CRITICAL'].includes(f.level) || f.collectibility !== 'lancar');
     return { items, unknown_collectibility: items.filter((f) => !f.collectibility_known).length,
          unknown_exposure: items.filter((f) => !f.collectibility_known).reduce((n, f) => n + f.outstanding, 0),
          analysis_count: items.filter((f) => f.analysis_known).length, fresh: freshCount, overdue: items.length - freshCount, total: items.length,
          coverage: items.length ? freshCount / items.length : null,
          risk_exposure: atRisk.reduce((n, f) => n + f.outstanding, 0), risk_count: atRisk.length };
}
