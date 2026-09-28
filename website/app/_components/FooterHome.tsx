"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function FooterHome() {
  const pathname = usePathname();

  const handleNavClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    href: string,
  ) => {
    if (href.startsWith("/#") && pathname === "/") {
      e.preventDefault();
      const targetId = href.replace("/#", "");
      const elem = document.getElementById(targetId);
      if (elem) {
        elem.scrollIntoView({ behavior: "smooth", block: "start" });
        window.history.pushState(null, "", href);
      }
    }
  };

  return (
    <footer className="border-t border-black/[0.08] bg-white/90 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-8 md:flex-row">
          {/* Brand Info */}
          <div className="flex flex-col items-center gap-3 text-center md:items-start md:text-left">
            <Link href="/" className="transition-opacity hover:opacity-80">
              <Image
                src="/branding/tforart-fileforge-logo.svg"
                alt="Tforart FileForge Logo"
                width={160}
                height={35}
                className="h-7 w-auto object-contain"
              />
            </Link>
            <p className="max-w-sm text-xs leading-relaxed text-gray-500">
              Ứng dụng nén 7-Zip & tự động hoá upload Google Drive <br />
              chuẩn Desktop dành cho Windows.
            </p>
          </div>

          {/* Quick Nav Links */}
          <div className="flex flex-wrap items-center justify-center gap-6 text-xs font-medium text-gray-600">
            <Link
              href="/#features"
              onClick={(e) => handleNavClick(e, "/#features")}
              className="cursor-pointer !text-gray-600 transition-colors hover:!text-black"
            >
              Tính năng
            </Link>
            <Link
              href="/#showcase"
              onClick={(e) => handleNavClick(e, "/#showcase")}
              className="cursor-pointer !text-gray-600 transition-colors hover:!text-black"
            >
              Trải nghiệm
            </Link>
            <Link
              href="/#how-it-works"
              onClick={(e) => handleNavClick(e, "/#how-it-works")}
              className="cursor-pointer !text-gray-600 transition-colors hover:!text-black"
            >
              Cách hoạt động
            </Link>
            <Link
              href="/#faq"
              onClick={(e) => handleNavClick(e, "/#faq")}
              className="cursor-pointer !text-gray-600 transition-colors hover:!text-black"
            >
              Hỏi đáp
            </Link>

            <Link
              href="https://tforart.vn"
              target="_blank"
              rel="noopener noreferrer"
              className="!text-gray-600 transition-colors hover:!text-black"
            >
              Tforart Production
            </Link>
            <Link
              href="/#download"
              onClick={(e) => handleNavClick(e, "/#download")}
              className="!text-gray-600 transition-colors hover:!text-black"
            >
              Tải FileForge
            </Link>
          </div>
        </div>

        {/* Bottom Legal bar */}
        <div className="mt-8 flex flex-col items-center justify-between gap-10 border-t border-gray-100 pt-6 text-xs text-gray-500 md:flex-row md:gap-0">
          <div className="order-2 text-center md:order-1 md:text-left">
            <p>© 2026 Tforart FileForge. All rights reserved.</p>
            <p className="mt-0.5 text-gray-400">Made by Nguyen Son Tung</p>
          </div>
          <div className="order-1 flex flex-wrap items-center justify-center gap-6 md:order-2">
            <Link
              href="/privacy"
              className="!text-gray-500 transition-colors hover:!text-gray-900"
            >
              Chính sách bảo mật (Privacy)
            </Link>
            <Link
              href="/terms"
              className="!text-gray-500 transition-colors hover:!text-gray-900"
            >
              Điều khoản dịch vụ (Terms)
            </Link>
            <Link
              href="mailto:lienhe@tforart.vn"
              className="!text-gray-500 transition-colors hover:!text-gray-900"
            >
              Liên hệ (Contact)
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
