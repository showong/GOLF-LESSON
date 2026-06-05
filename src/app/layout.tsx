import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "골프 레슨 튜더 · AI 스윙 코치",
  description:
    "스크린골프 스윙 영상을 업로드하면 전문 AI 코치가 등급과 단계를 매겨 맞춤 레슨을 드립니다.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "골프 튜더",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#13311c",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="min-h-[100dvh]">
        <header className="sticky top-0 z-20 border-b border-fairway-100 bg-white/90 backdrop-blur safe-pt">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-fairway-500 font-bold text-white">
                G
              </div>
              <div>
                <div className="text-base font-bold leading-tight text-fairway-900 sm:text-lg">
                  골프 레슨 튜더
                </div>
                <div className="hidden text-xs text-fairway-700/70 sm:block">
                  AI 스윙 분석 · 등급별 전담 코치
                </div>
              </div>
            </div>
            <div className="hidden text-xs text-fairway-700/70 sm:block">
              by Gemini 3.1 비전
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
          {children}
        </main>
        <footer className="mx-auto max-w-5xl px-4 py-6 text-xs text-fairway-700/60 safe-pb sm:px-6 sm:py-8">
          영상은 분석 직후 서버에서 삭제됩니다. 분석 요약만 저장되어 다음 분석의
          변화 추이에 사용돼요.
        </footer>
      </body>
    </html>
  );
}
