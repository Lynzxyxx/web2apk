const fs = require('fs');
const os = require('os');
const path = require('path');

const MAX_FILES = 3000;
const MAX_TOTAL = 100 * 1024 * 1024; // 100 MB setelah diekstrak

function countFiles(dir) {
  let n = 0;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    n += fs.statSync(p).isDirectory() ? countFiles(p) : 1;
  }
  return n;
}

/**
 * Menyiapkan folder website dari file .html atau .zip.
 * Return: { dir, cleanup, fileCount }
 */
function prepareSite(buffer, filename) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'site-'));
  const cleanup = () => fs.rm(tmp, { recursive: true, force: true }, () => {});

  try {
    if (/\.html?$/i.test(filename)) {
      fs.writeFileSync(path.join(tmp, 'index.html'), buffer);
      return { dir: tmp, cleanup, fileCount: 1 };
    }

    const AdmZip = require('adm-zip');
    let zip;
    try {
      zip = new AdmZip(buffer);
    } catch {
      throw new Error('File ZIP rusak atau tidak bisa dibaca.');
    }

    const entries = zip
      .getEntries()
      .filter(
        (e) =>
          !e.isDirectory &&
          !e.entryName.startsWith('__MACOSX/') &&
          !path.basename(e.entryName).startsWith('._')
      );
    if (!entries.length) throw new Error('ZIP kosong.');
    if (entries.length > MAX_FILES) throw new Error(`Terlalu banyak file (maks ${MAX_FILES}).`);

    let total = 0;
    for (const e of entries) total += e.header.size;
    if (total > MAX_TOTAL) throw new Error('Ukuran isi ZIP terlalu besar (maks 100 MB).');

    const root = path.resolve(tmp);
    for (const e of entries) {
      const rel = e.entryName.replace(/\\/g, '/');
      const target = path.resolve(root, rel);
      if (!target.startsWith(root + path.sep)) throw new Error('ZIP berisi path yang tidak aman.');
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, e.getData());
    }

    // index.html harus ada di root (atau di dalam satu folder induk)
    let siteRoot = root;
    if (!fs.existsSync(path.join(siteRoot, 'index.html'))) {
      const top = fs.readdirSync(root).filter((n) => !n.startsWith('.'));
      const only = top.length === 1 ? path.join(root, top[0]) : null;
      if (only && fs.statSync(only).isDirectory() && fs.existsSync(path.join(only, 'index.html'))) {
        siteRoot = only;
      } else {
        throw new Error('index.html tidak ditemukan di root ZIP. Pastikan file utama bernama index.html.');
      }
    }
    return { dir: siteRoot, cleanup, fileCount: countFiles(siteRoot) };
  } catch (e) {
    cleanup();
    throw e;
  }
}

module.exports = { prepareSite };
