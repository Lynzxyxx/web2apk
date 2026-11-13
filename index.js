require('dotenv').config();
const path = require('path');
const { Telegraf, Markup } = require('telegraf');
const { buildApk } = require('./lib/builder');

if (!process.env.BOT_TOKEN) {
  console.error('BOT_TOKEN belum diisi. Salin .env.example menjadi .env lalu isi tokennya.');
  process.exit(1);
}

const bot = new Telegraf(process.env.BOT_TOKEN, { handlerTimeout: 20 * 60 * 1000 });

// state per user: { step: 'url' | 'name' | 'icon', url, name }
const sessions = new Map();

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
  const link = await ctx.telegram.getFileLink(fileId);
  const res = await fetch(link.href || String(link));
  if (!res.ok) throw new Error('Gagal mengunduh file dari Telegram');
  return Buffer.from(await res.arrayBuffer());
}

const HELP =
  '🤖 *Bot Web2APK*\n\n' +
  'Ubah website jadi aplikasi Android (APK).\n\n' +
  '/web2apk - mulai buat APK\n' +
  '/cancel - batalkan proses\n' +
  '/help - bantuan';

const START_IMAGE = path.join(__dirname, 'assets', 'start.png');
let startFileId = null; // cache file_id supaya gambar tidak diunggah ulang tiap /start

const START_CAPTION =
  '🐱 *Selamat datang di WEB2APK Bot!*\n\n' +
  'Ubah website kamu jadi aplikasi Android (APK) dengan mudah.\n' +
  'Atur sendiri *URL*, *nama aplikasi*, dan *ikon aplikasi*.\n\n' +
  '👇 Tekan tombol di bawah atau ketik /web2apk untuk mulai.';

const startKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('🚀 Buat APK Sekarang', 'start_web2apk')],
  [Markup.button.callback('📖 Bantuan', 'show_help')],
]);

bot.start(async (ctx) => {
  sessions.delete(ctx.from.id);
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

function beginWeb2Apk(ctx) {
  sessions.set(ctx.from.id, { step: 'url' });
  return ctx.reply('🌐 Kirim URL website yang mau dijadikan APK.\nContoh: https://sora-pedia.my.id');
}

bot.command('web2apk', beginWeb2Apk);
bot.action('start_web2apk', async (ctx) => {
  await ctx.answerCbQuery();
  return beginWeb2Apk(ctx);
});
bot.action('show_help', async (ctx) => {
  await ctx.answerCbQuery();
  return ctx.replyWithMarkdown(HELP);
});

bot.command('cancel', (ctx) => {
  sessions.delete(ctx.from.id);
  ctx.reply('❎ Dibatalkan. Ketik /web2apk untuk mulai lagi.');
});

bot.command('skip', (ctx) => {
  const s = sessions.get(ctx.from.id);
  if (s && s.step === 'icon') return startBuild(ctx, s, null);
  ctx.reply('Tidak ada yang bisa di-skip. Ketik /web2apk untuk mulai.');
});

bot.on('text', async (ctx) => {
  const s = sessions.get(ctx.from.id);
  if (!s) return ctx.reply('Ketik /web2apk untuk mulai membuat APK.');
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
});

async function handleImage(ctx, fileId) {
  const s = sessions.get(ctx.from.id);
  if (!s || s.step !== 'icon') return ctx.reply('Ketik /web2apk untuk mulai membuat APK.');
  try {
    const buf = await downloadFile(ctx, fileId);
    return startBuild(ctx, s, buf);
  } catch (e) {
    return ctx.reply('❌ ' + e.message);
  }
}

bot.on('photo', (ctx) => {
  const photos = ctx.message.photo;
  return handleImage(ctx, photos[photos.length - 1].file_id);
});

bot.on('document', (ctx) => {
  const d = ctx.message.document;
  if (!d.mime_type || !d.mime_type.startsWith('image/')) return ctx.reply('❌ File harus berupa gambar (PNG/JPG/WEBP).');
  if (d.file_size > 10 * 1024 * 1024) return ctx.reply('❌ Ukuran gambar maksimal 10 MB.');
  return handleImage(ctx, d.file_id);
});

async function startBuild(ctx, s, iconBuffer) {
  sessions.delete(ctx.from.id);
  const pos = queued;
  const info = await ctx.reply(
    `⏳ ${pos > 0 ? `Masuk antrian (di depan kamu: ${pos}).` : 'Sedang membangun APK...'}\n` +
      'Build pertama bisa 3-10 menit karena Gradle mengunduh dependensi.'
  );

  try {
    const result = await enqueue(() => buildApk({ url: s.url, name: s.name, iconBuffer }));
    await ctx.replyWithDocument(
      { source: result.apkPath, filename: result.fileName },
      {
        caption:
          `✅ APK berhasil dibuat\n📱 Nama: ${s.name}\n🌐 URL: ${s.url}\n📦 Package: ${result.appId}`,
      }
    );
    result.cleanup();
  } catch (e) {
    console.error(e);
    await ctx.reply('❌ Gagal membuat APK:\n' + String(e.message).slice(0, 1500));
  } finally {
    ctx.telegram.deleteMessage(ctx.chat.id, info.message_id).catch(() => {});
  }
}

bot.catch((err) => console.error('Bot error:', err));
bot.launch().then(() => console.log('Bot Web2APK berjalan...'));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
