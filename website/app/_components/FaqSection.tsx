"use client";

import { useState } from "react";
import { HelpCircle, ChevronDown } from "lucide-react";

const faqs = [
  {
    q: "FileForge có lưu hay quét nội dung file của tôi lên máy chủ bên ngoài không?",
    a: "Hoàn toàn KHÔNG. Tforart FileForge là ứng dụng Local-first chạy trực tiếp trên máy tính của bạn. Dữ liệu tệp tin và thông tin nén truyền thẳng từ máy tính của bạn lên Google Drive qua API chính thức của Google bằng giao thức HTTPS mã hóa. Chúng tôi không lưu trữ, trung chuyển hay can thiệp vào bất kỳ tệp tin nào của bạn.",
  },
  {
    q: "Token đăng nhập tài khoản Google Drive được bảo mật ra sao?",
    a: "Ứng dụng xác thực qua chuẩn OAuth 2.0 PKCE khắt khe của Google. Access và Refresh Tokens được lưu mã hóa trực tiếp trong Windows Credential Manager — hệ thống quản lý mật khẩu cấp độ hệ điều hành của Windows. Token không bao giờ bị lưu dưới dạng plaintext, không ghi vào database SQLite và không bao giờ lộ ra giao diện hiển thị.",
  },
  {
    q: "Nếu mạng bị ngắt quãng hoặc rớt Wi-Fi giữa chừng khi đang upload thì sao?",
    a: "Không bao giờ phải upload lại từ đầu! FileForge chia tệp nén thành các chunk 8 MiB theo chuẩn Resumable Upload của Google. Khi mất kết nối mạng, tác vụ tự động chuyển sang trạng thái 'Waiting for network'. Ngay khi có mạng trở lại, FileForge tự động phục hồi phiên tải lên từ đúng vị trí byte đang dang dở.",
  },
  {
    q: "Cấu hình máy tính tối thiểu để sử dụng FileForge là gì?",
    a: "Hệ điều hành Windows 10 hoặc Windows 11 (64-bit), Microsoft Edge WebView2 Runtime (đã tích hợp sẵn trên Windows) và công cụ 7-Zip x64 (khuyên dùng phiên bản 24.x trở lên). Nhờ viết bằng Rust và Tauri v2, ứng dụng chỉ tiêu thụ một lượng RAM rất nhỏ (khoảng vài chục MB).",
  },
  {
    q: "FileForge liên kết với nền tảng Tforart Review như thế nào?",
    a: "FileForge là công cụ desktop chuyên xử lý nén đa luồng và tải tệp gốc siêu tốc lên Google Drive. Sau khi hoàn thành, bạn có thể copy link Drive để gắn vào nền tảng Tforart Review cho khách hàng và đối tác cùng xem, trao đổi nhận xét và duyệt file trực quan.",
  },
];

export default function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggle = (idx: number) => {
    setOpenIndex(openIndex === idx ? null : idx);
  };

  return (
    <section id="faq" className="relative scroll-mt-20 py-20 lg:py-28">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/80 px-4 py-1.5 text-xs font-semibold text-gray-800 shadow-2xs backdrop-blur-md">
            <HelpCircle className="size-3.5 text-emerald-600" />
            <span>Giải đáp thắc mắc</span>
          </div>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-gray-950 sm:text-4xl">
            Các câu hỏi thường gặp
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-gray-600 sm:text-base">
            Mọi thông tin về độ an toàn, bảo mật dữ liệu và cách hoạt động của Tforart FileForge.
          </p>
        </div>

        <div className="mt-12 space-y-4">
          {faqs.map((f, i) => {
            const isOpen = openIndex === i;
            return (
              <div
                key={i}
                className="overflow-hidden rounded-2xl border border-black/8 bg-white/90 shadow-sm transition-all"
              >
                <button
                  onClick={() => toggle(i)}
                  className="flex w-full items-center justify-between p-6 text-left"
                >
                  <span className="text-base font-bold text-gray-950 sm:text-lg">
                    {f.q}
                  </span>
                  <ChevronDown
                    className={`size-5 text-gray-500 transition-transform duration-200 ${
                      isOpen ? "rotate-180 text-emerald-600" : ""
                    }`}
                  />
                </button>

                {isOpen && (
                  <div className="border-t border-gray-100 px-6 pt-2 pb-6 text-sm leading-relaxed text-gray-600 sm:text-base">
                    {f.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
