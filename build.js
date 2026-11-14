// Dijalankan oleh GitHub Actions: membangun APK dari template lalu mengirimnya ke Telegram.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync, spawnSync } = require('child_process');
const sharp = require('sharp');

const E = process.env;
const TOKEN = E.TELEGRAM_BOT_TOKEN;
const CHAT = E.CHAT_ID;
const TG = `https://api.telegram.org/bot${TOKEN}`;
const SIZES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };

const slugify = (n) => {
  let s = n.toLowerCase().replace(/[^a-z0-9]/g, '') || 'app';
  if (/^[0-9]/.test(s)) s = 'app' + s;
  return s.slice(0, 20);
};
const xmlEscape = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/@/g, '\\@').replace(/\?/g, '\\?');

async function tgSend(text) {
  await fetch(`${TG}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT, text }),
  });
}

async function download(fileId) {
  const j = await (await fetch(`${TG}/getFile?file_id=${encodeURIComponent(fileId)}`)).json();
  if (!j.ok) throw new Error('Gagal mengambil file dari Telegram: ' + j.description);
  const r = await fetch(`https://api.telegram.org/file/bot${TOKEN}/${j.result.file_path}`);
  if (!r.ok) throw new Error('Gagal mengunduh file dari Telegram.');
  return Buffer.from(await r.arrayBuffer());
}

function replaceIn(file, map) {
  let c = fs.readFileSync(file, 'utf8');
  for (const [k, v] of Object.entries(map)) c = c.split(k).join(v);
  fs.writeFileSync(file, c);
}

function defaultIcon(name) {
  const letter = (name.trim()[0] || 'A').toUpperCase().replace(/[<>&]/g, 'A');
  const hue = parseInt(crypto.createHash('md5').update(name).digest('hex').slice(0, 4), 16) % 360;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="hsl(${hue},65%,45%)"/><text x="256" y="350" font-size="300" font-family="sans-serif" font-weight="bold" fill="#fff" text-anchor="middle">${letter}</text></svg>`
  );
}

// siapkan folder website dari .html / .zip
async function prepareSite(fileId, fileName, dest) {
  const buf = await download(fileId);
  fs.mkdirSync(dest, { recursive: true });
  if (/\.html?$/i.test(fileName)) {
    fs.writeFileSync(path.join(dest, 'index.html'), buf);
    return;
  }
  const zipPath = path.join(os.tmpdir(), 'site.zip');
  fs.writeFileSync(zipPath, buf);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'site-'));
  try {
    execFileSync('unzip', ['-q', '-o', zipPath, '-d', tmp, '-x', '__MACOSX/*']);
  } catch {
    throw new Error('File ZIP rusak atau tidak bisa dibaca.');
  }
  let root = tmp;
  if (!fs.existsSync(path.join(root, 'index.html'))) {
    const top = fs.readdirSync(root).filter((n) => !n.startsWith('.'));
    const only = top.length === 1 ? path.join(root, top[0]) : null;
    if (only && fs.statSync(only).isDirectory() && fs.existsSync(path.join(only, 'index.html'))) root = only;
    else throw new Error('index.html tidak ditemukan di root ZIP.');
  }
  fs.cpSync(root, dest, { recursive: true });
}

async function main() {
  const name = (E.APP_NAME || '').trim().slice(0, 30);
  if (!name) throw new Error('Nama aplikasi kosong.');
  if (!E.START_URL && !E.SITE_FILE_ID) throw new Error('URL atau file website tidak ada.');

  const orientation = ['unspecified', 'portrait', 'landscape'].includes(E.ORIENTATION) ? E.ORIENTATION : 'unspecified';
  const color = /^#[0-9a-fA-F]{6}$/.test(E.THEME_COLOR || '') ? E.THEME_COLOR : '#7C3AED';
  const fullscreen = E.FULLSCREEN === 'true' ? 'true' : 'false';

  const id = crypto.randomBytes(4).toString('hex');
  const appId = `com.web2apk.${slugify(name)}${id}`;
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'apk-'));
  fs.cpSync(path.join(__dirname, 'template'), work, { recursive: true });

  let startUrl = E.START_URL;
  if (E.SITE_FILE_ID) {
    await prepareSite(E.SITE_FILE_ID, E.SITE_FILE_NAME || 'index.html', path.join(work, 'app/src/main/assets/www'));
    startUrl = 'file:///android_asset/www/index.html';
  }

  const res = 'app/src/main/res/';
  replaceIn(path.join(work, 'app/build.gradle'), { __APP_ID__: appId });
  replaceIn(path.join(work, 'app/src/main/AndroidManifest.xml'), { __ORIENTATION__: orientation });
  replaceIn(path.join(work, res, 'values/strings.xml'), {
    __APP_NAME__: xmlEscape(name),
    __URL__: startUrl.replace(/&/g, '&amp;').replace(/</g, '&lt;'),
    __THEME_COLOR__: color,
  });
  replaceIn(path.join(work, res, 'values/config.xml'), { __FULLSCREEN__: fullscreen });

  // ikon
  let iconBuf = defaultIcon(name);
  if (E.ICON_FILE_ID) iconBuf = await download(E.ICON_FILE_ID);
  try {
    await sharp(iconBuf).metadata();
  } catch {
    throw new Error('File ikon tidak bisa dibaca. Pakai PNG/JPG yang valid.');
  }
  for (const [dpi, px] of Object.entries(SIZES)) {
    const dir = path.join(work, res, `mipmap-${dpi}`);
    fs.mkdirSync(dir, { recursive: true });
    await sharp(iconBuf).resize(px, px, { fit: 'cover' }).png().toFile(path.join(dir, 'ic_launcher.png'));
  }

  const sdk = E.ANDROID_HOME || E.ANDROID_SDK_ROOT;
  if (sdk) fs.writeFileSync(path.join(work, 'local.properties'), `sdk.dir=${sdk}\n`);

  const g = spawnSync('gradle', ['assembleDebug', '--no-daemon', '-q'], { cwd: work, encoding: 'utf8', maxBuffer: 100 * 1024 * 1024 });
  if (g.status !== 0) {
    const out = `${g.stderr || ''}\n${g.stdout || ''}`.split('\n').filter(Boolean).slice(-12).join('\n');
    throw new Error(out || 'Gradle gagal.');
  }

  const apk = path.join(work, 'app/build/outputs/apk/debug/app-debug.apk');
  if (!fs.existsSync(apk)) throw new Error('APK tidak ditemukan setelah build.');

  const fd = new FormData();
  fd.append('chat_id', CHAT);
  fd.append(
    'caption',
    `✅ APK berhasil dibuat\n📱 Nama: ${name}\n` + (E.SITE_FILE_ID ? `📄 Sumber: ${E.SITE_FILE_NAME}\n` : `🌐 URL: ${E.START_URL}\n`) + `📦 Package: ${appId}`
  );
  fd.append('document', new Blob([fs.readFileSync(apk)], { type: 'application/vnd.android.package-archive' }), `${slugify(name)}.apk`);
  const r = await fetch(`${TG}/sendDocument`, { method: 'POST', body: fd });
  const j = await r.json();
  if (!j.ok) throw new Error('Gagal mengirim APK ke Telegram: ' + j.description);
  console.log('APK terkirim.');
}

main().catch(async (e) => {
  console.error(e);
  try {
    await tgSend('❌ Gagal membuat APK:\n' + String(e.message).slice(-1500));
  } catch {}
  process.exit(1);
});
