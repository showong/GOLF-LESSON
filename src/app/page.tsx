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
    <div className="space-y-8">
      <section className="rounded-2xl bg-gradient-to-br from-fairway-700 to-fairway-900 p-8 text-white shadow-md">
        <h1 className="text-2xl font-bold sm:text-3xl">
          오늘 친 스윙, 코치가 바로 봐드릴게요.
        </h1>
        <p className="mt-2 text-sm text-fairway-100/80">
          스크린골프장에서 받은 영상을 그대로 올려주세요. 클럽 종류를 알아서
          인식하고 등급(골린이·아마추어·세미프로·프로)과 LV-1~3 단계를 매겨
          드립니다. 이전 영상과 비교해서 어떻게 달라졌는지도 클럽별로 보여드려요.
        </p>
        <div className="mt-5 max-w-sm">
          <label className="block text-xs font-medium text-fairway-100/80">
            닉네임 (메모리/기록 식별용)
          </label>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="예: 9번홀의왕"
            className="mt-1 w-full rounded-lg border border-fairway-600 bg-fairway-900/40 px-3 py-2 text-sm text-white placeholder-fairway-100/40 focus:border-sand-300 focus:outline-none"
          />
        </div>
      </section>

      <VideoUpload
        nickname={nickname}
        onResult={(data) => {
          setResult(data);
          setRefreshKey((k) => k + 1);
        }}
      />

      {result && (
        <AnalysisResult
          data={
            result as Parameters<typeof AnalysisResult>[0]["data"]
          }
        />
      )}

      <ProgressDashboard nickname={nickname} refreshKey={refreshKey} />
    </div>
  );
}
