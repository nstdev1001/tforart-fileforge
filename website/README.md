# Tforart FileForge — Website & Landing Page

Landing page giới thiệu và tải ứng dụng **Tforart FileForge**, đồng bộ nhận diện thương hiệu và phong cách thiết kế với **Tforart Review** (`E:\CODE\tforart-review\frontend`).

## Tính năng trang web

- **Trang chủ (`/`)**:
  - **Header & Footer** đồng bộ hệ sinh thái Tforart (kèm liên kết Tforart Review & Tforart Production).
  - **Hero Section**: Giới thiệu công nghệ Tauri v2 + Rust, nén 7-Zip & Google Drive Resumable Upload với ảnh chụp màn hình trực tiếp từ app.
  - **Features Grid**: 6 tính năng cốt lõi (7-Zip native engine, chunk 8 MiB, Watchers tự động, Windows Credential Manager, System Tray, SQLite hàng đợi).
  - **Interactive Showcase**: Bộ 4 tab trực quan với hình ảnh thực tế của app (Hàng đợi tác vụ, Cấu hình Drive & 7-Zip, Thư mục Watcher tự động, Chạy ngầm & Băng thông).
  - **3-Bước sử dụng**: Quy trình đơn giản từ kết nối đến nhận link Google Drive bàn giao.
  - **FAQ**: Giải đáp thắc mắc về bảo mật, kết nối mạng và yêu cầu hệ thống.
  - **Download / CTA**: Nút tải file cài đặt Windows (.exe) và link GitHub repository.
- **Trang Chính sách Quyền riêng tư (`/privacy`)**:
  - Tuân thủ chính sách **Google API Services User Data Policy (Limited Use)**.
  - Minh bạch về cơ chế lưu trữ token trong **Windows Credential Manager**.
  - Cam kết Local-first: không lưu hay sao chép tệp tin media của người dùng.
- **Trang Điều khoản Dịch vụ (`/terms`)**:
  - Quy định sử dụng, bản quyền thương hiệu Tforart và giới hạn kỹ thuật.

## Hướng dẫn chạy thử nghiệm

Tại thư mục gốc của repository:

```bash
# Chạy máy chủ dev của website (cổng 3002)
npm run web:dev

# Build phiên bản production
npm run web:build

# Chạy bản production đã build
npm run web:start
```

Hoặc di chuyển trực tiếp vào thư mục `website/`:

```bash
cd website
npm run dev
```

Truy cập: [http://localhost:3002](http://localhost:3002)

## Hướng dẫn Deploy (Vercel / Cloudflare Pages)

1. Kết nối Git repository `tforart-fileforge` vào Vercel / Cloudflare Pages.
2. Tại mục **Project Settings** > **General** > **Root Directory**: Chọn `website`.
3. Framework Preset sẽ tự động nhận diện là **Next.js**.
4. Bấm **Deploy**.
