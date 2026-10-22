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

## Dua peran (seperti aplikasi asal, versi sederhana)

**Pemohon** (pilih "Pemohon" di kiri atas)
1. *Usaha & pinjaman* — data usaha, jumlah, lama, dan **cicil setiap hari / minggu / bulan**.
2. *Laporan keuangan* — **cukup kirim berkas** (PDF, Excel, CSV, atau foto). Angkanya dibaca otomatis
   (foto / PDF hasil scan lewat OCR di browser); pemohon hanya memeriksa dan mengisi yang belum terbaca.
3. *Jaminan & dokumen* — jenis & nilai jaminan, lampiran KTP, legalitas, rekening koran, dll.
4. *Periksa & kirim* — ringkasan + persetujuan pemeriksaan data.
5. *Pengajuan saya* — linimasa, permintaan perbaikan, dan **penawaran untuk diterima / ditolak**.
   Seperti aplikasi asal, pemohon tidak melihat skor atau peringkat.

**Petugas bank** (pilih "Petugas bank")
1. *Pengajuan masuk* — antrian per tahap (perlu diperiksa, siap dicairkan, menunggu pemohon).
2. Pemeriksaan satu pengajuan: data & angka dari berkas → centang dokumen (keyakinan data) →
   wawancara 7 pertanyaan → kartu hasil analisis + simulasi → gerbang keputusan →
   **kirim penawaran** (jumlah, lama, bunga, periode cicilan) / **minta perbaikan** / tolak.
3. Setelah pemohon menerima: syarat pencairan → cairkan → pemantauan bulanan → keringanan.
4. *Portofolio* — lampu kesehatan pinjaman, NPL, CKPN/PPKA (mode Lengkap), cadangan data.

| Yang diisi pemohon | Yang diisi petugas |
| --- | --- |
| Data usaha, jumlah, lama, periode cicilan, keperluan | Verifikasi dokumen |
| Berkas laporan keuangan (dibaca otomatis) | Tunggakan (SLIK), kas cukup berapa bulan |
| Jaminan & dokumen pendukung | Wawancara (model usaha, pasar, pengalaman, dst.) |
| Menerima / menolak penawaran | Penawaran, perbaikan, pencairan, pemantauan, keringanan |

Data tersimpan di browser (localStorage). Pemohon dan petugas memakai browser yang sama dalam mode lokal
(sama seperti mode lokal aplikasi asal). Gunakan *Unduh cadangan* / *Pulihkan dari cadangan* di Portofolio.

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
index.html              halaman tunggal
src/core/               mesin hitung MEZS.id — disalin utuh, JANGAN diubah di sini
src/data/               benchmark sektor IDX & profil perusahaan
src/simple/             lapisan baru:
  analyze.js            memanggil mesin (+ uji ulang pada jumlah saran)
  translate.js          hasil mesin → status, peringkat, bintang, kalimat (tanpa hitung ulang)
  form-schema.js        formulir 5 langkah dalam bahasa sehari-hari
  intake.js             baca berkas laporan, dokumen, keyakinan data, gerbang keputusan
  loans.js              alur: pengajuan → penawaran → pencairan → pemantauan → keringanan
  demo.js               kasus Bu Sari & Pak Darto
src/ui/app.js           peran, navigasi, penyimpanan, unggah berkas
src/ui/borrower-view.js layar pemohon
src/ui/lender-view.js   layar petugas: antrian & pemeriksaan
src/ui/result-view.js   kartu hasil analisis + simulasi + rincian
src/ui/loans-view.js    portofolio, pencairan, pemantauan, keringanan
src/ui/ocr.js           OCR foto laporan (Tesseract.js, dari repo asal)
data/contoh/            berkas laporan contoh (CSV Bu Sari, PDF & Excel dua periode)
tests/core/             tes mesin dari repo asal
tests/simple.test.js    tes penerjemah, termasuk "hasil tetap sama"
tests/loans.test.js     tes alur pinjaman & periode cicilan (Pak Darto = kompendium)
tests/intake.test.js    tes pembacaan berkas CSV/PDF/Excel
docs/PRD_DASHBOARD_SEDERHANA.md
docs/UJI_COBA_PENGGUNA.md   panduan uji coba Tahap 3
```

## Menyelaraskan mesin

`src/core/` adalah salinan dari `productive-loan-analyzer/src/core`. Bila mesin di repo asal berubah,
salin ulang folder itu beserta `tests/core/`, lalu jalankan `npm test`. Tes `tests/simple.test.js`
memastikan angka Bu Sari tetap sama dengan kompendium.

Catatan: peringkat adalah model internal MEZS.id, bukan rating resmi PEFINDO. Data demo fiktif.
