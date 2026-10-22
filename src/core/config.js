/**
 * core/config.js — Konfigurasi default (bobot, threshold, aturan, konstanta).
 *
 * Rujukan: docs/ARCHITECTURE.md §3, §3.6, §3A, §6A, §7 dan glosarium PD/EL.
 *
 * PRINSIP (v2):
 *  1. **Satu sumber kebenaran** untuk setiap angka kebijakan. Tidak ada nilai yang
 *     di-hardcode di engine; semua dibaca dari config efektif.
 *  2. **Konfigurasi efektif** = DEFAULT_CONFIG ⊕ PROFILE_RULES[profil] ⊕
 *     overlay sektor (lihat `resolveConfig`). Setiap analisis menyimpan snapshot
 *     + hash konfigurasi (`configHash`) sehingga hasil bisa direproduksi.
 *  3. **Aturan dinilai lewat registry** (`HARD_RULE_DEFS` + `evaluateRules`) agar
 *     interpretasi DSCR/ICR/DTI/LTV/Altman identik di seluruh modul
 *     (eligibility, stress test, covenant).
 *
 * Catatan konsistensi v1 → v2:
 *  - `hardRules.altman_distress` (duplikat) DIHAPUS → ambang tunggal di `altman`.
 *  - `hardRules.ltv_max_no_guarantee` → diganti `ltv_max` / `ltv_max_with_guarantee`
 *    / `ltv_soft_max`; `nominal.ltvMax*` (duplikat) DIHAPUS.
 *  - DSCR/DTI/ICR kini dihitung dari **debt service riil** (tenor, skema angsuran,
 *    utang eksisting) oleh core/debt-service.js.
 */

/** Versi skema konfigurasi — dinaikkan bila makna angka kebijakan berubah. */
export const CONFIG_VERSION = '2.0.0';

/** 6 pilar penilaian. */
export const PILLARS = [
     'business_viability',
     'financial_health',
     'cash_flow',
     'management',
     'collateral',
     'industry_risk'
];

export const PILLAR_LABELS = {
     business_viability: 'Business Viability',
     financial_health: 'Financial Health',
     cash_flow: 'Cash Flow & Repayment',
     management: 'Management & Track Record',
     collateral: 'Collateral & Guarantee',
     industry_risk: 'Industry & Macro Risk'
};

/**
 * Metadata rasio benchmark (11 sektor × 20 rasio).
 * direction: 'higher' = makin tinggi makin baik; 'lower' = makin rendah makin baik.
 */
export const RATIO_META = {
     gpm: { label: 'Gross Profit Margin', direction: 'higher', unit: 'ratio' },
     opm: { label: 'Operating Profit Margin', direction: 'higher', unit: 'ratio' },
     npm: { label: 'Net Profit Margin', direction: 'higher', unit: 'ratio' },
     roa: { label: 'Return on Assets', direction: 'higher', unit: 'ratio' },
     roe: { label: 'Return on Equity', direction: 'higher', unit: 'ratio' },
     dar: { label: 'Debt to Assets Ratio', direction: 'lower', unit: 'ratio' },
     der: { label: 'Debt to Equity Ratio', direction: 'lower', unit: 'ratio' },
     ltd_to_equity: { label: 'LTD to Equity', direction: 'lower', unit: 'ratio' },
     debt_to_capital: { label: 'Debt to Capital', direction: 'lower', unit: 'ratio' },
     icr: { label: 'Interest Coverage Ratio', direction: 'higher', unit: 'ratio' },
     current_ratio: { label: 'Current Ratio', direction: 'higher', unit: 'ratio' },
     quick_ratio: { label: 'Quick Ratio', direction: 'higher', unit: 'ratio' },
     cash_ratio: { label: 'Cash Ratio', direction: 'higher', unit: 'ratio' },
     cash_turnover: { label: 'Cash Turnover', direction: 'higher', unit: 'ratio' },
     tato: { label: 'Total Asset Turnover', direction: 'higher', unit: 'ratio' },
     fato: { label: 'Fixed Asset Turnover', direction: 'higher', unit: 'ratio' },
     inventory_turnover: { label: 'Inventory Turnover', direction: 'higher', unit: 'ratio' },
     receivable_turnover: { label: 'Receivable Turnover', direction: 'higher', unit: 'ratio' },
     working_capital_turnover: { label: 'Working Capital Turnover', direction: 'higher', unit: 'ratio' },
     payable_turnover: { label: 'Payable Turnover', direction: 'higher', unit: 'ratio' }
};

/**
 * Rasio utama yang dipakai untuk evaluasi gap vs benchmark + aturan "gap terlalu jauh".
 * (Selaras dengan contoh di ARCHITECTURE §3A.3: ROA, ROE, DER, ...)
 */
export const MAIN_RATIOS = ['roa', 'roe', 'npm', 'current_ratio', 'icr', 'der'];

/**
 * Definisi komponen (sub-faktor) tiap pilar.
 * - key       : nama komponen (juga kunci rasio bila benchmarkKey diisi)
 * - pillar    : pilar induk
 * - base      : bobot dasar RELATIF dalam pilar (Σ per pilar = 1.0)
 * - benchmarkKey : kunci rasio benchmark (null bila murni kualitatif)
 * - direction : arah penilaian ('higher'/'lower') untuk komponen berbasis benchmark
 * - qualitative : true bila diambil dari input sub-skor user (0–1)
 */
export const COMPONENT_DEFS = [
     // Business Viability — kualitatif (model, pasar, skala, ketergantungan)
     { key: 'model_bisnis', pillar: 'business_viability', base: 0.35, benchmarkKey: null, qualitative: true, label: 'Model Bisnis' },
     { key: 'posisi_pasar', pillar: 'business_viability', base: 0.25, benchmarkKey: null, qualitative: true, label: 'Posisi Pasar' },
     { key: 'skalabilitas', pillar: 'business_viability', base: 0.25, benchmarkKey: null, qualitative: true, label: 'Skalabilitas' },
     { key: 'ketergantungan', pillar: 'business_viability', base: 0.15, benchmarkKey: null, qualitative: true, label: 'Ketergantungan (diversifikasi)' },

     // Financial Health — kuantitatif (profitabilitas, likuiditas, solvabilitas, Z, tren)
     { key: 'roa', pillar: 'financial_health', base: 0.30, benchmarkKey: 'roa', direction: 'higher', label: 'Profitabilitas (ROA)' },
     { key: 'current_ratio', pillar: 'financial_health', base: 0.20, benchmarkKey: 'current_ratio', direction: 'higher', label: 'Likuiditas (Current Ratio)' },
     { key: 'der', pillar: 'financial_health', base: 0.20, benchmarkKey: 'der', direction: 'lower', label: 'Solvabilitas (DER)' },
     { key: 'altman_z', pillar: 'financial_health', base: 0.20, benchmarkKey: null, direction: 'higher', label: 'Altman Z-Score' },
     { key: 'tren_keuangan', pillar: 'financial_health', base: 0.10, benchmarkKey: null, qualitative: true, label: 'Tren Keuangan' },

     // Cash Flow & Repayment — kuantitatif
     { key: 'dscr', pillar: 'cash_flow', base: 0.35, benchmarkKey: null, direction: 'higher', label: 'DSCR' },
     { key: 'icr', pillar: 'cash_flow', base: 0.25, benchmarkKey: 'icr', direction: 'higher', label: 'ICR' },
     { key: 'dti', pillar: 'cash_flow', base: 0.20, benchmarkKey: null, direction: 'lower', label: 'DTI' },
     { key: 'ocf_positif', pillar: 'cash_flow', base: 0.10, benchmarkKey: null, qualitative: true, label: 'Arus Kas Operasional Positif' },
     { key: 'cash_runway', pillar: 'cash_flow', base: 0.10, benchmarkKey: null, direction: 'higher', label: 'Cash Runway' },

     // Management & Track Record — kualitatif
     { key: 'pengalaman_tim', pillar: 'management', base: 0.40, benchmarkKey: null, qualitative: true, label: 'Pengalaman Tim' },
     { key: 'rekam_jejak_bayar', pillar: 'management', base: 0.35, benchmarkKey: null, qualitative: true, label: 'Rekam Jejak Bayar' },
     { key: 'tata_kelola', pillar: 'management', base: 0.25, benchmarkKey: null, qualitative: true, label: 'Tata Kelola/Legalitas' },

     // Collateral & Guarantee
     { key: 'ltv', pillar: 'collateral', base: 0.50, benchmarkKey: null, direction: 'lower', label: 'LTV' },
     { key: 'jenis_agunan', pillar: 'collateral', base: 0.30, benchmarkKey: null, qualitative: true, label: 'Jenis & Likuiditas Agunan' },
     { key: 'personal_guarantee', pillar: 'collateral', base: 0.20, benchmarkKey: null, qualitative: true, label: 'Personal Guarantee' },

     // Industry & Macro Risk
     { key: 'risiko_sektor', pillar: 'industry_risk', base: 0.50, benchmarkKey: null, qualitative: true, label: 'Risiko Sektor' },
     { key: 'prospek_industri', pillar: 'industry_risk', base: 0.30, benchmarkKey: null, qualitative: true, label: 'Prospek Industri' },
     { key: 'sensitivitas_makro', pillar: 'industry_risk', base: 0.20, benchmarkKey: null, qualitative: true, label: 'Sensitivitas Makro' }
];

/* ============================================================================
 * 0b. PENJELASAN PARAMETER BISNIS & MANAJEMEN
 *     (satu sumber kebenaran untuk label + penjelasan pada wizard & detail)
 * ==========================================================================*/

/**
 * Metadata tiap parameter kualitatif Bisnis & Manajemen.
 * - label : label singkat pada form
 * - group : kelompok tampilan ('viability' | 'management' | 'industry')
 * - unit  : 'skor' (0–1) | 'tahun' | 'bulan' | 'bool'
 * - help  : penjelasan bahasa awam — apa yang dinilai & cara menilai
 */
export const BISNIS_MANAJEMEN_META = {
     // ——— Viability Bisnis & Tren ———
     skor_model_bisnis: {
          label: 'Model Bisnis', group: 'viability', unit: 'skor',
          help: 'Seberapa kokoh & berulang sumber pendapatan (kontrak, langganan, repeat order). 1 = model terbukti & berulang; 0 = musiman/sekali jalan.'
     },
     posisi_pasar: {
          label: 'Posisi Pasar', group: 'viability', unit: 'skor',
          help: 'Kekuatan posisi vs pesaing serta daya tawar ke pemasok/pelanggan. 1 = pemimpin pasar; 0 = pemain pinggiran.'
     },
     skalabilitas: {
          label: 'Skalabilitas', group: 'viability', unit: 'skor',
          help: 'Kemampuan tumbuh tanpa kenaikan biaya proporsional (otomasi, kapasitas cadangan). 1 = sangat skalabel; 0 = tumbuh selalu menaikkan biaya.'
     },
     ketergantungan: {
          label: 'Diversifikasi Pelanggan', group: 'viability', unit: 'skor',
          help: 'Tingkat diversifikasi pelanggan/pemasok. 1 = terdiversifikasi (ketergantungan rendah); 0 = bergantung pada satu pembeli/pemasok.'
     },
     tren_keuangan: {
          label: 'Tren Keuangan', group: 'viability', unit: 'skor',
          help: 'Arah kinerja 2–3 periode terakhir (penjualan, margin, laba). 1 = membaik konsisten; 0 = menurun.'
     },

     // ——— Manajemen & Track Record ———
     pengalaman_tim: {
          label: 'Pengalaman Tim', group: 'management', unit: 'skor',
          help: 'Jam terbang & kompetensi tim manajemen di industri ini. Digabung 50:50 dengan Track Record (tahun). 1 = sangat berpengalaman.'
     },
     rekam_jejak_bayar: {
          label: 'Rekam Jejak Pembayaran', group: 'management', unit: 'skor',
          help: 'Kualitas riwayat pembayaran kewajiban ke bank & pemasok. 1 = selalu lancar; 0 = pernah menunggak/macet.'
     },
     tata_kelola: {
          label: 'Tata Kelola / Legalitas', group: 'management', unit: 'skor',
          help: 'Kualitas tata kelola, pembukuan, & legalitas (badan hukum, izin, audit). 1 = rapi & taat aturan; 0 = administrasi tidak tertib.'
     },
     track_record_tahun: {
          label: 'Track Record (tahun)', group: 'management', unit: 'tahun',
          help: 'Lama usaha beroperasi. ≥ 5 tahun dianggap mapan; memengaruhi skor Pengalaman Tim.'
     },
     cash_runway_bulan: {
          label: 'Cash Runway (bulan)', group: 'management', unit: 'bulan',
          help: 'Berapa bulan kas dapat menutup biaya operasional tanpa pendapatan baru. ≥ 6 bulan dianggap sehat.'
     },
     ocf_positif: {
          label: 'Arus Kas Operasional Positif', group: 'management', unit: 'bool',
          help: 'Apakah arus kas operasional positif. Bila dikosongkan, disimpulkan dari Arus Kas Operasional di langkah Keuangan.'
     },

     // ——— Risiko Industri & Makro ———
     skor_industri_risk: {
          label: 'Skor Risiko Sektor', group: 'industry', unit: 'skor',
          help: 'Risiko inheren sektor usaha (siklikalitas, regulasi, persaingan). 1 = risiko sektor rendah; 0 = risiko tinggi.'
     },
     prospek_industri: {
          label: 'Prospek Industri', group: 'industry', unit: 'skor',
          help: 'Prospek pertumbuhan industri ke depan. 1 = cerah; 0 = lesu/menyusut.'
     },
     sensitivitas_makro: {
          label: 'Sensitivitas Makro', group: 'industry', unit: 'skor',
          help: 'Ketahanan usaha terhadap guncangan makro (kurs, suku bunga, inflasi). 1 = sangat tahan; 0 = sangat sensitif.'
     }
};

/** Judul tiap kelompok parameter Bisnis & Manajemen. */
export const BISNIS_MANAJEMEN_GROUPS = {
     viability: 'Viability Bisnis & Tren',
     management: 'Manajemen & Track Record',
     industry: 'Risiko Industri & Makro'
};

/** Panduan interpretasi skor 0–1 (legend pada form & detail). */
export const SCORE_SCALE_GUIDE = [
     { range: '0,00 – 0,20', label: 'Sangat lemah', note: 'Risiko tinggi; perlu mitigasi/syarat kuat.' },
     { range: '0,21 – 0,40', label: 'Lemah', note: 'Di bawah standar; jadi sorotan analisis.' },
     { range: '0,41 – 0,60', label: 'Cukup', note: 'Netral; pantau tren.' },
     { range: '0,61 – 0,80', label: 'Kuat', note: 'Di atas rata-rata.' },
     { range: '0,81 – 1,00', label: 'Sangat kuat', note: 'Faktor positif utama.' }
];

/* ============================================================================
 * 1. REGISTRY ATURAN (hard rules) — interpretasi tunggal untuk semua modul
 * ==========================================================================*/

/**
 * Tiap aturan: { key, metric, op, label, unit, enforcement, description }
 * - metric      : kunci pada objek metrics yang dinilai
 * - op          : 'gte' (minimal) | 'lte' (maksimal) | 'lt' (kurang dari) | 'gt' (lebih dari)
 * - enforcement : 'hard'   → pelanggaran memaksa TIDAK_LAYAK
 *                 'soft'   → pelanggaran menurunkan keputusan maksimal REVIEW
 *                 'watch'  → hanya dicatat sebagai catatan (tidak mengubah keputusan)
 */
export const HARD_RULE_DEFS = [
     {
          key: 'dscr_min', metric: 'dscr', op: 'gte', unit: 'x', enforcement: 'hard',
          label: 'DSCR minimum',
          description: 'Arus kas operasi harus menutup seluruh debt service (pokok + bunga, termasuk utang eksisting).'
     },
     {
          key: 'icr_min', metric: 'icr', op: 'gte', unit: 'x', enforcement: 'hard',
          label: 'ICR minimum',
          description: 'EBIT harus menutup seluruh beban bunga (utang baru + eksisting).'
     },
     {
          key: 'dti_max', metric: 'dti', op: 'lte', unit: '%', enforcement: 'soft',
          label: 'DTI maksimum',
          description: 'Total debt service tahunan dibagi penjualan tahunan.'
     },
     {
          key: 'ds_ratio_max', metric: 'ds_ratio', op: 'lte', unit: '%', enforcement: 'soft',
          label: 'Debt Service Ratio maksimum',
          description: 'Total debt service tahunan dibagi arus kas operasi tahunan (kebalikan DSCR, lebih mudah dibaca).'
     },
     {
          key: 'ltv_max', metric: 'ltv', op: 'lte', unit: 'x', enforcement: 'soft',
          label: 'LTV maksimum',
          description: 'Plafon terhadap nilai agunan; tanpa personal guarantee memakai batas ini.'
     },
     {
          key: 'ltv_max_with_guarantee', metric: 'ltv', op: 'lte', unit: 'x', enforcement: 'watch',
          label: 'LTV maksimum (dengan personal guarantee)',
          description: 'Batas LTV yang diizinkan bila ada personal guarantee.'
     },
     {
          key: 'altman_z_distress', metric: 'altman_z', op: 'gt', unit: 'Z', enforcement: 'soft',
          label: 'Altman Z — batas distress',
          description: 'Z di bawah/atau sama dengan nilai ini = zona distress.'
     },
     {
          key: 'negative_ocf_periods', metric: 'negative_ocf_periods', op: 'lt', unit: 'periode', enforcement: 'hard',
          label: 'Arus kas operasi negatif berturut-turut',
          description: 'Jumlah periode negatif berurutan yang ditoleransi.'
     },
     {
          key: 'arrears_days_max', metric: 'arrears_days', op: 'lte', unit: 'hari', enforcement: 'hard',
          label: 'Tunggakan maksimum',
          description: 'Tunggakan berjalan pada fasilitas yang sudah ada.'
     }
];

/* ============================================================================
 * 2. KONFIGURASI DEFAULT
 * ==========================================================================*/

export const DEFAULT_CONFIG = {
     version: CONFIG_VERSION,

     /** Bobot pilar default (total = 1.0). ARCHITECTURE §3.6.A. */
     pillarWeights: {
          business_viability: 0.20,
          financial_health: 0.25,
          cash_flow: 0.25,
          management: 0.15,
          collateral: 0.10,
          industry_risk: 0.05
     },

     /** Ambang skor keputusan. */
     thresholds: { layak: 75, layak_bersyarat: 60, review: 45 },

     /** Nilai aturan (kunci harus ada di HARD_RULE_DEFS). */
     hardRules: {
          dscr_min: 1.15,
          icr_min: 1.20,
          dti_max: 0.35,
          ds_ratio_max: 0.60,
          ltv_max: 0.75,
          ltv_max_with_guarantee: 0.95,
          altman_z_distress: 1.81,
          negative_ocf_periods: 2,
          arrears_days_max: 90
     },

     /** Ambang Altman Z (satu sumber; §3.6.J). */
     altman: { z_safe: 2.99, z_distress: 1.81 },

     /** Perlakuan gap dalam bobot dinamis. */
     gap: {
          too_far: -30, // avg_gap_pct < -30 => too far
          materialThreshold: 30, // |gap| > 30 => material
          neutralZone: 10, // |gap| <= 10 => noise
          mainRatiosMinBreach: 3,
          sensitivityK: 0.5
     },

     /** Rekomendasi nominal. */
     nominal: {
          dscrTarget: 1.30,
          rounding: 50000000, // Rp 50 juta
          rangeWidth: 0.05, // ±5%
          maxTenorBulan: 120,
          minTenorBulan: 3
     },

     /** Debt service: tenor, skema angsuran, utang eksisting. */
     debtService: {
          basis: 'ocf_then_ebitda_then_ebit', // urutan pemilihan numerator DSCR
          defaultScheme: 'annuity',
          seasonalityFactor: 1.15, // penalty untuk skema musiman (arus kas tidak rata)
          graceFactor: 1.0, // selama grace, pokok ditunda → DS turun (ditangani di skema)
          // CCF untuk EAD. Kredit berjangka (modal kerja/investasi) dicairkan penuh → 1,0.
          // Turunkan hanya untuk fasilitas revolving yang belum ditarik penuh.
          ccf: 1.0
     },

     /**
      * Financial spreading pra-rasio (ARCHITECTURE §4.5, RMA/Docsumo).
      * Opsional — bila field mentah kosong, adjusted = raw sehingga kompatibel.
      */
     spreading: {
          enabled: true,
          reclassRestrictedCash: true,
          reclassRelatedPartyReceivables: true,
          reclassRelatedPartyDebtLt: true
     },

     /**
      * Integritas laporan keuangan (ARCHITECTURE §4.5).
      * Menandai neraca tidak seimbang / tidak konsisten sebelum rasio dipakai
      * ("kalau ada laporan keuangannya ga beres, misalnya ga balance").
      */
     integrity: {
          tolerancePct: 1 // toleransi ketidakseimbangan (% dari total aset)
     },

     /**
      * Segmentasi borrower ("setiap peminjam harus dibedabedakan").
      * Ambang batas plafon diajukan (Rupiah) untuk mikro / kecil / menengah.
      */
     segment: {
          mikroMax: 50000000, // ≤ 50 juta → UMKM mikro
          kecilMax: 500000000, // ≤ 500 juta → UMKM kecil
          menengahMax: 5000000000 // ≤ 5 miliar → UMKM menengah
     },

     /**
      * Arus kas harian (khusus UMKM — "umkm kalau bisa cuma perhari").
      */
     dailyCashflow: {
          workingDaysPerMonth: 26,
          weekendFactor: 0.6,
          transactionsPerDay: 10
     },

     /**
      * Transformasi benchmark (L2):
      * - smeCorrection: menyesuaikan median/kuartil IDX (large-cap) agar adil
      *   dibandingkan dengan UKM. factor=0.78 → ambang higher-is-better dikali 0.78.
      * - tails: persentil ekor yang diharapkan tersedia di data benchmark.
      */
     benchmark: {
          smeCorrection: { enabled: false, factor: 0.78 },
          tails: { lower: 'p01', upper: 'p99' }
     },

     /**
      * AHP (human layer, ARCHITECTURE §7A / §10.1) — opsional.
      * Bila enabled & pairwise (6×6 sesuai urutan PILLARS) diberikan, bobot pilar
      * diturunkan dari expert judgment + Consistency Ratio (CR < maxCR).
      */
     ahp: {
          enabled: false,
          pairwise: null,
          enforceConsistency: true,
          maxCR: 0.10
     },

     /** EWS pasca-pencairan. */
     ews: { watchDays: 7, criticalDays: 30 },

     /** Probabilitas default (PD). */
     pd: {
          horizonBulan: 12,
          floor: 0.0005,
          cap: 0.45,
          /** Titik kalibrasi: [skor, PD 12 bulan] — interpolasi log-linear monotone. */
          anchors: [
               [95, 0.0020],
               [90, 0.0035],
               [85, 0.0060],
               [80, 0.0100],
               [75, 0.0165],
               [70, 0.0260],
               [65, 0.0400],
               [60, 0.0600],
               [55, 0.0850],
               [50, 0.1200],
               [45, 0.1700],
               [40, 0.2400],
               [35, 0.3200],
               [30, 0.4000],
               [20, 0.4500]
          ],
          /** Faktor kualitas data: PD dinaikkan bila data tidak lengkap / coverage rendah. */
          coverageFloor: 0.6,
          coveragePenaltyMax: 0.35,
          /** Rata-rata jangka panjang untuk mean-reversion PD lifetime. */
          meanReversion: 0.35
     },

     /** Loss Given Default. */
     lgd: {
          base: 0.45,
          floor: 0.05,
          cap: 0.90,
          /** Lama pemulihan agunan (bulan); nilai agunan didiskonto selama periode ini. */
          recoveryMonths: 18,
          recoveryMonthsByJenis: {
               deposito: 0,
               piutang: 6,
               persediaan: 6,
               kendaraan: 9,
               mesin: 12,
               tanah_bangunan: 18,
               lainnya: 12
          },
          /** Tingkat diskonto tahunan untuk nilai kini hasil pemulihan. */
          discountRate: 0.12,
          /** Haircut nilai agunan menurut jenis (0 = tidak ada penyusutan). */
          haircutByJenis: {
               deposito: 0.05,
               tanah_bangunan: 0.20,
               kendaraan: 0.40,
               mesin: 0.50,
               persediaan: 0.60,
               piutang: 0.65,
               lainnya: 0.55,
               tanpa_agunan: 1.0
          },
          /** Pengurangan LGD bila ada personal guarantee (efektivitas penagihan). */
          pgUplift: 0.05
     },

     /** Base rate, biaya, dan target return untuk risk-based pricing. */
     pricing: {
          fundingCost: 0.085, // cost of fund 8,5% p.a.
          opexRate: 0.020, // biaya operasional atas pokok
          capitalChargeRate: 0.11, // biaya modal × modal ekonomi (UL)
          targetMargin: 0.030, // margin laba minimum
          taxRate: 0.22,
          rarocHurdle: 0.15, // imbal hasil minimum atas modal ekonomi setelah pajak (cost of equity)
          minRate: 0.08,
          maxRate: 0.36,
          tenorSpreadBpsPerYear: 5 // premi tenor 0,05% per tahun tenor
     },

     /** Stress test. */
     stress: {
          bufferTarget: 1.20, // DSCR tertekan harus ≥ target ini agar "tahan"
          // Porsi biaya variabel bila HPP tidak tercatat (ikut turun saat omzet turun); tipikal dagang & F&B.
          variableCostShare: 0.7,
          // Di bawah tingkat ketahanan ini ("sangat rentan") keputusan otomatis paling tinggi REVIEW.
          minSurvivalForAuto: 0.375,
          scenarios: [
               { id: 'S1', label: 'Omzet −20%', shocks: { penjualan: -0.20 } },
               { id: 'S2', label: 'Omzet −35%', shocks: { penjualan: -0.35 } },
               { id: 'S3', label: 'Harga input +15% (margin turun)', shocks: { hpp: 0.15 } },
               { id: 'S4', label: 'Biaya impor/kurs +10%', shocks: { hpp: 0.10, beban_operasional: 0.05 } },
               { id: 'S5', label: 'Piutang macet — kas turun 25% & piutang +60 hari', shocks: { kas: -0.25, piutang: 0.35, piutang_aging_hari: 60 } },
               { id: 'S6', label: 'Kombinasi moderat (omzet −20%, margin −2pp)', shocks: { penjualan: -0.20, margin_delta_pp: -2 } },
               { id: 'S7', label: 'Bunga +300 bps (repricing)', shocks: { bunga_bps: 300 } },
               { id: 'S8', label: 'Nilai agunan turun 20% (LTV naik)', shocks: { nilai_agunan: -0.20 } }
          ]
     },

     /** ATMR risiko kredit pendekatan standar (SEOJK 24/2021, Basel III). */
     rwa: {
          riskWeights: {
               retail: 0.75, // UMKM ritel memenuhi kriteria
               sme_corporate: 0.85, // UMKM/korporasi kecil-menengah tanpa peringkat
               corporate: 1.0, // korporasi tanpa peringkat
               financial_institution: 1.0, // lembaga keuangan tanpa peringkat (sesuaikan grade SCRA)
               past_due: 1.5, // tertunggak > 90 hari, cadangan khusus < 20%
               past_due_provisioned: 1.0 // tertunggak > 90 hari, cadangan khusus ≥ 20%
          },
          retailMaxExposure: 5_000_000_000, // batas eksposur per debitur untuk kelas ritel
          smeMaxSales: 50_000_000_000, // omzet tahunan maksimum UMKM korporasi
          pastDueDays: 90,
          pastDueProvisionThreshold: 0.2,
          ccfUndrawn: 0.4, // komitmen belum ditarik (umum)
          cre: { splitShare: 0.55, riskWeight: 0.6 }, // properti komersial: loan-splitting
          haircut: { deposito: 0, fx: 0.08, exposure: 0 },
          minCar: 0.08, // KPMM minimum
          capitalBuffer: 0.025 // capital conservation buffer
     },

     /** Restrukturisasi 3R (POJK 40/2019). */
     restructuring: {
          gestationPayments: 3, // pembayaran tepat waktu berturut-turut per kenaikan 1 tingkat
          targetDscr: 1.2, // target pemulihan; opsi dengan DSCR ≥ 1,0 tetap layak dipertimbangkan
          maxTenorExtensionBulan: 60,
          maxTenorBulan: 120,
          maxGraceBulan: 12
     },

     /** Syarat penarikan & borrowing base (kredit modal kerja). */
     disbursement: {
          minEquityShareInvestasi: 0.2, // setoran modal sendiri minimal 20% biaya proyek
          borrowingBase: {
               arAdvanceRate: 0.75, // piutang lancar pihak ketiga
               inventoryAdvanceRate: 0.5, // persediaan barang jadi yang cepat laku
               arIneligibleOverDays: 90
          }
     },

     /** Covenant otomatis (terutama untuk LAYAK BERSYARAT). */
     covenant: {
          dscrMin: 1.15,
          derMax: 3.0,
          ltvMax: 0.80,
          agingPiutangMaxHari: 60,
          reportingMaxHari: 15,
          annualReportMaxHari: 120, // laporan tahunan 90–120 hari setelah tutup buku
          notificationMaxHariKerja: 5,
          icrMin: 1.5, // selaras ambang WARNING EWS P2 (materi: tipikal ≥ 2,0x)
          currentRatioMin: 1.0,
          ocfPositif: true,
          toleranceWarn: 0.10, // 10% toleransi sebelum breach dinyatakan material
          includeForReview: false
     },

     /** Metrik portofolio & kolektibilitas. */
     portfolio: {
          /**
           * Batas hari tunggakan per tingkat kolektibilitas (POJK 40/2019): DPK 1–90,
           * Kurang Lancar 91–120, Diragukan 121–180, Macet > 180 hari.
           */
          collectibilityDays: { dpk: 1, kurang_lancar: 91, diragukan: 121, macet: 181 },
          /** Tingkat kolektibilitas yang dihitung NPL (Non-Performing Loan). */
          nplLevels: ['kurang_lancar', 'diragukan', 'macet'],
          /** Konsentrasi sektor: HHI > nilai ini dianggap terkonsentrasi. */
          hhiAlert: 0.25,
          topNConcentration: 10,
          /**
           * PPKA minimum POJK 40/2019: umum 1% (Lancar, atas eksposur bruto) dan khusus
           * 5% / 15% / 50% / 100% (DPK → Macet) atas eksposur setelah dikurangi agunan.
           */
          provisionRate: {
               lancar: 0.01,
               dpk: 0.05,
               kurang_lancar: 0.15,
               diragukan: 0.5,
               macet: 1.0
          },
          /** Tingkat yang PPKA-nya dihitung setelah dikurangi nilai agunan yang diperhitungkan. */
          provisionNetOfCollateral: ['dpk', 'kurang_lancar', 'diragukan', 'macet'],
          /** Kualitas satu debitur mengikuti fasilitas terburuk (POJK 40 Pasal 5–6), kecuali proyek terpisah. */
          obligorContagion: true
     },

     /**
      * CKPN PSAK 71: tahap 1 (ECL 12 bulan), tahap 2 (SICR → ECL seumur fasilitas),
      * tahap 3 (gagal bayar → PD 100%). PD diberi bobot skenario makro (forward-looking).
      */
     ecl: {
          stage2DaysPastDue: 31,
          stage3DaysPastDue: 91,
          /** Level EWS yang menempatkan debitur di watchlist → SICR. */
          sicrEwsLevels: ['WARNING', 'CRITICAL'],
          /** Penurunan peringkat internal sejak pencairan yang dianggap SICR. */
          sicrRatingNotches: 2,
          /** Skenario makro berbobot; pdMultiplier dikalikan ke PD dasar. */
          scenarios: [
               { key: 'base', label: 'Dasar', weight: 0.6, pdMultiplier: 1.0 },
               { key: 'downside', label: 'Memburuk', weight: 0.3, pdMultiplier: 1.5 },
               { key: 'upside', label: 'Membaik', weight: 0.1, pdMultiplier: 0.8 }
          ]
     }
};

/* ============================================================================
 * 3. OVERRIDE PER PROFIL COMPANY (aturan + threshold + target)
 * ==========================================================================*/

/**
 * Setiap profil punya ekspektasi risiko berbeda, sehingga:
 *  - manufacturing: aset & agunan kuat → LTV longgar, DTI lebih longgar;
 *  - trade: siklus kas cepat, margin tipis → DSCR longgar, agunan longgar;
 *  - ukm_mapan: baseline konservatif;
 *  - startup: rekam jejak & agunan lemah → aturan paling ketat, PD lebih tinggi.
 */
export const PROFILE_RULES = {
     startup: {
          label: 'Startup / Early Stage',
          hardRules: {
               dscr_min: 1.25,
               icr_min: 1.35,
               dti_max: 0.30,
               ds_ratio_max: 0.55,
               ltv_max: 0.60,
               ltv_max_with_guarantee: 0.80,
               negative_ocf_periods: 2,
               arrears_days_max: 60
          },
          thresholds: { layak: 78, layak_bersyarat: 65, review: 50 },
          nominal: { dscrTarget: 1.40 },
          covenant: { dscrMin: 1.25, derMax: 2.5, reportingMaxHari: 10 },
          pdMultiplier: 1.35,
          quanti: 0.45
     },
     ukm_mapan: {
          label: 'UKM Mapan',
          hardRules: {
               dscr_min: 1.15,
               icr_min: 1.20,
               dti_max: 0.35,
               ds_ratio_max: 0.60,
               ltv_max: 0.75,
               ltv_max_with_guarantee: 0.95,
               negative_ocf_periods: 2,
               arrears_days_max: 90
          },
          thresholds: { layak: 75, layak_bersyarat: 60, review: 45 },
          nominal: { dscrTarget: 1.30 },
          covenant: { dscrMin: 1.15, derMax: 3.0, reportingMaxHari: 15 },
          pdMultiplier: 1.00,
          quanti: 0.60
     },
     manufacturing: {
          label: 'Manufacturing',
          hardRules: {
               dscr_min: 1.20,
               icr_min: 1.25,
               dti_max: 0.40,
               ds_ratio_max: 0.65,
               ltv_max: 0.80,
               ltv_max_with_guarantee: 1.00,
               negative_ocf_periods: 2,
               arrears_days_max: 90
          },
          thresholds: { layak: 75, layak_bersyarat: 62, review: 47 },
          nominal: { dscrTarget: 1.35 },
          covenant: { dscrMin: 1.20, derMax: 3.5, reportingMaxHari: 15 },
          pdMultiplier: 0.95,
          quanti: 0.70
     },
     trade: {
          label: 'Trading / Distribusi',
          hardRules: {
               dscr_min: 1.10,
               icr_min: 1.15,
               dti_max: 0.45,
               ds_ratio_max: 0.70,
               ltv_max: 0.85,
               ltv_max_with_guarantee: 1.00,
               negative_ocf_periods: 2,
               arrears_days_max: 90
          },
          thresholds: { layak: 72, layak_bersyarat: 58, review: 44 },
          nominal: { dscrTarget: 1.25 },
          covenant: { dscrMin: 1.10, derMax: 4.0, reportingMaxHari: 15 },
          pdMultiplier: 1.05,
          quanti: 0.65
     }
};

/**
 * Overlay sektor: hanya mengubah multiplier PD & batas LTV bila risiko struktural
 * sektor jauh berbeda dari rata-rata (mis. properti sangat siklikal, healthcare defensif).
 */
export const SECTOR_RULES = {
     'IDX-PROPERTY-REALESTATE': { pdMultiplier: 1.15, hardRules: { ltv_max: 0.70 } },
     'IDX-CONSUMER-NON-CYCLICALS': { pdMultiplier: 0.90 },
     'IDX-HEALTHCARE': { pdMultiplier: 0.90 },
     'IDX-TECHNOLOGY': { pdMultiplier: 1.10 },
     'IDX-ENERGY': { pdMultiplier: 1.10 },
     'IDX-BASIC-MATERIALS': { pdMultiplier: 1.05 }
};

/* ============================================================================
 * 4. KOLEKTIBILITAS OJK, SEVERITY EWS, LABEL
 * ==========================================================================*/

/** Kolektibilitas kredit produktif (OJK) — 5 tingkat. */
export const COLLECTIBILITY = {
     LANCAR: 'Lancar',
     DPK: 'Dalam Perhatian Khusus',
     KURANG_LANCAR: 'Kurang Lancar',
     DIRAGUKAN: 'Diragukan',
     MACET: 'Macet'
};

export const COLLECTIBILITY_ORDER = ['lancar', 'dpk', 'kurang_lancar', 'diragukan', 'macet'];

/** Urutan severity EWS (tinggi → rendah). */
export const EWS_SEVERITY_ORDER = ['CRITICAL', 'WARNING', 'WATCH', 'NORMAL'];

export const EWS_SEVERITY_LABEL = {
     CRITICAL: '🔴 Critical',
     WARNING: '🟠 Warning',
     WATCH: '🟡 Watch',
     NORMAL: '🟢 Normal'
};

export const DECISION_LABEL = {
     LAYAK: '✅ LAYAK',
     LAYAK_BERSYARAT: '⚖️ LAYAK BERSYARAT',
     REVIEW: '🟡 REVIEW',
     TIDAK_LAYAK: '❌ TIDAK LAYAK'
};

/** Tahap pipeline pengajuan (pra-pencairan). */
export const PIPELINE_STAGES = [
     { key: 'draft', label: 'Draft' },
     { key: 'dianalisis', label: 'Dianalisis' },
     { key: 'review', label: 'Review / Due Diligence' },
     { key: 'disetujui', label: 'Disetujui' },
     { key: 'ditolak', label: 'Ditolak' }
];

/** Status fasilitas pasca-pencairan. */
export const FACILITY_STATUS = {
     PIPELINE: 'pipeline',
     AKTIF: 'aktif',
     LUNAS: 'lunas',
     DITOLAK: 'ditolak'
};

/* ============================================================================
 * 5. RESOLUSI KONFIGURASI EFEKTIF + SNAPSHOT
 * ==========================================================================*/

function isPlainObject(v) {
     return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** Deep merge sederhana (sumber di kanan menang); array diganti, bukan digabung. */
export function deepMergeConfig(base, over) {
     if (!isPlainObject(base)) return over === undefined ? base : over;
     const out = Array.isArray(base) ? [...base] : { ...base };
     if (!isPlainObject(over)) return out;
     for (const [k, v] of Object.entries(over)) {
          out[k] = isPlainObject(v) && isPlainObject(out[k]) ? deepMergeConfig(out[k], v) : v;
     }
     return out;
}

/**
 * Konfigurasi efektif untuk kombinasi profil + sektor.
 * @param {object} [base] — default DEFAULT_CONFIG atau override dari Pengaturan
 * @param {{profileKey?:string, sectorKey?:string}} [sel]
 * @returns {object} config efektif (sudah termasuk `resolvedFor`)
 */
export function resolveConfig(base = DEFAULT_CONFIG, sel = {}) {
     const profileKey = sel.profileKey || null;
     const sectorKey = sel.sectorKey || null;
     let cfg = deepMergeConfig(DEFAULT_CONFIG, base && base !== DEFAULT_CONFIG ? base : {});

     const overrides = isPlainObject(cfg.profileRules) ? cfg.profileRules : {};
     const profileRule = profileKey ? deepMergeConfig(PROFILE_RULES[profileKey] || {}, overrides[profileKey] || {}) : null;
     if (profileRule) {
          const { label, pdMultiplier, quanti, ...rest } = profileRule;
          cfg = deepMergeConfig(cfg, rest);
          cfg.profile = { key: profileKey, label, pdMultiplier: num0(pdMultiplier, 1), quanti: num0(quanti, 0.6) };
     } else {
          cfg.profile = { key: null, label: '— (default)', pdMultiplier: 1, quanti: num0(cfg.profiles?.[null]?.quanti, 0.6) };
     }

     const sectorRule = sectorKey ? SECTOR_RULES[sectorKey] : null;
     if (sectorRule) cfg = deepMergeConfig(cfg, sectorRule);

     // Jaga konsistensi turunan: ambang Altman & LTV selalu sinkron antar seksi.
     cfg.hardRules.altman_z_distress = cfg.altman.z_distress;
     cfg.version = CONFIG_VERSION;

     cfg.resolvedFor = {
          profile_key: profileKey,
          profile_label: cfg.profile.label,
          sector_key: sectorKey,
          sector_pd_multiplier: num0(sectorRule && sectorRule.pdMultiplier, 1),
          config_version: CONFIG_VERSION
     };
     delete cfg.profiles;
     delete cfg.profileRules;
     return cfg;
}

function num0(v, d = 0) {
     const n = Number(v);
     return Number.isFinite(n) ? n : d;
}

/** Serialisasi stabil (kunci diurutkan, fungsi/volatile dibuang). */
export function stableStringify(value) {
     if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
     if (isPlainObject(value)) {
          const keys = Object.keys(value)
               .filter((k) => k !== 'resolvedFor' && typeof value[k] !== 'function')
               .sort();
          return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
     }
     return JSON.stringify(value === undefined ? null : value);
}

/** Hash FNV-1a 32-bit (hex) atas konfigurasi efektif — untuk snapshot/reproduksibilitas. */
export function configHash(config) {
     const s = stableStringify(config);
     let h = 0x811c9dc5;
     for (let i = 0; i < s.length; i++) {
          h ^= s.charCodeAt(i);
          h = Math.imul(h, 0x01000193) >>> 0;
     }
     return ('00000000' + h.toString(16)).slice(-8);
}

/** Ringkasan aturan efektif (untuk panel snapshot di UI). */
export function ruleSummary(config) {
     return HARD_RULE_DEFS.map((d) => ({
          key: d.key,
          label: d.label,
          metric: d.metric,
          op: d.op,
          unit: d.unit,
          enforcement: d.enforcement,
          value: config.hardRules[d.key],
          description: d.description
     }));
}

/* ============================================================================
 * 6. EVALUASI ATURAN (dipakai eligibility, stress test, covenant)
 * ==========================================================================*/

function metricValue(metrics, key) {
     const v = metrics ? metrics[key] : null;
     if (v === null || v === undefined || v === '') return null;
     const n = Number(v);
     return Number.isFinite(n) ? n : null;
}

function fmtMetric(v, unit) {
     if (v === null) return '—';
     if (unit === '%') return `${(v * 100).toFixed(1)}%`;
     if (unit === 'Z') return v.toFixed(2);
     if (unit === 'x') return `${v.toFixed(2)}x`;
     return `${v}`;
}

/**
 * Evaluasi seluruh aturan terhadap satu set metrik.
 * @param {object} args { metrics, config, options }
 *   metrics: { dscr, icr, dti, ds_ratio, ltv, altman_z, negative_ocf_periods, arrears_days }
 *   options: { skipKeys?:string[], personal_guarantee?:boolean }
 * @returns {{triggered:Array, softNotes:Array, watched:Array, evaluated:Array, passed:boolean}}
 */
export function evaluateRules({ metrics = {}, config = DEFAULT_CONFIG, options = {} } = {}) {
     const skip = new Set(options.skipKeys || []);
     const triggered = [];
     const softNotes = [];
     const watched = [];
     const evaluated = [];

     for (const def of HARD_RULE_DEFS) {
          if (skip.has(def.key)) continue;
          const limit = config.hardRules[def.key];
          if (limit === undefined || limit === null) continue;

          // Aturan LTV punya jalur berbeda bila ada personal guarantee.
          const isLtvPair = def.key === 'ltv_max' || def.key === 'ltv_max_with_guarantee';
          if (isLtvPair) {
               const hasPg = !!options.personal_guarantee;
               if (def.key === 'ltv_max' && hasPg) continue;
               if (def.key === 'ltv_max_with_guarantee' && !hasPg) continue;
          }

          const v = metricValue(metrics, def.metric);
          if (v === null) continue;

          let violated = false;
          switch (def.op) {
               case 'gte':
                    violated = v < limit;
                    break;
               case 'lte':
                    violated = v > limit;
                    break;
               case 'lt':
                    violated = v >= limit;
                    break;
               case 'gt':
                    violated = v <= limit;
                    break;
               default:
                    violated = false;
          }

          const detail = {
               key: def.key,
               rule: def.label,
               metric: def.metric,
               value: v,
               limit,
               op: def.op,
               unit: def.unit,
               enforcement: def.enforcement,
               violated,
               message: violated
                    ? `${def.label}: ${fmtMetric(v, def.unit)} ${def.op === 'gte' ? '< minimum' : def.op === 'lte' ? '> maksimum' : def.op === 'lt' ? '≥ batas' : '≤ batas'} ${fmtMetric(limit, def.unit)}`
                    : `${def.label}: ${fmtMetric(v, def.unit)} ✓ (batas ${fmtMetric(limit, def.unit)})`
          };
          evaluated.push(detail);

          if (violated) {
               if (def.enforcement === 'hard') triggered.push(detail);
               else if (def.enforcement === 'soft') softNotes.push(detail);
               else watched.push(detail);
          }
     }

     return { triggered, softNotes, watched, evaluated, passed: triggered.length === 0 && softNotes.length === 0 };
}

/* ============================================================================
 * 7. UTILITAS
 * ==========================================================================*/

/** Mapping rasio → pilar (untuk menerjemahkan gap ke bobot pilar). */
export function ratioToPillar(ratioKey) {
     const def = COMPONENT_DEFS.find((d) => d.key === ratioKey || d.benchmarkKey === ratioKey);
     return def ? def.pillar : null;
}

/** Komponen dalam pilar tertentu. */
export function componentsOfPillar(pillar) {
     return COMPONENT_DEFS.filter((d) => d.pillar === pillar);
}

/** Ambang Altman Z default (kompatibilitas). */
export const ALTMAN_Z = { safe: DEFAULT_CONFIG.altman.z_safe, distress: DEFAULT_CONFIG.altman.z_distress };
