const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const API = 'https://api.vercel.com';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function slugifyProject(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}

function walk(dir, base = dir, out = []) {
  for (const n of fs.readdirSync(dir)) {
    if (['.git', 'node_modules', '.DS_Store'].includes(n)) continue;
    const p = path.join(dir, n);
    if (fs.statSync(p).isDirectory()) walk(p, base, out);
    else out.push({ abs: p, rel: path.relative(base, p).split(path.sep).join('/') });
  }
  return out;
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

/** Deploy folder statis ke Vercel (production). Return { url, id } */
async function deployToVercel(dir, name) {
  const token = process.env.VERCEL_TOKEN;
  if (!token) throw new Error('VERCEL_TOKEN belum diisi di server (.env).');

  const team = process.env.VERCEL_TEAM_ID ? `teamId=${encodeURIComponent(process.env.VERCEL_TEAM_ID)}` : '';
  const q = () => (team ? `?${team}` : '');
  const auth = { Authorization: `Bearer ${token}` };

  const files = walk(dir);
  if (!files.length) throw new Error('Tidak ada file untuk di-deploy.');

  // 1) upload semua file (dedup via SHA1)
  const manifest = [];
  await pool(files, 8, async (f) => {
    const data = fs.readFileSync(f.abs);
    const sha = crypto.createHash('sha1').update(data).digest('hex');
    const r = await fetch(`${API}/v2/files${q()}`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/octet-stream', 'x-vercel-digest': sha },
      body: data,
    });
    if (!r.ok) throw new Error(await apiError(r, 'Upload file gagal'));
    manifest.push({ file: f.rel, sha, size: data.length });
  });

  // 2) buat deployment production
  const r = await fetch(`${API}/v13/deployments${q()}`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      files: manifest,
      target: 'production',
      projectSettings: { framework: null },
    }),
  });
  if (!r.ok) throw new Error(await apiError(r, 'Deploy gagal'));
  const created = await r.json();

  // 3) tunggu sampai READY
  let dep = created;
  for (let i = 0; i < 45 && dep.readyState !== 'READY'; i++) {
    if (['ERROR', 'CANCELED'].includes(dep.readyState)) {
      throw new Error(`Deploy gagal di Vercel (status ${dep.readyState}).`);
    }
    await sleep(2000);
    const g = await fetch(`${API}/v13/deployments/${created.id}${q()}`, { headers: auth });
    if (g.ok) dep = await g.json();
  }
  if (dep.readyState !== 'READY') throw new Error('Deploy belum selesai (timeout). Cek dashboard Vercel.');

  const aliases = (dep.alias || []).filter((a) => a.endsWith('.vercel.app')).sort((a, b) => a.length - b.length);
  return { url: `https://${aliases[0] || dep.url}`, id: created.id };
}

module.exports = { deployToVercel, slugifyProject };
