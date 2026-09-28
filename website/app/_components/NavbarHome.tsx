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
          <Link
            href="https://tforart.vn"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-gray-600 transition-colors hover:text-black"
          >
            Tforart Production
          </Link>
        </nav>

        {/* Desktop Actions */}
        <div className="hidden items-center gap-3 md:flex">
          <Link
            href="https://github.com/nstdev1001/tforart-fileforge"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center justify-center gap-2 rounded-lg border border-gray-300/80 bg-white/90 px-3 text-sm font-medium text-gray-700 shadow-2xs backdrop-blur-sm transition-all hover:bg-gray-50 hover:text-black"
          >
            <svg className="size-4 fill-current" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
              />
            </svg>
            <span>GitHub</span>
          </Link>
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
                <Link
                  href="https://github.com/nstdev1001/tforart-fileforge"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex h-9 items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white text-xs font-semibold text-gray-800 shadow-2xs transition-all hover:bg-gray-50"
                >
                  <svg className="size-4 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                    />
                  </svg>
                  <span>Xem GitHub Repo</span>
                </Link>
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

                <Link
                  href="https://tforart.vn"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-100 hover:text-black"
                >
                  <span>Tforart Production</span>
                  <ExternalLink className="size-3 text-gray-400" />
                </Link>
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
                <Link
                  href="mailto:lienhe@tforart.vn"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-100 hover:text-black"
                >
                  Liên hệ (Contact)
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
