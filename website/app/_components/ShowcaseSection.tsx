"use client";

import { useState } from "react";
import Image from "next/image";
import { 
  ListOrdered, 
  Settings2, 
  Eye, 
  Sliders, 
  CheckCircle2, 
  ArrowRight,
  ShieldCheck,
  Zap,
  FolderSync
} from "lucide-react";

const showcaseTabs = [
  {
    id: "tasks",
    label: "Quản lý Hàng đợi",
    title: "Theo Dõi Tốc Độ & Tiến Trình Nén / Upload Thời Gian Thực",
    badge: "Multi-task Queue",
    icon: <ListOrdered className="size-4" />,
    image: "/images/task-queue.png",
    alt: "Giao diện quản lý hàng đợi tác vụ FileForge",
    description:
      "Giao diện trực quan hiển thị chính xác tốc độ nén, tốc độ tải lên theo thời gian thực (51 MB/s), thanh phần trăm và thời gian hoàn tất dự kiến (ETA). Hỗ trợ tạm dừng, tiếp tục hoặc huỷ bỏ từng tác vụ độc lập.",
    highlights: [
      "Bộ lọc trạng thái: Running, Queued, Waiting For Network, Paused, Completed, Failed.",
      "Tự động tính toán ETA và dung lượng từng phân đoạn zip.",
      "Thao tác 1 chạm: Nén & Upload mới, hoặc Tải về & Giải nén từ Google Drive link.",
    ],
  },
  {
    id: "gdrive",
    label: "Google Drive & 7-Zip",
    title: "Kết Nối Google Drive OAuth 2.0 & Động Cơ 7-Zip Chuẩn",
    badge: "OS-Level Integration",
    icon: <Settings2 className="size-4" />,
    image: "/images/gdrive-7zip-settings.png",
    alt: "Cấu hình Google Drive và 7-Zip Engine",
    description:
      "Tích hợp sâu với tài khoản Google Drive của bạn mà không cần bên thứ ba. Hiển thị trực quan dung lượng đã dùng/còn lại (ví dụ 68 GB / 5.0 TB), duyệt cây thư mục Drive và tự động kết nối với 7-Zip x64 bản quyền trên máy tính.",
    highlights: [
      "Windows Credential Manager bảo mật token tuyệt đối, không lộ ra webview.",
      "Duyệt danh sách thư mục Google Drive ngay trong app với tính năng tạo folder mới.",
      "Tự động nhận diện phiên bản 7-Zip 24.x mới nhất hoặc chọn đường dẫn tuỳ ý.",
    ],
  },
  {
    id: "watchers",
    label: "Thư mục Tự Động",
    title: "Watchers: Tự Động Bắt File Render & Đẩy Vào Hàng Đợi",
    badge: "Zero Manual Work",
    icon: <FolderSync className="size-4" />,
    image: "/images/watchers-automation.png",
    alt: "Màn hình cấu hình Watchers",
    description:
      "Bạn không cần phải ngồi đợi Premiere hay After Effects render xong để upload. Chỉ cần thiết lập thư mục theo dõi (Watcher), FileForge sẽ canh chừng và tự động đưa file vào hàng đợi nén - upload ngay khi file hoàn tất ghi.",
    highlights: [
      "Thuật toán Stability Check (1-10s) chống tình trạng upload khi file đang render dở.",
      "Tự động loại bỏ file tạm .tmp, .part và lọc định dạng file đuôi .mp4, .mov, .zip, .prproj,...",
      "Gộp nhiều file vào 1 folder Drive đích hoặc upload từng file độc lập.",
    ],
  },
  {
    id: "system",
    label: "Chạy Ngầm & Băng Thông",
    title: "Chạy Êm Ái Dưới Khay Hệ Thống & Kiểm Soát Băng Thông",
    badge: "Desktop Experience",
    icon: <Sliders className="size-4" />,
    image: "/images/desktop-system-tray.png",
    alt: "Cài đặt chạy ngầm và băng thông desktop",
    description:
      "Được tối ưu để không làm ảnh hưởng đến công việc dựng hình hay chơi game của bạn. FileForge có thể chạy ngầm khi đóng cửa sổ, tự khởi động cùng máy tính và thông báo Toast Windows khi toàn bộ file đã lên mây.",
    highlights: [
      "Tùy chỉnh số luồng upload song song (1 đến 10 concurrent uploads).",
      "Chế độ Maximum Bandwidth tận dụng 100% đường truyền cáp quang.",
      "Thông báo Native Windows Toast kèm âm thanh báo hoàn tất tác vụ.",
    ],
  },
];

export default function ShowcaseSection() {
  const [activeTab, setActiveTab] = useState(0);
  const current = showcaseTabs[activeTab];

  return (
    <section id="showcase" className="relative scroll-mt-20 bg-slate-100/60 py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Heading */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/80 px-4 py-1.5 text-xs font-semibold text-gray-800 shadow-2xs backdrop-blur-md">
            <Eye className="size-3.5 text-emerald-600" />
            <span>Trải nghiệm thực tế</span>
          </div>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-gray-950 sm:text-4xl lg:text-5xl">
            Giao diện trực quan, đậm chất Desktop Native
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-gray-600">
            Xem thực tế cách Tforart FileForge vận hành hàng chục gigabyte dữ liệu media mỗi ngày một cách nhẹ nhàng và tin cậy.
          </p>
        </div>

        {/* Tab Controls */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-2.5 sm:gap-3">
          {showcaseTabs.map((tab, idx) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(idx)}
              className={`flex items-center gap-2 rounded-xl px-5 py-3 text-xs font-semibold transition-all duration-200 sm:text-sm ${
                activeTab === idx
                  ? "bg-black text-white shadow-md shadow-black/15"
                  : "border border-black/5 bg-white/80 text-gray-700 hover:bg-white hover:text-black"
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Tab Content Display */}
        <div className="mt-10 grid items-center gap-10 lg:grid-cols-12">
          {/* Left Column: Details */}
          <div className="lg:col-span-5">
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100/80 px-3 py-1 text-xs font-bold text-emerald-900">
              <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>{current.badge}</span>
            </div>

            <h3 className="mt-4 text-2xl font-bold tracking-tight text-gray-950 sm:text-3xl">
              {current.title}
            </h3>

            <p className="mt-4 text-sm leading-relaxed text-gray-600 sm:text-base">
              {current.description}
            </p>

            <div className="mt-6 space-y-3">
              {current.highlights.map((h, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-800">
                    <CheckCircle2 className="size-3.5" />
                  </div>
                  <p className="text-xs font-medium text-gray-700 sm:text-sm">
                    {h}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Right Column: Screenshot Window */}
          <div className="lg:col-span-7">
            <div className="relative rounded-2xl border border-black/10 bg-white/80 p-2 shadow-2xl backdrop-blur-xl sm:rounded-3xl sm:p-3">
              <div className="mb-2 flex items-center justify-between px-2 pt-1 text-[11px] text-gray-400">
                <div className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full bg-red-400" />
                  <span className="size-2.5 rounded-full bg-yellow-400" />
                  <span className="size-2.5 rounded-full bg-green-400" />
                  <span className="ml-2 font-medium text-gray-600">{current.title}</span>
                </div>
                <span className="font-mono text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                  Live View
                </span>
              </div>

              <div className="relative overflow-hidden rounded-xl border border-gray-200/90 bg-gray-50 shadow-inner">
                <Image
                  src={current.image}
                  alt={current.alt}
                  width={1100}
                  height={680}
                  className="h-auto w-full object-cover transition-opacity duration-300"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
