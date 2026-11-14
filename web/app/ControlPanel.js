'use client';
import { useCallback, useEffect, useState } from 'react';

export default function ControlPanel() {
  const [st, setSt] = useState(null);
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/status', { cache: 'no-store' });
      setSt(await r.json());
    } catch {
      setSt({ ok: false, error: 'Gagal memuat status.' });
    }
  }, []);

  useEffect(() => {
    setPw(sessionStorage.getItem('w2a_pw') || '');
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  async function toggle() {
    if (!pw) return setMsg({ type: 'err', text: 'Masukkan password admin dulu.' });
    const turningOn = !st.on;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch('/api/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: turningOn ? 'on' : 'off', password: pw }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'Gagal.');
      sessionStorage.setItem('w2a_pw', pw);
      setMsg({ type: 'ok', text: turningOn ? 'Bot diaktifkan!' : 'Bot dimatikan.' });
      await load();
    } catch (e) {
      setMsg({ type: 'err', text: e.message });
    }
    setBusy(false);
  }

  const ready = Boolean(st && st.ok);
  const on = ready && st.on;
  const recentError = ready && st.lastError && Date.now() / 1000 - st.lastErrorDate < 3600;

  return (
    <section className="panel">
      <div className="status">
        <span className={`dot ${ready ? (on ? 'on' : 'off') : 'idle'}`} />
        <span>{!st ? 'Memuat…' : !ready ? st.error : on ? 'Bot AKTIF' : 'Bot NONAKTIF'}</span>
      </div>

      <button className={`switch ${on ? 'on' : ''}`} onClick={toggle} disabled={busy || !ready} aria-pressed={on} aria-label="Nyalakan atau matikan bot">
        <span className="knob" />
        <span className="lbl">{busy ? '…' : on ? 'ON' : 'OFF'}</span>
      </button>

      <input
        type="password"
        className="pw"
        placeholder="Password admin"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        autoComplete="current-password"
      />
      {msg && <p className={`msg ${msg.type}`}>{msg.text}</p>}

      {ready && (
        <>
          <div className="stats">
            <div><b>{st.total}</b><span>APK diminta</span></div>
            <div><b>{st.pending}</b><span>Antrian update</span></div>
          </div>
          {recentError && <p className="msg err small">Error terakhir dari Telegram: {st.lastError}</p>}
          {!st.redis && <p className="msg warn small">Redis belum terpasang — sesi percakapan bisa hilang. Lihat README.</p>}
          <a className="btn" href={`https://t.me/${st.username}`} target="_blank" rel="noreferrer">
            💬 Buka @{st.username} di Telegram
          </a>
        </>
      )}
    </section>
  );
}
