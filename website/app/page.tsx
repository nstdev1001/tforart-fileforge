import type { Metadata } from "next";
import NavbarHome from "./_components/NavbarHome";
import HeroSection from "./_components/HeroSection";
import FeaturesSection from "./_components/FeaturesSection";
import ShowcaseSection from "./_components/ShowcaseSection";
import HowItWorksSection from "./_components/HowItWorksSection";
import FaqSection from "./_components/FaqSection";
import FinalCtaSection from "./_components/FinalCtaSection";
import FooterHome from "./_components/FooterHome";

export const metadata: Metadata = {
  title: "Tforart FileForge — Nén 7-Zip & Upload Google Drive Tự Động Cho Windows",
  description:
    "Ứng dụng desktop Windows siêu nhẹ bằng Tauri v2 & Rust: Nén 7-Zip đa luồng, tự động hóa upload Google Drive chuẩn Resumable, phục hồi khi rớt mạng, bảo mật Windows Credential Manager.",
};

export default function Home() {
  return (
    <div className="main-background min-h-screen text-gray-900 selection:bg-black selection:text-white">
      {/* Sticky Navigation Bar */}
      <NavbarHome />

      <main className="relative">
        {/* Hero Section with Live Dashboard Screenshot & Stats */}
        <HeroSection />

        {/* Features Section */}
        <FeaturesSection />

        {/* Interactive App Screenshots Showcase */}
        <ShowcaseSection />

        {/* 3-Step Workflow */}
        <HowItWorksSection />

        {/* FAQ Section */}
        <FaqSection />

        {/* Download & Final CTA */}
        <FinalCtaSection />
      </main>

      {/* Synchronized Footer */}
      <FooterHome />
    </div>
  );
}
