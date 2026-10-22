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

Contoh Bu Sari (Katering Dapur Sari, fiktif): skor 87,2 → **idAA — Sangat baik**, status **Perlu ditinjau**
karena cicilan Rp 400 jt memakai 63% uang usaha (batas 60%). Saran: pinjam **Rp 380 jt** → **Layak dibiayai**.

## Menjalankan

```bash
npm run serve        # lalu buka http://localhost:8765
npm test             # tes mesin dari repo asal + tes tampilan sederhana; Node ≥ 22.5
```

Tanpa build dan tanpa dependency. Deploy statis (mis. Vercel) langsung dari root repo.

## Struktur

```
index.html              halaman tunggal
src/core/               mesin hitung MEZS.id — disalin utuh, JANGAN diubah di sini
src/data/               benchmark sektor IDX & profil perusahaan
src/simple/             lapisan baru:
  analyze.js            memanggil mesin (+ uji ulang pada jumlah saran)
  translate.js          hasil mesin → status, peringkat, bintang, kalimat (tanpa hitung ulang)
  form-schema.js        formulir 5 langkah dalam bahasa sehari-hari
  demo.js               kasus Bu Sari
src/ui/app.js           tampilan formulir & kartu hasil
tests/core/             tes mesin dari repo asal
tests/simple.test.js    tes penerjemah, termasuk "hasil tetap sama"
docs/PRD_DASHBOARD_SEDERHANA.md
```

## Menyelaraskan mesin

`src/core/` adalah salinan dari `productive-loan-analyzer/src/core`. Bila mesin di repo asal berubah,
salin ulang folder itu beserta `tests/core/`, lalu jalankan `npm test`. Tes `tests/simple.test.js`
memastikan angka Bu Sari tetap sama dengan kompendium.

Catatan: peringkat adalah model internal MEZS.id, bukan rating resmi PEFINDO. Data demo fiktif.
