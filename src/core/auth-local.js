/**
 * core/auth-local.js — Autentikasi lokal (mode tanpa backend).
 *
 * Menentukan peran pengguna dari kredensial: **lender/admin** vs
 * **borrower/pemohon**. Dipakai saat aplikasi berjalan di mode lokal
 * (localStorage) agar pengalaman dua peran tetap dapat disimulasikan.
 *
 * Murni & deterministik; TIDAK menyentuh DOM maupun storage secara langsung
 * (daftar pengguna disuntikkan oleh pemanggil / dibaca dari data/storage.js).
 */

/** Peran yang dikenal. */
export const ROLES = ['lender', 'borrower'];

/** Label ramah untuk tiap peran. */
export const ROLE_LABEL = {
     lender: 'Admin / Lender',
     borrower: 'Pemohon / Borrower'
};

/**
 * Akun demo bawaan (dipakai bila storage belum memiliki daftar pengguna).
 * Kredensial ini sengaja ditampilkan di layar login agar mudah disimulasikan.
 */
export const DEMO_USERS = [
     {
          id: 'usr_admin',
          email: 'admin@demo.id',
          password: 'admin123',
          name: 'Admin Lender',
          role: 'lender',
          jabatan: 'Analis Kredit'
     },
     {
          id: 'usr_umkm',
          email: 'umkm@demo.id',
          password: 'umkm123',
          name: 'Pemohon UMKM',
          role: 'borrower',
          jabatan: 'Pemilik Usaha'
     }
];

/** Normalisasi email (trim + lowercase). */
export function normalizeEmail(value) {
     return String(value === null || value === undefined ? '' : value)
          .trim()
          .toLowerCase();
}

/** Daftar pengguna efektif: pakai daftar tersimpan bila ada, jika tidak akun demo. */
export function effectiveUsers(users) {
     return Array.isArray(users) && users.length ? users : DEMO_USERS;
}

/**
 * Verifikasi kredensial dan kembalikan objek sesi (tanpa password) bila valid.
 * @param {Array} users — daftar pengguna (boleh null → pakai akun demo)
 * @param {string} email
 * @param {string} password
 * @returns {{user_id:string,email:string,name:string,role:string,jabatan:string,login_at:string}|null}
 */
export function authenticate(users, email, password) {
     const list = effectiveUsers(users);
     const target = normalizeEmail(email);
     const found = list.find((u) => normalizeEmail(u.email) === target);
     if (!found) return null;
     const given = String(password === null || password === undefined ? '' : password);
     if (String(found.password) !== given) return null;
     return {
          user_id: found.id,
          email: found.email,
          name: found.name || found.email,
          role: ROLES.includes(found.role) ? found.role : 'lender',
          jabatan: found.jabatan || '',
          login_at: new Date().toISOString()
     };
}

/** True bila sesi adalah lender/admin (termasuk undefined → anggap internal). */
export function isLender(session) {
     return !!session && session.role !== 'borrower';
}

/** Label ramah sebuah peran. */
export function roleLabel(role) {
     return ROLE_LABEL[role] || ROLE_LABEL.borrower;
}

/** Rute beranda sesuai peran. */
export function homeRoute(session) {
     return isLender(session) ? '#/dashboard' : '#/my';
}

export default {
     ROLES,
     ROLE_LABEL,
     DEMO_USERS,
     normalizeEmail,
     effectiveUsers,
     authenticate,
     isLender,
     roleLabel,
     homeRoute
};
