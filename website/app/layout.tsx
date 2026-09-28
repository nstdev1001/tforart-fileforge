import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tforart FileForge — Nén 7-Zip & Upload Google Drive Tự Động Cho Windows",
  description:
    "Ứng dụng desktop Windows siêu nhẹ bằng Tauri v2 & Rust: Nén 7-Zip đa luồng, tự động hóa upload Google Drive chuẩn Resumable, phục hồi khi rớt mạng, bảo mật Windows Credential Manager.",
  keywords: [
    "Tforart FileForge",
    "7-Zip Windows",
    "Upload Google Drive tự động",
    "Tauri v2",
    "Rust desktop app",
    "Media workflow automation",
    "Tforart Review",
  ],
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/branding/tforart-fileforge-icon.svg", type: "image/svg+xml" },
      { url: "/branding/tforart-fileforge-icon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
