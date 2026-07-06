"use client";

import { useEffect, useState } from "react";
import VideoUpload from "@/components/VideoUpload";
import AnalysisResult from "@/components/AnalysisResult";
import ProgressDashboard from "@/components/ProgressDashboard";

const NICKNAME_KEY = "golf-tutor:nickname";

export default function HomePage() {
  const [nickname, setNickname] = useState("");
  const [result, setResult] = useState<unknown>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const saved =
      typeof window !== "undefined" ? localStorage.getItem(NICKNAME_KEY) : null;
    if (saved) setNickname(saved);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (nickname) localStorage.setItem(NICKNAME_KEY, nickname);
  }, [nickname]);

  return (
    <div className="space-y-6 sm:space-y-8">
      <section className="rounded-2xl bg-gradient-to-br from-fairway-700 to-fairway-900 p-5 text-white shadow-md sm:p-8">
        <h1 className="text-xl font-bold leading-tight sm:text-3xl">
          오늘 친 스윙, 코치가 바로 봐드릴게요.
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-fairway-100/85">
          스크린골프장 영상을 올리거나 폰으로 촬영하면 AI 코치가 클럽 종류·등급(골린이~프로)·
          LV-1~3을 매겨드려요. 측면샷과 정면샷 둘 다 올리면 더 정확합니다.
        </p>
        <div className="mt-5 max-w-md">
          <label className="block text-xs font-medium text-fairway-100/80">
            닉네임 (메모리/기록 식별용)
          </label>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="예: 9번홀의왕"
            inputMode="text"
            autoComplete="nickname"
            className="mt-1.5 block w-full rounded-lg border border-fairway-600 bg-fairway-900/40 px-3 py-3 text-base text-white placeholder-fairway-100/40 focus:border-sand-300 focus:outline-none"
          />
        </div>
      </section>

      <VideoUpload
        nickname={nickname}
        onResult={(data) => {
          setResult(data);
          setRefreshKey((k) => k + 1);
          // 결과 화면으로 자동 스크롤 (특히 모바일에서 유용)
          requestAnimationFrame(() => {
            document
              .getElementById("analysis-result")
              ?.scrollIntoView({ behavior: "smooth", block: "start" });
          });
        }}
      />

      {result != null && (
        <div id="analysis-result">
          <AnalysisResult
            data={result as Parameters<typeof AnalysisResult>[0]["data"]}
          />
        </div>
      )}

      <ProgressDashboard nickname={nickname} refreshKey={refreshKey} />
    </div>
  );
}
