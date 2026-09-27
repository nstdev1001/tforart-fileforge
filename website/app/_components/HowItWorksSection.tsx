"use client";

import { KeyRound, FolderUp, CheckCircle, ArrowRight, ShieldCheck } from "lucide-react";
import Link from "next/link";

const steps = [
  {
    step: "01",
    title: "Kết nối Google Drive & 7-Zip",
    description:
      "Chỉ với 1 cú click đăng nhập qua trình duyệt (Google OAuth 2.0 PKCE). Ứng dụng tự động kết nối với engine 7-Zip đã cài đặt trên máy tính của bạn.",
    tag: "Chỉ làm 1 lần",
  },
  {
    step: "02",
    title: "Chọn folder hoặc Cài Watcher",
    description:
      "Kéo thả thư mục dự án cần bàn giao, hoặc thiết lập Watcher để FileForge tự động phát hiện khi phần mềm dựng phim hoàn tất xuất video.",
    tag: "Linh hoạt tối đa",
  },
  {
    step: "03",
    title: "Tự động nén, Upload & Lấy Link",
    description:
      "FileForge nén đa luồng, upload cắt chunk 8 MiB với tốc độ tối đa. Mất mạng tự chờ, xong tác vụ tự gửi thông báo và cung cấp link Drive sẵn sàng.",
    tag: "Hoàn toàn tự động",
  },
];

export default function HowItWorksSection() {
  return (
    <section id="how-it-works" className="relative scroll-mt-20 py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/80 px-4 py-1.5 text-xs font-semibold text-gray-800 shadow-2xs backdrop-blur-md">
            <KeyRound className="size-3.5 text-emerald-600" />
            <span>Quy trình 3 bước</span>
          </div>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-gray-950 sm:text-4xl lg:text-5xl">
            Tối giản hoá bàn giao file chỉ trong vài phút
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-gray-600">
            Từ lúc render xong đến khi link Google Drive đến tay khách hàng, bạn không cần phải bận tâm canh chừng máy tính nữa.
          </p>
        </div>

        <div className="mt-14 grid gap-8 md:grid-cols-3">
          {steps.map((s, idx) => (
            <div
              key={idx}
              className="relative flex flex-col justify-between rounded-3xl border border-black/8 bg-white/90 p-8 shadow-sm transition-all duration-300 hover:shadow-lg"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-4xl font-black text-emerald-600/30">
                    {s.step}
                  </span>
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-800">
                    {s.tag}
                  </span>
                </div>
                <h3 className="mt-6 text-xl font-bold text-gray-950">
                  {s.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-gray-600">
                  {s.description}
                </p>
              </div>

              <div className="mt-6 border-t border-gray-100 pt-4 text-xs font-medium text-gray-400">
                Bước {idx + 1} trên 3
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
