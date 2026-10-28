/** Ringkasan operasional dari bukti yang tersedia, tanpa merekayasa riwayat. */
import { workAttention } from './work-items.js';

export function priorityReasons(app, now = Date.now()) {
     const reasons = [];
     if (app.task?.owner === 'none') return reasons;
     const work = app.work || {};
     const attention = workAttention(work, now);
     if (attention === 'overdue') reasons.push(`Target ${work.due_date} terlewati`);
     if (work.blocker) reasons.push(`Terhambat: ${work.blocker}`);
     if (attention === 'today') reasons.push('Target selesai hari ini');
     if (work.priority === 'high') reasons.push('Prioritas tinggi ditetapkan tim');
     if (app.status === 'offered') {
          const expiry = Date.parse(app.offer?.expires_at);
          if (Number.isFinite(expiry) && expiry < now) reasons.push('Penawaran kedaluwarsa');
          else if (Number.isFinite(expiry) && expiry - now <= 2 * 86400000) reasons.push('Penawaran berakhir dalam 2 hari');
     }
     if (!work.assignee_id) reasons.push('Belum ada penanggung jawab');
     return reasons;
}

const eventTo = (e) => e.to_status || e.to;
const eventFrom = (e) => e.from_status || e.from;
export function processMetrics(applications = []) {
     const stages = { submitted: [], need_fix: [], verified: [], scored: [], offered: [] };
     let withHistory = 0; let returned = 0;
     for (const app of applications) {
          const events = (app.events || []).filter((e) => Number.isFinite(Date.parse(e.at)) && Date.parse(e.at) <= Date.now() && eventTo(e) && eventTo(e) !== eventFrom(e)).slice().sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
          if (events.length) withHistory++;
          if (events.some((e) => eventTo(e) === 'need_fix')) returned++;
          let entered = null;
          for (const event of events) {
               if (entered && eventFrom(event) === eventTo(entered) && stages[eventFrom(event)]) {
                    const elapsed = (Date.parse(event.at) - Date.parse(entered.at)) / 86400000;
                    if (elapsed >= 0) stages[eventFrom(event)].push(elapsed);
               }
               entered = event;
          }
     }
     return { total: applications.length, withHistory, returned,
          stages: Object.entries(stages).map(([key, values]) => {
               values.sort((a, b) => a - b); const n = values.length;
               return { key, samples: n, medianDays: n ? (values[Math.floor((n - 1) / 2)] + values[Math.floor(n / 2)]) / 2 : null };
          }) };
}

export function dashboardSnapshot(data) {
     const items = {};
     for (const a of data.applications || []) {
          const work = data.work_items?.[`application:${a.id}`] || {};
          items[`application:${a.id}`] = { id: a.id, kind: 'application', name: a.borrower?.nama || a.payload?.borrower?.nama || a.applicant?.name || a.id,
               status: a.status || 'draft', assignment: work.assignee_id || '', version: work.version || 0,
               documents: JSON.stringify((a.documents || []).map((d) => [d.id, d.verified, d.verified_at]).sort((a, b) => String(a[0]).localeCompare(String(b[0])))) };
     }
     const latest = new Map();
     for (const m of data.monitoring || []) {
          const at = Date.parse(m.created_at || m.tanggal);
          if (Number.isFinite(at) && (!latest.has(m.borrower_id) || at >= latest.get(m.borrower_id).at)) latest.set(m.borrower_id, { at, level: m.ews_level });
     }
     for (const b of data.borrowers || []) {
          const work = data.work_items?.[`monitoring:${b.id}`] || {};
          const m = latest.get(b.id);
          if (m || work.version) items[`monitoring:${b.id}`] = { id: b.id, kind: 'monitoring', name: b.nama || b.id, at: m?.at || 0, level: m?.level || '', version: work.version || 0 };
     }
     return items;
}
export function snapshotChanges(previous, current) {
     if (!previous) return [];
     return Object.entries(current).flatMap(([key, item]) => {
          const old = previous[key]; const reasons = [];
          if (!old) reasons.push(item.kind === 'application' ? 'Pengajuan baru' : 'Monitoring / tindak lanjut baru');
          else if (item.kind === 'application') {
               if (old.status !== item.status) reasons.push('Status pengajuan berubah');
               if (old.assignment !== item.assignment) reasons.push('Penanggung jawab berubah');
               else if (old.version !== item.version) reasons.push('Pekerjaan diperbarui');
               if (old.documents !== item.documents) reasons.push('Dokumen / verifikasi berubah');
          } else {
               if (old.at !== item.at || old.level !== item.level) reasons.push('Monitoring diperbarui');
               if (old.version !== item.version) reasons.push('Tindak lanjut diperbarui');
          }
          return reasons.length ? [{ ...item, reasons }] : [];
     });
}
