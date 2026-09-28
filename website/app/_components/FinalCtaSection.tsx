"use client";

import Image from "next/image";
import { Download, Laptop, ShieldCheck } from "lucide-react";

export default function FinalCtaSection() {
  return (
    <section
      id="download"
      className="relative scroll-mt-16 py-20 md:scroll-mt-20 md:py-28 lg:py-32"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl border border-black/15 bg-black px-6 py-16 text-center text-white shadow-2xl sm:px-12 md:py-24 lg:px-16">
          {/* Background Image with optimized Next.js Image */}
          <Image
            src="/assets/backgrounds/last_content_background.jpg"
            alt="Nâng cấp quy trình bàn giao media của bạn ngay hôm nay"
            fill
            className="pointer-events-none object-cover object-center"
            sizes="(max-width: 1280px) 100vw, 1280px"
          />

          {/* Dark gradient overlay for optimal contrast and legibility */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/75 via-black/60 to-black/85 backdrop-blur-[1px]" />

          <div className="relative z-10 mx-auto max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-950/60 px-4 py-1.5 text-xs font-semibold text-emerald-300">
              <Laptop className="size-3.5" />
              <span>Sẵn sàng cho Windows 10 & Windows 11</span>
            </div>

            {/* Big Headline */}
            <h2 className="mt-8 text-3xl font-extrabold tracking-tight text-white sm:text-5xl md:text-6xl">
              <span className="block">Nén nhanh hơn</span>
              <span className="block text-gray-200">Bàn giao mượt mà hơn.</span>
            </h2>

            {/* Subcopy */}
            <p className="mx-auto mt-6 max-w-2xl text-sm leading-relaxed text-gray-300 text-pretty sm:text-base">
              Tải miễn phí Tforart FileForge. Không cài đặt rườm rà, kết nối an
              toàn với Google Drive và giải phóng 100% thời gian đóng gói file&nbsp;render.
            </p>

            {/* CTA buttons */}
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <a
                href="https://github.com/nstdev1001/tforart-fileforge/releases"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl !bg-white px-8 py-4 text-base font-semibold !text-black shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:!bg-gray-100 sm:w-auto"
              >
                <Download className="size-5" />
                <span>Tải FileForge cho Windows (.exe)</span>
              </a>

              <a
                href="https://github.com/nstdev1001/tforart-fileforge"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-6 py-4 text-base font-semibold text-white backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/15 sm:w-auto"
              >
                <svg className="size-5 fill-current" viewBox="0 0 24 24">
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                  />
                </svg>
                <span>Xem GitHub Repo</span>
              </a>
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-xs text-gray-400">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="size-4 text-emerald-400" />
                Không chứa quảng cáo hay mã độc
              </span>
              <span>•</span>
              <span>Phiên bản v0.1.0 Stable</span>
              <span>•</span>
              <span>Tauri v2 + Rust Core</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
