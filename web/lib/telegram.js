import crypto from 'node:crypto';

const token = () => process.env.BOT_TOKEN;

export async function tg(method, payload = {}) {
  if (!token()) throw new Error('BOT_TOKEN belum diisi.');
  const r = await fetch(`https://api.telegram.org/bot${token()}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(j.description || `Telegram error (${r.status})`);
  return j.result;
}

export async function downloadTgFile(fileId) {
  let f;
  try {
    f = await tg('getFile', { file_id: fileId });
  } catch {
    throw new Error('Gagal mengambil file. Ukuran maksimal yang bisa diterima bot adalah 20 MB.');
  }
  const r = await fetch(`https://api.telegram.org/file/bot${token()}/${f.file_path}`);
  if (!r.ok) throw new Error('Gagal mengunduh file dari Telegram.');
  return Buffer.from(await r.arrayBuffer());
}

// secret untuk memverifikasi bahwa request webhook benar-benar dari Telegram
export const webhookSecret = () =>
  crypto.createHash('sha256').update(`w2a:${token() || ''}`).digest('hex').slice(0, 48);

export const BOT_COMMANDS = [
  { command: 'start', description: 'Menu utama' },
  { command: 'web2apk', description: 'Website (URL) jadi APK' },
  { command: 'html', description: 'File HTML/ZIP jadi APK atau deploy' },
  { command: 'faq', description: 'Pertanyaan umum' },
  { command: 'cancel', description: 'Batalkan proses' },
];
