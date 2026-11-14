# WEB2APK Pro — Bot Telegram + Dashboard ON/OFF

Satu aplikasi Node.js yang menjalankan **bot Telegram** sekaligus **website dashboard**
(tombol **ON/OFF**, status, statistik, FAQ, kontak). APK dibuat langsung di server kamu.

## Fitur bot
- 🌐 **Website → APK**: pilih mode **Online** (buka URL langsung) atau **Offline** (halaman diunduh dan dibundel di APK)
- 📄 **HTML / ZIP → APK** (ZIP harus berisi `index.html`)
- 🗂️ **File lain → APK**: PDF, gambar (png/jpg/gif/webp/svg), video (mp4/webm), audio (mp3/ogg/wav/m4a), teks (txt/md/json/csv/log)
- 🤖 **Android minimal** bisa dipilih: 5.0, 6.0, 7.0, 8.0, 9, 10, 11, 12, 13, 14
- 🎨 Atur **nama**, **ikon**, **orientasi**, **fullscreen**, **warna tema**
- Halaman "Tidak ada koneksi" otomatis untuk APK mode Online
- Antrian build, progres proses, `/status`, `/faq`

Perintah bot: `/start` `/web2apk` `/file` `/faq` `/status` `/cancel` `/skip`

## Kebutuhan server
VPS Linux, RAM ≥ 2 GB, disk ≥ 10 GB, internet. (Mode Offline butuh `wget`.)

## Instalasi — Docker (disarankan)
```bash
cp .env.example .env        # isi BOT_TOKEN dan ADMIN_PASSWORD
docker compose up -d --build
```
Build image pertama ±10 menit (mengunduh Android SDK). Setelah itu buka `http://IP-SERVER:3000`.
`restart: always` membuat aplikasi hidup lagi sendiri jika crash atau server reboot.

## Instalasi — Manual (Ubuntu/Debian)
1. Node.js 20+, JDK 17, `wget`, `unzip`.
2. Gradle **8.x** (jangan dari `apt`, terlalu lama). Contoh pakai SDKMAN:
   `curl -s https://get.sdkman.io | bash` → `sdk install gradle 8.5`
3. Android SDK: unduh *command-line tools* dari developer.android.com, lalu
   `sdkmanager "platforms;android-34" "build-tools;34.0.0"` dan terima lisensinya.
4. Di folder proyek:
   ```bash
   npm install
   cp .env.example .env     # isi BOT_TOKEN, ADMIN_PASSWORD, ANDROID_HOME, GRADLE_BIN
   npm start
   ```
5. Agar tidak mati: `npm i -g pm2 && pm2 start server.js --name web2apk && pm2 save && pm2 startup`

## Dashboard
- Buka website → isi **password admin** → tekan **ON** / **OFF**.
- ON = bot menerima pesan, OFF = bot berhenti merespons. Statusnya tersimpan di `data/state.json`,
  jadi setelah restart server bot mengikuti status terakhir (`AUTO_START=false` untuk mematikan fitur ini).
- Bot dan dashboard satu proses: kalau server/proses mati, keduanya mati, karena itu pakai Docker restart atau pm2.
- **Keamanan:** password dikirim lewat browser. Pakai HTTPS (mis. Caddy atau Nginx + Let's Encrypt)
  atau akses lewat SSH tunnel; pakai password yang kuat.

## Batasan
- File dari Telegram maks 20 MB; APK maks ±50 MB (batas kirim bot).
- Mode Offline cocok untuk website statis; website yang butuh login/server atau memuat aset dari domain lain tetap butuh internet.
- Viewer PDF sederhana (scroll halaman); seek pada video besar bisa terbatas.
- APK debug-signed: bisa dipasang langsung, belum untuk Play Store.
- Satu bot Telegram hanya boleh dijalankan di satu tempat (jangan jalankan bot yang sama di dua server).

## Masalah umum
| Gejala | Solusi |
|---|---|
| `BOT_TOKEN belum diisi` | Isi `.env`, restart |
| `ANDROID_HOME belum diatur` | Isi `ANDROID_HOME` di `.env` (otomatis di Docker) |
| `gradle tidak ditemukan` | Pasang Gradle 8.x atau pakai Docker |
| `wget tidak ditemukan` | `apt install wget` (mode Offline) |
| Error 409 / bot bentrok | Bot yang sama sedang jalan di tempat lain; matikan salah satu |
| Build gagal | Baca pesan error yang dikirim bot; lihat log `docker compose logs -f` |
