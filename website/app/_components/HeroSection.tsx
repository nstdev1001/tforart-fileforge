"use client";

import Image from "next/image";
import Link from "next/link";
import { 
  Download, 
  PlayCircle, 
  Sparkles, 
  ShieldCheck, 
  Zap, 
  HardDrive, 
  ArrowRight,
  CheckCircle2,
  FolderSync
} from "lucide-react";

export default function HeroSection() {
  return (
    <section className="relative overflow-hidden pt-12 pb-20 md:pt-20 md:pb-28 lg:pt-24 lg:pb-36">
      {/* Top subtle badge */}
      <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-50/70 px-4 py-1.5 text-xs font-semibold text-emerald-800 shadow-sm backdrop-blur-md">
          <Sparkles className="size-3.5 text-emerald-600" />
          <span>Tauri v2 + Rust Native • Tự động hoá bàn giao media cho Windows</span>
        </div>

        {/* Headline */}
        <h1 className="mt-7 text-4xl font-black tracking-tight text-gray-950 sm:text-6xl md:text-7xl lg:text-7xl">
          <span className="block">Nén 7-Zip & Upload Google Drive</span>
          <span className="mt-1 block bg-gradient-to-r from-emerald-600 via-teal-700 to-gray-900 bg-clip-text text-transparent">
            Tự động hoá siêu tốc cho Creator
          </span>
        </h1>

        {/* Subtitle */}
        <p className="mx-auto mt-6 max-w-3xl text-base leading-relaxed text-gray-600 sm:text-lg md:text-xl">
          Giải phóng thời gian nén file và tải lên thủ công sau mỗi buổi render.
          FileForge tự động phát hiện file mới, nén 7-Zip đa luồng và đẩy lên Google Drive
          với khả năng <strong>tự nối lại khi rớt mạng</strong>.
        </p>

        {/* Action Buttons */}
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4 md:mt-10">
          <Link
            href="/#download"
            className="inline-flex w-full items-center justify-center gap-2.5 rounded-xl bg-black px-7 py-3.5 text-base font-semibold text-white shadow-xl shadow-black/10 transition-all duration-200 hover:-translate-y-0.5 hover:bg-gray-800 sm:w-auto"
          >
            <Download className="size-5 text-emerald-400" />
            <span>Tải FileForge cho Windows</span>
          </Link>
          <a
            href="#features"
            onClick={(e) => {
              e.preventDefault();
              const elem = document.getElementById("features");
              if (elem) {
                elem.scrollIntoView({ behavior: "smooth", block: "start" });
                window.history.pushState(null, "", "#features");
              }
            }}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-300/80 bg-white/90 px-6 py-3.5 text-base font-semibold text-gray-800 shadow-sm backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-gray-50 sm:w-auto"
          >
            <PlayCircle className="size-5 text-emerald-600" />
            <span>Khám phá tính năng</span>
          </a>
        </div>

        {/* Feature Highlights pills */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-medium text-gray-500">
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="size-3.5 text-emerald-600" />
            Không tốn RAM (Rust core)
          </span>
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="size-3.5 text-emerald-600" />
            Chạy ngầm khay hệ thống (Tray)
          </span>
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="size-3.5 text-emerald-600" />
            Bảo mật Windows Credential Manager
          </span>
        </div>
      </div>

      {/* Primary Hero Screenshot Showcase */}
      <div className="relative mx-auto mt-12 max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="relative rounded-2xl border border-black/10 bg-white/60 p-2 shadow-2xl shadow-emerald-950/10 backdrop-blur-xl sm:rounded-3xl sm:p-4">
          {/* Simulated App Window Header */}
          <div className="mb-3 flex items-center justify-between px-2 pt-1">
            <div className="flex items-center gap-2">
              <span className="size-3 rounded-full bg-red-400" />
              <span className="size-3 rounded-full bg-yellow-400" />
              <span className="size-3 rounded-full bg-green-400" />
              <span className="ml-2 text-xs font-medium text-gray-500">Tforart FileForge — Live Dashboard</span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-gray-400">
              <span className="rounded bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800">Tauri Native</span>
              <span>Windows 10/11</span>
            </div>
          </div>

          {/* Screenshot Image */}
          <div className="relative overflow-hidden rounded-xl border border-gray-200/80 bg-gray-50 shadow-inner">
            <Image
              src="/images/dashboard-hero.png"
              alt="Tforart FileForge Dashboard giao diện thực tế"
              width={1200}
              height={750}
              className="h-auto w-full object-cover"
              priority
            />
          </div>

          {/* Floating Callout Badges */}
          <div className="absolute -bottom-5 left-8 hidden rounded-xl border border-black/10 bg-white/95 px-4 py-2.5 shadow-lg backdrop-blur-md md:flex md:items-center md:gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <Zap className="size-5" />
            </div>
            <div className="text-left">
              <p className="text-xs font-bold text-gray-900">Upload 51 MB/s Resumable</p>
              <p className="text-[11px] text-gray-500">Chia nhỏ chunk 8 MiB chuẩn Google Drive</p>
            </div>
          </div>

          <div className="absolute -top-4 right-10 hidden rounded-xl border border-black/10 bg-white/95 px-4 py-2.5 shadow-lg backdrop-blur-md md:flex md:items-center md:gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-teal-100 text-teal-700">
              <ShieldCheck className="size-5" />
            </div>
            <div className="text-left">
              <p className="text-xs font-bold text-gray-900">OAuth 2.0 PKCE Bảo Mật</p>
              <p className="text-[11px] text-gray-500">Token nằm an toàn trong Windows Credential</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
