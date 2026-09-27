"use client";

import NavbarHome from "@/app/_components/NavbarHome";
import FooterHome from "@/app/_components/FooterHome";
import { 
  ShieldCheck, 
  Clock, 
  Lock, 
  Database, 
  Cloud, 
  UserCheck, 
  Mail, 
  HardDrive,
  CheckCircle2
} from "lucide-react";
import Link from "next/link";

export default function PrivacyPage() {
  return (
    <div className="main-background min-h-screen flex flex-col text-gray-900 selection:bg-black selection:text-white">
      {/* Synchronized Header */}
      <NavbarHome />

      {/* Main Content Area */}
      <main className="flex-1 py-12 sm:py-16">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          {/* Header Banner */}
          <div className="mb-10 text-center">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-50/80 px-4 py-1.5 text-xs font-semibold text-emerald-800 shadow-sm backdrop-blur-md">
              <ShieldCheck className="size-4 text-emerald-600" />
              <span>Văn bản Pháp lý & Quyền riêng tư</span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-gray-950 sm:text-4xl lg:text-5xl">
              Chính Sách Quyền Riêng Tư
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-sm text-gray-600 sm:text-base">
              Cam kết bảo mật dữ liệu, cơ chế mã hóa và quyền sở hữu nội dung dành cho người dùng ứng dụng desktop <strong>Tforart FileForge</strong>.
            </p>
            <div className="mt-4 flex items-center justify-center gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <Clock className="size-3.5" /> Có hiệu lực từ: 01/01/2025
              </span>
              <span>•</span>
              <span>Cập nhật lần cuối: Năm 2026</span>
            </div>
          </div>

          {/* Policy Document Body */}
          <div className="space-y-8 rounded-3xl border border-black/10 bg-white/90 p-6 shadow-xl shadow-black/5 backdrop-blur-xl sm:p-10 lg:p-12">
            {/* Section 1 */}
            <section className="space-y-3 border-b border-gray-100 pb-8">
              <h2 className="flex items-center gap-3 text-xl font-bold text-gray-950">
                <span className="flex size-7 items-center justify-center rounded-lg bg-black text-xs font-bold text-white">
                  1
                </span>
                Giới thiệu & Triết lý Local-first
              </h2>
              <p className="text-sm leading-relaxed text-gray-700">
                Chào mừng bạn đến với <strong>Tforart FileForge</strong> (thuộc hệ sinh thái sáng tạo <strong>Tforart</strong>).
                Ứng dụng được thiết kế theo triết lý <strong>Local-first</strong>: toàn bộ quá trình nén tệp tin, theo dõi thư mục và tải lên đám mây diễn ra trực tiếp giữa máy tính Windows của bạn và tài khoản Google Drive cá nhân của bạn.
              </p>
              <p className="text-sm leading-relaxed text-gray-700">
                Chúng tôi không lưu trữ, trung chuyển, sao chép hay giám sát nội dung các tệp tin media, video hoặc hình ảnh mà bạn xử lý qua ứng dụng.
              </p>
            </section>

            {/* Section 2 */}
            <section className="space-y-3 border-b border-gray-100 pb-8">
              <h2 className="flex items-center gap-3 text-xl font-bold text-gray-950">
                <span className="flex size-7 items-center justify-center rounded-lg bg-black text-xs font-bold text-white">
                  2
                </span>
                Xác thực Google OAuth 2.0 & Bảo mật Token
              </h2>
              <p className="text-sm leading-relaxed text-gray-700">
                Để thực hiện tải tệp lên Google Drive, FileForge sử dụng luồng xác thực <strong>OAuth 2.0 Authorization Code PKCE (Proof Key for Code Exchange)</strong> theo tiêu chuẩn khắt khe nhất của Google dành cho ứng dụng Desktop:
              </p>
              <ul className="space-y-2 text-sm text-gray-700">
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                  <span><strong>Lưu trữ an toàn tại hệ điều hành:</strong> Access Token và Refresh Token được lưu trữ mã hóa trong <strong>Windows Credential Manager</strong>. Token không bao giờ được lưu dưới dạng văn bản thô (plaintext), không ghi vào cơ sở dữ liệu SQLite và không bao giờ xuất hiện trong giao diện Webview.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                  <span><strong>Làm mới token tự động & độc lập:</strong> Quá trình refresh token diễn ra hoàn toàn trong tầng mã nguồn Rust native, sử dụng cơ chế khoá đơn luồng (single-flight lock) để đảm bảo không bị xung đột phiên.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                  <span><strong>Quyền ngắt kết nối tuyệt đối:</strong> Bạn có thể nhấn nút <em>Disconnect</em> trong phần Cài đặt bất kỳ lúc nào để thu hồi và xóa sạch token khỏi máy tính ngay lập tức.</span>
                </li>
              </ul>
            </section>

            {/* Section 3 */}
            <section className="space-y-3 border-b border-gray-100 pb-8">
              <h2 className="flex items-center gap-3 text-xl font-bold text-gray-950">
                <span className="flex size-7 items-center justify-center rounded-lg bg-black text-xs font-bold text-white">
                  3
                </span>
                Tuân thủ Chính sách Dữ liệu Người dùng Google API (Limited Use)
              </h2>
              <p className="text-sm leading-relaxed text-gray-700">
                Việc Tforart FileForge sử dụng và truyền thông tin nhận được từ Google API sang bất kỳ ứng dụng nào khác sẽ tuân thủ nghiêm ngặt{" "}
                <a
                  href="https://developers.google.com/terms/api-services-user-data-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-emerald-700 underline"
                >
                  Chính sách Dữ liệu Người dùng Dịch vụ Google API
                </a>, bao gồm các yêu cầu về <em>Sử dụng có giới hạn (Limited Use)</em>:
              </p>
              <ul className="space-y-2 text-sm text-gray-700">
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                  <span>Chỉ sử dụng quyền truy cập Google Drive để tạo thư mục đích, tải lên các tệp tin nén do người dùng chỉ định và lấy đường dẫn chia sẻ (webViewLink).</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                  <span>Không chuyển nhượng hoặc bán dữ liệu Google của bạn cho bất kỳ bên thứ ba, nhà môi giới dữ liệu hoặc đối tác quảng cáo nào.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                  <span>Không sử dụng dữ liệu của bạn để phát triển, huấn luyện hoặc tinh chỉnh các mô hình trí tuệ nhân tạo (AI/ML) tổng quát.</span>
                </li>
              </ul>
            </section>

            {/* Section 4 */}
            <section className="space-y-3 border-b border-gray-100 pb-8">
              <h2 className="flex items-center gap-3 text-xl font-bold text-gray-950">
                <span className="flex size-7 items-center justify-center rounded-lg bg-black text-xs font-bold text-white">
                  4
                </span>
                Lưu trữ Dữ liệu Cục bộ (SQLite & Logs)
              </h2>
              <p className="text-sm leading-relaxed text-gray-700">
                Trên máy tính của bạn, FileForge sử dụng một cơ sở dữ liệu SQLite cục bộ nằm trong thư mục dữ liệu ứng dụng của hệ điều hành (<code>AppData/Roaming/fileforge.db</code>). Cơ sở dữ liệu này chỉ lưu giữ:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-sm text-gray-700">
                <li>Danh sách và trạng thái các tác vụ (Queued, Running, Paused, Completed, Failed).</li>
                <li>Đường dẫn thư mục nguồn trên máy tính của bạn để phục vụ việc nén và theo dõi tự động (Watchers).</li>
                <li>Cấu hình số luồng chạy đồng thời, đường dẫn 7z.exe và tùy chọn giao diện sáng/tối.</li>
                <li>Nhật ký vận hành cục bộ (log tiến trình) nhằm giúp bạn tra cứu lịch sử và khắc phục sự cố.</li>
              </ul>
              <p className="text-sm text-gray-700">
                Toàn bộ dữ liệu này hoàn toàn thuộc về bạn và có thể xóa bất cứ lúc nào bằng cách gỡ bỏ ứng dụng.
              </p>
            </section>

            {/* Section 5 */}
            <section className="space-y-3">
              <h2 className="flex items-center gap-3 text-xl font-bold text-gray-950">
                <span className="flex size-7 items-center justify-center rounded-lg bg-black text-xs font-bold text-white">
                  5
                </span>
                Liên hệ Ban Quản trị & Hỗ trợ Quyền riêng tư
              </h2>
              <p className="text-sm leading-relaxed text-gray-700">
                Nếu bạn có bất kỳ thắc mắc, phản hồi hoặc yêu cầu liên quan đến chính sách quyền riêng tư của FileForge, xin vui lòng liên hệ với chúng tôi:
              </p>
              <div className="mt-4 rounded-2xl bg-gray-50 p-5 border border-gray-200/80 text-sm space-y-2">
                <p><strong>Đơn vị phát triển:</strong> Tforart Production & Đội ngũ sáng tạo Tforart</p>
                <p><strong>Người đại diện kỹ thuật:</strong> Nguyễn Sơn Tùng</p>
                <p><strong>Email tiếp nhận:</strong> <a href="mailto:lienhe@tforart.vn" className="text-emerald-700 font-semibold underline">lienhe@tforart.vn</a></p>
                <p><strong>Hệ sinh thái:</strong> <a href="https://tforart.vn" target="_blank" rel="noopener noreferrer" className="text-emerald-700 underline">https://tforart.vn</a> | <a href="https://review.tforart.vn" target="_blank" rel="noopener noreferrer" className="text-emerald-700 underline">https://review.tforart.vn</a></p>
              </div>
            </section>
          </div>
        </div>
      </main>

      {/* Synchronized Footer */}
      <FooterHome />
    </div>
  );
}
