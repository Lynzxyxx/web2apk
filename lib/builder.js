const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const sharp = require('sharp');
const { makeViewerHtml, safeName } = require('./files');

const TEMPLATE = path.join(__dirname, '..', 'template');
const OVERLAY_PDF = path.join(__dirname, '..', 'overlays', 'pdf', 'MainActivity.java');
const ORIGIN = 'https://appassets.androidplatform.net';
const SIZES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const MIN_SDKS = [21, 23, 24, 26, 28, 29, 30, 31, 33, 34];
const UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36';

const xmlEscape = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/@/g, '\\@').replace(/\?/g, '\\?');

function slugify(name) {
  let s = name.toLowerCase().replace(/[^a-z0-9]/g, '') || 'app';
  if (/^[0-9]/.test(s)) s = 'app' + s;
  return s.slice(0, 20);
}

function defaultIconSvg(name) {
  const letter = (name.trim()[0] || 'A').toUpperCase().replace(/[<>&]/g, 'A');
  const hue = parseInt(crypto.createHash('md5').update(name).digest('hex').slice(0, 4), 16) % 360;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="hsl(${hue},65%,45%)"/><text x="256" y="350" font-size="300" font-family="sans-serif" font-weight="bold" fill="#fff" text-anchor="middle">${letter}</text></svg>`
  );
}

function replaceInFile(file, map) {
  let c = fs.readFileSync(file, 'utf8');
  for (const [k, v] of Object.entries(map)) c = c.split(k).join(v);
  fs.writeFileSync(file, c);
}

function run(cmd, args, opts) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { ...opts, maxBuffer: 100 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        if (err.code === 'ENOENT') return reject(new Error(`${cmd} tidak ditemukan di server. Pasang dulu (lihat README).`));
        const out = (stderr || stdout || err.message).toString();
        return reject(new Error(out.split('\n').filter(Boolean).slice(-15).join('\n')));
      }
      resolve(stdout);
    });
  });
}

function listHtml(dir, base = dir, out = []) {
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n);
    if (fs.statSync(p).isDirectory()) listHtml(p, base, out);
    else if (/\.html?$/i.test(n)) out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out;
}

// mode offline untuk URL: unduh halaman + aset (wget), return path file awal
async function mirrorSite(url, dest) {
  fs.mkdirSync(dest, { recursive: true });
  try {
    await run('wget', ['-r', '-l', '2', '-np', '-p', '-k', '-E', '-nH', '-e', 'robots=off', '--timeout=20', '--tries=2', '--quota=60m', '-U', UA, '-P', dest, url], { timeout: 180000 });
  } catch (e) {
    if (/tidak ditemukan/.test(e.message)) throw e; // wget keluar non-zero untuk 404 kecil; lanjut jika ada file
  }
  const htmls = listHtml(dest);
  if (!htmls.length) throw new Error('Gagal mengunduh website untuk mode offline (situs memblokir atau butuh login). Coba mode Online.');

  const u = new URL(url);
  let rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
  if (!rel || rel.endsWith('/')) rel += 'index.html';
  const cands = [rel, rel + '.html', rel.replace(/\.[^/.]+$/, '') + '.html'];
  let start = cands.find((c) => fs.existsSync(path.join(dest, c)));
  if (!start) start = fs.existsSync(path.join(dest, 'index.html')) ? 'index.html' : htmls[0];
  return start;
}

const assetUrl = (rel) => ORIGIN + '/' + rel.split('/').map(encodeURIComponent).join('/');

/**
 * opts: { kind:'url'|'site'|'file', url, mode:'online'|'offline', siteDir,
 *         fileKind:'viewer'|'pdf', fileType, fileName, fileBuf,
 *         name, iconBuffer, minSdk, orientation, fullscreen, themeColor }
 */
async function buildApk(opts, onProgress = () => {}) {
  const name = opts.name;
  const id = crypto.randomBytes(4).toString('hex');
  const work = path.join(os.tmpdir(), 'web2apk-' + id);
  const appId = `com.web2apk.${slugify(name)}${id}`;
  const cleanup = () => fs.rm(work, { recursive: true, force: true }, () => {});

  try {
    onProgress('prepare');
    fs.cpSync(TEMPLATE, work, { recursive: true });
    const www = path.join(work, 'app/src/main/assets/www');
    fs.mkdirSync(www, { recursive: true });

    let startUrl;
    if (opts.kind === 'url' && opts.mode !== 'offline') {
      startUrl = opts.url;
    } else if (opts.kind === 'url') {
      onProgress('mirror');
      startUrl = assetUrl(await mirrorSite(opts.url, www));
    } else if (opts.kind === 'site') {
      fs.cpSync(opts.siteDir, www, { recursive: true });
      startUrl = ORIGIN + '/index.html';
    } else if (opts.fileKind === 'pdf') {
      fs.writeFileSync(path.join(www, 'file.pdf'), opts.fileBuf);
      fs.copyFileSync(OVERLAY_PDF, path.join(work, 'app/src/main/java/com/web2apk/template/MainActivity.java'));
      startUrl = ORIGIN + '/index.html';
    } else {
      const sn = safeName(opts.fileName);
      const isText = opts.fileType === 'text';
      if (!isText) fs.writeFileSync(path.join(www, sn), opts.fileBuf);
      const title = opts.fileName.replace(/\.[^.]+$/, '');
      fs.writeFileSync(path.join(www, 'index.html'), makeViewerHtml(opts.fileType, title, sn, isText ? opts.fileBuf.toString('utf8') : ''));
      startUrl = ORIGIN + '/index.html';
    }

    const minSdk = MIN_SDKS.includes(Number(opts.minSdk)) ? Number(opts.minSdk) : 21;
    const orientation = ['unspecified', 'portrait', 'landscape'].includes(opts.orientation) ? opts.orientation : 'unspecified';
    const color = /^#[0-9a-fA-F]{6}$/.test(opts.themeColor || '') ? opts.themeColor : '#7C3AED';
    const res = 'app/src/main/res/';

    replaceInFile(path.join(work, 'app/build.gradle'), { __APP_ID__: appId, __MIN_SDK__: String(minSdk) });
    replaceInFile(path.join(work, 'app/src/main/AndroidManifest.xml'), { __ORIENTATION__: orientation });
    replaceInFile(path.join(work, res, 'values/strings.xml'), {
      __APP_NAME__: xmlEscape(name),
      __URL__: startUrl.replace(/&/g, '&amp;').replace(/</g, '&lt;'),
      __THEME_COLOR__: color,
    });
    replaceInFile(path.join(work, res, 'values/config.xml'), { __FULLSCREEN__: opts.fullscreen ? 'true' : 'false' });

    // ikon
    const iconSrc = opts.iconBuffer || defaultIconSvg(name);
    try {
      await sharp(iconSrc).metadata();
    } catch {
      throw new Error('File ikon tidak bisa dibaca. Pakai PNG/JPG yang valid.');
    }
    for (const [dpi, px] of Object.entries(SIZES)) {
      const dir = path.join(work, res, `mipmap-${dpi}`);
      fs.mkdirSync(dir, { recursive: true });
      await sharp(iconSrc).resize(px, px, { fit: 'cover' }).png().toFile(path.join(dir, 'ic_launcher.png'));
    }

    const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
    if (!sdk) throw new Error('ANDROID_HOME belum diatur di server.');
    fs.writeFileSync(path.join(work, 'local.properties'), `sdk.dir=${sdk}\n`);

    onProgress('gradle');
    await run(process.env.GRADLE_BIN || 'gradle', ['assembleDebug', '--no-daemon', '-q'], {
      cwd: work,
      timeout: (Number(process.env.BUILD_TIMEOUT_MIN) || 20) * 60 * 1000,
      env: process.env,
    });

    const apkPath = path.join(work, 'app/build/outputs/apk/debug/app-debug.apk');
    if (!fs.existsSync(apkPath)) throw new Error('APK tidak ditemukan setelah build.');
    return { apkPath, appId, fileName: `${slugify(name)}.apk`, size: fs.statSync(apkPath).size, cleanup };
  } catch (e) {
    cleanup();
    throw e;
  }
}

module.exports = { buildApk, MIN_SDKS };
