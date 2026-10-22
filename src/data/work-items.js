import { loadUsers, loadSession, loadWorkItems, writeWorkItems } from './storage.js';
import { DEMO_USERS } from '../core/auth-local.js';
import { updateWork } from '../core/work-items.js';
export { loadWorkItems };
export function localMembers() {
     const users = (loadUsers() || DEMO_USERS).filter((u) => u.role !== 'borrower' && u.active !== false);
     const session = loadSession();
     if (session && session.role !== 'borrower' && !users.some((u) => u.id === (session.id || session.user_id))) users.push({ ...session, id: session.id || session.user_id });
     return users.map(({ id, name, email }) => ({ id, name, email })).filter((u) => u.id);
}
export function saveWorkItem(kind, id, input) {
     const session = loadSession();
     if (!session || session.role === 'borrower') throw new Error('Masuk sebagai lender untuk mengatur pekerjaan');
     const all = loadWorkItems(); const key = `${kind}:${id}`;
     const next = updateWork(all[key], input, { members: localMembers(), actor: session, kind });
     all[key] = next;
     writeWorkItems(all);
     return next;
}
