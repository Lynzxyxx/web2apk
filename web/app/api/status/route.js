import { tg } from '../../../lib/telegram';
import { getInt, hasRedis } from '../../../lib/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [me, info] = await Promise.all([tg('getMe'), tg('getWebhookInfo')]);
    return Response.json({
      ok: true,
      on: Boolean(info.url && info.url.endsWith('/api/bot')),
      username: me.username,
      pending: info.pending_update_count || 0,
      lastError: info.last_error_message || null,
      lastErrorDate: info.last_error_date || null,
      total: await getInt('stat:apk').catch(() => 0),
      redis: hasRedis,
    });
  } catch {
    return Response.json({ ok: false, error: 'Bot belum dikonfigurasi (cek BOT_TOKEN di server).' });
  }
}
