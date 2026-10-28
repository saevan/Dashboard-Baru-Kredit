/** Penugasan operasional; tidak mengubah keputusan kredit atau sinyal EWS. */
export function localDay(now = Date.now()) {
     const d = new Date(now);
     return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function workAttention(work = {}, now = Date.now(), completed = false) {
     if (completed || work.status === 'resolved') return 'closed';
     if (work.due_date && work.due_date < localDay(now)) return 'overdue';
     if (work.blocker) return 'blocked';
     if (work.due_date === localDay(now)) return 'today';
     if (!work.assignee_id) return 'unassigned';
     return 'scheduled';
}
export const ATTENTION_LABEL = { closed: 'Selesai', overdue: 'Lewat tenggat', blocked: 'Terhambat', today: 'Jatuh tempo hari ini', unassigned: 'Belum ditugaskan', scheduled: 'Terjadwal' };

export function updateWork(previous = {}, input = {}, { members = [], actor = {}, kind, now = new Date().toISOString() } = {}) {
     if (!['application', 'monitoring'].includes(kind)) throw new Error('Jenis pekerjaan tidak valid');
     if (!Number.isInteger(input.version) || input.version !== (previous.version || 0)) throw new Error('Pekerjaan sudah berubah. Muat ulang sebelum menyimpan.');
     const text = (key, limit) => {
          const value = String(input[key] ?? '').trim();
          if (value.length > limit) throw new Error(`Isian ${key} terlalu panjang (maksimal ${limit} karakter)`);
          return value;
     };
     const assignee_id = text('assignee_id', 200);
     const member = members.find((m) => m.id === assignee_id);
     if (assignee_id && !member) throw new Error('Pilih penanggung jawab aktif yang tersedia');
     const due_date = text('due_date', 10);
     if (due_date && (!/^\d{4}-\d{2}-\d{2}$/.test(due_date) || !Number.isFinite(Date.parse(due_date)) || new Date(due_date).toISOString().slice(0, 10) !== due_date)) throw new Error('Tanggal tenggat tidak valid');
     const status = input.status || 'open';
     if (!['open', 'resolved'].includes(status) || kind === 'application' && status !== 'open') throw new Error('Status tindak lanjut tidak valid');
     const note = text('note', 2000);
     const blocker = text('blocker', 1000);
     if (status === 'resolved' && !note) throw new Error('Catatan hasil wajib diisi untuk menyelesaikan tindak lanjut');
     if (status === 'resolved' && blocker) throw new Error('Hapus hambatan setelah ditangani sebelum menutup tindak lanjut');
     if (!['normal', 'high'].includes(input.priority || 'normal')) throw new Error('Prioritas tidak valid');
     const next = { assignee_id, assignee_name: member?.name || member?.email || '', due_date, blocker, note,
          priority: input.priority || 'normal', status, version: (previous.version || 0) + 1, updated_at: now,
          updated_by: actor.name || actor.email || actor.id || 'Pengguna', resolved_at: status === 'resolved' ? now : null };
     return { ...next, history: [...(previous.history || []), { ...next }] };
}

export function matchesWork(work = {}, filter = '', actorId = '', completed = false) {
     if (!filter) return true;
     const attention = workAttention(work, Date.now(), completed);
     if (filter === 'mine') return !!actorId && work.assignee_id === actorId && attention !== 'closed';
     if (filter === 'unassigned') return !work.assignee_id && attention !== 'closed';
     if (filter === 'today') return work.due_date === localDay() && attention !== 'closed';
     if (filter === 'blocked') return !!work.blocker && attention !== 'closed';
     return attention === filter;
}
