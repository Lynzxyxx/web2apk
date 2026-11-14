const fs = require('fs');
const path = require('path');
const { Telegraf, Markup } = require('telegraf');
const { buildApk } = require('./builder');
const { prepareSite } = require('./site');
const { classify, SUPPORTED_TEXT, LABEL } = require('./files');
const { SOCIAL, startText, faqText, esc } = require('./texts');

const START_IMAGE = path.join(__dirname, '..', 'public', 'start.png');
const MAX_FILE = 20 * 1024 * 1024;
const MAX_APK = 49 * 1024 * 1024; // batas kirim bot Telegram ±50 MB

const ANDROID = [[21, '5.0'], [23, '6.0'], [24, '7.0'], [26, '8.0'], [28, '9'], [29, '10'], [30, '11'], [31, '12'], [33, '13'], [34, '14']];
const ORIENT = [['Otomatis', 'unspecified'], ['Potret', 'portrait'], ['Lanskap', 'landscape']];
const COLORS = [['Ungu', '#7C3AED'], ['Hijau', '#16A34A'], ['Biru', '#2563EB'], ['Merah', '#DC2626'], ['Hitam', '#111111'], ['Putih', '#FFFFFF']];
const verName = (api) => (ANDROID.find((a) => a[0] === api) || ANDROID[0])[1];
const verLabel = (api) => `Android ${verName(api)}+ (API ${api})`;

// ---------- antrian build (satu per satu) ----------
const MAX_QUEUE = Number(process.env.MAX_QUEUE) || 5;
let chain = Promise.resolve();
let waiting = 0;
let working = false;
function enqueue(fn) {
  waiting++;
  const p = chain.then(async () => {
    waiting--;
    working = true;
    try {
      return await fn();
    } finally {
      working = false;
    }
  });
  chain = p.catch(() => {});
  return p;
}
const queueInfo = () => ({ waiting, working });

// ---------- sesi ----------
const sessions = new Map();
const busy = new Set();
const newS = (extra) => ({ createdAt: Date.now(), mode: 'online', android: 21, o: 0, f: false, c: 0, ...extra });
function setSession(uid, s) {
  clearSession(uid);
  sessions.set(uid, s);
}
function clearSession(uid) {
  const s = sessions.get(uid);
  if (s && s.siteCleanup) s.siteCleanup();
  sessions.delete(uid);
}
setInterval(() => {
  for (const [uid, s] of sessions) if (Date.now() - s.createdAt > 45 * 60 * 1000) clearSession(uid);
}, 5 * 60 * 1000).unref();

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
  if (!res.ok) throw new Error('Gagal mengunduh file dari Telegram.');
  return Buffer.from(await res.arrayBuffer());
}

// ---------- teks & keyboard ----------
const ASK_URL = '🌐 <b>Website → APK</b>\nKirim <b>URL website</b> yang mau dijadikan APK.\nContoh: <code>https://example.com</code>';
const ASK_FILE =
  '🗂️ <b>File → APK</b>\nKirim file kamu sebagai <b>File/Dokumen</b>:\n\n' + esc(SUPPORTED_TEXT) + '\n\nMaksimal 20 MB.';
const ASK_NAME = '✏️ Kirim <b>nama aplikasi</b> (maks 30 karakter).';
const ASK_ICON =
  '🖼 Kirim <b>ikon aplikasi</b> (PNG/JPG, disarankan persegi 512×512 — kirim sebagai <i>File</i> agar tidak terkompres).\n\nAtau tekan <b>Lewati</b> untuk ikon otomatis.';
const NO_SESSION = 'Sesi habis. Ketik /start untuk membuka menu.';
const STAGES = {
  prepare: '⚙️ Menyiapkan project...',
  mirror: '📥 Mengunduh website untuk mode offline...',
  gradle: '🛠 Compile APK (bagian paling lama)...',
};
const cb = (t, d) => Markup.button.callback(t, d);

const sourceLabel = (s) => (s.kind === 'url' ? esc(s.url) : `${esc(s.sourceName)} (${LABEL[s.type] || 'File'})`);
const settingsText = (s) =>
  `⚙️ <b>Pengaturan aplikasi</b>\n📱 <b>${esc(s.name)}</b>\n${s.kind === 'url' ? '🌐' : '📄'} ${sourceLabel(s)}\n\n` +
  'Atur sesuai selera, lalu tekan <b>Lanjut</b>.' +
  (s.kind !== 'url' ? '\n<i>Konten dibundel di dalam APK (bisa dibuka tanpa internet).</i>' : '');

function settingsKeyboard(s) {
  const rows = [];
  if (s.kind === 'url') rows.push([cb(s.mode === 'online' ? '🌐 Mode: Online (live)' : '📦 Mode: Offline (dibundel)', 'opt_mode')]);
  rows.push([cb(`🤖 Android minimal: ${verLabel(s.android)}`, 'opt_android')]);
  rows.push([cb(`📱 Orientasi: ${ORIENT[s.o][0]}`, 'opt_o')]);
  rows.push([cb(`🖥 Fullscreen: ${s.f ? 'Aktif' : 'Mati'}`, 'opt_f')]);
  rows.push([cb(`🎨 Warna tema: ${COLORS[s.c][0]}`, 'opt_c')]);
  rows.push([cb('➡️ Lanjut', 'opt_next')]);
  return Markup.inlineKeyboard(rows);
}

const ANDROID_TEXT =
  '🤖 <b>Pilih Android minimal</b>\nMakin kecil versinya, makin banyak HP yang bisa memasang APK-nya. ' +
  'Android 5.0 mendukung hampir semua HP.';
function androidKeyboard(s) {
  const btns = ANDROID.map(([api, name]) => cb(`${s.android === api ? '✅ ' : ''}Android ${name}+`, `av_${api}`));
  const rows = [];
  for (let i = 0; i < btns.length; i += 2) rows.push(btns.slice(i, i + 2));
  rows.push([cb('⬅️ Kembali', 'opt_back')]);
  return Markup.inlineKeyboard(rows);
}

const socialRow = () => [Markup.button.url('📸 Instagram', SOCIAL.instagram.url), Markup.button.url('🎵 TikTok', SOCIAL.tiktok.url)];

// ---------- bot ----------
function makeBot(hooks = {}) {
  const bot = new Telegraf(process.env.BOT_TOKEN, { handlerTimeout: 30 * 60 * 1000 });
  let startFileId = null;
  const sess = (ctx) => sessions.get(ctx.from.id);

  const beginUrl = (ctx) => {
    setSession(ctx.from.id, newS({ step: 'url', kind: 'url' }));
    return ctx.replyWithHTML(ASK_URL);
  };
  const beginFile = (ctx) => {
    setSession(ctx.from.id, newS({ step: 'file' }));
    return ctx.replyWithHTML(ASK_FILE);
  };

  bot.start(async (ctx) => {
    clearSession(ctx.from.id);
    const caption = startText(ctx.from.first_name);
    const kb = Markup.inlineKeyboard([
      [cb('🌐 Website → APK', 'start_url')],
      [cb('🗂️ HTML / ZIP / File → APK', 'start_file')],
      [cb('❓ FAQ', 'faq')],
      socialRow(),
    ]);
    try {
      const msg = await ctx.replyWithPhoto(startFileId || { source: START_IMAGE }, { caption, parse_mode: 'HTML', ...kb });
      if (!startFileId) startFileId = msg.photo[msg.photo.length - 1].file_id;
    } catch (e) {
      console.error('Gagal kirim gambar start:', e.message);
      startFileId = null;
      await ctx.reply(caption, { parse_mode: 'HTML', ...kb });
    }
  });

  bot.command(['help', 'faq'], (ctx) => ctx.replyWithHTML(faqText(), Markup.inlineKeyboard([socialRow()])));
  bot.command('web2apk', beginUrl);
  bot.command(['file', 'html', 'zip', 'html2apk'], beginFile);
  bot.command('status', (ctx) => {
    const q = queueInfo();
    return ctx.replyWithHTML(`📊 <b>Status</b>\n🛠 Sedang build: ${q.working ? 'ya' : 'tidak'}\n🚦 Antrian: ${q.waiting}`);
  });
  bot.command('cancel', (ctx) => {
    clearSession(ctx.from.id);
    return ctx.reply('❎ Dibatalkan. Ketik /start untuk membuka menu.');
  });
  bot.command('skip', (ctx) => {
    const s = sess(ctx);
    if (s && s.step === 'icon') return startBuild(ctx, s, null);
    return ctx.reply('Tidak ada yang bisa dilewati. Ketik /start untuk membuka menu.');
  });

  // ----- tombol menu -----
  bot.action('start_url', async (ctx) => (await ctx.answerCbQuery(), beginUrl(ctx)));
  bot.action('start_file', async (ctx) => (await ctx.answerCbQuery(), beginFile(ctx)));
  bot.action('faq', async (ctx) => (await ctx.answerCbQuery(), ctx.replyWithHTML(faqText(), Markup.inlineKeyboard([socialRow()]))));

  // ----- tombol pengaturan -----
  const guardOpts = async (ctx) => {
    const s = sess(ctx);
    if (!s || s.step !== 'opts') {
      await ctx.answerCbQuery('Sesi habis. Ketik /start');
      return null;
    }
    await ctx.answerCbQuery();
    return s;
  };
  const refresh = (ctx, s) =>
    ctx.editMessageText(settingsText(s), { parse_mode: 'HTML', ...settingsKeyboard(s) }).catch(() => {});

  bot.action('opt_mode', async (ctx) => {
    const s = await guardOpts(ctx);
    if (!s) return;
    s.mode = s.mode === 'online' ? 'offline' : 'online';
    return refresh(ctx, s);
  });
  bot.action('opt_o', async (ctx) => {
    const s = await guardOpts(ctx);
    if (!s) return;
    s.o = (s.o + 1) % ORIENT.length;
    return refresh(ctx, s);
  });
  bot.action('opt_f', async (ctx) => {
    const s = await guardOpts(ctx);
    if (!s) return;
    s.f = !s.f;
    return refresh(ctx, s);
  });
  bot.action('opt_c', async (ctx) => {
    const s = await guardOpts(ctx);
    if (!s) return;
    s.c = (s.c + 1) % COLORS.length;
    return refresh(ctx, s);
  });
  bot.action('opt_android', async (ctx) => {
    const s = await guardOpts(ctx);
    if (!s) return;
    return ctx.editMessageText(ANDROID_TEXT, { parse_mode: 'HTML', ...androidKeyboard(s) }).catch(() => {});
  });
  bot.action(/^av_(\d+)$/, async (ctx) => {
    const s = await guardOpts(ctx);
    if (!s) return;
    const api = Number(ctx.match[1]);
    if (ANDROID.some((a) => a[0] === api)) s.android = api;
    return refresh(ctx, s);
  });
  bot.action('opt_back', async (ctx) => {
    const s = await guardOpts(ctx);
    if (!s) return;
    return refresh(ctx, s);
  });
  bot.action('opt_next', async (ctx) => {
    const s = await guardOpts(ctx);
    if (!s) return;
    s.step = 'icon';
    return ctx.replyWithHTML(ASK_ICON, Markup.inlineKeyboard([[cb('⏭ Lewati (ikon otomatis)', 'icon_skip')]]));
  });
  bot.action('icon_skip', async (ctx) => {
    const s = sess(ctx);
    if (!s || s.step !== 'icon') return ctx.answerCbQuery('Sesi habis. Ketik /start');
    await ctx.answerCbQuery();
    return startBuild(ctx, s, null);
  });

  // ----- teks -----
  bot.on('text', async (ctx) => {
    const s = sess(ctx);
    if (!s) return ctx.reply('Ketik /start untuk membuka menu.');
    const text = ctx.message.text.trim();
    switch (s.step) {
      case 'url': {
        const url = normalizeUrl(text);
        if (!url) return ctx.replyWithHTML('❌ URL tidak valid. Coba lagi, contoh: <code>https://example.com</code>');
        s.url = url;
        s.step = 'name';
        return ctx.replyWithHTML(ASK_NAME);
      }
      case 'name': {
        if (text.length > 30) return ctx.reply('❌ Nama maksimal 30 karakter. Coba lagi.');
        s.name = text;
        s.step = 'opts';
        return ctx.replyWithHTML(settingsText(s), settingsKeyboard(s));
      }
      case 'file':
        return ctx.reply('Kirim file sebagai File/Dokumen, atau /cancel.');
      case 'icon':
        return ctx.reply('Kirim gambar untuk ikon, atau ketik /skip.');
      case 'opts':
        return ctx.reply('Atur pengaturan lewat tombol di atas, lalu tekan Lanjut.');
      default:
        return ctx.reply('Ketik /start untuk membuka menu.');
    }
  });

  // ----- file masuk -----
  async function onFile(ctx, s, { fileId, fileName, size }) {
    const info = classify(fileName);
    if (!info) return ctx.replyWithHTML('❌ Format tidak didukung. Yang bisa dijadikan APK:\n\n' + esc(SUPPORTED_TEXT));
    if (size > MAX_FILE) return ctx.reply('❌ Ukuran file maksimal 20 MB.');
    const wait = await ctx.reply('📥 Memproses file...');
    try {
      const buf = await downloadFile(ctx, fileId);
      if (info.kind === 'site') {
        const site = prepareSite(buf, fileName);
        s.siteDir = site.dir;
        s.siteCleanup = site.cleanup;
        s.kind = 'site';
      } else {
        if (info.type === 'text' && buf.length > 5 * 1024 * 1024) throw new Error('File teks maksimal 5 MB.');
        s.fileBuf = buf;
        s.kind = 'file';
      }
      s.fileKind = info.kind;
      s.type = info.type;
      s.fileName = fileName;
      s.sourceName = fileName;
      s.step = 'name';
      await ctx.replyWithHTML(`✅ <b>${esc(fileName)}</b> diterima (${LABEL[info.type]}).\n\n${ASK_NAME}`);
    } catch (e) {
      await ctx.reply('❌ ' + e.message);
    } finally {
      ctx.telegram.deleteMessage(ctx.chat.id, wait.message_id).catch(() => {});
    }
  }

  async function onIcon(ctx, s, fileId) {
    try {
      return startBuild(ctx, s, await downloadFile(ctx, fileId));
    } catch (e) {
      return ctx.reply('❌ ' + e.message);
    }
  }

  bot.on('photo', (ctx) => {
    const s = sess(ctx);
    const p = ctx.message.photo[ctx.message.photo.length - 1];
    if (s && s.step === 'icon') return onIcon(ctx, s, p.file_id);
    if (s && s.step === 'file') return onFile(ctx, s, { fileId: p.file_id, fileName: 'foto.jpg', size: p.file_size || 0 });
    return ctx.reply('Ketik /start untuk membuka menu.');
  });
  bot.on('video', (ctx) => {
    const s = sess(ctx);
    const v = ctx.message.video;
    if (s && s.step === 'file') return onFile(ctx, s, { fileId: v.file_id, fileName: v.file_name || 'video.mp4', size: v.file_size || 0 });
    return ctx.reply('Ketik /file dulu untuk mengirim file.');
  });
  bot.on('audio', (ctx) => {
    const s = sess(ctx);
    const a = ctx.message.audio;
    if (s && s.step === 'file') return onFile(ctx, s, { fileId: a.file_id, fileName: a.file_name || 'audio.mp3', size: a.file_size || 0 });
    return ctx.reply('Ketik /file dulu untuk mengirim file.');
  });
  bot.on('document', (ctx) => {
    const s = sess(ctx);
    const d = ctx.message.document;
    if (s && s.step === 'file') return onFile(ctx, s, { fileId: d.file_id, fileName: d.file_name || 'file', size: d.file_size || 0 });
    if (s && s.step === 'icon') {
      if (!d.mime_type || !d.mime_type.startsWith('image/')) return ctx.reply('❌ File harus berupa gambar (PNG/JPG/WEBP).');
      if (d.file_size > 10 * 1024 * 1024) return ctx.reply('❌ Ukuran gambar maksimal 10 MB.');
      return onIcon(ctx, s, d.file_id);
    }
    return ctx.reply('Ketik /file dulu untuk mengirim file.');
  });

  // ----- proses build -----
  async function startBuild(ctx, s, iconBuffer) {
    const uid = ctx.from.id;
    if (busy.has(uid)) return ctx.reply('⏳ Kamu masih punya build yang berjalan. Tunggu selesai dulu.');
    if (waiting + (working ? 1 : 0) >= MAX_QUEUE) return ctx.reply('🚦 Antrian penuh. Coba lagi beberapa menit lagi.');

    sessions.delete(uid); // folder situs dibersihkan setelah build
    busy.add(uid);
    const pos = waiting + (working ? 1 : 0);
    const info = await ctx.reply(pos > 0 ? `🚦 Masuk antrian (di depan kamu: ${pos})...` : '⏳ Menyiapkan build...');
    const setStage = (t) => ctx.telegram.editMessageText(ctx.chat.id, info.message_id, undefined, t).catch(() => {});

    try {
      const result = await enqueue(() =>
        buildApk(
          {
            kind: s.kind, url: s.url, mode: s.mode, siteDir: s.siteDir,
            fileKind: s.fileKind, fileType: s.type, fileName: s.fileName, fileBuf: s.fileBuf,
            name: s.name, iconBuffer, minSdk: s.android,
            orientation: ORIENT[s.o][1], fullscreen: s.f, themeColor: COLORS[s.c][1],
          },
          (stage) => setStage(STAGES[stage] || '⏳ Memproses...')
        )
      );
      if (result.size > MAX_APK) {
        result.cleanup();
        throw new Error('APK terlalu besar untuk dikirim lewat Telegram (maks ±50 MB). Coba kurangi ukuran file/website.');
      }
      const kindText = s.kind === 'url' ? `Website ${s.mode === 'online' ? 'Online' : 'Offline'}` : LABEL[s.type];
      await ctx.replyWithDocument(
        { source: result.apkPath, filename: result.fileName },
        {
          parse_mode: 'HTML',
          caption:
            `✅ <b>APK berhasil dibuat</b>\n📱 Nama: <b>${esc(s.name)}</b>\n🗂 Jenis: ${kindText}\n` +
            `🤖 Android: ${verLabel(s.android)}\n⚙️ ${ORIENT[s.o][0]} · Fullscreen ${s.f ? 'aktif' : 'mati'} · Tema ${COLORS[s.c][0]}\n` +
            `📦 Package: <code>${result.appId}</code>`,
        }
      );
      result.cleanup();
      if (hooks.onResult) hooks.onResult(true);
    } catch (e) {
      console.error(e);
      if (hooks.onResult) hooks.onResult(false);
      await ctx.reply('❌ Gagal membuat APK:\n' + String(e.message).slice(0, 1500));
    } finally {
      busy.delete(uid);
      if (s.siteCleanup) s.siteCleanup();
      ctx.telegram.deleteMessage(ctx.chat.id, info.message_id).catch(() => {});
    }
  }

  bot.catch((err) => console.error('Bot error:', err));
  return bot;
}

module.exports = { makeBot, queueInfo };
