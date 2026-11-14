import ControlPanel from './ControlPanel';
import { FAQ, FEATURES, SOCIAL } from '../lib/texts';

export default function Home() {
  return (
    <main>
      <header className="hero">
        <img className="logo" src="/start.png" alt="Logo WEB2APK" width="180" height="180" />
        <h1>WEB2APK</h1>
        <p className="tag">Ubah website atau file HTML jadi aplikasi Android — langsung dari Telegram.</p>
      </header>

      <ControlPanel />

      <section>
        <h2>✨ Fitur</h2>
        <div className="grid">
          {FEATURES.map((f) => (
            <div className="card" key={f.title}>
              <div className="ico">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="faq">
        <h2>❓ FAQ</h2>
        <div className="faq">
          {FAQ.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section>
        <h2>📞 Hubungi Admin</h2>
        <div className="social">
          <a className="btn" href={SOCIAL.instagram.url} target="_blank" rel="noreferrer">
            📸 Instagram · {SOCIAL.instagram.handle}
          </a>
          <a className="btn" href={SOCIAL.tiktok.url} target="_blank" rel="noreferrer">
            🎵 TikTok · {SOCIAL.tiktok.handle}
          </a>
        </div>
      </section>

      <footer>© {new Date().getFullYear()} WEB2APK</footer>
    </main>
  );
}
