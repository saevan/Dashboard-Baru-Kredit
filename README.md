# Dashboard Kredit Sederhana — MEZS.id

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

## Alur

1. **Ajukan** — formulir 5 langkah (atau "Isi contoh Bu Sari") → kartu hasil + simulasi → *Simpan ke daftar pinjaman*.
2. **Keputusan** — petugas menyetujui jumlah (bawaan: jumlah aman) atau menolak dengan alasan.
3. **Pencairan** — centang syarat; tombol *Cairkan* aktif hanya bila syarat wajib lengkap.
4. **Pemantauan** — catat tiap bulan (7 isian sederhana, 20 parameter di mode Lengkap) → lampu, alasan, tindakan.
5. **Keringanan** — muncul otomatis saat lampu kuning/merah; petugas memilih dan menerapkan.

Data tersimpan di browser (localStorage). Gunakan *Unduh cadangan* / *Pulihkan dari cadangan* di Daftar pinjaman.

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
- Di dalam frame (mis. Artifact claude.ai) tombol Cetak disembunyikan dan cadangan disalin ke papan klip,
  karena host memblokir dialog, cetak, dan unduhan.

## Struktur

```
index.html              halaman tunggal
src/core/               mesin hitung MEZS.id — disalin utuh, JANGAN diubah di sini
src/data/               benchmark sektor IDX & profil perusahaan
src/simple/             lapisan baru:
  analyze.js            memanggil mesin (+ uji ulang pada jumlah saran)
  translate.js          hasil mesin → status, peringkat, bintang, kalimat (tanpa hitung ulang)
  form-schema.js        formulir 5 langkah dalam bahasa sehari-hari
  loans.js              siklus pinjaman: keputusan, pencairan, pemantauan, keringanan, portofolio
  demo.js               kasus Bu Sari & Pak Darto
src/ui/app.js           navigasi, formulir, kartu hasil, simulasi, penyimpanan
src/ui/loans-view.js    daftar pinjaman & detail pinjaman
tests/core/             tes mesin dari repo asal
tests/simple.test.js    tes penerjemah, termasuk "hasil tetap sama"
tests/loans.test.js     tes siklus pinjaman (Pak Darto = kompendium)
docs/PRD_DASHBOARD_SEDERHANA.md
docs/UJI_COBA_PENGGUNA.md   panduan uji coba Tahap 3
```

## Menyelaraskan mesin

`src/core/` adalah salinan dari `productive-loan-analyzer/src/core`. Bila mesin di repo asal berubah,
salin ulang folder itu beserta `tests/core/`, lalu jalankan `npm test`. Tes `tests/simple.test.js`
memastikan angka Bu Sari tetap sama dengan kompendium.

Catatan: peringkat adalah model internal MEZS.id, bukan rating resmi PEFINDO. Data demo fiktif.
