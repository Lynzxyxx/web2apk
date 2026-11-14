const fs = require('fs');
const path = require('path');
const { makeBot, queueInfo } = require('./bot');

const STATE_FILE = path.join(__dirname, '..', 'data', 'state.json');
const COMMANDS = [
  { command: 'start', description: 'Menu utama' },
  { command: 'web2apk', description: 'Website (URL) jadi APK' },
  { command: 'file', description: 'HTML/ZIP/PDF/gambar/video jadi APK' },
  { command: 'faq', description: 'Pertanyaan umum' },
  { command: 'status', description: 'Status antrian build' },
  { command: 'cancel', description: 'Batalkan proses' },
];

let bot = null;
let running = false;
let startedAt = null;
let username = null;
let lastError = null;
let starting = false;

let state = { enabled: true, built: 0, failed: 0 };
try {
  state = { ...state, ...JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) };
} catch {}
function save() {
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state));
  } catch (e) {
    console.error('Gagal menyimpan state:', e.message);
  }
}

function onResult(ok) {
  if (ok) state.built++;
  else state.failed++;
  save();
}

async function start() {
  if (running || starting) return;
  if (!process.env.BOT_TOKEN) throw new Error('BOT_TOKEN belum diisi di file .env');
  starting = true;
  try {
    const b = makeBot({ onResult });
    const me = await b.telegram.getMe(); // validasi token
    await b.telegram.deleteWebhook().catch(() => {});
    await b.telegram.setMyCommands(COMMANDS).catch(() => {});
    b.launch().catch((e) => {
      lastError = e.message;
      running = false;
      console.error('Bot berhenti karena error:', e.message);
    });
    bot = b;
    running = true;
    startedAt = Date.now();
    username = me.username;
    lastError = null;
    state.enabled = true;
    save();
    console.log(`Bot @${me.username} aktif`);
  } finally {
    starting = false;
  }
}

async function stop(persist = true) {
  if (!running) return;
  try {
    bot.stop('dimatikan dari dashboard');
  } catch {}
  bot = null;
  running = false;
  startedAt = null;
  if (persist) {
    state.enabled = false;
    save();
  }
  console.log('Bot dimatikan');
}

function status() {
  const q = queueInfo();
  return {
    ok: true,
    running,
    username,
    uptime: running ? Math.floor((Date.now() - startedAt) / 1000) : 0,
    built: state.built,
    failed: state.failed,
    queue: q.waiting + (q.working ? 1 : 0),
    error: lastError,
    tokenSet: Boolean(process.env.BOT_TOKEN),
    adminSet: Boolean(process.env.ADMIN_PASSWORD),
  };
}

function autoStart() {
  if (process.env.AUTO_START === 'false' || state.enabled === false) return;
  start().catch((e) => {
    lastError = e.message;
    console.error('Auto start gagal:', e.message);
  });
}

module.exports = { start, stop, status, autoStart };
