"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Layers3, ShieldCheck, Heart } from "lucide-react";

export default function FooterHome() {
  const pathname = usePathname();

  const handleNavClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    href: string
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
            <Link href="/" className="flex items-center gap-3 transition-opacity hover:opacity-80">
              <div className="grid size-8 shrink-0 place-items-center rounded-xl bg-[#007a55] text-white shadow-sm">
                <Layers3 className="size-4" strokeWidth={2.2} />
              </div>
              <Image
                src="/branding/tforart-fileforge-logo.svg"
                alt="Tforart FileForge Logo"
                width={160}
                height={32}
                className="h-6 w-auto object-contain"
              />
            </Link>
            <p className="max-w-sm text-xs leading-relaxed text-gray-500">
              Ứng dụng nén 7-Zip & tự động hoá upload Google Drive chuẩn Desktop cho Windows.
              Tối ưu cho editor, studio và đội ngũ sáng tạo media.
            </p>
          </div>

          {/* Quick Nav Links */}
          <div className="flex flex-wrap items-center justify-center gap-6 text-xs font-medium text-gray-600">
            <Link
              href="/#features"
              onClick={(e) => handleNavClick(e, "/#features")}
              className="cursor-pointer transition-colors hover:text-black"
            >
              Tính năng
            </Link>
            <Link
              href="/#showcase"
              onClick={(e) => handleNavClick(e, "/#showcase")}
              className="cursor-pointer transition-colors hover:text-black"
            >
              Giao diện thực tế
            </Link>
            <Link
              href="/#how-it-works"
              onClick={(e) => handleNavClick(e, "/#how-it-works")}
              className="cursor-pointer transition-colors hover:text-black"
            >
              Cách hoạt động
            </Link>
            <Link
              href="/#faq"
              onClick={(e) => handleNavClick(e, "/#faq")}
              className="cursor-pointer transition-colors hover:text-black"
            >
              Hỏi đáp
            </Link>
            <a
              href="https://review.tforart.vn"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-black"
            >
              Tforart Review
            </a>
            <a
              href="https://tforart.vn"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-black"
            >
              Tforart Production
            </a>
          </div>
        </div>

        {/* Bottom Legal bar */}
        <div className="mt-8 flex flex-col items-center justify-between gap-6 border-t border-gray-100 pt-6 text-xs text-gray-500 md:flex-row md:gap-0">
          <div className="order-2 text-center md:order-1 md:text-left">
            <p>© 2026 Tforart FileForge. Thuộc hệ sinh thái sáng tạo Tforart.</p>
            <p className="mt-0.5 text-gray-400">Made with passion by Nguyen Son Tung</p>
          </div>
          <div className="order-1 flex flex-wrap items-center justify-center gap-6 md:order-2">
            <Link
              href="/privacy"
              className="transition-colors hover:text-gray-900"
            >
              Chính sách bảo mật (Privacy)
            </Link>
            <Link
              href="/terms"
              className="transition-colors hover:text-gray-900"
            >
              Điều khoản dịch vụ (Terms)
            </Link>
            <a
              href="mailto:lienhe@tforart.vn"
              className="transition-colors hover:text-gray-900"
            >
              Liên hệ hỗ trợ (Contact)
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
