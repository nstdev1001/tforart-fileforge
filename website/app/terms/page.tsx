"use client";

import NavbarHome from "@/app/_components/NavbarHome";
import FooterHome from "@/app/_components/FooterHome";
import { 
  FileText, 
  Clock, 
  CheckCircle2, 
  Scale, 
  AlertTriangle, 
  ShieldAlert, 
  Copyright,
  ExternalLink
} from "lucide-react";
import Link from "next/link";

export default function TermsPage() {
  return (
    <div className="main-background min-h-screen flex flex-col text-gray-900 selection:bg-black selection:text-white">
      {/* Synchronized Header */}
      <NavbarHome />

      {/* Main Content Area */}
      <main className="flex-1 py-12 sm:py-16">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          {/* Header Banner */}
          <div className="mb-10 text-center">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-50/80 px-4 py-1.5 text-xs font-semibold text-blue-800 shadow-sm backdrop-blur-md">
              <FileText className="size-4 text-blue-600" />
              <span>Thỏa thuận Người dùng & Điều khoản Dịch vụ</span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-gray-950 sm:text-4xl lg:text-5xl">
              Điều Khoản Dịch Vụ
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-sm text-gray-600 sm:text-base">
              Quy định quyền lợi, nghĩa vụ và trách nhiệm pháp lý khi tải về và sử dụng phần mềm <strong>Tforart FileForge</strong>.
            </p>
            <div className="mt-4 flex items-center justify-center gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <Clock className="size-3.5" /> Có hiệu lực từ: 01/01/2025
              </span>
              <span>•</span>
              <span>Cập nhật lần cuối: Năm 2026</span>
            </div>
          </div>

          {/* Terms Document Body */}
          <div className="space-y-8 rounded-3xl border border-black/10 bg-white/90 p-6 shadow-xl shadow-black/5 backdrop-blur-xl sm:p-10 lg:p-12">
            {/* Section 1 */}
            <section className="space-y-3 border-b border-gray-100 pb-8">
              <h2 className="flex items-center gap-3 text-xl font-bold text-gray-950">
                <span className="flex size-7 items-center justify-center rounded-lg bg-black text-xs font-bold text-white">
                  1
                </span>
                Chấp thuận Điều khoản Sử dụng
              </h2>
              <p className="text-sm leading-relaxed text-gray-700">
                Bằng việc tải về, cài đặt hoặc chạy ứng dụng <strong>Tforart FileForge</strong> (sau đây gọi là &quot;Ứng dụng&quot;), bạn xác nhận rằng bạn đã đọc, hiểu và đồng ý tuân thủ toàn bộ các điều khoản và điều kiện được nêu tại văn bản này cũng như{" "}
                <Link href="/privacy" className="text-emerald-700 font-semibold underline">
                  Chính sách Quyền Riêng Tư
                </Link>{" "}
                của chúng tôi.
              </p>
              <p className="text-sm leading-relaxed text-gray-700">
                Nếu bạn không đồng ý với bất kỳ điều khoản nào, xin vui lòng ngừng sử dụng và gỡ bỏ ứng dụng khỏi thiết bị của bạn.
              </p>
            </section>

            {/* Section 2 */}
            <section className="space-y-3 border-b border-gray-100 pb-8">
              <h2 className="flex items-center gap-3 text-xl font-bold text-gray-950">
                <span className="flex size-7 items-center justify-center rounded-lg bg-black text-xs font-bold text-white">
                  2
                </span>
                Quyền sở hữu trí tuệ & Giấy phép sử dụng
              </h2>
              <p className="text-sm leading-relaxed text-gray-700">
                Thương hiệu, biểu trưng <strong>Tforart</strong>, <strong>Tforart FileForge</strong>, thiết kế giao diện, logo và toàn bộ các thành phần mã nguồn ứng dụng thuộc sở hữu hợp pháp của <strong>Nguyễn Sơn Tùng</strong> và <strong>Tforart Production</strong>.
              </p>
              <ul className="space-y-2 text-sm text-gray-700">
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                  <span>Bạn được cấp quyền sử dụng miễn phí ứng dụng cho mục đích cá nhân, thương mại, studio hoặc doanh nghiệp trong quy trình nén và tải lên tệp tin.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                  <span>Nội dung tệp tin media, video, hình ảnh của bạn hoàn toàn thuộc quyền sở hữu của bạn. Tforart không có bất kỳ quyền sở hữu hoặc yêu cầu bản quyền nào đối với dữ liệu người dùng.</span>
                </li>
              </ul>
            </section>

            {/* Section 3 */}
            <section className="space-y-3 border-b border-gray-100 pb-8">
              <h2 className="flex items-center gap-3 text-xl font-bold text-gray-950">
                <span className="flex size-7 items-center justify-center rounded-lg bg-black text-xs font-bold text-white">
                  3
                </span>
                Tuân thủ Điều khoản của Dịch vụ Bên thứ ba (Google Drive)
              </h2>
              <p className="text-sm leading-relaxed text-gray-700">
                Khi sử dụng tính năng tải lên Google Drive của FileForge, bạn đồng ý tuân thủ:
              </p>
              <ul className="space-y-2 text-sm text-gray-700">
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                  <span><a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer" className="font-semibold text-emerald-700 underline">Điều khoản dịch vụ của Google</a> và chính sách sử dụng có thể chấp nhận được của Google Drive.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                  <span>Không sử dụng FileForge để phân tán mã độc, virus, phần mềm gián điệp hoặc tài liệu vi phạm bản quyền và pháp luật hiện hành.</span>
                </li>
              </ul>
            </section>

            {/* Section 4 */}
            <section className="space-y-3 border-b border-gray-100 pb-8">
              <h2 className="flex items-center gap-3 text-xl font-bold text-gray-950">
                <span className="flex size-7 items-center justify-center rounded-lg bg-black text-xs font-bold text-white">
                  4
                </span>
                Giới hạn Trách nhiệm & Bảo đảm Kỹ thuật
              </h2>
              <p className="text-sm leading-relaxed text-gray-700">
                Ứng dụng được cung cấp trên cơ sở <strong>&quot;NGUYÊN TRẠNG&quot; (AS IS)</strong> và <strong>&quot;TÙY THUỘC VÀO SẴN CÓ&quot; (AS AVAILABLE)</strong>.
              </p>
              <div className="rounded-2xl bg-amber-50 p-4 border border-amber-200/80 text-xs leading-relaxed text-amber-900 space-y-1.5">
                <p className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="size-4 text-amber-700" />
                  Lưu ý về dung lượng ổ đĩa và đường truyền mạng:
                </p>
                <p>
                  Mặc dù FileForge tích hợp thuật toán preflight kiểm tra dung lượng trống trước khi nén và thuật toán thử lại tự động (exponential backoff) khi mạng chập chờn, người dùng cần đảm bảo hệ điều hành có đủ không gian đĩa đệm và đường truyền internet ổn định cho các tệp dung lượng lớn (hàng chục GB). Chúng tôi không chịu trách nhiệm đối với các tổn thất phát sinh do lỗi phần cứng cá nhân, nhà mạng viễn thông hoặc sự cố dịch vụ của Google.
                </p>
              </div>
            </section>

            {/* Section 5 */}
            <section className="space-y-3">
              <h2 className="flex items-center gap-3 text-xl font-bold text-gray-950">
                <span className="flex size-7 items-center justify-center rounded-lg bg-black text-xs font-bold text-white">
                  5
                </span>
                Thông tin Liên hệ
              </h2>
              <p className="text-sm leading-relaxed text-gray-700">
                Mọi thắc mắc hoặc yêu cầu hỗ trợ pháp lý về điều khoản dịch vụ, xin gửi thư điện tử về:
              </p>
              <div className="mt-3 rounded-2xl bg-gray-50 p-5 border border-gray-200/80 text-sm space-y-1.5">
                <p><strong>Bộ phận hỗ trợ Tforart:</strong> <a href="mailto:lienhe@tforart.vn" className="text-emerald-700 font-semibold underline">lienhe@tforart.vn</a></p>
                <p><strong>Trang chủ hệ sinh thái:</strong> <a href="https://tforart.vn" target="_blank" rel="noopener noreferrer" className="text-emerald-700 underline">https://tforart.vn</a></p>
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
