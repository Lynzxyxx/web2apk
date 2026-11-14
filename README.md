# WEB2APK — Versi Web (aktif 24 jam)

Bot Telegram yang berjalan di **Vercel** (webhook) + website kontrol dengan tombol **ON/OFF**.
Proses build APK dikerjakan oleh **GitHub Actions**, jadi tidak butuh VPS yang bisa mati.

```
Telegram ──webhook──▶ Vercel (web/)  ──dispatch──▶ GitHub Actions (builder-repo/)
                         │                                  │ build APK
                         └─ website ON/OFF + FAQ            └──▶ kirim APK langsung ke Telegram
```

## Isi
- `web/` — project Next.js (website + webhook bot) → deploy ke Vercel
- `builder-repo/` — isi repo GitHub (private) yang membangun APK

## Langkah setup
1. **Buat bot** di @BotFather. Disarankan token **baru**, terpisah dari bot VPS
   (satu bot tidak bisa memakai webhook dan polling sekaligus).
2. **Repo builder**: buat repo GitHub *private*, upload **isi** folder `builder-repo/`
   (termasuk `.github/`) ke root repo, branch `main`.
   Lalu Settings → Secrets and variables → Actions → New secret:
   `TELEGRAM_BOT_TOKEN` = token bot.
3. **GitHub token**: Settings → Developer settings → Personal access tokens.
   Classic: centang `repo` + `workflow`. (Fine-grained: akses repo builder, Actions = Read and write.)
4. **Deploy `web/` ke Vercel** (Root Directory = `web`), isi Environment Variables
   sesuai `web/.env.example`:
   `BOT_TOKEN`, `ADMIN_PASSWORD`, `GITHUB_TOKEN`, `GITHUB_REPO` (mis. `gilang/web2apk-builder`).
5. **Redis (sangat disarankan)**: Vercel → Storage/Marketplace → **Upstash Redis** → connect ke project.
   Dipakai untuk menyimpan sesi percakapan (URL, nama, dll.) karena serverless tidak punya memori tetap.
6. (Opsional) `VERCEL_TOKEN` (+ `VERCEL_TEAM_ID`) untuk fitur **Deploy HTML/ZIP**.
7. Redeploy, buka website, masukkan `ADMIN_PASSWORD`, tekan **ON**. Selesai — coba `/start` di bot.

## Catatan
- **ON** = mendaftarkan webhook ke Telegram, **OFF** = menghapusnya (bot berhenti merespons).
  Pesan yang masuk saat OFF diabaikan ketika bot dinyalakan lagi.
- Tombol ON/OFF dilindungi `ADMIN_PASSWORD` — pakai password yang kuat.
- Batas: file dari Telegram maks 20 MB; build ±3–8 menit; GitHub Actions gratis 2.000 menit/bulan untuk repo private.
- APK bertipe debug-signed (bisa dipasang langsung, belum untuk Play Store).
