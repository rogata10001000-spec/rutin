import type { Metadata, Viewport } from "next";
import { Noto_Sans_JP } from "next/font/google";
import "./globals.css";

const notoSansJP = Noto_Sans_JP({
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
  preload: true,
  variable: "--font-noto-sans-jp",
});

export const metadata: Metadata = {
  title: "Rutin - 習慣化サポート",
  description: "継続できない人のための、人による伴走型・習慣化サポートサービス",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "Rutin",
    statusBarStyle: "default",
  },
};

// モバイル最適化:
// - viewportFit: cover → iPhone のセーフエリア(env(safe-area-inset-*))を有効化
// - interactiveWidget: resizes-content → ソフトキーボード表示時にレイアウト高を縮め、
//   入力欄・送信ボタンがキーボードに隠れないようにする（チャット返信のため必須）
export const viewport: Viewport = {
  themeColor: "#c76f55",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <head>
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className={`${notoSansJP.className} min-h-screen bg-background text-foreground antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
