"use client";

import { useRef, useState } from "react";

interface Props {
  nickname: string;
  onResult: (data: unknown) => void;
}

type ClubHint = "" | "driver" | "iron" | "approach";

export default function VideoUpload({ nickname, onResult }: Props) {
  const sideRef = useRef<HTMLInputElement>(null);
  const frontRef = useRef<HTMLInputElement>(null);
  const [sideFile, setSideFile] = useState<File | null>(null);
  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [clubHint, setClubHint] = useState<ClubHint>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!nickname.trim()) {
      setError("먼저 닉네임을 입력해 주세요.");
      return;
    }
    if (!sideFile && !frontFile) {
      setError("측면샷 또는 정면샷 중 최소 1개는 업로드해 주세요.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("nickname", nickname.trim());
      if (sideFile) fd.append("videoSide", sideFile);
      if (frontFile) fd.append("videoFront", frontFile);
      if (clubHint) fd.append("clubHint", clubHint);
      const res = await fetch("/api/analyze", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "분석 실패");
      onResult(data);
      setSideFile(null);
      setFrontFile(null);
      if (sideRef.current) sideRef.current.value = "";
      if (frontRef.current) frontRef.current.value = "";
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류");
    } finally {
      setBusy(false);
    }
  }

  const sizeMB = (f: File) => Math.round((f.size / 1024 / 1024) * 10) / 10;

  return (
    <section className="rounded-2xl border border-fairway-100 bg-white p-6 shadow-sm">
      <h2 className="text-base font-semibold text-fairway-900">
        스윙 영상 업로드
      </h2>
      <p className="mt-1 text-sm text-fairway-700/80">
        측면샷과 정면샷을 함께 올리면 시점별 강점을 활용한 더 정확한 분석이
        가능해요. 한 시점만 올려도 분석은 진행됩니다.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <FileSlot
          inputRef={sideRef}
          file={sideFile}
          onChange={setSideFile}
          title="측면샷"
          recommended
          hint="스윙 플레인·자세각·임팩트·피니시 분석에 가장 유리"
        />
        <FileSlot
          inputRef={frontRef}
          file={frontFile}
          onChange={setFrontFile}
          title="정면샷"
          recommended={false}
          hint="정렬·머리 움직임·스웨이·체중 이동 분석에 유리"
        />
      </div>

      <div className="mt-4">
        <label className="block text-xs font-medium text-fairway-700">
          클럽 종류
          <span className="ml-1 text-fairway-700/60">
            (자동 인식이 어려울 때 직접 지정)
          </span>
        </label>
        <div className="mt-1 grid grid-cols-4 gap-2">
          {(
            [
              { value: "", label: "자동 인식" },
              { value: "driver", label: "드라이버" },
              { value: "iron", label: "아이언" },
              { value: "approach", label: "어프로치" },
            ] as { value: ClubHint; label: string }[]
          ).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setClubHint(opt.value)}
              className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
                clubHint === opt.value
                  ? "border-fairway-700 bg-fairway-700 text-white"
                  : "border-fairway-100 bg-white text-fairway-900 hover:border-fairway-500"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={submit}
        disabled={busy}
        className="mt-4 w-full rounded-lg bg-fairway-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 sm:w-auto"
      >
        {busy
          ? "코치가 영상을 보는 중…"
          : `AI 코치에게 보내기 (${[sideFile && "측면", frontFile && "정면"]
              .filter(Boolean)
              .join("+") || "영상 미선택"})`}
      </button>

      <div className="mt-3 flex flex-wrap gap-3 text-xs text-fairway-700/80">
        {sideFile && (
          <span>측면샷: {sideFile.name} ({sizeMB(sideFile)}MB)</span>
        )}
        {frontFile && (
          <span>정면샷: {frontFile.name} ({sizeMB(frontFile)}MB)</span>
        )}
      </div>

      {error && (
        <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {busy && (
        <div className="mt-3 text-xs text-fairway-700/70">
          각 영상별로 키 프레임 추출 → Gemini 업로드 → 헤드코치 판정 → 전담 코치
          분석 → 헤드코치 리뷰 순으로 진행돼요. 영상 2개일 경우 1분 정도 걸릴 수
          있어요.
        </div>
      )}
    </section>
  );
}

function FileSlot({
  inputRef,
  file,
  onChange,
  title,
  recommended,
  hint,
}: {
  inputRef: React.RefObject<HTMLInputElement>;
  file: File | null;
  onChange: (f: File | null) => void;
  title: string;
  recommended: boolean;
  hint: string;
}) {
  return (
    <label
      className={`block cursor-pointer rounded-xl border-2 border-dashed p-3 transition ${
        file
          ? "border-fairway-500 bg-fairway-50"
          : "border-fairway-100 bg-white hover:border-fairway-500"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-fairway-900">
          {title}
          {recommended && (
            <span className="ml-1.5 rounded bg-fairway-700 px-1.5 py-0.5 text-[10px] font-bold text-white">
              권장
            </span>
          )}
        </span>
        {file && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              onChange(null);
              if (inputRef.current) inputRef.current.value = "";
            }}
            className="text-[11px] text-fairway-700/70 underline"
          >
            제거
          </button>
        )}
      </div>
      <p className="mt-0.5 text-[11px] text-fairway-700/70">{hint}</p>
      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/x-m4v,video/webm"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        className="mt-2 block w-full text-xs file:mr-2 file:rounded-md file:border-0 file:bg-fairway-500 file:px-3 file:py-1.5 file:text-white hover:file:bg-fairway-600"
      />
    </label>
  );
}
