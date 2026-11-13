# Bot Telegram Web2APK

Bot Telegram (Node.js) yang mengubah website menjadi APK Android (WebView).
Pengguna bisa mengatur **URL**, **nama aplikasi**, dan **ikon aplikasi**.

## Cara pakai bot
1. `/web2apk`
2. Kirim URL website
3. Kirim nama aplikasi
4. Kirim gambar ikon (atau `/skip` untuk ikon otomatis)
5. Tunggu, bot mengirim file `.apk`

## Fitur HTML/ZIP (`/html`)
Kirim file `.html` atau `.zip` (harus ada `index.html`, maks 20 MB), lalu pilih:
- **Jadikan APK** - file website dibundel di dalam APK (bisa jalan offline).
- **Deploy ke Website** - website di-deploy ke Vercel dan bot mengirim link-nya.
  Wajib isi `VERCEL_TOKEN` di `.env` (buat di https://vercel.com/account/tokens).
  Hanya untuk website statis (HTML/CSS/JS), bukan PHP/Node.

## Instalasi

> Bot ini butuh server/VPS yang berjalan terus (bukan Vercel/serverless),
> minimal RAM 2 GB.

### Opsi A - Docker (paling mudah, sudah termasuk JDK + Android SDK)
```bash
cp .env.example .env      # isi BOT_TOKEN
docker build -t web2apk-bot .
docker run -d --restart=always --name web2apk --env-file .env -v gradle-cache:/home/gradle/.gradle web2apk-bot
```

### Opsi B - Manual (Ubuntu/Debian VPS)
Butuh: Node.js 18+, JDK 17, Gradle 8.x, Android SDK (platform android-34, build-tools 34.0.0).
```bash
npm install
cp .env.example .env      # isi BOT_TOKEN, ANDROID_HOME, GRADLE_BIN
npm start
```

## Catatan
- Build pertama lebih lama karena Gradle mengunduh dependensi; build berikutnya cepat.
- APK yang dihasilkan bertipe debug-signed, bisa langsung diinstal di HP.
  Untuk rilis Play Store, tambahkan konfigurasi signing sendiri di `template/app/build.gradle`.
- Gambar tampilan /start ada di `assets/start.png` (ganti file ini untuk mengubah gambarnya).
- Build diantrikan satu per satu agar server tidak kehabisan memori.
