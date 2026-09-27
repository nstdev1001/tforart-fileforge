"use client";

import { 
  Zap, 
  ShieldCheck, 
  FolderSync, 
  HardDrive, 
  Cpu, 
  Bell, 
  Layers3, 
  CloudUpload,
  Database,
  ArrowRight
} from "lucide-react";

const features = [
  {
    icon: <Zap className="size-6 text-emerald-600" />,
    title: "Động Cơ 7-Zip Nguyên Bản",
    badge: "Native Engine",
    description:
      "Tự động nhận diện hoặc tùy chỉnh đường dẫn 7z.exe x64 trên máy tính. Tối ưu đa luồng CPU, kiểm tra trước dung lượng trống của ổ đĩa để đảm bảo không bao giờ bị lỗi tràn đĩa khi nén các thư mục nặng hàng chục GB.",
  },
  {
    icon: <CloudUpload className="size-6 text-teal-600" />,
    title: "Upload Resumable Google Drive",
    badge: "Zero Data Loss",
    description:
      "Cơ chế cắt nhỏ 8 MiB per chunk chuẩn Google API. Tự động lưu session token, tự động bắt lại khi rớt mạng (Waiting for network) và phục hồi đúng vị trí dang dở mà không cần nén hay tải lại từ đầu.",
  },
  {
    icon: <FolderSync className="size-6 text-blue-600" />,
    title: "Folder Watchers — Bắt File Tự Động",
    badge: "Automation",
    description:
      "Chỉ định thư mục xuất file của Premiere, After Effects, DaVinci Resolve hay Blender. Thuật toán kiểm tra tính ổn định (stability check) phát hiện khi file hoàn tất render và tự động nén, upload lên Drive định sẵn.",
  },
  {
    icon: <ShieldCheck className="size-6 text-emerald-700" />,
    title: "Bảo Mật Windows Credential Manager",
    badge: "Enterprise Security",
    description:
      "Đăng nhập tài khoản Google an toàn qua OAuth 2.0 PKCE. Access và refresh tokens được lưu trữ trực tiếp trong Windows Credential Manager của hệ điều hành, không bao giờ lộ ra webview hay lưu text/plain trong database.",
  },
  {
    icon: <Cpu className="size-6 text-indigo-600" />,
    title: "Chạy Ngầm Khay Hệ Thống (System Tray)",
    badge: "Lightweight",
    description:
      "Được viết bằng Rust + Tauri v2, ứng dụng siêu nhẹ, chiếm cực ít RAM so với Electron. Dễ dàng thu nhỏ xuống khay hệ thống, tùy chọn khởi động cùng Windows và gửi thông báo native Windows khi hoàn tất tác vụ.",
  },
  {
    icon: <Database className="size-6 text-amber-600" />,
    title: "Hàng Đợi Đa Luồng & SQLite Cục Bộ",
    badge: "Full Control",
    description:
      "Cấu hình số luồng chạy đồng thời từ 1 đến 10 workers. Toàn bộ lịch sử tác vụ, tốc độ truyền tải, kích thước và log lỗi được lưu an toàn trong SQLite cục bộ, bảo toàn dữ liệu ngay cả khi mất điện đột ngột.",
  },
];

export default function FeaturesSection() {
  return (
    <section id="features" className="relative scroll-mt-20 py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Heading */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/80 px-4 py-1.5 text-xs font-semibold text-gray-800 shadow-2xs backdrop-blur-md">
            <Layers3 className="size-3.5 text-emerald-600" />
            <span>Sức mạnh cốt lõi</span>
          </div>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-gray-950 sm:text-4xl lg:text-5xl">
            Được thiết kế riêng cho Media Editors & Studios
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-gray-600">
            Tất cả những gì bạn cần để biến khâu đóng gói và bàn giao video/ảnh thành một chu trình mượt mà, tự động và chuẩn xác.
          </p>
        </div>

        {/* Feature Cards Grid */}
        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <div
              key={i}
              className="group relative flex flex-col justify-between rounded-3xl border border-black/8 bg-white/90 p-8 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-black/15 hover:shadow-xl hover:shadow-black/5"
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex size-12 items-center justify-center rounded-2xl bg-gray-50 ring-1 ring-black/5 group-hover:bg-emerald-50">
                    {f.icon}
                  </div>
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-[11px] font-semibold text-gray-600">
                    {f.badge}
                  </span>
                </div>
                <h3 className="mt-6 text-lg font-bold text-gray-950">
                  {f.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-gray-600">
                  {f.description}
                </p>
              </div>

              <div className="mt-6 flex items-center gap-1.5 text-xs font-semibold text-emerald-700 opacity-0 transition-opacity group-hover:opacity-100">
                <span>Xem chi tiết</span>
                <ArrowRight className="size-3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
