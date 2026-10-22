# PRD Dashboard Kredit Sederhana — MEZS.id

22 Oktober 2026 · Saevan

## Ringkasan

Dashboard ini menjawab satu pertanyaan untuk orang awam: **"Apakah usaha ini sanggup membayar pinjamannya, dan berapa yang aman dipinjamkan?"** Jawabannya ditampilkan dalam bahasa sehari-hari, dengan warna lampu lalu lintas (hijau, kuning, merah) dan kalimat penjelas, bukan deretan rasio.

Mesin hitung MEZS.id yang sudah ada (skor 6 pilar, plafon, risiko, stress test, pemantauan) tetap dipakai. Yang berubah hanya **cara menyajikannya**: istilah teknis disembunyikan di balik tombol "Lihat detail" untuk analis yang membutuhkannya.

Pengguna utama adalah pemilik UMKM yang mengajukan pinjaman dan petugas kredit pemula. Analis senior tetap bisa membuka tampilan lengkap.

## Masalah

Dashboard saat ini benar secara perhitungan, tetapi sulit dibaca orang yang bukan bankir. Satu halaman hasil memuat puluhan angka dan singkatan sekaligus.

- **Terlalu banyak istilah:** DSCR, ICR, DTI, LTV, RAROC, CKPN, PPKA, ATMR, EWS. Pemilik usaha tidak tahu mana yang penting.
- **Hasil yang membingungkan:** Bu Sari mendapat skor 87,2 (idAA, "LAYAK"), tetapi keputusannya REVIEW karena satu aturan. Tanpa penjelasan, ini terasa bertentangan.
- **Tidak ada langkah berikutnya:** pemohon tidak diberi tahu apa yang harus diperbaiki agar disetujui.
- **Petugas pemula kewalahan:** mereka harus membaca kompendium 14 halaman sebelum bisa menjelaskan hasilnya ke nasabah.

## Tujuan & bukan tujuan

**Tujuan**

1. Orang awam paham hasil analisis dalam **1 menit**, tanpa membuka glosarium.
2. Setiap hasil punya **alasan dalam satu kalimat** dan **langkah berikutnya** yang jelas.
3. Pemohon bisa mengajukan pinjaman sendiri dengan maksimal **5 langkah**.
4. Petugas kredit pemula bisa menjelaskan keputusan ke nasabah tanpa bantuan analis senior.

**Bukan tujuan**

- Mengubah rumus, bobot, atau aturan kebijakan. Semua tetap dari `src/core/config.js`.
- Menghapus tampilan lengkap untuk analis. Tampilan itu tetap ada, hanya tidak muncul pertama.
- Membuat keputusan otomatis tanpa analis. Prinsipnya tetap: sistem menjelaskan, manusia memutuskan.
- Aplikasi mobile terpisah. Versi ini cukup web yang nyaman dibuka di HP.

## Pengguna & kebutuhannya

| Pengguna | Contoh | Pertanyaan utamanya | Yang perlu dilihat |
| --- | --- | --- | --- |
| Pemilik UMKM (pemohon) | Bu Sari, katering | "Pinjaman saya disetujui tidak? Kalau tidak, apa yang kurang?" | Status pengajuan, alasan, daftar hal yang perlu dilengkapi, cicilan per bulan dan per hari |
| Petugas kredit pemula | Staf cabang baru | "Usaha ini aman dibiayai? Bagaimana menjelaskannya ke nasabah?" | Kartu hasil 1 halaman, 6 nilai dalam bahasa biasa, saran plafon, catatan yang bisa dibacakan |
| Analis senior | Komite kredit | "Angka mana yang membuat keputusan ini?" | Tombol "Lihat detail" ke tampilan lengkap (rasio, PD, LGD, RAROC, stress test) |
| Manajer / pemantau | Kepala cabang | "Pinjaman mana yang mulai bermasalah?" | Daftar pinjaman berwarna hijau-kuning-merah dan tindakan yang disarankan |

## Prinsip bahasa & desain

Setiap layar menjawab **satu pertanyaan**, memakai **warna lampu lalu lintas**, dan menulis angka dalam **rupiah atau "kali"**, bukan singkatan.

- **Hijau** = aman · **Kuning** = perlu perhatian · **Merah** = berisiko. Warna selalu disertai kata, agar tetap terbaca oleh penderita buta warna.
- **Kalimat dulu, angka kemudian.** Contoh: "Uang masuk usaha cukup untuk membayar cicilan 1,6 kali" lebih dulu dari "DSCR 1,58x".
- **Istilah teknis hanya di tooltip** (ikon ?) dan di tampilan detail.
- **Skor 0–100 diganti bintang 1–5 untuk tiap pilar.** Skor akhir tetap memakai peringkat gaya PEFINDO, selalu disertai artinya (lihat tabel di bawah).

**Peringkat akhir gaya PEFINDO**

Skor akhir 0–100 tetap diubah ke peringkat gaya PEFINDO seperti di kompendium. Di kartu hasil, peringkat **selalu tampil bersama artinya**, misalnya "idAA — Sangat baik".

| Peringkat | Skor akhir | Label di layar | Arti untuk nasabah |
| --- | --- | --- | --- |
| idAAA | ≥ 92 | Sangat baik | Kemampuan bayar sangat kuat, risiko gagal bayar sangat rendah |
| idAA+ / idAA / idAA- | 80–91 | Sangat baik | Kemampuan bayar kuat, risiko gagal bayar rendah |
| idA+ / idA / idA- | 68–79 | Baik | Kemampuan bayar baik, sedikit peka terhadap kondisi sulit |
| idBBB+ / idBBB / idBBB- | 56–67 | Cukup | Masih layak dibiayai, perlu dipantau |
| idBB+ / idBB / idBB- | 44–55 | Kurang | Kemampuan bayar lemah, butuh perbaikan atau jaminan tambahan |
| idB ke bawah (idB, idCCC, idD) | < 44 | Berisiko tinggi | Besar kemungkinan kesulitan membayar |

Batas "layak investasi" adalah idBBB- (skor 56). Di bawah peringkat selalu ada catatan: *"Peringkat model internal MEZS.id, bukan rating resmi PEFINDO."*

Peringkat menunjukkan kekuatan usaha, sedangkan **keputusan** (Layak / Perlu ditinjau / Tidak layak) bisa berbeda karena aturan kebijakan. Karena itu status keputusan tetap tampil paling atas, di atas peringkat.

**Kamus pengganti istilah**

| Istilah sekarang | Tampilan sederhana | Contoh kalimat (Bu Sari) |
| --- | --- | --- |
| DSCR | Kemampuan bayar cicilan | "Uang masuk usaha cukup untuk 1,6 kali cicilan" |
| Rasio cicilan / arus kas | Porsi uang usaha untuk cicilan | "63 dari setiap Rp 100 uang usaha habis untuk cicilan" |
| Current ratio | Uang siap pakai vs utang dekat | "Uang siap pakai 2,8 kali utang jangka pendek" |
| DER | Seberapa besar utang dibanding modal sendiri | "Utang hanya 38% dari modal sendiri" |
| LTV | Nilai jaminan dibanding pinjaman | "Jaminan bernilai 1,5 kali pinjaman" |
| Altman Z | Risiko bangkrut | "Risiko bangkrut: rendah" |
| PD | Peluang gagal bayar | "Sekitar 4 dari 1.000 usaha serupa gagal bayar dalam setahun" |
| Bunga berbasis risiko / RAROC | Bunga yang ditawarkan | "Bunga 13,7% per tahun, cicilan Rp 13 jt per bulan" |
| Stress test | Uji kondisi sulit | "Jika omzet turun 20%, usaha belum sanggup membayar" |
| Borrowing base | Dana yang bisa dicairkan dulu | "Tahap pertama bisa cair Rp 165 jt" |
| Covenant | Janji yang harus ditepati | "Kirim laporan bulanan paling lambat tanggal 15" |
| EWS / kolektibilitas | Kesehatan pinjaman | "Lancar" / "Perlu diperhatikan" / "Bermasalah" |
| Restrukturisasi 3R | Keringanan cicilan | "Tenor diperpanjang 33 bulan, cicilan jadi Rp 7,5 jt" |

## Alur pengguna

```
1. Ajukan pinjaman ──► 2. Lihat kartu hasil ──► Warnanya?
                                                 ├─ hijau ──────────► 3. Cair bertahap ──► 4. Pantau kesehatan
                                                 │                                          └─ jika lampu merah ──► Tawarkan keringanan
                                                 └─ kuning / merah ─► Perbaiki data ──► (ajukan ulang ke langkah 1)
```

Kartu hasil (langkah 2) adalah pusat produk: warna menentukan apakah pemohon lanjut ke pencairan atau memperbaiki data lalu mengajukan ulang. Setelah cair, pinjaman dipantau tiap bulan, dan lampu merah memicu tawaran keringanan cicilan.

## Fitur & layar

Versi pertama (MVP) cukup **5 layar**. Layar 1–3 untuk pemohon dan petugas, layar 4–5 untuk pemantauan.

| # | Layar | Isi utama | Prioritas |
| --- | --- | --- | --- |
| 1 | Ajukan pinjaman | Formulir 5 langkah: data usaha, jumlah & lama pinjaman, unggah laporan (foto boleh), jaminan, kirim. Ada bilah kemajuan dan daftar dokumen yang belum ada. | MVP |
| 2 | Kartu hasil | Satu halaman: status berwarna, peringkat beserta artinya (idAA — Sangat baik), alasan satu kalimat, jumlah yang aman dipinjam, cicilan per bulan dan per hari, 6 nilai bintang, tombol "Lihat detail". | MVP |
| 3 | Apa yang perlu diperbaiki | Daftar centang hal yang bisa dilakukan pemohon, misalnya "Lampirkan rekening koran 6 bulan" atau "Ajukan Rp 380 jt agar langsung layak". | MVP |
| 4 | Pinjaman saya / Portofolio | Daftar pinjaman dengan lampu hijau-kuning-merah, sisa pinjaman, cicilan berikutnya, status "Menunggu pencairan". | MVP |
| 5 | Peringatan dini | Pinjaman yang memburuk, alasannya dalam bahasa biasa, dan tindakan yang disarankan (telepon nasabah, kunjungi, tawarkan keringanan). | MVP |
| 6 | Simulasi "Bagaimana jika" | Geser jumlah pinjaman, lama, dan bunga; kartu hasil langsung berubah. | Tahap 2 |
| 7 | Uji kondisi sulit | 8 skenario ditampilkan sebagai "tahan / tidak tahan" dengan penjelasan. | Tahap 2 |
| 8 | Ringkasan untuk dicetak | Satu halaman PDF untuk nasabah dan komite. | Tahap 2 |

**Contoh kartu hasil: Bu Sari (Katering Dapur Sari)**

> **Perlu ditinjau** (kuning) · Peringkat idAA — Sangat baik
>
> Usaha Bu Sari sehat dan menguntungkan, tetapi cicilan Rp 400 jt akan memakai 63% uang usaha (batas aman 60%).
>
> **Saran:** pinjam **Rp 380 jt** selama 36 bulan agar langsung layak. Cicilan sekitar **Rp 13 jt per bulan**, atau sisihkan **Rp 526 rb per hari**.
>
> Kemampuan bayar ★★★★★ · Kesehatan keuangan ★★★★★ · Prospek usaha ★★★★ · Pengelolaan ★★★★ · Jaminan ★★★★ · Kondisi industri ★★★★
>
> **Perlu diingat:** jika omzet turun 20%, usaha akan kesulitan membayar. Kirim laporan bulanan agar bank bisa membantu lebih awal.

**Aturan bintang per pilar:** 90–100 = 5 bintang, 75–89 = 4, 60–74 = 3, 45–59 = 2, di bawah 45 = 1.

## Yang tetap dihitung di belakang layar

Tidak ada rumus yang berubah. Dashboard sederhana hanya **lapisan tampilan baru** di atas mesin `src/core/` yang sudah lulus 586 tes.

| Mesin yang ada | Ditampilkan sebagai |
| --- | --- |
| Skor 6 pilar & bobot (`scoring.js`, `weights.js`) | Peringkat gaya PEFINDO beserta artinya (rating.js) + 6 nilai bintang per pilar |
| Keputusan 3 lapis & aturan kebijakan (`eligibility.js`) | Status berwarna + alasan satu kalimat |
| Rekomendasi plafon (`debt-service.js`) | "Jumlah yang aman dipinjam" |
| Cicilan anuitas/flat/bagi hasil, arus kas harian | Cicilan per bulan dan per hari |
| PD, LGD, bunga, RAROC (`pd.js`, `nominal.js`) | Hanya bunga akhir; sisanya di "Lihat detail" |
| Stress test 8 skenario (`stress.js`) | Satu kalimat "Perlu diingat" + layar uji kondisi sulit (tahap 2) |
| Syarat pencairan & borrowing base (`disbursement.js`) | Daftar centang syarat + "dana tahap pertama" |
| Covenant, EWS, kolektibilitas, CKPN, ATMR (`covenant.js`, `ews-monitor.js`, `portfolio.js`, `rwa.js`) | Lampu kesehatan pinjaman + tindakan disarankan; angka regulasi hanya untuk analis |
| Restrukturisasi 3R (`restructuring.js`) | "Pilihan keringanan cicilan" dengan cicilan baru |

Kebutuhan teknis baru hanya dua: (1) modul **penerjemah** yang mengubah hasil mesin menjadi kalimat dan bintang, dan (2) **saklar tampilan** "Sederhana / Lengkap" yang diingat per pengguna.

## Ukuran keberhasilan

Diukur lewat uji coba dengan 10 pemilik UMKM dan 5 petugas kredit sebelum dan sesudah tampilan baru.

| Ukuran | Cara mengukur | Target |
| --- | --- | --- |
| Paham hasil | Setelah melihat kartu hasil, peserta menjawab "disetujui atau tidak, dan kenapa" dengan benar | ≥ 8 dari 10 pemohon |
| Waktu memahami | Waktu dari membuka kartu hasil sampai bisa menjelaskan keputusan | ≤ 1 menit |
| Pengajuan selesai sendiri | Pemohon menyelesaikan formulir tanpa bantuan | ≥ 80% |
| Petugas bisa menjelaskan | Petugas pemula menjelaskan kasus Bu Sari ke "nasabah" tanpa membuka kompendium | ≥ 4 dari 5 petugas |
| Hasil tetap sama | Keputusan, plafon, dan bunga di tampilan sederhana = tampilan lengkap | 100% (diuji otomatis) |
| Kepuasan | Survei 1–5 "tampilan ini mudah dimengerti" | Rata-rata ≥ 4 |

## Rilis bertahap, risiko & pertanyaan terbuka

**Rilis bertahap**

1. **Tahap 1 (MVP):** penerjemah kalimat & bintang, kartu hasil, layar perbaikan, formulir 5 langkah, saklar Sederhana/Lengkap.
2. **Tahap 2:** portofolio & peringatan dini versi sederhana, simulasi "bagaimana jika", uji kondisi sulit, ringkasan cetak.
3. **Tahap 3:** uji coba dengan pengguna nyata, perbaikan kata-kata berdasarkan hasil uji.

**Risiko**

| Risiko | Akibat | Cara mengatasi |
| --- | --- | --- |
| Penyederhanaan terlalu jauh | Pemohon mengira "4 bintang" berarti pasti disetujui | Status keputusan selalu tampil paling atas, di atas bintang |
| Kalimat tidak sinkron dengan angka | Penjelasan bertentangan dengan keputusan | Kalimat dibuat otomatis dari hasil mesin + tes otomatis |
| Terkesan menjanjikan persetujuan | Keluhan nasabah | Teks tetap: "Hasil ini bahan pertimbangan, keputusan akhir oleh bank" |
| Analis kehilangan detail | Keputusan komite melambat | Tampilan lengkap tetap satu klik |

**Pertanyaan terbuka**

- [ ] Siapa yang menyetujui label arti peringkat (Sangat baik → Berisiko tinggi)?
- [ ] Apakah pemohon boleh melihat saran plafon, atau hanya petugas?
- [ ] Bahasa daerah atau hanya Bahasa Indonesia?
- [ ] Siapa yang menyetujui daftar kalimat penjelas (tim risiko atau tim produk)?

---

## Status implementasi (repo ini)

| Tahap | Isi | Status |
| --- | --- | --- |
| 1 | Penerjemah kalimat & peringkat, kartu hasil, layar perbaikan, formulir 5 langkah, saklar Sederhana/Lengkap | Selesai |
| 2 | Daftar pinjaman (portofolio) & peringatan dini, keputusan & pencairan, keringanan cicilan, simulasi "bagaimana jika", uji kondisi sulit, cetak, cadangan data | Selesai |
| 2b | Peran terpisah pemohon/petugas, laporan dikirim sebagai berkas & dibaca otomatis, cicilan harian/mingguan/bulanan, penawaran yang diterima/ditolak pemohon | Selesai |
| 3 | Uji coba dengan pengguna nyata | Siap dijalankan — lihat `docs/UJI_COBA_PENGGUNA.md` |

Perubahan dari rencana awal: kartu hasil (skor & peringkat) kini hanya untuk petugas, mengikuti aplikasi asal; pemohon melihat linimasa, permintaan perbaikan, dan penawaran.

Catatan: layar 4–5 (portofolio & peringatan dini) yang di tabel layar ditandai MVP dibangun bersama Tahap 2.
