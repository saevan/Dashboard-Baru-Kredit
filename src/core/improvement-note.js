export const IMPROVEMENT_NOTE_STAGES = ['scored', 'offered', 'accepted', 'declined', 'decided', 'rejected'];
export function improvementNote(text, at = new Date().toISOString()) {
     if (typeof text !== 'string' || !text.trim() || text.trim().length > 4000) throw new Error('Isi catatan perbaikan antara 1 dan 4.000 karakter.');
     return { text: text.trim(), updated_at: at };
}

/**
 * Pecah catatan perbaikan menjadi langkah bernomor + daftar bukti untuk ditampilkan rapi.
 * Format otomatis: "1. Tindakan\nBukti: a, b, dan c" dipisah baris kosong; kalimat sesudah
 * langkah terakhir menjadi penutup. Catatan bebas tanpa nomor → steps kosong (tampil apa adanya).
 */
export function parseImprovementSteps(text) {
     const blocks = String(text || '').replace(/\r\n?/g, '\n').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
     const steps = []; const rest = [];
     for (const block of blocks) {
          const m = block.match(/^(\d{1,2})[.)]\s+([\s\S]+)$/);
          if (!m) { rest.push(block); continue; }
          const [actionPart, ...evidenceParts] = m[2].split(/\n\s*Bukti\s*:\s*/i);
          // Pisah per koma berspasi (koma desimal "1,5" tetap utuh); buang kata sambung di depan item.
          const evidence = evidenceParts.join(' ').replace(/\.\s*$/, '').split(/,\s+/).map((e) => e.trim().replace(/^(?:dan|serta)\s+/i, ''))
               .filter(Boolean).map((e) => e[0].toUpperCase() + e.slice(1));
          steps.push({ action: actionPart.replace(/\s*\n\s*/g, ' ').trim(), evidence });
     }
     return steps.length ? { steps, closing: rest.join('\n\n') } : { steps: [], closing: String(text || '').trim() };
}
