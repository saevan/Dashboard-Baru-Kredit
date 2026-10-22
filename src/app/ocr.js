/**
 * ui/ocr.js — OCR laporan keuangan (foto / PDF hasil scan) di browser pemohon.
 *
 * Tesseract.js dimuat dari CDN hanya saat dibutuhkan; berkas tidak dikirim ke
 * layanan pihak ketiga. Data bahasa (ind+eng) diunduh sekali lalu disimpan
 * di cache browser oleh Tesseract.
 */
import { readPdfImages } from '../core/pdf-text.js';
import { ocrCandidates } from '../core/ocr-text.js';

const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js';
const MAX_PAGES = 5;
let loading = null;

function loadTesseract() {
     if (globalThis.Tesseract) return Promise.resolve(globalThis.Tesseract);
     loading ??= new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = TESSERACT_URL;
          script.crossOrigin = 'anonymous';
          script.onload = () => (globalThis.Tesseract ? resolve(globalThis.Tesseract) : reject(new Error('Modul OCR tidak tersedia.')));
          script.onerror = () => { loading = null; reject(new Error('Modul OCR gagal dimuat. Periksa koneksi internet lalu coba lagi.')); };
          document.head.append(script);
     });
     return loading;
}

/** Piksel mentah PDF (Gray/RGB) → PNG Blob melalui canvas. */
async function pixelsToBlob({ width, height, channels, bytes }) {
     const canvas = document.createElement('canvas');
     canvas.width = width; canvas.height = height;
     const ctx = canvas.getContext('2d');
     const image = ctx.createImageData(width, height);
     for (let i = 0, j = 0; i < width * height; i++, j += channels) {
          const r = bytes[j], g = channels === 3 ? bytes[j + 1] : r, b = channels === 3 ? bytes[j + 2] : r;
          image.data.set([r, g, b, 255], i * 4);
     }
     ctx.putImageData(image, 0, 0);
     return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Gambar halaman tidak dapat disiapkan.'))), 'image/png'));
}

/** Gambar yang akan dibaca: foto langsung, atau gambar halaman dari PDF hasil scan. */
async function pagesOf(bytes, ext) {
     if (ext !== 'pdf') return [new Blob([bytes], { type: ext === 'png' ? 'image/png' : 'image/jpeg' })];
     const pdf = await readPdfImages(bytes, { maxPages: MAX_PAGES });
     if (pdf.encrypted) throw new Error('PDF terkunci kata sandi. Unggah PDF tanpa kata sandi.');
     if (!pdf.images.length) throw new Error('Gambar halaman PDF tidak ditemukan atau formatnya belum didukung OCR. Unggah foto/JPG halaman laporan.');
     return Promise.all(pdf.images.map((img) => (img.type === 'jpeg' ? new Blob([img.bytes], { type: 'image/jpeg' }) : pixelsToBlob(img))));
}

/**
 * Baca angka laporan dari foto/PDF scan.
 * @param {Uint8Array} bytes
 * @param {string} filename
 * @param {(text: string) => void} [onProgress]
 * @returns {Promise<{status: 'ready'|'unrecognized', message: string, candidates: Array, source: 'ocr'}>}
 */
export async function ocrFinancialFile(bytes, filename, onProgress = () => {}) {
     const ext = String(filename).split('.').pop().toLowerCase();
     if (!['pdf', 'png', 'jpg', 'jpeg'].includes(ext)) throw new Error('OCR hanya untuk foto (JPG/PNG) atau PDF hasil scan.');
     onProgress('Menyiapkan OCR…');
     const [Tesseract, pages] = await Promise.all([loadTesseract(), pagesOf(bytes, ext)]);
     let page = 0;
     const worker = await Tesseract.createWorker('ind+eng', 1, {
          logger: (m) => {
               if (m.status === 'recognizing text') onProgress(`Membaca halaman ${page + 1}/${pages.length} dengan OCR… ${Math.round((m.progress || 0) * 100)}%`);
               else if (/load|initializ/i.test(m.status || '')) onProgress('Mengunduh data bahasa OCR (sekali saja)…');
          }
     });
     const texts = [];
     try {
          for (; page < pages.length; page++) texts.push((await worker.recognize(pages[page])).data.text);
     } finally { await worker.terminate(); }
     const candidates = ocrCandidates(texts.join('\n'));
     return candidates.length
          ? { status: 'ready', source: 'ocr', message: 'Angka dibaca dengan OCR. Bandingkan dengan dokumen, lalu pilih “Gunakan angka laporan ini”.', candidates }
          : { status: 'unrecognized', source: 'ocr', message: 'OCR tidak menemukan pos laporan keuangan (mis. Penjualan, Jumlah aset). Pastikan foto tegak, terang, dan tidak terpotong, atau isi angka secara manual.', candidates: [] };
}
