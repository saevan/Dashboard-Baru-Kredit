# MEZS.id — Dashboard Kredit (desain ulang)

Dashboard analisis pinjaman usaha untuk **orang awam**: pemilik UMKM dan petugas kredit pemula.
Hasilnya ditampilkan dengan lampu lalu lintas, peringkat gaya PEFINDO beserta artinya, dan kalimat sehari-hari.
Perhitungannya **lengkap dan identik** dengan aplikasi MEZS.id (productive-loan-analyzer).

| Yang dilihat orang awam | Yang dihitung mesin di belakang layar |
| --- | --- |
| Status: Layak / Layak dengan syarat / Perlu ditinjau / Belum layak | Keputusan 3 lapis + aturan kebijakan per profil |
| Peringkat `idAA — Sangat baik` | Skor 6 pilar → skala PEFINDO (model internal) |
| Jumlah yang aman dipinjam + saran | Rekomendasi plafon (kapasitas bayar, LTV, permintaan) |
| Cicilan per bulan & per hari kerja | Anuitas/flat, arus kas harian UMKM |
| Bintang 1–5 per bagian | Skor pilar dengan bobot profil + gap sektor IDX |
| "Jika omzet turun 20%, …" | Stress test 8 skenario |
| Daftar perbaikan | Pelanggaran aturan, integritas laporan, data kosong |
| **Lihat detail / mode Lengkap** | PD, LGD, EL/UL, bunga berbasis risiko, RAROC, ATMR, borrowing base, covenant |
| "Coba: bagaimana jika?" | Analisis ulang langsung saat jumlah, lama, atau bunga diubah |
| Daftar pinjaman: hijau / kuning / merah | EWS 20 parameter, kolektibilitas POJK 40, CKPN PSAK 71, PPKA, NPL, HHI |
| Daftar centang syarat pencairan | Syarat penarikan + borrowing base (pencairan pertama dibatasi) |
| "Yang perlu dilakukan" | Tindakan & eskalasi dari aturan judgement EWS |
| Pilihan keringanan cicilan | Restrukturisasi 3R (bunga ≥ titik impas, masa tunggu POJK 40) |

Contoh Bu Sari (Katering Dapur Sari, fiktif): skor 87,2 → **idAA — Sangat baik**, status **Perlu ditinjau**
karena cicilan Rp 400 jt memakai 63% uang usaha (batas 60%). Saran: pinjam **Rp 380 jt** → **Layak dibiayai**.

Contoh Pak Darto (Warung Bakso, fiktif): Mei **Sehat** → Juli **Waspada** (telat 9 hari) → September **Bermasalah**
(telat 45 hari, uang usaha 0,78 kali cicilan). Pilihan keringanan yang disarankan: perpanjang jadi **33 bulan**,
cicilan **Rp 7,47 jt**, uang usaha 1,23 kali cicilan.

## Dibangun ulang untuk UX yang lebih mudah

Kelengkapan dashboard lama dipertahankan; yang dipangkas adalah **langkah operasional** sehari-hari
(lihat §8 di cetak biru). Tampilan dibuat **dari nol**; logika perhitungan, teori, dan format datanya diambil utuh dari dashboard lama
(`productive-loan-analyzer`) — dashboard lama tidak diubah. Keputusan desain mengikuti 13 prinsip UX
(Next Digital) dan dicatat di [`docs/REDESIGN_UX.md`](docs/REDESIGN_UX.md).

**Pemohon** — menu: Beranda · Ajukan · Pengajuan saya
1. *Ajukan* (4 langkah, tersimpan otomatis): usaha & pinjaman (cicil **harian / mingguan / bulanan**) →
   **kirim laporan keuangan apa adanya** (PDF/Excel/CSV/foto, angka dibaca otomatis, OCR untuk foto) →
   jaminan & dokumen → periksa & kirim.
2. *Pengajuan saya*: status dengan jawaban di atas, linimasa, catatan petugas, **terima / tolak penawaran**
   lengkap dengan bunga efektif. Pemohon tidak melihat skor atau peringkat (sama seperti dashboard lama).

**Petugas** — menu: Beranda · Pengajuan · Nasabah · Portofolio · Lainnya
1. *Beranda*: tugas berikutnya per prioritas (audit, analisis, pencairan, menunggu pemohon) + kesehatan pinjaman.
2. *Pengajuan → Tinjau* dalam **satu halaman kerja**: Dokumen · Audit keuangan (2 butir otomatis) · Agunan · Wawancara
   (skala 5 tingkat), tombol "tandai semua" per bagian, progres langsung, tombol **Berikutnya →** → Hasil & keputusan. Hasil tidak muncul sebelum audit diverifikasi; audit belum lengkap wajib justifikasi.
   Penawaran flat / bagi hasil dengan pemeriksaan otomatis; di luar batas → keputusan manual beralasan.
3. *Nasabah → Pemantauan bulanan*: semua pinjaman berjalan dalam satu tabel, isian awal = bulan lalu, **Simpan semua**.
   *Nasabah*: satu halaman per nasabah — Ringkasan · Analisis · Fasilitas & pemantauan (syarat pencairan,
   cairkan, pemantauan bulanan 20 parameter, keringanan 3R, covenant) · Simulasi bagaimana-jika.
4. *Portofolio*: mode Sederhana / Lengkap (NPL, CKPN PSAK 71, PPKA, ATMR, konsentrasi, migrasi).
5. *Lainnya*: Analisis manual, Panduan 5C, Pengaturan (dengan pratinjau dampak + statistik penggunaan lokal), Tim.

Umum: pencarian cepat nasabah/pengajuan, breadcrumb, mode gelap, navigasi bawah di HP, konfirmasi di halaman,
toast untuk setiap aksi. Akun contoh: `umkm@demo.id` / `umkm123`, `admin@demo.id` / `admin123`,
atau tombol "Coba sebagai …" di halaman masuk. "Muat data contoh" mengisi pengajuan Bu Sari & pinjaman Pak Darto.

Data tersimpan di browser (mode lokal, kunci `pla.*` sama dengan dashboard lama — cadangan JSON lama bisa diimpor).

## Menjalankan

```bash
npm run serve        # lalu buka http://localhost:8765
npm test             # tes mesin dari repo asal + tes tampilan sederhana; Node ≥ 22.5
```

Tanpa build dan tanpa dependency.

## Deploy

- **GitHub Pages:** workflow `.github/workflows/pages.yml` menjalankan tes lalu men-deploy setiap push.
  Aktifkan sekali di *Settings → Pages → Build and deployment → Source: GitHub Actions*.
- **Vercel / Netlify:** impor repo, tanpa build command, output directory = root.
- Di dalam frame (mis. Artifact claude.ai) cadangan disalin ke papan klip karena host memblokir unduhan,
  dan OCR foto tidak tersedia (data bahasa OCR diunduh dari host yang diblokir). CSV, Excel, dan PDF berteks tetap terbaca.

## Struktur

```
index.html                  halaman tunggal
src/core/  src/data/  src/utils/   mesin, penyimpanan, format — disalin utuh dari dashboard lama, JANGAN diubah di sini
src/services/               logika yang dulu tertanam di tampilan lama, dipindahkan tanpa mengubah aturan
  core.js                   konfigurasi, analisis, sesi, tim
  applications.js           pengajuan: draf, lampiran, isi otomatis, kirim, audit, nilai, penawaran
  portfolio.js              nasabah, fasilitas, pemantauan, 3R, portofolio, cadangan
  simulation.js · plain.js · labels.js · demo.js
src/app/                    tampilan baru
  main.js                   rute, menu per peran, breadcrumb, pencarian, mode gelap
  ui.js · widgets.js · result.js · styles.css
  pages/                    public · borrower · lender · customers · more
tests/core/                 tes mesin dari repo asal
tests/services.test.js      alur penuh lapisan layanan (Bu Sari 87,2 → idAA; Pak Darto)
docs/REDESIGN_UX.md         cetak biru desain ulang
```

## Menyelaraskan mesin

**Perbedaan sengaja dari repo asal** (pertahankan saat menyalin ulang):
- `src/core/intake-config.js` — sumber verifikasi wajib baru **Surat keterangan bank** (validasi rekening koran, bobot 1).
  Rekening koran baru bisa ditandai terverifikasi setelah surat ini terverifikasi (`src/services/applications.js`).
  Tes terkait: `tests/core/confidence.test.js`, `tests/services.test.js`.

`src/core/` adalah salinan dari `productive-loan-analyzer/src/core`. Bila mesin di repo asal berubah,
salin ulang folder itu beserta `tests/core/`, lalu jalankan `npm test`. Tes `tests/services.test.js`
memastikan angka Bu Sari tetap sama dengan kompendium.

Catatan: peringkat adalah model internal MEZS.id, bukan rating resmi PEFINDO. Data demo fiktif.
