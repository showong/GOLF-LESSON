import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "골프 레슨 튜더 · AI 스윙 코치",
  description:
    "스크린골프 스윙 영상을 업로드하면 전문 AI 코치가 등급과 단계를 매겨 맞춤 레슨을 드립니다.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="min-h-screen">
        <header className="border-b border-fairway-100 bg-white/80 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-fairway-500 text-white font-bold flex items-center justify-center">
                G
              </div>
              <div>
                <div className="text-lg font-bold text-fairway-900">
                  골프 레슨 튜더
                </div>
                <div className="text-xs text-fairway-700/70">
                  AI 스윙 분석 · 등급별 전담 코치
                </div>
              </div>
            </div>
            <div className="text-xs text-fairway-700/70">
              by Gemini 3.1 비전
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
        <footer className="mx-auto max-w-5xl px-6 py-8 text-xs text-fairway-700/60">
          영상은 분석 직후 서버에서 삭제됩니다. 분석 요약만 저장되어 다음 분석의
          변화 추이에 사용돼요.
        </footer>
      </body>
    </html>
  );
}
