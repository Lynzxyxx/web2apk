import { after } from 'next/server';
import { handleUpdate } from '../../../lib/handler';
import { webhookSecret } from '../../../lib/telegram';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req) {
  if (req.headers.get('x-telegram-bot-api-secret-token') !== webhookSecret()) {
    return new Response('forbidden', { status: 403 });
  }
  const update = await req.json().catch(() => null);
  if (!update) return new Response('bad request', { status: 400 });
  const ctx = { origin: new URL(req.url).origin };
  // balas 200 secepatnya, proses di belakang layar
  after(async () => {
    await handleUpdate(update, ctx);
  });
  return Response.json({ ok: true });
}

export async function GET() {
  return new Response('WEB2APK webhook');
}
