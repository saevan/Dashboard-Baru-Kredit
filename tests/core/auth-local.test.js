/**
 * tests/auth-local.test.js — Autentikasi lokal (mode tanpa backend).
 *
 * Menguji: akun demo, verifikasi kredensial (case-insensitive), peran
 * lender/borrower, label ramah, dan rute beranda per peran.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
     ROLES,
     ROLE_LABEL,
     DEMO_USERS,
     normalizeEmail,
     effectiveUsers,
     authenticate,
     isLender,
     roleLabel,
     homeRoute
} from '../../src/core/auth-local.js';

test('auth-local: dua akun demo dengan peran berbeda', () => {
     assert.equal(DEMO_USERS.length, 2);
     assert.deepEqual(
          DEMO_USERS.map((u) => u.role).sort(),
          ['borrower', 'lender'],
          'harus ada tepat satu lender dan satu borrower'
     );
     assert.deepEqual([...ROLES].sort(), ['borrower', 'lender']);
     assert.equal(ROLE_LABEL.lender, 'Admin / Lender');
     assert.equal(ROLE_LABEL.borrower, 'Pemohon / Borrower');
});

test('auth-local: normalizeEmail trim + lowercase, tahan nilai kosong', () => {
     assert.equal(normalizeEmail('  ADMIN@Demo.ID '), 'admin@demo.id');
     assert.equal(normalizeEmail(null), '');
     assert.equal(normalizeEmail(undefined), '');
     assert.equal(normalizeEmail(123), '123');
});

test('auth-local: effectiveUsers memakai akun demo bila daftar kosong', () => {
     assert.equal(effectiveUsers(null).length, 2);
     assert.equal(effectiveUsers([]).length, 2);
     const custom = [{ id: 'x', email: 'x@y.z', password: 'p', role: 'lender' }];
     assert.equal(effectiveUsers(custom)[0].id, 'x', 'daftar tersimpan harus dipakai bila ada');
});

test('auth-local: authenticate valid → sesi tanpa password', () => {
     const s = authenticate(DEMO_USERS, 'admin@demo.id', 'admin123');
     assert.ok(s, 'kredensial benar harus berhasil');
     assert.equal(s.user_id, 'usr_admin');
     assert.equal(s.role, 'lender');
     assert.equal(s.email, 'admin@demo.id');
     assert.ok(!('password' in s), 'objek sesi tidak boleh membawa password');
     assert.ok(typeof s.login_at === 'string' && s.login_at.length > 0, 'login_at harus terisi');
});

test('auth-local: login case-insensitive pada email', () => {
     const s = authenticate(DEMO_USERS, 'UMKM@Demo.id', 'umkm123');
     assert.ok(s);
     assert.equal(s.role, 'borrower');
     assert.equal(s.user_id, 'usr_umkm');
});

test('auth-local: kredensial salah / email tak dikenal → null', () => {
     assert.equal(authenticate(DEMO_USERS, 'admin@demo.id', 'salah'), null);
     assert.equal(authenticate(DEMO_USERS, 'tidak@ada.id', 'admin123'), null);
     assert.equal(authenticate(DEMO_USERS, 'admin@demo.id', ''), null);
     assert.equal(authenticate(DEMO_USERS, '', ''), null);
});

test('auth-local: isLender benar untuk lender, salah untuk borrower & null', () => {
     assert.equal(isLender({ role: 'lender' }), true);
     assert.equal(isLender({ role: 'borrower' }), false);
     assert.equal(isLender(null), false);
});

test('auth-local: roleLabel & homeRoute mengikuti peran', () => {
     assert.equal(roleLabel('lender'), 'Admin / Lender');
     assert.equal(roleLabel('borrower'), 'Pemohon / Borrower');
     assert.equal(roleLabel('apa pun'), 'Pemohon / Borrower', 'peran tak dikenal → borrower');
     assert.equal(homeRoute({ role: 'lender' }), '#/dashboard');
     assert.equal(homeRoute({ role: 'borrower' }), '#/my');
     assert.equal(homeRoute(null), '#/my', 'tanpa sesi bukan lender → beranda pemohon');
});
