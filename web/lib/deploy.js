import crypto from 'node:crypto';

const API = 'https://api.vercel.com';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function slugifyProject(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]);
    })
  );
}

async function apiError(res, fallback) {
  try {
    const j = await res.json();
    return (j && j.error && j.error.message) || `${fallback} (HTTP ${res.status})`;
  } catch {
    return `${fallback} (HTTP ${res.status})`;
  }
}

/** Deploy daftar file [{ rel, data }] ke Vercel (production). Return { url }. */
export async function deployToVercel(files, name) {
  const token = process.env.VERCEL_TOKEN;
  if (!token) throw new Error('VERCEL_TOKEN belum diisi di server.');
  const q = process.env.VERCEL_TEAM_ID ? `?teamId=${encodeURIComponent(process.env.VERCEL_TEAM_ID)}` : '';
  const auth = { Authorization: `Bearer ${token}` };

  const manifest = [];
  await pool(files, 8, async (f) => {
    const sha = crypto.createHash('sha1').update(f.data).digest('hex');
    const r = await fetch(`${API}/v2/files${q}`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/octet-stream', 'x-vercel-digest': sha },
      body: f.data,
    });
    if (!r.ok) throw new Error(await apiError(r, 'Upload file gagal'));
    manifest.push({ file: f.rel, sha, size: f.data.length });
  });

  const r = await fetch(`${API}/v13/deployments${q}`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, files: manifest, target: 'production', projectSettings: { framework: null } }),
  });
  if (!r.ok) throw new Error(await apiError(r, 'Deploy gagal'));
  const created = await r.json();

  let dep = created;
  for (let i = 0; i < 25 && dep.readyState !== 'READY'; i++) {
    if (['ERROR', 'CANCELED'].includes(dep.readyState)) throw new Error(`Deploy gagal di Vercel (status ${dep.readyState}).`);
    await sleep(2000);
    const g = await fetch(`${API}/v13/deployments/${created.id}${q}`, { headers: auth });
    if (g.ok) dep = await g.json();
  }
  if (dep.readyState !== 'READY') throw new Error('Deploy belum selesai (timeout). Cek dashboard Vercel.');

  const aliases = (dep.alias || []).filter((a) => a.endsWith('.vercel.app')).sort((a, b) => a.length - b.length);
  return { url: `https://${aliases[0] || dep.url}` };
}
