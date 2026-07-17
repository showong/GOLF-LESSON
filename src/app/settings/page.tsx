"use client";

import { useState } from "react";

export default function SettingsPage() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function deleteData() {
    if (!window.confirm("저장된 영상, 분석 기록과 숙제 이력을 모두 삭제할까요? 복구할 수 없습니다.")) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/user", { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "삭제에 실패했습니다.");
      localStorage.removeItem("golf-tutor:nickname");
      setMessage("데이터를 삭제했습니다. 홈에서 새 사용자로 시작할 수 있습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "삭제에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto max-w-2xl rounded-2xl bg-white p-5 shadow-sm sm:p-8">
      <h1 className="text-xl font-bold text-fairway-900">데이터 관리</h1>
      <p className="mt-2 text-sm leading-relaxed text-fairway-700">
        현재 브라우저의 사용자 ID에 연결된 원본 영상, 분석 결과, 등급 이력과 숙제 기록을 삭제합니다.
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={deleteData}
        className="mt-5 rounded-lg bg-red-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy ? "삭제하는 중…" : "내 데이터 모두 삭제"}
      </button>
      {message && <p className="mt-3 text-sm text-fairway-700">{message}</p>}
    </section>
  );
}

