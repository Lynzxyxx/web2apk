const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const sharp = require('sharp');

const TEMPLATE = path.join(__dirname, '..', 'template');
const SIZES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };

function xmlEscape(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/@/g, '\\@')
    .replace(/\?/g, '\\?');
}

function slugify(name) {
  let s = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!s) s = 'app';
  if (/^[0-9]/.test(s)) s = 'app' + s;
  return s.slice(0, 20);
}

function defaultIconSvg(name) {
  const letter = (name.trim()[0] || 'A').toUpperCase().replace(/[<>&]/g, 'A');
  const hue = parseInt(crypto.createHash('md5').update(name).digest('hex').slice(0, 4), 16) % 360;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <rect width="512" height="512" fill="hsl(${hue},65%,45%)"/>
      <text x="256" y="350" font-size="300" font-family="sans-serif" font-weight="bold" fill="#fff" text-anchor="middle">${letter}</text>
    </svg>`
  );
}

function replaceInFile(file, map) {
  let c = fs.readFileSync(file, 'utf8');
  for (const [k, v] of Object.entries(map)) c = c.split(k).join(v);
  fs.writeFileSync(file, c);
}

function run(cmd, args, opts) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { ...opts, maxBuffer: 50 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const out = (stderr || stdout || err.message).toString();
        return reject(new Error(out.split('\n').filter(Boolean).slice(-15).join('\n')));
      }
      resolve(stdout);
    });
  });
}

async function buildApk({ url, name, iconBuffer }) {
  const id = crypto.randomBytes(4).toString('hex');
  const work = path.join(os.tmpdir(), 'web2apk-' + id);
  const appId = `com.web2apk.${slugify(name)}${id}`;

  fs.cpSync(TEMPLATE, work, { recursive: true });

  // nama, URL, package
  replaceInFile(path.join(work, 'app/build.gradle'), { __APP_ID__: appId });
  replaceInFile(path.join(work, 'app/src/main/res/values/strings.xml'), {
    __APP_NAME__: xmlEscape(name),
    __URL__: url.replace(/&/g, '&amp;').replace(/</g, '&lt;'),
  });

  // ikon
  let source;
  try {
    source = sharp(iconBuffer || defaultIconSvg(name));
    await source.metadata();
  } catch {
    throw new Error('File ikon tidak bisa dibaca. Pakai PNG/JPG yang valid.');
  }
  for (const [dpi, px] of Object.entries(SIZES)) {
    const dir = path.join(work, 'app/src/main/res', `mipmap-${dpi}`);
    fs.mkdirSync(dir, { recursive: true });
    await sharp(iconBuffer || defaultIconSvg(name))
      .resize(px, px, { fit: 'cover' })
      .png()
      .toFile(path.join(dir, 'ic_launcher.png'));
  }

  // lokasi Android SDK
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (!sdk) throw new Error('ANDROID_HOME belum diatur di server.');
  fs.writeFileSync(path.join(work, 'local.properties'), `sdk.dir=${sdk}\n`);

  // build
  await run(process.env.GRADLE_BIN || 'gradle', ['assembleDebug', '--no-daemon', '-q'], {
    cwd: work,
    timeout: 20 * 60 * 1000,
    env: process.env,
  });

  const apkPath = path.join(work, 'app/build/outputs/apk/debug/app-debug.apk');
  if (!fs.existsSync(apkPath)) throw new Error('APK tidak ditemukan setelah build.');

  return {
    apkPath,
    appId,
    fileName: `${slugify(name)}.apk`,
    cleanup: () => fs.rm(work, { recursive: true, force: true }, () => {}),
  };
}

module.exports = { buildApk };
