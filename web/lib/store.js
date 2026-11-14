// Penyimpanan sesi: Upstash Redis (REST) bila tersedia, jika tidak memakai memori (tidak andal di serverless).
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
export const hasRedis = Boolean(URL_ && TOKEN);
const mem = globalThis.__w2a_mem || (globalThis.__w2a_mem = new Map());

async function cmd(args) {
  const r = await fetch(URL_, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}

function memGet(key) {
  const e = mem.get(key);
  if (!e || e.exp < Date.now()) return null;
  return e.v;
}

export async function getJSON(key) {
  if (!hasRedis) {
    const v = memGet(key);
    return v == null ? null : JSON.parse(v);
  }
  const v = await cmd(['GET', key]);
  return v ? JSON.parse(v) : null;
}

export async function setJSON(key, val, ttl = 3600) {
  if (!hasRedis) return void mem.set(key, { v: JSON.stringify(val), exp: Date.now() + ttl * 1000 });
  await cmd(['SET', key, JSON.stringify(val), 'EX', ttl]);
}

export async function del(key) {
  if (!hasRedis) return void mem.delete(key);
  await cmd(['DEL', key]);
}

export async function incr(key) {
  if (!hasRedis) {
    const n = Number(memGet(key) || 0) + 1;
    mem.set(key, { v: String(n), exp: Date.now() + 365 * 864e5 });
    return n;
  }
  return cmd(['INCR', key]);
}

export async function getInt(key) {
  if (!hasRedis) return Number(memGet(key) || 0);
  return Number((await cmd(['GET', key])) || 0);
}

// true jika key baru dibuat (belum ada)
export async function setnx(key, ttl = 600) {
  if (!hasRedis) {
    if (memGet(key) != null) return false;
    mem.set(key, { v: '1', exp: Date.now() + ttl * 1000 });
    return true;
  }
  return (await cmd(['SET', key, '1', 'NX', 'EX', ttl])) === 'OK';
}
