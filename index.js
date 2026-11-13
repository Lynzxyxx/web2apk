require('dotenv').config();
const path = require('path');
const { Telegraf, Markup } = require('telegraf');
const { buildApk } = require('./lib/builder');
const { prepareSite } = require('./lib/site');
const { deployToVercel, slugifyProject } = require('./lib/deploy');

if (!process.env.BOT_TOKEN) {
  console.error('BOT_TOKEN belum diisi. Salin .env.example menjadi .env lalu isi tokennya.');
  process.exit(1);
}

const bot = new Telegraf(process.env.BOT_TOKEN, { handlerTimeout: 20 * 60 * 1000 });

/*
 * state per user:
 *  step: 'url' | 'name' | 'icon'                    (alur Website -> APK)
 *        'site' | 'site_action' | 'deploy_name'     (alur HTML/ZIP -> APK / Deploy)
 */
const sessions = new Map();
const lastDeploys = new Map(); // userId -> url hasil deploy terakhir

function setSession(uid, data) {
  clearSession(uid);
  sessions.set(uid, { ...data, createdAt: Date.now() });
}
function clearSession(uid) {
  const s = sessions.get(uid);
  if (s && s.siteCleanup) s.siteCleanup();
  sessions.delete(uid);
}
// bersihkan sesi yang terbengkalai (> 45 menit)
setInterval(() => {
  for (const [uid, s] of sessions) if (Date.now() - s.createdAt > 45 * 60 * 1000) clearSession(uid);
}, 5 * 60 * 1000).unref();

// antrian build (satu per satu supaya server tidak kehabisan RAM)
let chain = Promise.resolve();
let queued = 0;
function enqueue(fn) {
  queued++;
  const p = chain.then(fn, fn).finally(() => queued--);
  chain = p.catch(() => {});
  return p;
}

function normalizeUrl(input) {
  let t = input.trim();
  if (!/^https?:\/\//i.test(t)) t = 'https://' + t;
  try {
    const u = new URL(t);
    if (!['http:', 'https:'].includes(u.protocol) || !u.hostname.includes('.')) return null;
    return u.toString();
  } catch {
    return null;
  }
}

async function downloadFile(ctx, fileId) {
  let link;
  try {
    link = await ctx.telegram.getFileLink(fileId);
  } catch {
    throw new Error('Gagal mengambil file. Ukuran maksimal yang bisa diterima bot adalah 20 MB.');
  }
  const res = await fetch(link.href || String(link));
  if (!res.ok) throw new Error('Gagal mengunduh file dari Telegram');
  return Buffer.from(await res.arrayBuffer());
}

// ---------------------------------------------------------------- /start & help
const HELP =
  '🤖 *Bot Web2APK*\n\n' +
  '/web2apk - ubah URL website jadi APK\n' +
  '/html - ubah file HTML/ZIP jadi APK, atau deploy jadi website\n' +
  '/cancel - batalkan proses\n' +
  '/help - bantuan\n\n' +
  '*Catatan HTML/ZIP:* kirim file `.html`, atau `.zip` yang berisi `index.html` (maks 20 MB). Hanya website statis (HTML/CSS/JS).';

const START_IMAGE = path.join(__dirname, 'assets', 'start.png');
let startFileId = null; // cache file_id supaya gambar tidak diunggah ulang tiap /start

const START_CAPTION =
  '🐱 *Selamat datang di WEB2APK Bot!*\n\n' +
  '• 🌐 *Website → APK* (dari URL)\n' +
  '• 📄 *HTML/ZIP → APK* atau *Deploy ke website*\n\n' +
  'Atur sendiri *nama aplikasi* dan *ikon aplikasi*.\n\n' +
  '👇 Pilih menu di bawah.';

const startKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('🌐 Website → APK', 'start_web2apk')],
  [Markup.button.callback('📄 HTML/ZIP → APK / Deploy', 'start_html')],
  [Markup.button.callback('📖 Bantuan', 'show_help')],
]);

bot.start(async (ctx) => {
  clearSession(ctx.from.id);
  const opts = { caption: START_CAPTION, parse_mode: 'Markdown', ...startKeyboard };
  try {
    const msg = await ctx.replyWithPhoto(startFileId || { source: START_IMAGE }, opts);
    if (!startFileId) startFileId = msg.photo[msg.photo.length - 1].file_id;
  } catch (e) {
    console.error('Gagal kirim gambar start:', e.message);
    startFileId = null;
    await ctx.reply(START_CAPTION, { parse_mode: 'Markdown', ...startKeyboard });
  }
});

bot.help((ctx) => ctx.replyWithMarkdown(HELP));

// ---------------------------------------------------------------- alur Website -> APK
function beginWeb2Apk(ctx) {
  setSession(ctx.from.id, { step: 'url' });
  return ctx.reply('🌐 Kirim URL website yang mau dijadikan APK.\nContoh: https://sora-pedia.my.id');
}

// ---------------------------------------------------------------- alur HTML/ZIP
function beginSite(ctx) {
  setSession(ctx.from.id, { step: 'site' });
  return ctx.reply(
    '📄 Kirim file website kamu sebagai *File/Dokumen*:\n' +
      '• `.html` (satu halaman), atau\n' +
      '• `.zip` berisi `index.html` + aset (CSS/JS/gambar)\n\n' +
      'Maksimal 20 MB.',
    { parse_mode: 'Markdown' }
  );
}

bot.command('web2apk', beginWeb2Apk);
bot.command(['html', 'html2apk', 'deploy'], beginSite);

bot.action('start_web2apk', async (ctx) => {
  await ctx.answerCbQuery();
  return beginWeb2Apk(ctx);
});
bot.action('start_html', async (ctx) => {
  await ctx.answerCbQuery();
  return beginSite(ctx);
});
bot.action('show_help', async (ctx) => {
  await ctx.answerCbQuery();
  return ctx.replyWithMarkdown(HELP);
});

bot.action('site_apk', async (ctx) => {
  await ctx.answerCbQuery();
  const s = sessions.get(ctx.from.id);
  if (!s || s.step !== 'site_action') return ctx.reply('Sesi habis. Ketik /html untuk mulai lagi.');
  s.step = 'name';
  return ctx.reply('✏️ Kirim *nama aplikasi* (maks 30 karakter).', { parse_mode: 'Markdown' });
});

bot.action('site_deploy', async (ctx) => {
  await ctx.answerCbQuery();
  const s = sessions.get(ctx.from.id);
  if (!s || s.step !== 'site_action') return ctx.reply('Sesi habis. Ketik /html untuk mulai lagi.');
  s.step = 'deploy_name';
  return ctx.reply(
    '🏷 Kirim *nama project* untuk alamat website (huruf kecil, angka, strip).\n' +
      'Contoh: `toko-gilang` → toko-gilang.vercel.app',
    { parse_mode: 'Markdown' }
  );
});

bot.action('deploy_to_apk', async (ctx) => {
  await ctx.answerCbQuery();
  const url = lastDeploys.get(ctx.from.id);
  if (!url) return ctx.reply('Data deploy tidak ditemukan. Ketik /web2apk lalu kirim URL websitenya.');
  setSession(ctx.from.id, { step: 'name', url });
  return ctx.reply('✏️ Kirim *nama aplikasi* (maks 30 karakter).', { parse_mode: 'Markdown' });
});

bot.command('cancel', (ctx) => {
  clearSession(ctx.from.id);
  ctx.reply('❎ Dibatalkan. Ketik /web2apk atau /html untuk mulai lagi.');
});

bot.command('skip', (ctx) => {
  const s = sessions.get(ctx.from.id);
  if (s && s.step === 'icon') return startBuild(ctx, s, null);
  ctx.reply('Tidak ada yang bisa di-skip. Ketik /web2apk atau /html untuk mulai.');
});

// ---------------------------------------------------------------- teks
bot.on('text', async (ctx) => {
  const s = sessions.get(ctx.from.id);
  if (!s) return ctx.reply('Ketik /web2apk (dari URL) atau /html (dari file HTML/ZIP) untuk mulai.');
  const text = ctx.message.text.trim();

  if (s.step === 'url') {
    const url = normalizeUrl(text);
    if (!url) return ctx.reply('❌ URL tidak valid. Coba lagi, contoh: https://example.com');
    s.url = url;
    s.step = 'name';
    return ctx.reply('✏️ Sekarang kirim *nama aplikasi* (maks 30 karakter).', { parse_mode: 'Markdown' });
  }

  if (s.step === 'name') {
    if (text.length < 1 || text.length > 30) return ctx.reply('❌ Nama harus 1-30 karakter. Coba lagi.');
    s.name = text;
    s.step = 'icon';
    return ctx.reply(
      '🖼 Kirim *ikon aplikasi* (gambar PNG/JPG, disarankan persegi 512x512, kirim sebagai File agar tidak terkompres).\n\nAtau ketik /skip untuk memakai ikon otomatis.',
      { parse_mode: 'Markdown' }
    );
  }

  if (s.step === 'icon') return ctx.reply('Kirim gambar untuk ikon, atau ketik /skip.');

  if (s.step === 'site') return ctx.reply('Kirim file .html atau .zip sebagai File/Dokumen, atau /cancel.');
  if (s.step === 'site_action') return ctx.reply('Pilih salah satu tombol di atas: Jadikan APK atau Deploy.');

  if (s.step === 'deploy_name') {
    const slug = slugifyProject(text);
    if (slug.length < 3) return ctx.reply('❌ Nama project minimal 3 karakter (huruf/angka). Coba lagi.');
    const wait = await ctx.reply('🚀 Sedang deploy ke Vercel...');
    try {
      const result = await deployToVercel(s.siteDir, slug);
      lastDeploys.set(ctx.from.id, result.url);
      clearSession(ctx.from.id);
      await ctx.reply(
        `✅ Website berhasil di-deploy!\n\n🌐 ${result.url}\n\n` +
          'Catatan: memakai nama project yang sama akan memperbarui website lama.',
        Markup.inlineKeyboard([[Markup.button.callback('📱 Jadikan APK dari website ini', 'deploy_to_apk')]])
      );
    } catch (e) {
      console.error(e);
      await ctx.reply('❌ Gagal deploy:\n' + String(e.message).slice(0, 1500) + '\n\nKirim nama project lain untuk coba lagi, atau /cancel.');
    } finally {
      ctx.telegram.deleteMessage(ctx.chat.id, wait.message_id).catch(() => {});
    }
  }
});

// ---------------------------------------------------------------- gambar & dokumen
async function handleImage(ctx, fileId) {
  const s = sessions.get(ctx.from.id);
  if (!s || s.step !== 'icon') return ctx.reply('Ketik /web2apk atau /html untuk mulai.');
  try {
    const buf = await downloadFile(ctx, fileId);
    return startBuild(ctx, s, buf);
  } catch (e) {
    return ctx.reply('❌ ' + e.message);
  }
}

async function handleSiteFile(ctx, s, d) {
  const fname = d.file_name || '';
  if (!/\.(html?|zip)$/i.test(fname)) return ctx.reply('❌ File harus berformat .html atau .zip');
  if (d.file_size > 20 * 1024 * 1024) return ctx.reply('❌ Ukuran file maksimal 20 MB.');

  const wait = await ctx.reply('📥 Memproses file...');
  try {
    const buf = await downloadFile(ctx, d.file_id);
    const site = prepareSite(buf, fname);
    s.siteDir = site.dir;
    s.siteCleanup = site.cleanup;
    s.step = 'site_action';
    await ctx.reply(
      `✅ File diterima (${site.fileCount} file).\nMau diapakan?`,
      Markup.inlineKeyboard([
        [Markup.button.callback('📱 Jadikan APK', 'site_apk')],
        [Markup.button.callback('🌐 Deploy ke Website', 'site_deploy')],
      ])
    );
  } catch (e) {
    await ctx.reply('❌ ' + e.message);
  } finally {
    ctx.telegram.deleteMessage(ctx.chat.id, wait.message_id).catch(() => {});
  }
}

bot.on('photo', (ctx) => {
  const photos = ctx.message.photo;
  return handleImage(ctx, photos[photos.length - 1].file_id);
});

bot.on('document', (ctx) => {
  const s = sessions.get(ctx.from.id);
  const d = ctx.message.document;

  if (s && s.step === 'site') return handleSiteFile(ctx, s, d);

  if (!d.mime_type || !d.mime_type.startsWith('image/')) {
    return ctx.reply(s && s.step === 'icon' ? '❌ File harus berupa gambar (PNG/JPG/WEBP).' : 'Ketik /html dulu untuk mengirim file website.');
  }
  if (d.file_size > 10 * 1024 * 1024) return ctx.reply('❌ Ukuran gambar maksimal 10 MB.');
  return handleImage(ctx, d.file_id);
});

// ---------------------------------------------------------------- build APK
async function startBuild(ctx, s, iconBuffer) {
  sessions.delete(ctx.from.id); // folder situs (jika ada) dibersihkan setelah build
  const pos = queued;
  const info = await ctx.reply(
    `⏳ ${pos > 0 ? `Masuk antrian (di depan kamu: ${pos}).` : 'Sedang membangun APK...'}\n` +
      'Build pertama bisa 3-10 menit karena Gradle mengunduh dependensi.'
  );

  try {
    const result = await enqueue(() => buildApk({ url: s.url, siteDir: s.siteDir, name: s.name, iconBuffer }));
    await ctx.replyWithDocument(
      { source: result.apkPath, filename: result.fileName },
      {
        caption:
          `✅ APK berhasil dibuat\n📱 Nama: ${s.name}\n` +
          (s.siteDir ? '📄 Sumber: file HTML (dibundel di dalam APK)\n' : `🌐 URL: ${s.url}\n`) +
          `📦 Package: ${result.appId}`,
      }
    );
    result.cleanup();
  } catch (e) {
    console.error(e);
    await ctx.reply('❌ Gagal membuat APK:\n' + String(e.message).slice(0, 1500));
  } finally {
    if (s.siteCleanup) s.siteCleanup();
    ctx.telegram.deleteMessage(ctx.chat.id, info.message_id).catch(() => {});
  }
}

bot.catch((err) => console.error('Bot error:', err));
bot.launch().then(() => {
  console.log('Bot Web2APK berjalan...');
  bot.telegram
    .setMyCommands([
      { command: 'start', description: 'Menu utama' },
      { command: 'web2apk', description: 'Website (URL) jadi APK' },
      { command: 'html', description: 'File HTML/ZIP jadi APK atau deploy' },
      { command: 'cancel', description: 'Batalkan proses' },
      { command: 'help', description: 'Bantuan' },
    ])
    .catch(() => {});
});
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
