"use client";

import { useRef, useState } from "react";

interface Props {
  nickname: string;
  onResult: (data: unknown) => void;
}

export default function VideoUpload({ nickname, onResult }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!nickname.trim()) {
      setError("먼저 닉네임을 입력해 주세요.");
      return;
    }
    if (!file) {
      setError("스윙 영상을 선택해 주세요.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("nickname", nickname.trim());
      fd.append("video", file);
      const res = await fetch("/api/analyze", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "분석 실패");
      onResult(data);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-fairway-100 bg-white p-6 shadow-sm">
      <h2 className="text-base font-semibold text-fairway-900">
        스윙 영상 업로드
      </h2>
      <p className="mt-1 text-sm text-fairway-700/80">
        스크린골프장에서 받은 mp4/mov 영상을 그대로 올려주세요. 코치가 클럽
        종류(드라이버·아이언·어프로치)도 자동으로 알아봐요.
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          ref={inputRef}
          type="file"
          accept="video/mp4,video/quicktime,video/x-m4v,video/webm"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-fairway-500 file:px-4 file:py-2 file:text-white hover:file:bg-fairway-600"
        />
        <button
          onClick={submit}
          disabled={busy}
          className="rounded-lg bg-fairway-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "코치가 영상을 보는 중…" : "AI 코치에게 보내기"}
        </button>
      </div>
      {file && (
        <div className="mt-3 text-xs text-fairway-700/80">
          선택됨: {file.name} ({Math.round(file.size / 1024 / 1024)} MB)
        </div>
      )}
      {error && (
        <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {busy && (
        <div className="mt-3 text-xs text-fairway-700/70">
          영상 업로드 후 Gemini 3.1이 프레임을 분석하고 있어요. 30초~1분 정도
          걸릴 수 있어요.
        </div>
      )}
    </section>
  );
}
