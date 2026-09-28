"use client";

import { 
  Zap, 
  ShieldCheck, 
  FolderSync, 
  Cpu, 
  CloudUpload,
  Database
} from "lucide-react";

const features = [
  {
    number: "01",
    icon: <Zap className="size-5 text-black" />,
    title: "Động cơ 7-Zip nguyên bản",
    description:
      "Tự động nhận diện hoặc tùy chỉnh đường dẫn 7z.exe x64. Tối ưu đa luồng CPU, kiểm tra trước dung lượng trống của ổ đĩa để đảm bảo không bị lỗi tràn đĩa khi nén thư mục hàng chục GB.",
  },
  {
    number: "02",
    icon: <CloudUpload className="size-5 text-black" />,
    title: "Upload Resumable Google Drive",
    description:
      "Cơ chế chia nhỏ 8 MiB per chunk chuẩn Google API. Tự động lưu session token, tự động chờ khi rớt mạng và phục hồi đúng vị trí dang dở mà không cần nén hay tải lại từ đầu.",
  },
  {
    number: "03",
    icon: <FolderSync className="size-5 text-black" />,
    title: "Watchers — Tự động bắt file render",
    description:
      "Chỉ định thư mục xuất file của Premiere, After Effects, DaVinci Resolve hay Blender. Thuật toán stability check nhận diện khi file kết thúc render và tự động nén, upload lên Drive.",
  },
  {
    number: "04",
    icon: <ShieldCheck className="size-5 text-black" />,
    title: "Bảo mật Windows Credential",
    description:
      "Đăng nhập tài khoản Google an toàn qua OAuth 2.0 PKCE. Tokens được lưu trữ trực tiếp trong Windows Credential Manager của hệ điều hành, không lưu plaintext trong database.",
  },
  {
    number: "05",
    icon: <Cpu className="size-5 text-black" />,
    title: "Chạy ngầm khay hệ thống (Tray)",
    description:
      "Được viết bằng Rust + Tauri v2, ứng dụng siêu nhẹ, chiếm cực ít RAM so với Electron. Dễ dàng thu nhỏ xuống khay hệ thống và gửi thông báo native Windows khi hoàn tất tác vụ.",
  },
  {
    number: "06",
    icon: <Database className="size-5 text-black" />,
    title: "Hàng đợi đa luồng & SQLite cục bộ",
    description:
      "Cấu hình số luồng chạy đồng thời từ 1 đến 10 workers. Toàn bộ lịch sử tác vụ, tốc độ truyền tải và log lỗi được lưu an toàn trong SQLite cục bộ, bảo toàn dữ liệu khi khởi động lại.",
  },
];

export default function FeaturesSection() {
  return (
    <section
      id="features"
      className="relative scroll-mt-16 py-20 md:scroll-mt-20 md:py-28 lg:py-32"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/80 px-3.5 py-1 text-xs font-semibold text-gray-800 backdrop-blur-sm">
            <span>Sức mạnh cốt lõi</span>
          </div>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-gray-950 sm:text-4xl md:text-5xl">
            Mọi thứ bạn cần để bàn giao media siêu tốc.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-gray-600 sm:text-lg">
            Được thiết kế tỉ mỉ cho quy trình làm việc của video editor, 3D artist, motion designer và studio sáng tạo hiện đại.
          </p>
        </div>

        {/* Features Grid */}
        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 md:mt-16 lg:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.number}
              className="group relative flex flex-col justify-between rounded-2xl border border-black/10 bg-white/85 p-6 shadow-xs backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-black/20 hover:bg-white hover:shadow-xl hover:shadow-black/5 sm:p-7"
            >
              <div>
                {/* Header with Number & Icon */}
                <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                  <span className="font-mono text-2xl font-bold tracking-tight text-gray-400 transition-colors group-hover:text-black">
                    {feature.number}
                  </span>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-50 transition-colors group-hover:bg-gray-100">
                    {feature.icon}
                  </div>
                </div>

                {/* Content */}
                <h3 className="mt-5 text-xl font-bold tracking-tight text-gray-950">
                  {feature.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-gray-600">
                  {feature.description}
                </p>
              </div>

              {/* Bottom line indicator */}
              <div className="mt-6 h-0.5 w-8 rounded-full bg-gray-200 transition-all duration-300 group-hover:w-full group-hover:bg-black" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
