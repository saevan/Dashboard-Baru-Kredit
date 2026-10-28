import { effectiveUsers } from '../core/auth-local.js';
import { loadUsers, loadSession, getApplication, upsertApplication } from './storage.js';

export function borrowerAccounts() {
     return effectiveUsers(loadUsers()).filter(u => u.role === 'borrower' && u.active !== false)
          .map(({id,name,email}) => ({id,name,email}));
}

/** Ownerless legacy applications retain their original demo borrower, never the current lender. */
export function applicationRecipient(app) {
     const id = app?.applicant_id || 'usr_umkm';
     const account = borrowerAccounts().find(u => u.id === id);
     return { id, valid:!!account, name:account?.name || '', email:account?.email || '' };
}

/** Repair only unresolvable recipients, explicitly chosen by a lender; no silent reassignment. */
export function repairApplicationRecipient(id, recipientId) {
     const session = loadSession();
     if (!session || !['lender','admin'].includes(session.role)) throw new Error('Hanya lender yang dapat memperbaiki penerima.');
     const app = getApplication(id);
     if (!app) throw new Error('Pengajuan tidak ditemukan.');
     if (!['draft','need_fix','submitted','verified','scored','offered'].includes(app.status)) throw new Error('Penerima pengajuan yang sudah selesai tidak dapat diubah.');
     if (applicationRecipient(app).valid) throw new Error('Pengajuan sudah terhubung ke akun borrower yang valid. Penerima tidak diubah.');
     const recipient = borrowerAccounts().find(u => u.id === recipientId);
     if (!recipient) throw new Error('Pilih akun borrower penerima yang terdaftar.');
     return upsertApplication({...app,applicant_id:recipient.id,events:[...(app.events || []),{
          action:'recipient_repaired',from:app.status,to:app.status,at:new Date().toISOString(),
          actor:session.user_id || session.id,previous_applicant_id:app.applicant_id || null,applicant_id:recipient.id,
          note:`Penerima diperbaiki ke ${recipient.email}. Syarat penawaran tidak berubah.`
     }]});
}
