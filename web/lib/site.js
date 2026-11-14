import AdmZip from 'adm-zip';

const MAX_FILES = 3000;
const MAX_TOTAL = 100 * 1024 * 1024;
const NO_INDEX = 'index.html tidak ditemukan di root ZIP. Pastikan file utama bernama index.html.';

/** Mengubah file .html / .zip menjadi daftar file [{ rel, data }] (di memori). */
export function extractSite(buffer, filename) {
  if (/\.html?$/i.test(filename)) return [{ rel: 'index.html', data: buffer }];

  let zip;
  try {
    zip = new AdmZip(buffer);
  } catch {
    throw new Error('File ZIP rusak atau tidak bisa dibaca.');
  }
  const entries = zip
    .getEntries()
    .filter((e) => !e.isDirectory && !e.entryName.startsWith('__MACOSX/') && !e.entryName.split('/').pop().startsWith('._'));
  if (!entries.length) throw new Error('ZIP kosong.');
  if (entries.length > MAX_FILES) throw new Error(`Terlalu banyak file (maks ${MAX_FILES}).`);
  let total = 0;
  for (const e of entries) total += e.header.size;
  if (total > MAX_TOTAL) throw new Error('Ukuran isi ZIP terlalu besar (maks 100 MB).');

  let files = entries.map((e) => ({ rel: e.entryName.replace(/\\/g, '/').replace(/^\/+/, ''), data: e.getData() }));
  if (files.some((f) => f.rel.split('/').includes('..'))) throw new Error('ZIP berisi path yang tidak aman.');

  if (!files.some((f) => f.rel === 'index.html')) {
    const tops = new Set(files.map((f) => f.rel.split('/')[0]));
    const top = tops.size === 1 ? [...tops][0] : null;
    if (top && files.some((f) => f.rel === `${top}/index.html`)) {
      files = files.map((f) => ({ rel: f.rel.slice(top.length + 1), data: f.data }));
    } else {
      throw new Error(NO_INDEX);
    }
  }
  return files;
}
