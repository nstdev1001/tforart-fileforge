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
    icon: "/branding/tforart-fileforge-logo.svg",
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
