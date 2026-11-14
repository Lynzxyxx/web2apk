import './globals.css';

export const metadata = {
  title: 'WEB2APK — Ubah Website jadi APK',
  description: 'Bot Telegram yang mengubah website atau file HTML menjadi aplikasi Android (APK).',
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
