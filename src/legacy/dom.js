/** Potongan ui/dom.js dashboard lama: hanya escapeHtml yang dipakai halaman utama. */
const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function escapeHtml(value) {
     if (value === null || value === undefined) return '';
     return String(value).replace(/[&<>"']/g, (c) => ENTITIES[c]);
}
