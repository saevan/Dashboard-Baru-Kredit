import { myApplication } from './applicant-local.js';
import { getBorrower, getDocumentsForBorrower, loadSession } from './storage.js';

// Binary content lives outside localStorage; never pretend a failed write succeeded.
async function database() {
     if (!globalThis.indexedDB) throw new Error('Penyimpanan berkas tidak tersedia di browser ini.');
     return new Promise((resolve, reject) => {
          const request = indexedDB.open('pla-attachments-v1', 1);
          request.onupgradeneeded = () => request.result.createObjectStore('files');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(new Error('Penyimpanan berkas tidak dapat dibuka.'));
     });
}
async function transaction(mode, action) {
     const db = await database();
     try {
          return await new Promise((resolve, reject) => {
               const tx = db.transaction('files', mode);
               const request = action(tx.objectStore('files'));
               tx.oncomplete = () => resolve(request.result);
               tx.onabort = tx.onerror = () => reject(new Error('Berkas gagal disimpan/dibaca. Periksa ruang penyimpanan browser.'));
          });
     } finally { db.close(); }
}
function accessible(applicationId, editable = false) {
     const app = myApplication(applicationId);
     if (!app) throw new Error('Pengajuan tidak ditemukan.');
     if (editable && !['draft', 'need_fix'].includes(app.status)) throw new Error('Berkas hanya dapat diubah pada draf atau pengajuan yang diminta perbaikan.');
     return app;
}
export async function saveLocalFile(applicationId, docId, bytes) {
     accessible(applicationId, true);
     return transaction('readwrite', store => store.put(bytes, `${applicationId}:${docId}`));
}
export async function readLocalFile(applicationId, docId) {
     const app = accessible(applicationId);
     if (!app.documents?.some(d => d.id === docId && d.has_file)) throw new Error('Lampiran tidak ditemukan.');
     const bytes = await transaction('readonly', store => store.get(`${applicationId}:${docId}`));
     accessible(applicationId);
     if (!bytes) throw new Error('Berkas tidak ada di browser ini. Minta pemohon melampirkan ulang.');
     return bytes;
}
export async function removeLocalFile(applicationId, docId) {
     accessible(applicationId, true);
     return transaction('readwrite', store => store.delete(`${applicationId}:${docId}`));
}

function facilityAccess(id, write = false) {
     const role = loadSession()?.role;
     if (!(write ? ['lender', 'admin', 'analyst'] : ['lender', 'admin', 'analyst', 'checker', 'viewer']).includes(role) || !getBorrower(id)) throw new Error('Akses dokumen fasilitas tidak diizinkan.');
}
export async function saveFacilityFile(id, docId, bytes) {
     facilityAccess(id, true);
     return transaction('readwrite', store => store.put(bytes, `facility:${id}:${docId}`));
}
export async function readFacilityFile(id, docId) {
     facilityAccess(id);
     if (!getDocumentsForBorrower(id).some(d => d.id === docId && d.has_file)) throw new Error('Berkas tidak ditemukan.');
     const bytes = await transaction('readonly', store => store.get(`facility:${id}:${docId}`));
     facilityAccess(id);
     if (!bytes) throw new Error('Berkas tidak tersedia di browser ini. Lampirkan ulang berkas.');
     return bytes;
}
export async function removeFacilityFile(id, docId) {
     facilityAccess(id, true);
     return transaction('readwrite', store => store.delete(`facility:${id}:${docId}`));
}

export async function clearAttachmentStorage() {
     if (!globalThis.indexedDB) return;
     return new Promise((resolve, reject) => {
          const request = indexedDB.deleteDatabase('pla-attachments-v1');
          request.onsuccess = () => resolve();
          request.onerror = request.onblocked = () => reject(new Error('Berkas belum dapat dihapus. Tutup tab aplikasi lain lalu coba lagi.'));
     });
}
