import { tg, downloadTgFile } from './telegram';
import { getJSON, setJSON, del, incr, setnx } from './store';
import { dispatchBuild } from './github';
import { deployToVercel, slugifyProject } from './deploy';
import { extractSite } from './site';
import { FAQ, SOCIAL } from './texts';

// ------------------------------------------------------------------ helper
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const send = (chat, text, extra = {}) =>
  tg('sendMessage', { chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra });
const kb = (rows) => ({ reply_markup: { inline_keyboard: rows } });
const b = (text, data) => ({ text, callback_data: data });
const link = (text, url) => ({ text, url });
const socialRow = [link('📸 Instagram', SOCIAL.instagram.url), link('🎵 TikTok', SOCIAL.tiktok.url)];

const ORIENT = [['Otomatis', 'unspecified'], ['Potret', 'portrait'], ['Lanskap', 'landscape']];
const COLORS = [['Ungu', '#7C3AED'], ['Hijau', '#16A34A'], ['Biru', '#2563EB'], ['Merah', '#DC2626'], ['Hitam', '#111111'], ['Putih', '#FFFFFF']];

const getS = (uid) => getJSON(`s:${uid}`);
const putS = (uid, s) => setJSON(`s:${uid}`, s, 3600);
const newS = (extra) => ({ o: 0, f: false, c: 0, ...extra });

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

// ------------------------------------------------------------------ teks
const startText = (first) =>
  [
    '<b>🐱 WEB2APK</b> <i>— Website jadi Aplikasi Android</i>',
    '━━━━━━━━━━━━━━━━━━━━',
    '',
    `Halo, <b>${esc(first || 'teman')}</b>! 👋`,
    'Ubah website atau file HTML kamu jadi <b>APK</b> langsung dari Telegram.',
    '',
    '<b>✨ Fitur</b>',
    '┣ 🌐 Website (URL) → APK',
    '┣ 📄 HTML / ZIP → APK',
    '┣ 🚀 Deploy HTML / ZIP jadi website',
    '┣ 🎨 Atur nama, ikon, warna &amp; orientasi',
    '┗ ⚡ Aktif 24 jam',
    '',
    '<b>📌 Cara pakai</b>',
    '1️⃣ Pilih menu di bawah',
    '2️⃣ Kirim URL atau file website',
    '3️⃣ Atur nama &amp; ikon',
    '4️⃣ Terima APK-nya 📲',
    '',
    '<i>Butuh bantuan? Ketik /faq</i>',
  ].join('\n');

const faqText = () =>
  '❓ <b>FAQ — WEB2APK</b>\n\n' +
  FAQ.map((f, i) => `<b>${i + 1}. ${esc(f.q)}</b>\n${esc(f.a)}`).join('\n\n') +
  `\n\n📸 Instagram: <code>${SOCIAL.instagram.handle}</code>\n🎵 TikTok: <code>${SOCIAL.tiktok.handle}</code>`;

const ASK_URL = '🌐 <b>Website → APK</b>\nKirim <b>URL website</b> yang mau dijadikan APK.\nContoh: <code>https://example.com</code>';
const ASK_SITE =
  '📄 <b>HTML / ZIP</b>\nKirim file website kamu sebagai <b>File/Dokumen</b>:\n• <code>.html</code> (satu halaman), atau\n• <code>.zip</code> berisi <code>index.html</code> + aset\n\nMaksimal 20 MB.';
const ASK_NAME = '✏️ Kirim <b>nama aplikasi</b> (maks 30 karakter).';
const ASK_ICON =
  '🖼 Kirim <b>ikon aplikasi</b> (PNG/JPG, disarankan persegi 512×512 — kirim sebagai <i>File</i> agar tidak terkompres).\n\nAtau tekan <b>Lewati</b> untuk ikon otomatis.';
const NO_SESSION = 'Sesi habis. Ketik /start untuk membuka menu.';

const optionsKeyboard = (s) =>
  kb([
    [b(`📱 Orientasi: ${ORIENT[s.o][0]}`, 'opt_o')],
    [b(`🖥 Fullscreen: ${s.f ? 'Aktif' : 'Mati'}`, 'opt_f')],
    [b(`🎨 Warna tema: ${COLORS[s.c][0]}`, 'opt_c')],
    [b('➡️ Lanjut', 'opt_next')],
  ]);

// ------------------------------------------------------------------ aksi
async function start(chat, uid, first, ctx) {
  await del(`s:${uid}`);
  const rows = [
    [b('🌐 Website → APK', 'menu_url')],
    [b('📄 HTML/ZIP → APK / Deploy', 'menu_site')],
    [b('❓ FAQ', 'faq')],
    socialRow,
  ];
  const caption = startText(first);
  try {
    await tg('sendPhoto', { chat_id: chat, photo: `${ctx.origin}/start.png`, caption, parse_mode: 'HTML', ...kb(rows) });
  } catch {
    await send(chat, caption, kb(rows));
  }
}

async function beginUrl(chat, uid) {
  await putS(uid, newS({ step: 'url' }));
  return send(chat, ASK_URL);
}
async function beginSite(chat, uid) {
  await putS(uid, newS({ step: 'site' }));
  return send(chat, ASK_SITE);
}

async function startBuild(chat, uid, s, iconFileId) {
  try {
    await dispatchBuild({
      chat_id: String(chat),
      app_name: s.name,
      url: s.url || '',
      icon_file_id: iconFileId || '',
      site_file_id: s.siteFileId || '',
      site_file_name: s.siteFileName || '',
      orientation: ORIENT[s.o][1],
      fullscreen: String(Boolean(s.f)),
      theme_color: COLORS[s.c][1],
    });
  } catch (e) {
    return send(chat, `❌ ${esc(e.message)}\n\nCoba lagi nanti atau hubungi admin.`);
  }
  await del(`s:${uid}`);
  await incr('stat:apk').catch(() => {});
  return send(
    chat,
    `🛠 <b>Build dimulai!</b>\n\n📱 Nama: <b>${esc(s.name)}</b>\n` +
      (s.siteFileId ? `📄 Sumber: ${esc(s.siteFileName)}\n` : `🌐 URL: ${esc(s.url)}\n`) +
      `⚙️ ${ORIENT[s.o][0]} · Fullscreen ${s.f ? 'aktif' : 'mati'} · Tema ${COLORS[s.c][0]}\n\n` +
      '⏳ APK akan dikirim otomatis ke chat ini dalam ±3–8 menit.'
  );
}

async function doDeploy(chat, uid, s, slug) {
  const wait = await send(chat, '🚀 Sedang deploy ke Vercel...');
  try {
    const files = extractSite(await downloadTgFile(s.siteFileId), s.siteFileName);
    const { url } = await deployToVercel(files, slug);
    await setJSON(`d:${uid}`, { url }, 86400);
    await del(`s:${uid}`);
    await send(
      chat,
      `✅ <b>Website berhasil di-deploy!</b>\n\n🌐 ${esc(url)}\n\n<i>Memakai nama project yang sama akan memperbarui website lama.</i>`,
      kb([[b('📱 Jadikan APK dari website ini', 'deploy_to_apk')]])
    );
  } catch (e) {
    await send(chat, `❌ <b>Gagal deploy:</b>\n${esc(String(e.message).slice(0, 1500))}\n\nKirim nama project lain untuk coba lagi, atau /cancel.`);
  } finally {
    tg('deleteMessage', { chat_id: chat, message_id: wait.message_id }).catch(() => {});
  }
}

async function onImage(chat, uid, s, fileId) {
  if (!s || s.step !== 'icon') return send(chat, 'Ketik /start untuk membuka menu.');
  return startBuild(chat, uid, s, fileId);
}

async function onSiteFile(chat, uid, s, d) {
  const name = d.file_name || '';
  if (!/\.(html?|zip)$/i.test(name)) return send(chat, '❌ File harus berformat <b>.html</b> atau <b>.zip</b>.');
  if (d.file_size > 20 * 1024 * 1024) return send(chat, '❌ Ukuran file maksimal 20 MB.');
  s.siteFileId = d.file_id;
  s.siteFileName = name;
  s.step = 'site_action';
  await putS(uid, s);
  return send(
    chat,
    `✅ File <b>${esc(name)}</b> diterima.\nMau diapakan?`,
    kb([[b('📱 Jadikan APK', 'site_apk')], [b('🌐 Deploy ke Website', 'site_deploy')]])
  );
}

// ------------------------------------------------------------------ pesan
async function onMessage(m, ctx) {
  if (!m.from || m.from.is_bot || m.chat.type !== 'private') return;
  const chat = m.chat.id;
  const uid = m.from.id;
  const text = (m.text || '').trim();

  if (text.startsWith('/')) {
    switch (text.split(/[\s@]/)[0].toLowerCase()) {
      case '/start':
        return start(chat, uid, m.from.first_name, ctx);
      case '/help':
      case '/faq':
        return send(chat, faqText(), kb([socialRow]));
      case '/web2apk':
        return beginUrl(chat, uid);
      case '/html':
      case '/html2apk':
      case '/deploy':
        return beginSite(chat, uid);
      case '/cancel':
        await del(`s:${uid}`);
        return send(chat, '❎ Dibatalkan. Ketik /start untuk membuka menu.');
      case '/skip': {
        const s = await getS(uid);
        if (s && s.step === 'icon') return startBuild(chat, uid, s, '');
        return send(chat, 'Tidak ada yang bisa dilewati. Ketik /start untuk membuka menu.');
      }
      default:
        return send(chat, 'Perintah tidak dikenal. Ketik /start untuk membuka menu.');
    }
  }

  const s = await getS(uid);

  if (m.photo && m.photo.length) return onImage(chat, uid, s, m.photo[m.photo.length - 1].file_id);

  if (m.document) {
    if (s && s.step === 'site') return onSiteFile(chat, uid, s, m.document);
    if (m.document.mime_type && m.document.mime_type.startsWith('image/')) {
      if (m.document.file_size > 10 * 1024 * 1024) return send(chat, '❌ Ukuran gambar maksimal 10 MB.');
      return onImage(chat, uid, s, m.document.file_id);
    }
    return send(chat, 'Ketik /html dulu untuk mengirim file website.');
  }

  if (!text) return;
  if (!s) return send(chat, 'Ketik /start untuk membuka menu.');

  switch (s.step) {
    case 'url': {
      const url = normalizeUrl(text);
      if (!url) return send(chat, '❌ URL tidak valid. Coba lagi, contoh: <code>https://example.com</code>');
      s.url = url;
      s.step = 'name';
      await putS(uid, s);
      return send(chat, ASK_NAME);
    }
    case 'name': {
      if (text.length > 30) return send(chat, '❌ Nama maksimal 30 karakter. Coba lagi.');
      s.name = text;
      s.step = 'opts';
      await putS(uid, s);
      return send(chat, '⚙️ <b>Pengaturan aplikasi</b>\nAtur sesuai selera, lalu tekan <b>Lanjut</b>.', optionsKeyboard(s));
    }
    case 'deploy_name': {
      const slug = slugifyProject(text);
      if (slug.length < 3) return send(chat, '❌ Nama project minimal 3 karakter (huruf/angka). Coba lagi.');
      return doDeploy(chat, uid, s, slug);
    }
    case 'icon':
      return send(chat, 'Kirim gambar untuk ikon, atau ketik /skip.');
    case 'site':
      return send(chat, 'Kirim file .html atau .zip sebagai File/Dokumen, atau /cancel.');
    case 'site_action':
      return send(chat, 'Pilih salah satu tombol di atas: Jadikan APK atau Deploy.');
    default:
      return send(chat, 'Ketik /start untuk membuka menu.');
  }
}

// ------------------------------------------------------------------ tombol
async function onCallback(cq) {
  tg('answerCallbackQuery', { callback_query_id: cq.id }).catch(() => {});
  if (!cq.message) return;
  const chat = cq.message.chat.id;
  const uid = cq.from.id;
  const d = cq.data;

  switch (d) {
    case 'menu_url':
      return beginUrl(chat, uid);
    case 'menu_site':
      return beginSite(chat, uid);
    case 'faq':
      return send(chat, faqText(), kb([socialRow]));
    case 'icon_skip': {
      const s = await getS(uid);
      if (!s || s.step !== 'icon') return send(chat, NO_SESSION);
      return startBuild(chat, uid, s, '');
    }
    case 'opt_o':
    case 'opt_f':
    case 'opt_c':
    case 'opt_next': {
      const s = await getS(uid);
      if (!s || s.step !== 'opts') return send(chat, NO_SESSION);
      if (d === 'opt_next') {
        s.step = 'icon';
        await putS(uid, s);
        return send(chat, ASK_ICON, kb([[b('⏭ Lewati (ikon otomatis)', 'icon_skip')]]));
      }
      if (d === 'opt_o') s.o = (s.o + 1) % ORIENT.length;
      if (d === 'opt_f') s.f = !s.f;
      if (d === 'opt_c') s.c = (s.c + 1) % COLORS.length;
      await putS(uid, s);
      return tg('editMessageReplyMarkup', {
        chat_id: chat,
        message_id: cq.message.message_id,
        reply_markup: optionsKeyboard(s).reply_markup,
      });
    }
    case 'site_apk':
    case 'site_deploy': {
      const s = await getS(uid);
      if (!s || s.step !== 'site_action') return send(chat, NO_SESSION);
      if (d === 'site_apk') {
        s.step = 'name';
        await putS(uid, s);
        return send(chat, ASK_NAME);
      }
      s.step = 'deploy_name';
      await putS(uid, s);
      const def = slugifyProject(s.siteFileName.replace(/\.[^.]+$/, ''));
      return send(
        chat,
        '🏷 Kirim <b>nama project</b> untuk alamat website (huruf kecil, angka, strip).\nContoh: <code>toko-gilang</code> → toko-gilang.vercel.app',
        def.length >= 3 ? kb([[b(`Pakai nama file: ${def}`, 'deploy_default')]]) : {}
      );
    }
    case 'deploy_default': {
      const s = await getS(uid);
      if (!s || s.step !== 'deploy_name') return send(chat, NO_SESSION);
      return doDeploy(chat, uid, s, slugifyProject(s.siteFileName.replace(/\.[^.]+$/, '')));
    }
    case 'deploy_to_apk': {
      const dd = await getJSON(`d:${uid}`);
      if (!dd) return send(chat, 'Data deploy tidak ditemukan. Ketik /web2apk lalu kirim URL websitenya.');
      await putS(uid, newS({ step: 'name', url: dd.url }));
      return send(chat, ASK_NAME);
    }
  }
}

// ------------------------------------------------------------------ entry
export async function handleUpdate(update, ctx) {
  if (update.update_id && !(await setnx(`u:${update.update_id}`, 600).catch(() => true))) return; // duplikat
  try {
    if (update.callback_query) await onCallback(update.callback_query);
    else if (update.message) await onMessage(update.message, ctx);
  } catch (e) {
    console.error('handler error', e);
    const chat = (update.message && update.message.chat.id) || (update.callback_query && update.callback_query.message && update.callback_query.message.chat.id);
    if (chat) await send(chat, '⚠️ Terjadi kesalahan: ' + esc(String(e.message).slice(0, 300))).catch(() => {});
  }
}
