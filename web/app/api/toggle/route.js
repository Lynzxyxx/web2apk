import crypto from 'node:crypto';
import { tg, webhookSecret, BOT_COMMANDS } from '../../../lib/telegram';

export const dynamic = 'force-dynamic';

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function POST(req) {
  const { action, password } = await req.json().catch(() => ({}));
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return Response.json({ ok: false, error: 'ADMIN_PASSWORD belum diatur di server.' }, { status: 500 });
  if (!password || !crypto.timingSafeEqual(sha(password), sha(expected))) {
    await sleep(800);
    return Response.json({ ok: false, error: 'Password salah.' }, { status: 401 });
  }

  try {
    if (action === 'on') {
      const origin = new URL(req.url).origin;
      await tg('setWebhook', {
        url: `${origin}/api/bot`,
        secret_token: webhookSecret(),
        allowed_updates: ['message', 'callback_query'],
        drop_pending_updates: true,
        max_connections: 20,
      });
      await tg('setMyCommands', { commands: BOT_COMMANDS }).catch(() => {});
    } else if (action === 'off') {
      await tg('deleteWebhook', { drop_pending_updates: false });
    } else {
      return Response.json({ ok: false, error: 'Aksi tidak valid.' }, { status: 400 });
    }
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
