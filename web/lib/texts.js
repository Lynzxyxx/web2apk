export const SOCIAL = {
  instagram: { handle: 'lang.87788', url: 'https://www.instagram.com/lang.87788' },
  tiktok: { handle: 'lang.8787', url: 'https://www.tiktok.com/@lang.8787' },
};

export const FEATURES = [
  { icon: '🌐', title: 'Website → APK', desc: 'Kirim URL, dapatkan aplikasi Android siap pasang.' },
  { icon: '📄', title: 'HTML / ZIP → APK', desc: 'File website kamu dibundel di dalam APK, bisa jalan offline.' },
  { icon: '🚀', title: 'Deploy Website', desc: 'Kirim HTML/ZIP, langsung online dengan link .vercel.app.' },
  { icon: '🎨', title: 'Nama & Ikon Custom', desc: 'Atur nama aplikasi dan ikon sesuai brand kamu.' },
  { icon: '⚙️', title: 'Pengaturan Lanjutan', desc: 'Pilih orientasi layar, mode fullscreen, dan warna tema.' },
  { icon: '⚡', title: 'Aktif 24 Jam', desc: 'Berjalan di cloud, tanpa VPS yang bisa mati.' },
];

export const FAQ = [
  { q: 'Apa itu WEB2APK?', a: 'Bot Telegram yang mengubah website (URL) atau file HTML/ZIP menjadi aplikasi Android (APK) dengan nama dan ikon sesuai keinginan kamu.' },
  { q: 'Bagaimana cara membuat APK?', a: 'Buka bot, ketik /web2apk, kirim URL website, nama aplikasi, atur pengaturan, lalu kirim ikon (atau lewati). APK dikirim otomatis ke chat.' },
  { q: 'Berapa lama prosesnya?', a: 'Sekitar 3–8 menit. Build pertama bisa lebih lama.' },
  { q: 'File HTML/ZIP seperti apa yang didukung?', a: 'Website statis: file .html, atau .zip berisi index.html beserta CSS/JS/gambar (maks 20 MB). PHP atau Node.js tidak didukung.' },
  { q: 'Bagaimana cara deploy website?', a: 'Ketik /html, kirim file .html/.zip, pilih Deploy, lalu kirim nama project. Kamu akan mendapat link nama-project.vercel.app.' },
  { q: 'APK tidak bisa dipasang di HP?', a: 'Aktifkan izin "Instal dari sumber tidak dikenal" untuk aplikasi yang kamu pakai membuka APK. APK memakai tanda tangan debug, jadi belum untuk Play Store.' },
  { q: 'Apakah aplikasinya bisa offline?', a: 'APK dari HTML/ZIP bisa jalan offline. APK dari URL tetap butuh internet.' },
  { q: 'Bot tidak merespons?', a: 'Bot mungkin sedang dinonaktifkan atau diproses. Coba lagi nanti, atau hubungi admin lewat Instagram/TikTok.' },
];
