/** ui/simulator.js — Simulasi cicilan bunga flat; dipakai beranda pemohon dan landing page. */
import { installmentSimulationError } from '../core/installment-simulation.js';
import { loanCostDisclosure } from '../core/loan-cost.js';
import { classifyBorrower } from '../core/segment.js';
import {
     installmentFor,
     NEW_LOAN_SCHEME,
     periodicInstallment,
     suggestPeriodicity,
     normalizePeriodicity,
     PERIODICITIES,
     PERIODICITY_LABELS
} from '../core/debt-service.js';
import { loanCostHtml } from './loan-cost.js';
import { escapeHtml } from './dom.js';
import { formatRupiah } from '../utils/format.js';

/**
 * @param {{ limits?: { minTenor:number, maxTenor:number, maxPlafon:number } }} [options]
 *   Batas kebijakan untuk halaman publik; dashboard memakai batas validasi umum.
 */
export function simHtml({ limits = null } = {}) {
     const opts = PERIODICITIES.map(
          (p) => `<option value="${p}">${escapeHtml(PERIODICITY_LABELS[p])}</option>`
     ).join('');
     return `
     <div class="card">
          <div class="card-head"><h2 class="lvl-3">Simulasi Cicilan</h2></div>
          <div class="card-body">
               <p class="muted small">
                    Bunga flat dihitung dari pokok awal selama seluruh tenor, meskipun sisa pokok berkurang.
                    Tampilan harian/mingguan membantu memperkirakan dana yang perlu disisihkan.
               </p>
               <form data-sim-form${limits ? ` data-min-tenor="${limits.minTenor}" data-max-tenor="${limits.maxTenor}" data-max-plafon="${limits.maxPlafon}"` : ''}>
                    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;">
                         <label class="field"><span>Plafon (Rp)</span>
                              <input type="number" name="plafon" min="1" ${limits ? `max="${limits.maxPlafon}" ` : ''}step="any" required value="100000000" /></label>
                         <label class="field"><span>Tenor (bulan)</span>
                              <input type="number" name="tenor" min="${limits ? limits.minTenor : 1}" max="${limits ? limits.maxTenor : 600}" step="1" required value="12" /></label>
                         <label class="field"><span>Bunga flat (% / tahun)</span>
                              <input type="number" name="bunga" min="0" step="any" required value="14" /></label>
                         <label class="field"><span>Tampilan estimasi dana</span>
                              <select name="periodicity">${opts}</select></label>
                    </div>
                    <div class="muted small" style="margin-top:6px;" data-sim-hint></div>
                    <div style="margin-top:12px;" data-sim-out aria-live="polite"></div>
               </form>
          </div>
     </div>`;
}

function simResultHtml({ periodicity, inst, periodic }) {
     const row = (label, value) =>
          `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--surface-2);">
               <span class="muted">${escapeHtml(label)}</span><strong>${value}</strong>
          </div>`;
     const unit = { harian: 'hari', mingguan: 'minggu', bulanan: 'bulan' }[periodicity];
     const equivalent = periodicity !== 'bulanan';
     return `
     <div style="background:var(--surface-2);border:1px solid var(--surface-3);border-radius:8px;padding:12px;">
          ${row('Cicilan per bulan (flat)', formatRupiah(inst.first_payment))}
          ${row('Jumlah cicilan bulanan', `${inst.tenor_bulan}×`)}
          ${equivalent ? row(`Estimasi dana per ${unit}`, formatRupiah(periodic.per_period)) + row('Jumlah periode penyisihan (estimasi)', `${periodic.tenor_period.toLocaleString('id-ID')}×`) : ''}
          ${row('Total bunga', formatRupiah(inst.total_interest))}
          ${row('Total pembayaran', formatRupiah(inst.total_payment))}
     </div>
     <p class="small">Total bunga = pokok awal × bunga flat tahunan × tenor bulan ÷ 12.<br>Cicilan bulanan = (pokok awal + total bunga) ÷ tenor bulan.</p>
     ${loanCostHtml(loanCostDisclosure(inst.principal, inst.schedule))}
     ${equivalent ? `<p class="muted small">Estimasi ${unit} membagi total pembayaran ke ${periodic.tenor_period} periode: ${periodicity === 'harian' ? '30 hari per bulan' : '52 minggu per tahun, jumlah minggu dibulatkan'}. Jadwal kredit tetap bulanan; bunga belum dihitung ulang sebagai kredit ${periodicity}.</p>` : ''}
     <p class="muted small">Belum termasuk biaya admin, provisi, asuransi, atau denda. Angka ditampilkan dalam rupiah bulat; total dihitung sebelum pembulatan.</p>`;
}

export function bindSimulator(mount) {
     const form = mount.querySelector('[data-sim-form]');
     if (!form) return;
     const out = form.querySelector('[data-sim-out]');
     const hint = form.querySelector('[data-sim-hint]');
     // Akses eksplisit (bukan properti bernama form.*) agar andal di jsdom.
     const plafonEl = form.querySelector('[name="plafon"]');
     const tenorEl = form.querySelector('[name="tenor"]');
     const bungaEl = form.querySelector('[name="bunga"]');
     const periodicityEl = form.querySelector('[name="periodicity"]');
     if (!plafonEl || !tenorEl || !bungaEl || !periodicityEl) return;
     form.addEventListener('submit', (event) => { event.preventDefault(); paint(); });
     let touched = false;

     periodicityEl.addEventListener('change', () => {
          touched = true;
          paint();
     });
     [plafonEl, tenorEl, bungaEl].forEach((el) => el.addEventListener('input', paint));

     // Batas kebijakan (landing page): tenor & plafon yang dipublikasikan.
     function policyError() {
          const { minTenor, maxTenor, maxPlafon } = form.dataset;
          if (maxTenor && (Number(tenorEl.value) < Number(minTenor) || Number(tenorEl.value) > Number(maxTenor))) return `Tenor ${minTenor}–${maxTenor} bulan.`;
          if (maxPlafon && Number(plafonEl.value) > Number(maxPlafon)) return `Plafon maksimal ${formatRupiah(Number(maxPlafon))}.`;
          return '';
     }

     function paint() {
          const error = installmentSimulationError({ principal: plafonEl.value, tenorBulan: tenorEl.value,
               annualRate: bungaEl.value === '' ? '' : Number(bungaEl.value) / 100 }) || policyError();
          if (error) {
               if (hint) hint.textContent = '';
               if (out) out.innerHTML = `<p role="alert">${escapeHtml(error)}</p>`;
               return;
          }
          const plafon = Number(plafonEl.value);
          const tenor = Number(tenorEl.value);
          const bunga = Number(bungaEl.value);
          const segment = classifyBorrower({ plafon_diajukan: plafon });
          const suggested = suggestPeriodicity(segment.key);
          if (!touched) periodicityEl.value = suggested;
          const periodicity = normalizePeriodicity(periodicityEl.value);
          const inst = installmentFor(NEW_LOAN_SCHEME, plafon, bunga / 100, tenor, {});
          if (!Number.isFinite(inst.total_payment)) {
               if (out) out.innerHTML = '<p role="alert">Angka terlalu besar untuk dihitung. Periksa plafon dan bunga.</p>';
               return;
          }
          const periodic = periodicInstallment({
               monthlyPayment: inst.monthly_avg,
               periodicity,
               tenorBulan: tenor
          });
          if (hint) {
               hint.innerHTML = `Segmen terdeteksi: <strong>${escapeHtml(segment.label)}</strong> · estimasi dana <strong>${escapeHtml(PERIODICITY_LABELS[periodicity])}</strong>`;
          }
          if (out) out.innerHTML = simResultHtml({ plafon, tenor, periodicity, inst, periodic, suggested });
     }

     paint();
}

