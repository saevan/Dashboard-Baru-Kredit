import { normalizeLoanCost } from '../core/loan-cost.js';
import { formatRupiah } from '../utils/format.js';
import { escapeHtml } from './dom.js';

export function loanCostHtml(raw) {
     const cost = normalizeLoanCost(raw);
     if (!cost) return '';
     const pct = rate => `${(rate * 100).toLocaleString('id-ID', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}%`;
     return `<section class="loan-cost-disclosure" aria-label="Bunga efektif dan nilai kini">
          <p><strong>Efektif tahunan ekuivalen: ${escapeHtml(pct(cost.effective_annual_rate))}</strong><br>
          <span class="muted small">Setara ${escapeHtml(pct(cost.monthly_rate))} per bulan atas sisa pokok. Belum termasuk biaya tambahan; bukan APR seluruh biaya.</span></p>
          <details><summary>Cara menghitung nilai kini (PV)</summary>
               <p><code>PV = Σ Cₜ / (1 + i)ᵗ</code></p>
               <p class="small">Cₜ = pembayaran bulan ke-t; i = bunga ekuivalen bulanan ${escapeHtml(pct(cost.monthly_rate))}.
               Tingkat i dihitung dari jadwal bulanan sehingga PV cicilan = dana pinjaman ${escapeHtml(formatRupiah(cost.present_value))}.
               Rumus memakai presisi penuh sebelum pembulatan tampilan.</p>
               <p class="small">PV menjelaskan nilai waktu uang. Total yang dibayar tetap <strong>${escapeHtml(formatRupiah(cost.total_payment))}</strong> sesuai jadwal, sebelum biaya tambahan.</p>
          </details>
     </section>`;
}
