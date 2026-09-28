"use client";

import { ArrowRight, Download, ExternalLink, Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export default function NavbarHome() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { name: "Tính năng", href: "/#features" },
    { name: "Trải nghiệm", href: "/#showcase" },
    { name: "Cách hoạt động", href: "/#how-it-works" },
    { name: "Hỏi đáp", href: "/#faq" },
  ];

  const handleNavClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    href: string,
    isMobile = false,
  ) => {
    if (href.startsWith("/#") && pathname === "/") {
      e.preventDefault();
      const targetId = href.replace("/#", "");
      const elem = document.getElementById(targetId);

      if (isMobile) {
        setMobileMenuOpen(false);
        setTimeout(() => {
          elem?.scrollIntoView({ behavior: "smooth", block: "start" });
          window.history.pushState(null, "", href);
        }, 150);
      } else {
        elem?.scrollIntoView({ behavior: "smooth", block: "start" });
        window.history.pushState(null, "", href);
      }
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-black/[0.07] bg-white/85 backdrop-blur-md transition-all">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link
          href="/"
          className="flex items-center transition-opacity hover:opacity-85"
        >
          <Image
            src="/branding/tforart-fileforge-logo.svg"
            alt="Tforart FileForge Logo"
            width={180}
            height={40}
            className="h-6 w-auto object-contain md:h-7"
            priority
          />
        </Link>

        {/* Desktop Navigation Links */}
        <nav className="hidden items-center gap-8 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.name}
              href={link.href}
              onClick={(e) => handleNavClick(e, link.href)}
              className="cursor-pointer text-sm font-medium text-gray-600 transition-colors hover:text-black"
            >
              {link.name}
            </Link>
          ))}
          <a
            href="https://tforart.vn"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-gray-600 transition-colors hover:text-black"
          >
            Tforart Production
          </a>
        </nav>

        {/* Desktop Actions */}
        <div className="hidden items-center gap-3 md:flex">
          <a
            href="https://github.com/nstdev1001/tforart-fileforge"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center justify-center rounded-lg border border-gray-300/80 bg-white/90 px-3.5 text-sm font-medium text-gray-700 shadow-2xs backdrop-blur-sm transition-all hover:bg-gray-50 hover:text-black"
          >
            GitHub
          </a>
          <Link
            href="/#download"
            onClick={(e) => handleNavClick(e, "/#download")}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-black px-4 text-sm font-semibold text-white shadow-2xs transition-all hover:bg-gray-800"
          >
            <span>Tải FileForge</span>
            <ArrowRight className="size-3.5" />
          </Link>
        </div>

        {/* Mobile Menu Button */}
        <div className="flex md:hidden">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="inline-flex cursor-pointer items-center justify-center rounded-lg p-2 text-gray-700 hover:bg-gray-100 focus:outline-none"
            aria-label="Open Navigation Menu"
          >
            <Menu className="size-5" />
          </button>
        </div>
      </div>

      {/* Mobile Drawer Overlay and Panel */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop mask */}
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Drawer container */}
          <div className="fixed top-0 right-0 z-50 flex h-full w-[68vw] max-w-[270px] flex-col justify-between bg-white shadow-2xl transition-transform duration-300">
            {/* Drawer Header & Content */}
            <div className="flex flex-col p-4">
              {/* Close Button Row */}
              <div className="flex items-center justify-end pb-2">
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
                  aria-label="Close menu"
                >
                  <X className="size-5" />
                </button>
              </div>

              {/* Action buttons on top */}
              <div className="flex flex-col gap-2">
                <Link
                  href="/#download"
                  onClick={(e) => handleNavClick(e, "/#download", true)}
                  className="flex h-9 items-center justify-center gap-1.5 rounded-xl bg-black text-xs font-semibold text-white shadow-2xs"
                >
                  <Download className="size-3.5" />
                  <span>Tải FileForge</span>
                </Link>
                <a
                  href="https://github.com/nstdev1001/tforart-fileforge"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex h-9 items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white text-xs font-semibold text-gray-800 shadow-2xs"
                >
                  <span>Xem GitHub Repo</span>
                </a>
              </div>

              {/* Navigation links below buttons */}
              <div className="mt-4 flex flex-col space-y-1 border-t border-gray-100 pt-3">
                {navLinks.map((link) => (
                  <Link
                    key={link.name}
                    href={link.href}
                    onClick={(e) => handleNavClick(e, link.href, true)}
                    className="flex cursor-pointer items-center rounded-xl px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-100 hover:text-black"
                  >
                    {link.name}
                  </Link>
                ))}
              </div>
            </div>

            {/* Bottom Area: Ecosystem & Legal Links */}
            <div className="mt-auto flex flex-col gap-2 border-t border-gray-100 p-4 pt-3">
              <div className="flex flex-col space-y-0.5">

                <a
                  href="https://tforart.vn"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-100 hover:text-black"
                >
                  <span>Tforart Production</span>
                  <ExternalLink className="size-3 text-gray-400" />
                </a>
                <Link
                  href="/privacy"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-100 hover:text-black"
                >
                  Chính sách bảo mật (Privacy)
                </Link>
                <Link
                  href="/terms"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-100 hover:text-black"
                >
                  Điều khoản dịch vụ (Terms)
                </Link>
                <a
                  href="mailto:lienhe@tforart.vn"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-100 hover:text-black"
                >
                  Liên hệ (Contact)
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
