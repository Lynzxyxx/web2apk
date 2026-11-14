require('dotenv').config();
const crypto = require('crypto');
const path = require('path');
const express = require('express');
const ctrl = require('./lib/controller');
const { FAQ, FEATURES, SOCIAL } = require('./lib/texts');

const app = express();
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = new Map(); // ip -> { n, t }

app.get('/api/content', (req, res) => res.json({ faq: FAQ, features: FEATURES, social: SOCIAL }));
app.get('/api/status', (req, res) => res.json(ctrl.status()));

app.post('/api/toggle', async (req, res) => {
  const { action, password } = req.body || {};
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return res.status(500).json({ ok: false, error: 'ADMIN_PASSWORD belum diatur di file .env' });

  const f = fails.get(req.ip);
  if (f && f.n >= 8 && Date.now() - f.t < 10 * 60 * 1000) {
    return res.status(429).json({ ok: false, error: 'Terlalu banyak percobaan. Coba lagi 10 menit lagi.' });
  }
  if (!password || !crypto.timingSafeEqual(sha(password), sha(expected))) {
    fails.set(req.ip, { n: (f && Date.now() - f.t < 10 * 60 * 1000 ? f.n : 0) + 1, t: Date.now() });
    await sleep(800);
    return res.status(401).json({ ok: false, error: 'Password salah.' });
  }
  fails.delete(req.ip);

  try {
    if (action === 'on') await ctrl.start();
    else if (action === 'off') await ctrl.stop();
    else return res.status(400).json({ ok: false, error: 'Aksi tidak valid.' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`Dashboard WEB2APK: http://localhost:${PORT}`);
  ctrl.autoStart();
});

const shutdown = async () => {
  try {
    await ctrl.stop(false); // jangan ubah status ON/OFF yang tersimpan
  } catch {}
  process.exit(0);
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
