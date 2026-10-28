# Cetak Biru Desain Ulang — MEZS.id

Dashboard dibangun ulang dari nol. **Logika perhitungan, teori, dan model datanya diambil utuh dari dashboard lama**
(`productive-loan-analyzer`): `src/core` (mesin), `src/data` (penyimpanan & format data), `src/utils`.
Yang dibuat baru hanya **tampilan dan alur penggunaannya**, dengan tujuan memudahkan UX.
Dashboard lama tidak diubah sama sekali.

Acuan prinsip: [Prinsip Dasar User Experience — Next Digital](https://nextdigital.co.id/prinsip-dasar-user-experience/) (13 prinsip).

> **Revisi arah (masukan pengguna):** kelengkapan dashboard lama sudah bagus dan **dipertahankan** —
> yang ribet adalah **menjalankannya sehari-hari**. Fokus desain ulang: memangkas langkah operasional
> (klik, pindah halaman, isian berulang), bukan menyembunyikan informasi. Lihat §8.

---

## 1. Masalah UX di dashboard lama (hasil audit)

| Temuan | Dampak |
| --- | --- |
| 11 menu di sidebar, dikelompokkan per istilah internal ("Monitor Risiko", "Kerangka 5C", "Borrower") | Petugas baru tidak tahu harus mulai dari mana |
| Satu layar detail berisi 7 tab + 20+ kartu (rasio, bobot, gap, segmentasi, covenant, amortisasi, simulasi, 3R) | Informasi penting tenggelam; hierarki visual datar |
| Jargon di tampilan utama: DSCR, LTV, PD, LGD, CKPN, ATMR, SICR, gate, grade index | Pemohon & petugas pemula bingung |
| Skor wawancara diketik manual 0–1 ("0,63") | Rawan salah ketik, sulit dibandingkan antar-analis |
| Satu tombol aksi berganti makna menurut status (verify / score / offer / decide) | Pengguna tidak yakin apa yang terjadi setelah klik |
| Konfirmasi memakai dialog browser; umpan balik berupa teks kecil | Tidak terlihat jelas apakah aksi berhasil |
| Data analisis manual, pengajuan pemohon, dan fasilitas berjalan tersebar di 4 menu berbeda | Satu nasabah dilacak lewat banyak layar |

## 2. Dari prinsip ke keputusan desain

| # | Prinsip (artikel) | Keputusan di dashboard baru |
| --- | --- | --- |
| 1 | Kejelasan & kesederhanaan | Menu maksimal 4 per peran. Bahasa sehari-hari di permukaan; istilah teknis hanya di "Rincian analis" dan tooltip. Satu layar = satu tugas utama. |
| 2 | Konsistensi | Satu design system: warna merek (navy + biru + emas), satu set komponen (kartu, pil status, tombol), lampu hijau/kuning/merah dengan arti yang sama di semua layar. Navigasi tetap di posisi yang sama. |
| 3 | Kecepatan & kinerja | Tanpa framework/build, tanpa gambar berat; modul ES dimuat langsung. OCR & pustaka berat hanya dimuat saat dipakai. Perhitungan tetap lokal di browser. |
| 4 | Aksesibilitas | Kontras token diperiksa di mode terang & gelap, semua kontrol bisa dipakai keyboard, fokus terlihat, label pada setiap input, status tidak hanya lewat warna (selalu ada kata). |
| 5 | Feedback yang jelas | Toast "berhasil/gagal" untuk setiap aksi, indikator proses saat membaca berkas, konfirmasi di halaman (bukan dialog browser) untuk aksi yang tidak bisa dibatalkan. |
| 6 | Hierarki visual | Setiap layar dibuka dengan **jawaban** (status + alasan + tindakan berikutnya), baru kemudian detail. Tombol utama satu per bagian. |
| 7 | Mobile-first | Tata letak satu kolom yang melebar di desktop; target sentuh ≥ 44 px; navigasi bawah di HP. |
| 8 | Personalisasi | Beranda berbeda per peran; beranda pemohon menyapa nama usaha dan menampilkan langkah berikutnya miliknya; petugas melihat tugas yang ditugaskan kepadanya. Pilihan tampilan Sederhana/Lengkap dan mode gelap diingat. Bahasa & format Rupiah lokal. |
| 9 | Efisiensi navigasi | Menu familiar ("Beranda", "Pengajuan", "Nasabah", "Portofolio"), breadcrumb di setiap halaman dalam, **pencarian cepat** nasabah/pengajuan dengan saran otomatis. |
| 10 | Berpusat pada pengguna | Persona & peta perjalanan di bawah; panduan uji coba di `docs/UJI_COBA_PENGGUNA.md`. |
| 11 | Mikrointeraksi | Tombol berubah keadaan saat diproses, centang beranimasi, progres langkah terisi, toast muncul-hilang (menghormati *reduced motion*). |
| 12 | Data analitik | Catatan penggunaan lokal (langkah formulir yang ditinggalkan, waktu peninjauan) ditampilkan di Pengaturan → Statistik penggunaan, tanpa mengirim data ke luar. |
| 13 | Tren UX | Mode gelap mengikuti perangkat. Suara dan 3D tidak relevan untuk alat kerja kredit, jadi sengaja tidak dipakai. |

## 3. Persona

| Persona | Tujuan | Kebutuhan utama |
| --- | --- | --- |
| **Bu Sari** — pemilik katering (pemohon) | Mendapat modal kerja tanpa ribet | Tahu syaratnya, cukup unggah laporan apa adanya, tahu status & cicilannya |
| **Rina** — analis kredit | Menilai cepat & konsisten (< 15 menit) | Daftar periksa yang memandu, hasil langsung dengan alasan, penawaran yang aman |
| **Budi** — manajer risiko | Menjaga kesehatan portofolio | Ringkasan per lampu, siapa yang perlu tindakan, angka regulasi saat dibutuhkan |
| **Admin** | Mengatur kebijakan & tim | Bobot, aturan, benchmark, anggota tim, cadangan data |

## 4. Peta perjalanan

```
Pemohon:  Masuk → Ajukan (4 langkah, unggah laporan) → Pantau status → (Perbaiki) → Terima/tolak penawaran → Lihat cicilan
Petugas:  Beranda (tugas) → Tinjau pengajuan: Audit keuangan → Cek agunan → Wawancara → Hitung hasil
          → Kirim penawaran (flat / bagi hasil) → Siapkan fasilitas → Syarat pencairan → Cairkan
          → Pemantauan bulanan (EWS) → Keringanan 3R bila perlu → Portofolio
```

## 5. Struktur menu (IA)

**Pemohon:** Beranda · Ajukan · Pengajuan saya
**Petugas:** Beranda · Pengajuan · Nasabah · Portofolio · (⋯ Lainnya: Analisis manual, Panduan 5C, Pengaturan, Tim)

## 6. Peta fitur lama → baru (tidak ada yang hilang)

| Dashboard lama | Dashboard baru |
| --- | --- |
| Landing + simulasi cicilan | Halaman masuk dengan simulasi cicilan singkat |
| Login / daftar (demo lokal) | Masuk sebagai Pemohon / Petugas (akun demo) |
| Beranda Saya, Ajukan Kredit, Status Pengajuan, Penawaran | Pemohon: Beranda, Ajukan, Pengajuan saya (status + penawaran + perbaikan) |
| Beranda internal (ringkasan) | Petugas: Beranda — tugas prioritas & angka kunci |
| Pengajuan (antrean + audit 3 bagian + skor + penawaran + aksi) | Pengajuan → Tinjau (langkah bertahap) |
| Borrower (daftar) + Hasil + Detail 7 tab + Monitor Risiko | Nasabah → satu halaman per nasabah dengan 4 bagian: Ringkasan · Analisis · Fasilitas & pemantauan · Simulasi |
| Form analisis manual (5 langkah) | Lainnya → Analisis manual |
| Portofolio (CKPN, PPKA, NPL, ATMR, migrasi, konsentrasi) | Portofolio (ringkas di atas, rincian di mode Lengkap) |
| Kerangka 5C (referensi) | Lainnya → Panduan 5C |
| Pengaturan (bobot, aturan, profil, benchmark, data) | Lainnya → Pengaturan (bertab, dengan pratinjau dampak) |
| Tim kerja | Lainnya → Tim |

## 7. Batasan

- Mode lokal (data di browser), sama seperti mode lokal dashboard lama. Mode API/server lama tidak dibangun ulang.
- Format data sama dengan dashboard lama: cadangan JSON dan berkas impor demo lama bisa dipakai.

## 8. Memangkas langkah operasional

Semua informasi dan perhitungan tetap tampil (Rincian analis, Portofolio mode Lengkap sebagai bawaan petugas).
Yang dipangkas adalah pekerjaan rutin:

| Pekerjaan rutin | Sebelumnya | Sekarang |
| --- | --- | --- |
| Meninjau satu pengajuan sampai dinilai | ±31 aksi, berpindah 5 halaman/tab | **16 aksi di satu halaman kerja** (diukur dengan uji browser): dokumen, audit keuangan, agunan, wawancara bertumpuk; tombol "tandai semua" per bagian; progres langsung tanpa memuat ulang; bilah aksi selalu terlihat |
| Pindah ke pengajuan berikutnya | Kembali ke antrean, cari lagi | Tombol **Berikutnya →** di setiap pengajuan |
| Menyiapkan fasilitas setelah pemohon menerima | Buka pengajuan → buka fasilitas | Tombol **Siapkan fasilitas** langsung di antrean & Beranda |
| Syarat pencairan | Centang satu per satu | **Tandai semua terpenuhi** (dengan konfirmasi; tetap tercatat per syarat, waktu, dan petugas) |
| Pemantauan bulanan seluruh pinjaman | Buka tiap nasabah, isi 20 parameter | **Pemantauan bulanan**: satu tabel semua pinjaman, isian awal = bulan lalu, ubah yang berubah saja, **Simpan semua** |
| Mencari nasabah/pengajuan | Buka menu, gulir daftar | Tekan **/** lalu ketik nama |

Kontrol tidak berkurang: "tandai semua" hanya mencentang butir yang bisa dicentang manual (butir otomatis
tetap dihitung mesin), audit yang belum lengkap tetap wajib justifikasi, keputusan di luar batas tetap wajib alasan.

## 9. Segmen target & bahasa pasar

- **Debitur kecil vs besar** ditentukan dari omzet setahun pada laporan keuangan (kriteria penjualan PP 7/2021):
  ≤ Rp2 M mikro, ≤ Rp15 M kecil → *debitur kecil*; ≤ Rp50 M menengah, di atasnya besar → *debitur besar*.
  Berbeda dari `core/segment.js` (segmen operasional dari jumlah pinjaman), yang tetap dipakai mesin.
- **Hanya tampilan & bahasa** yang berbeda: isian dan perhitungan sama. Debitur kecil → ringkasan sehari-hari
  di depan, "Rincian lengkap (istilah bank)" terlipat. Debitur besar → rincian analis terbuka seperti biasa.
- **Bahasa pasar** (pedagang & UMKM lokal) di semua layar pemohon: status, pesan, wizard, tawaran, linimasa,
  halaman masuk/daftar. Logika status tetap `core/applicant-feedback.js`; hanya kata-katanya diganti.
- Halaman utama (landing) sengaja tetap sama dengan dashboard lama.
