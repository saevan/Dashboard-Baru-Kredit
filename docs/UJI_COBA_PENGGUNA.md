# Panduan Uji Coba Pengguna (Tahap 3)

Tujuan: membuktikan target di PRD bagian *Ukuran keberhasilan* dengan **10 pemilik UMKM** dan **5 petugas kredit pemula**.
Durasi per peserta ±20 menit. Satu fasilitator, satu pencatat.

## Persiapan

- Buka dashboard di HP atau laptop peserta (tampilan **Sederhana**). Hapus data lama: Daftar pinjaman → pastikan kosong.
- Siapkan stopwatch dan lembar catatan (tabel di bawah).
- Jangan menjelaskan istilah apa pun selama tugas berlangsung. Catat setiap pertanyaan peserta.

## Tugas untuk pemilik UMKM

| # | Tugas | Yang diukur | Lulus bila |
| --- | --- | --- | --- |
| 1 | "Isi pengajuan untuk usaha Ibu/Bapak" (pakai data sendiri atau kartu data contoh) | Selesai tanpa bantuan | Sampai kartu hasil tanpa dibantu |
| 2 | Tunjukkan kartu hasil Bu Sari ("Isi contoh Bu Sari" → Lihat hasil). Tanya: "Disetujui atau tidak? Kenapa?" | Paham hasil, waktu | Menjawab "perlu ditinjau karena cicilan terlalu besar dibanding uang usaha" ≤ 1 menit |
| 3 | "Berapa yang sebaiknya dipinjam agar langsung layak? Berapa cicilannya per bulan?" | Paham saran | Rp 380 jt, ±Rp 13 jt/bulan |
| 4 | "Apa yang terjadi kalau omzet turun?" | Paham peringatan | Menyebut kesulitan membayar bila omzet turun 20% |
| 5 | Survei 1–5: "Tampilan ini mudah dimengerti" | Kepuasan | Rata-rata ≥ 4 |

## Tugas untuk petugas kredit pemula

| # | Tugas | Lulus bila |
| --- | --- | --- |
| 1 | Jelaskan kasus Bu Sari kepada fasilitator yang berperan sebagai nasabah, tanpa membuka kompendium | Menyebut status, alasan, saran jumlah, dan catatan "bukan rating resmi PEFINDO" |
| 2 | Simpan pengajuan → setujui Rp 380 jt → lengkapi syarat → cairkan | Paham kenapa pencairan pertama Rp 165 jt |
| 3 | Daftar pinjaman → "Muat contoh Pak Darto". Tanya: "Apa yang harus Anda lakukan minggu ini?" | Menyebut kunjungan & keringanan cicilan, lapor manajer risiko |
| 4 | Pilih keringanan yang disarankan dan jelaskan ke nasabah | Menyebut 33 bulan, cicilan ±Rp 7,5 jt |
| 5 | Survei 1–5 seperti di atas | Rata-rata ≥ 4 |

## Lembar catatan

| Peserta | Peran | Tugas | Waktu (detik) | Lulus? | Pertanyaan / kebingungan | Kata yang tidak dipahami |
| --- | --- | --- | --- | --- | --- | --- |
| P01 | UMKM | 2 | | | | |

## Setelah uji coba

1. Rekap per target PRD: paham hasil (≥ 8/10), waktu (≤ 1 menit), selesai sendiri (≥ 80%), petugas bisa menjelaskan (≥ 4/5), kepuasan (≥ 4).
2. Kumpulkan **kata yang tidak dipahami** → perbaiki kalimat di `src/simple/translate.js` dan `src/simple/loans.js` (bukan di mesin).
3. Jalankan `npm test` — tes "hasil tetap sama" memastikan perubahan kata tidak mengubah angka.
