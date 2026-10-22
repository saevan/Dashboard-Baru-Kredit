export const COLLATERAL_TYPES = { tanah_bangunan: 'Tanah & bangunan', deposito: 'Deposito / kas', kendaraan: 'Kendaraan', mesin: 'Mesin / peralatan', persediaan: 'Persediaan', piutang: 'Piutang', lainnya: 'Lainnya' };
export function collateralError(a = {}) {
     if (a.ketersediaan === 'tidak_ada') return null;
     if (a.ketersediaan !== 'ada') return 'Pilih tersedia atau tidak ada agunan.';
     if (!COLLATERAL_TYPES[a.jenis]) return 'Pilih jenis agunan.';
     if (!Number.isFinite(Number(a.nilai_agunan)) || Number(a.nilai_agunan) <= 0) return 'Estimasi nilai agunan harus lebih dari 0.';
     if (!String(a.pemilik || '').trim()) return 'Isi nama pemilik agunan.';
     if (!String(a.keterangan || '').trim()) return 'Isi lokasi atau identifikasi agunan.';
     return null;
}
