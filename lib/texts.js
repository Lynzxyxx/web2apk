const SOCIAL = {
  instagram: { handle: 'lang.87788', url: 'https://www.instagram.com/lang.87788' },
  tiktok: { handle: 'lang.8787', url: 'https://www.tiktok.com/@lang.8787' },
};

const FEATURES = [
  { icon: '🌐', title: 'Website → APK', desc: 'Mode Online (live) atau Offline (disimpan di dalam APK).' },
  { icon: '📄', title: 'HTML / ZIP → APK', desc: 'Website statis kamu dibundel jadi aplikasi, jalan tanpa internet.' },
  { icon: '🗂️', title: 'File Lain → APK', desc: 'PDF, gambar, video, audio, dan teks jadi aplikasi viewer.' },
  { icon: '🤖', title: 'Atur Versi Android', desc: 'Pilih Android minimal 5.0 sampai 14 sesuai target pengguna.' },
  { icon: '🎨', title: 'Nama, Ikon & Tema', desc: 'Atur nama, ikon, warna status bar, orientasi, dan fullscreen.' },
  { icon: '⚡', title: 'Aktif & Terkontrol', desc: 'Nyalakan atau matikan bot kapan saja dari website ini.' },
];

const FAQ = [
  { q: 'Apa itu WEB2APK?', a: 'Bot Telegram yang mengubah website (URL), file HTML/ZIP, atau file lain seperti PDF, gambar, video, audio, dan teks menjadi aplikasi Android (APK) dengan nama dan ikon sesuai keinginan kamu.' },
  { q: 'Apa bedanya mode Online dan Offline?', a: 'Online: APK membuka website langsung sehingga selalu terbaru, tetapi butuh internet (jika tidak ada koneksi, muncul halaman "Tidak ada koneksi"). Offline: halaman website diunduh dan disimpan di dalam APK, cocok untuk website statis. Gambar atau skrip dari domain lain tetap butuh internet, dan website yang butuh login atau server tidak cocok.' },
  { q: 'File apa saja yang bisa dijadikan APK?', a: 'Website: .html atau .zip (berisi index.html). Viewer: PDF, gambar (png, jpg, gif, webp, svg), video (mp4, webm), audio (mp3, ogg, wav, m4a), dan teks (txt, md, json, csv, log). Maksimal 20 MB per file.' },
  { q: 'Android versi berapa yang didukung?', a: 'Kamu bisa memilih Android minimal dari 5.0 sampai 14. Makin kecil versinya, makin banyak HP yang bisa memasang APK-nya. Aplikasi dibuat untuk target Android 14.' },
  { q: 'Berapa lama prosesnya?', a: 'Sekitar 2-8 menit tergantung antrian. Build pertama bisa lebih lama karena mengunduh komponen.' },
  { q: 'APK tidak bisa dipasang di HP?', a: 'Aktifkan izin "Instal dari sumber tidak dikenal" untuk aplikasi yang kamu pakai membuka APK. Pastikan juga versi Android HP kamu sama atau lebih baru dari versi minimal yang dipilih.' },
  { q: 'Apakah bisa diupload ke Play Store?', a: 'Belum. APK memakai tanda tangan debug sehingga cocok untuk dibagikan dan dipasang langsung.' },
  { q: 'Bot tidak merespons?', a: 'Bot mungkin sedang dimatikan oleh admin atau sedang sibuk. Coba lagi nanti, atau hubungi admin lewat Instagram/TikTok.' },
];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const startText = (first) =>
  [
    '<b>🐱 WEB2APK</b> <i>— Ubah apa saja jadi Aplikasi Android</i>',
    '━━━━━━━━━━━━━━━━━━━━',
    '',
    `Halo, <b>${esc(first || 'teman')}</b>! 👋`,
    'Buat <b>APK</b> dari website atau file kamu langsung di Telegram.',
    '',
    '<b>✨ Fitur</b>',
    '┣ 🌐 Website → APK (Online / Offline)',
    '┣ 📄 HTML &amp; ZIP → APK',
    '┣ 🗂️ PDF, gambar, video, audio, teks → APK',
    '┣ 🤖 Atur Android minimal (5.0 – 14)',
    '┣ 🎨 Atur nama, ikon, warna &amp; orientasi',
    '┗ ⚡ Proses otomatis, tinggal tunggu',
    '',
    '<b>📌 Cara pakai</b>',
    '1️⃣ Pilih menu di bawah',
    '2️⃣ Kirim URL atau file kamu',
    '3️⃣ Atur nama, pengaturan &amp; ikon',
    '4️⃣ Terima APK-nya 📲',
    '',
    '<i>Butuh bantuan? Ketik /faq</i>',
  ].join('\n');

const faqText = () =>
  '❓ <b>FAQ — WEB2APK</b>\n\n' +
  FAQ.map((f, i) => `<b>${i + 1}. ${esc(f.q)}</b>\n${esc(f.a)}`).join('\n\n') +
  `\n\n📸 Instagram: <code>${SOCIAL.instagram.handle}</code>\n🎵 TikTok: <code>${SOCIAL.tiktok.handle}</code>`;

module.exports = { SOCIAL, FEATURES, FAQ, startText, faqText, esc };
