"use client";

import { useEffect, useRef, useState } from "react";
import { extractPoseTrack } from "@/lib/pose-client";
import type { PoseTrack } from "@/lib/pose";

interface Props {
  nickname: string;
  onResult: (data: unknown) => void;
}

type ClubHint = "" | "driver" | "iron" | "approach";
type PoseStatus = "idle" | "extracting" | "ready" | "unavailable";

export default function VideoUpload({ nickname, onResult }: Props) {
  const sideRef = useRef<HTMLInputElement>(null);
  const frontRef = useRef<HTMLInputElement>(null);
  const [sideFile, setSideFile] = useState<File | null>(null);
  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [clubHint, setClubHint] = useState<ClubHint>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 브라우저 스켈레톤(관절) 추출 — 파일 선택 즉시 백그라운드로 진행.
  // 실패해도 분석은 서버 폴백으로 정상 동작하므로 제출을 막지 않는다.
  const poseRef = useRef<{ side: PoseTrack | null; front: PoseTrack | null }>({
    side: null,
    front: null,
  });
  const [poseStatus, setPoseStatus] = useState<{
    side: PoseStatus;
    front: PoseStatus;
  }>({ side: "idle", front: "idle" });

  function startPoseExtraction(view: "side" | "front", file: File | null) {
    poseRef.current[view] = null;
    if (!file) {
      setPoseStatus((s) => ({ ...s, [view]: "idle" }));
      return;
    }
    setPoseStatus((s) => ({ ...s, [view]: "extracting" }));
    extractPoseTrack(file, view)
      .then((track) => {
        // 추출 도중 파일이 바뀌었으면 무시
        poseRef.current[view] = track;
        setPoseStatus((s) => ({ ...s, [view]: track ? "ready" : "unavailable" }));
      })
      .catch(() => {
        setPoseStatus((s) => ({ ...s, [view]: "unavailable" }));
      });
  }

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
      // 브라우저에서 추출된 관절 좌표(있을 때만) — 서버 위상 감지·정량 지표에 사용
      if (sideFile && poseRef.current.side) {
        fd.append("poseSide", JSON.stringify(poseRef.current.side));
      }
      if (frontFile && poseRef.current.front) {
        fd.append("poseFront", JSON.stringify(poseRef.current.front));
      }
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
  const hasFile = sideFile !== null || frontFile !== null;

  return (
    <section className="rounded-2xl border border-fairway-100 bg-white p-4 shadow-sm sm:p-6">
      <h2 className="text-base font-semibold text-fairway-900">
        스윙 영상 업로드
      </h2>
      <p className="mt-1 text-sm text-fairway-700/80">
        측면샷과 정면샷을 함께 올리면 더 정확해요. 한 시점만 올려도 분석 가능합니다.
        스마트폰에서는 <strong>카메라로 즉석 촬영</strong>도 됩니다.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <FileSlot
          inputRef={sideRef}
          file={sideFile}
          onChange={(f) => {
            setSideFile(f);
            startPoseExtraction("side", f);
          }}
          title="측면샷"
          recommended
          hint="플레인·자세각·임팩트 분석에 가장 유리"
          view="side"
        />
        <FileSlot
          inputRef={frontRef}
          file={frontFile}
          onChange={(f) => {
            setFrontFile(f);
            startPoseExtraction("front", f);
          }}
          title="정면샷"
          recommended={false}
          hint="정렬·머리 움직임·스웨이 분석에 유리"
          view="front"
        />
      </div>

      <div className="mt-5">
        <label className="block text-sm font-medium text-fairway-900">
          클럽 종류
        </label>
        <p className="text-xs text-fairway-700/60">
          자동 인식이 어려울 때 직접 지정
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
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
              className={`min-h-[44px] rounded-lg border px-3 py-2.5 text-sm font-medium transition ${
                clubHint === opt.value
                  ? "border-fairway-700 bg-fairway-700 text-white"
                  : "border-fairway-100 bg-white text-fairway-900 active:bg-fairway-50"
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
        className="mt-5 min-h-[52px] w-full rounded-xl bg-fairway-700 px-4 py-3 text-base font-semibold text-white shadow-sm transition active:bg-fairway-900 disabled:opacity-50"
      >
        {busy
          ? "코치가 영상을 보는 중…"
          : hasFile
            ? `AI 코치에게 보내기 (${[sideFile && "측면", frontFile && "정면"]
                .filter(Boolean)
                .join("+")})`
            : "AI 코치에게 보내기"}
      </button>

      {hasFile && (
        <div className="mt-3 flex flex-col gap-1 text-xs text-fairway-700/80">
          {sideFile && (
            <span>
              · 측면샷: {sideFile.name} ({sizeMB(sideFile)}MB){" "}
              <PoseBadge status={poseStatus.side} />
            </span>
          )}
          {frontFile && (
            <span>
              · 정면샷: {frontFile.name} ({sizeMB(frontFile)}MB){" "}
              <PoseBadge status={poseStatus.front} />
            </span>
          )}
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {busy && (
        <div className="mt-3 text-xs leading-relaxed text-fairway-700/70">
          각 영상별 키 프레임 추출 → Gemini 업로드 → 헤드코치 판정 → 전담 코치
          분석 → 헤드코치 리뷰. 영상 2개일 경우 1분 정도 걸려요.
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
  view,
}: {
  inputRef: React.RefObject<HTMLInputElement>;
  file: File | null;
  onChange: (f: File | null) => void;
  title: string;
  recommended: boolean;
  hint: string;
  view: "side" | "front";
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [videoInfo, setVideoInfo] = useState<{
    width: number;
    height: number;
    duration: number;
  } | null>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      setVideoInfo(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function pickFromGallery() {
    inputRef.current?.click();
  }
  function recordWithCamera(input: HTMLInputElement) {
    input.click();
  }

  return (
    <div
      className={`rounded-xl border-2 border-dashed p-3 transition ${
        file
          ? "border-fairway-500 bg-fairway-50"
          : "border-fairway-100 bg-white"
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
            onClick={() => {
              onChange(null);
              if (inputRef.current) inputRef.current.value = "";
            }}
            className="rounded px-2 py-1 text-[11px] text-fairway-700/70 underline"
          >
            제거
          </button>
        )}
      </div>
      <p className="mt-0.5 text-[11px] text-fairway-700/70">{hint}</p>

      <div className="relative mt-3 aspect-video overflow-hidden rounded-lg bg-slate-900">
        {previewUrl ? (
          <video
            src={previewUrl}
            className="h-full w-full object-contain"
            muted
            playsInline
            controls
            onLoadedMetadata={(e) => {
              const el = e.currentTarget;
              setVideoInfo({
                width: el.videoWidth,
                height: el.videoHeight,
                duration: el.duration,
              });
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center px-8 text-center text-[11px] leading-relaxed text-white/70">
            {view === "side"
              ? "카메라는 손 높이 · 타깃 라인과 평행 · 전신과 클럽 헤드가 모두 보이게"
              : "카메라는 가슴 높이 · 몸 정면 · 양발과 클럽 전체가 모두 보이게"}
          </div>
        )}
        <div className="pointer-events-none absolute inset-[8%] rounded-lg border border-dashed border-emerald-300/80" />
        <div className="pointer-events-none absolute bottom-[10%] left-[12%] right-[12%] border-t border-emerald-300/70" />
        <div className="pointer-events-none absolute bottom-[10%] left-1/2 top-[8%] border-l border-emerald-300/50" />
        <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[9px] text-white">
          머리·발·클럽이 점선 안쪽
        </span>
      </div>

      {videoInfo && (
        <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
          <span className={`rounded px-1.5 py-0.5 ${Math.min(videoInfo.width, videoInfo.height) >= 720 ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>
            {videoInfo.width}×{videoInfo.height}
          </span>
          <span className={`rounded px-1.5 py-0.5 ${videoInfo.duration >= 1 && videoInfo.duration <= 30 ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>
            {videoInfo.duration.toFixed(1)}초
          </span>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">
            서버에서 fps·전신·클럽 노출 추가 검사
          </span>
        </div>
      )}

      {/* 갤러리 선택 (기본) */}
      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/x-m4v,video/webm,video/*"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        className="hidden"
      />
      {/* 카메라 직접 촬영 (모바일에서만 유의미) */}
      <input
        id={`${title}-capture`}
        type="file"
        accept="video/*"
        capture="environment"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        className="hidden"
      />

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={pickFromGallery}
          className="min-h-[44px] rounded-lg border border-fairway-500 bg-white px-3 py-2 text-xs font-semibold text-fairway-900 active:bg-fairway-50"
        >
          📁 갤러리
        </button>
        <button
          type="button"
          onClick={() => {
            const el = document.getElementById(
              `${title}-capture`,
            ) as HTMLInputElement | null;
            if (el) recordWithCamera(el);
          }}
          className="min-h-[44px] rounded-lg bg-fairway-500 px-3 py-2 text-xs font-semibold text-white active:bg-fairway-600"
        >
          📷 촬영
        </button>
      </div>
    </div>
  );
}

function PoseBadge({ status }: { status: PoseStatus }) {
  if (status === "idle") return null;
  const map: Record<Exclude<PoseStatus, "idle">, { label: string; cls: string }> = {
    extracting: { label: "동작 분석 중…", cls: "bg-sky-100 text-sky-800" },
    ready: { label: "스켈레톤 분석 준비됨 ✓", cls: "bg-emerald-100 text-emerald-800" },
    unavailable: {
      label: "스켈레톤 미지원 (서버 분석으로 진행)",
      cls: "bg-slate-100 text-slate-600",
    },
  };
  const m = map[status as Exclude<PoseStatus, "idle">];
  return (
    <span className={`ml-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${m.cls}`}>
      {m.label}
    </span>
  );
}
