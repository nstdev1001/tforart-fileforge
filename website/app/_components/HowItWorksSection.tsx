"use client";

import { KeyRound, FolderUp, CloudUpload } from "lucide-react";

const steps = [
  {
    step: "01",
    icon: <KeyRound className="size-6 text-black" />,
    title: "Setup",
    subtitle: "Kết nối Google Drive & 7-Zip",
    description:
      "Chỉ với 1 cú click đăng nhập qua trình duyệt (Google OAuth 2.0 PKCE). Ứng dụng tự động kết nối với engine 7-Zip đã cài đặt trên máy tính của bạn.",
  },
  {
    step: "02",
    icon: <FolderUp className="size-6 text-black" />,
    title: "Watch",
    subtitle: "Chọn folder hoặc Cài Watcher",
    description:
      "Kéo thả thư mục dự án cần bàn giao, hoặc thiết lập Watcher để FileForge tự động phát hiện khi phần mềm dựng phim hoàn tất xuất video.",
  },
  {
    step: "03",
    icon: <CloudUpload className="size-6 text-black" />,
    title: "Deliver",
    subtitle: "Tự động nén, Upload & Lấy Link",
    description:
      "FileForge nén đa luồng, upload cắt chunk 8 MiB với tốc độ tối đa. Mất mạng tự chờ, xong tác vụ tự gửi thông báo và cung cấp link Drive sẵn sàng.",
  },
];

export default function HowItWorksSection() {
  return (
    <section
      id="how-it-works"
      className="relative scroll-mt-16 py-20 md:scroll-mt-20 md:py-28 lg:py-32"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/80 px-3.5 py-1 text-xs font-semibold text-gray-800 backdrop-blur-sm">
            <span>Quy trình 3 bước</span>
          </div>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-gray-950 sm:text-4xl md:text-5xl">
            Cách thức hoạt động đơn giản
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-gray-600 sm:text-lg">
            3 bước tinh gọn để biến mọi khâu nén và tải file nặng hàng chục GB <br className="hidden sm:inline" />
            thành trải nghiệm tự động, mượt mà và chuẩn xác.
          </p>
        </div>

        {/* Steps Grid */}
        <div className="mt-14 grid grid-cols-1 gap-8 md:mt-20 md:grid-cols-3">
          {steps.map((item, index) => (
            <div
              key={item.step}
              className="relative flex flex-col justify-between rounded-2xl border border-black/10 bg-white/85 p-8 shadow-xs backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-black/20 hover:bg-white hover:shadow-xl hover:shadow-black/5"
            >
              <div>
                <div className="flex items-center justify-between border-b border-gray-100 pb-5">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-50">
                    {item.icon}
                  </div>
                  <span className="font-mono text-3xl font-extrabold text-gray-300">
                    {item.step}
                  </span>
                </div>

                <div className="mt-6">
                  <span className="text-xs font-semibold tracking-wider text-gray-400 uppercase">
                    {item.subtitle}
                  </span>
                  <h3 className="mt-1 text-2xl font-bold tracking-tight text-gray-950">
                    {item.title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-gray-600">
                    {item.description}
                  </p>
                </div>
              </div>

              {/* Progress Indicator line */}
              <div className="mt-8 flex items-center gap-2">
                <div className="h-1 flex-1 rounded-full bg-gray-200">
                  <div
                    className="h-full rounded-full bg-black"
                    style={{ width: `${((index + 1) / steps.length) * 100}%` }}
                  />
                </div>
                <span className="font-mono text-[11px] font-semibold text-gray-400">
                  Bước {index + 1}/3
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
