import { loadApplications, getApplication, loadSession, loadBorrowers } from './storage.js';
/** Legacy ownerless records belong to the original demo borrower only. */
export function ownsApplication(app, session = loadSession()) {
     if (!app || !session) return false;
     if (session.role !== 'borrower') return true;
     const id = session.user_id || session.id;
     return app.applicant_id ? app.applicant_id === id : id === 'usr_umkm';
}
function withFacility(app) {
     const facility = loadBorrowers().find(b => b.id === app.borrower_id || b.application_id === app.id);
     return { ...app, facility_summary: facility ? { status: facility.facility_status, disbursed_at: facility.disbursed_at || null } : null };
}
export function myApplications() { return loadApplications().filter(app => ownsApplication(app)).map(withFacility); }
export function myApplication(id) { const app = getApplication(id); return ownsApplication(app) ? withFacility(app) : null; }
