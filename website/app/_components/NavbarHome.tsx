"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  Download, 
  Menu, 
  X, 
  ExternalLink, 
  Layers3, 
  ShieldCheck, 
  Sparkles 
} from "lucide-react";

export default function NavbarHome() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { name: "Tính năng", href: "/#features" },
    { name: "Giao diện", href: "/#showcase" },
    { name: "Cách hoạt động", href: "/#how-it-works" },
    { name: "Hỏi đáp", href: "/#faq" },
  ];

  const handleNavClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    href: string,
    isMobile = false
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
        {/* Brand Logo */}
        <Link
          href="/"
          className="flex items-center gap-3 transition-opacity hover:opacity-85"
        >
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#007a55] text-white shadow-sm">
            <Layers3 className="size-5" strokeWidth={2.2} />
          </div>
          <Image
            src="/branding/tforart-fileforge-logo.svg"
            alt="Tforart FileForge Logo"
            width={180}
            height={36}
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

          {/* Ecosystem dropdown/link */}
          <div className="flex items-center gap-3 border-l border-gray-200 pl-6">
            <a
              href="https://review.tforart.vn"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 transition-colors hover:text-gray-900"
            >
              <span>Tforart Review</span>
              <ExternalLink className="size-3" />
            </a>
            <a
              href="https://tforart.vn"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 transition-colors hover:text-gray-900"
            >
              <span>Tforart.vn</span>
              <ExternalLink className="size-3" />
            </a>
          </div>
        </nav>

        {/* Right CTA */}
        <div className="hidden items-center gap-3 md:flex">
          <Link
            href="/#download"
            onClick={(e) => handleNavClick(e, "/#download")}
            className="inline-flex items-center gap-2 rounded-xl bg-black px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-gray-800"
          >
            <Download className="size-3.5" />
            <span>Tải FileForge</span>
          </Link>
        </div>

        {/* Mobile menu button */}
        <div className="flex md:hidden">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="inline-flex items-center justify-center rounded-lg p-2 text-gray-700 hover:bg-gray-100"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="size-6" /> : <Menu className="size-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="border-b border-gray-200 bg-white/95 px-4 pt-3 pb-6 backdrop-blur-xl md:hidden">
          <div className="flex flex-col gap-3">
            {navLinks.map((link) => (
              <Link
                key={link.name}
                href={link.href}
                onClick={(e) => handleNavClick(e, link.href, true)}
                className="rounded-lg px-3 py-2 text-base font-medium text-gray-700 hover:bg-gray-50"
              >
                {link.name}
              </Link>
            ))}
            <div className="my-2 border-t border-gray-100 pt-2">
              <p className="px-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
                Hệ sinh thái Tforart
              </p>
              <div className="mt-2 flex flex-col gap-1">
                <a
                  href="https://review.tforart.vn"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
                >
                  <span>Tforart Review (Cộng tác media)</span>
                  <ExternalLink className="size-3.5 text-gray-400" />
                </a>
                <a
                  href="https://tforart.vn"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
                >
                  <span>Tforart Production</span>
                  <ExternalLink className="size-3.5 text-gray-400" />
                </a>
              </div>
            </div>
            <Link
              href="/#download"
              onClick={(e) => handleNavClick(e, "/#download", true)}
              className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-black py-3 text-sm font-semibold text-white shadow-md"
            >
              <Download className="size-4" />
              <span>Tải FileForge cho Windows</span>
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
