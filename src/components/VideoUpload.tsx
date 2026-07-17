"use client";

import { useEffect, useRef, useState } from "react";
import ViewGuideIllustration from "@/components/ViewGuide";
import type { SkeletonSource } from "@/components/SkeletonPhaseStrip";
import type { PoseTrack } from "@/lib/pose";
import type { PoseExtractionResult } from "@/lib/pose-client";

interface Props {
  nickname: string;
  pilotAccessCode: string;
  onResult: (data: unknown, skeletonSources: SkeletonSource[]) => void;
}

type ClubHint = "" | "driver" | "iron" | "approach";
type PoseStatus = "idle" | "extracting" | "ready" | "failed";
type PoseState = { status: PoseStatus; result?: PoseExtractionResult };
type UploadTab = "single" | "multi";
type MultiSwing = { side: File | null; front: File | null };

const emptyMultiSwings = (): MultiSwing[] =>
  Array.from({ length: 3 }, () => ({ side: null, front: null }));

export default function VideoUpload({ nickname, pilotAccessCode, onResult }: Props) {
  const sideRef = useRef<HTMLInputElement>(null);
  const frontRef = useRef<HTMLInputElement>(null);
  const [sideFile, setSideFile] = useState<File | null>(null);
  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [clubHint, setClubHint] = useState<ClubHint>("");
  const [busy, setBusy] = useState(false);
  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<UploadTab>("single");
  const [multiSwings, setMultiSwings] = useState<MultiSwing[]>(emptyMultiSwings);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [age18Confirmed, setAge18Confirmed] = useState(false);
  const [videoRightsConfirmed, setVideoRightsConfirmed] = useState(false);
  const [modelImprovementConsent, setModelImprovementConsent] = useState(false);

  // 브라우저 스켈레톤(관절) 추출 — 파일 선택 즉시 백그라운드로 진행.
  // 실패해도 분석은 서버 폴백으로 정상 동작하므로 제출을 막지 않는다.
  const poseRef = useRef<{ side: PoseTrack | null; front: PoseTrack | null }>({
    side: null,
    front: null,
  });
  const poseTaskRef = useRef<{
    side: Promise<PoseExtractionResult> | null;
    front: Promise<PoseExtractionResult> | null;
  }>({ side: null, front: null });
  const [poseState, setPoseState] = useState<{ side: PoseState; front: PoseState }>({
    side: { status: "idle" },
    front: { status: "idle" },
  });

  function startPoseExtraction(view: "side" | "front", file: File | null) {
    poseRef.current[view] = null;
    if (!file) {
      poseTaskRef.current[view] = null;
      setPoseState((state) => ({ ...state, [view]: { status: "idle" } }));
      return;
    }
    setPoseState((state) => ({ ...state, [view]: { status: "extracting" } }));
    // 초기 화면(SVG 가이드)은 MediaPipe 번들과 분리해 항상 렌더링한다.
    // 실제 영상이 선택된 시점에만 무거운 스켈레톤 모듈을 지연 로드한다.
    const task = import("@/lib/pose-client")
      .then(({ extractPoseTrackDetailed }) => extractPoseTrackDetailed(file, view))
      .catch(
        (): PoseExtractionResult => ({
          track: null,
          attemptedFrames: 0,
          detectedFrames: 0,
          delegate: null,
          failure: {
            code: "model-load",
            message: "관절 분석 모듈을 불러오지 못했어요.",
            retryable: true,
          },
        }),
      );
    poseTaskRef.current[view] = task;
    task
      .then((result) => {
        // 추출 도중 파일이 바뀌었으면 이전 작업 결과를 무시한다.
        if (poseTaskRef.current[view] !== task) return;
        poseRef.current[view] = result.track;
        setPoseState((state) => ({
          ...state,
          [view]: { status: result.track ? "ready" : "failed", result },
        }));
      })
      .catch(() => {});
  }

  async function submit() {
    const selectedMultiSwings = multiSwings
      .map((swing, index) => ({ ...swing, index }))
      .filter((swing) => swing.side || swing.front);
    if (!nickname.trim()) {
      setError("먼저 닉네임을 입력해 주세요.");
      return;
    }
    if (!termsAccepted || !privacyAccepted || !age18Confirmed || !videoRightsConfirmed) {
      setError("필수 이용 동의와 영상 권리 확인을 완료해 주세요.");
      return;
    }
    if (tab === "single" && !sideFile && !frontFile) {
      setError("측면샷 또는 정면샷 중 최소 1개는 업로드해 주세요.");
      return;
    }
    if (tab === "multi") {
      if (selectedMultiSwings.length < 2 || selectedMultiSwings.length > 3) {
        setError("멀티샷 분석은 같은 클럽 스윙 2~3개가 필요해요.");
        return;
      }
      if (!clubHint) {
        setError("멀티샷 분석은 어떤 클럽으로 쳤는지 꼭 선택해 주세요.");
        return;
      }
    }
    const selectedFiles: { file: File; view: "side" | "front"; swingIndex: number }[] =
      tab === "multi"
        ? selectedMultiSwings.flatMap((swing) => [
            ...(swing.side ? [{ file: swing.side, view: "side" as const, swingIndex: swing.index }] : []),
            ...(swing.front ? [{ file: swing.front, view: "front" as const, swingIndex: swing.index }] : []),
          ])
        : [
            ...(sideFile ? [{ file: sideFile, view: "side" as const, swingIndex: 0 }] : []),
            ...(frontFile ? [{ file: frontFile, view: "front" as const, swingIndex: 0 }] : []),
          ];
    const maxFileBytes = 80 * 1024 * 1024;
    const maxTotalBytes = 240 * 1024 * 1024;
    if (selectedFiles.some(({ file }) => file.size > maxFileBytes)) {
      setError("영상 한 개는 최대 80MB까지 업로드할 수 있어요.");
      return;
    }
    if (selectedFiles.reduce((sum, { file }) => sum + file.size, 0) > maxTotalBytes) {
      setError("전체 영상 용량은 최대 240MB까지 업로드할 수 있어요.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      if (tab === "single") {
        await Promise.all(
          [poseTaskRef.current.side, poseTaskRef.current.front].filter(
            (task): task is Promise<PoseExtractionResult> => task !== null,
          ),
        );
      }
      setBusyMessage("사용자 세션을 확인하고 있어요…");
      const userResponse = await fetch("/api/user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname: nickname.trim(),
          pilotAccessCode,
          termsAccepted,
          privacyAccepted,
          serviceAnalysisAccepted: true,
          age18Confirmed,
          videoRightsConfirmed,
          modelImprovementConsent,
        }),
      });
      const userData = await userResponse.json();
      if (!userResponse.ok) {
        throw new Error(userData?.error ?? "사용자 세션을 만들지 못했습니다.");
      }

      setBusyMessage("안전한 영상 업로드를 준비하고 있어요…");
      const presignResponse = await fetch("/api/uploads/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: selectedFiles.map(({ file, view, swingIndex }) => ({
            name: file.name,
            type: file.type,
            size: file.size,
            view,
            swingIndex,
          })),
        }),
      });
      const presign = await presignResponse.json();
      if (!presignResponse.ok) throw new Error(presign?.error ?? "업로드 준비 실패");
      if (!Array.isArray(presign.uploads) || presign.uploads.length !== selectedFiles.length) {
        throw new Error("업로드 예약 정보가 올바르지 않습니다.");
      }

      // 모바일 네트워크와 서버 부하를 고려해 한 번에 하나씩 직접 업로드한다.
      for (let index = 0; index < selectedFiles.length; index++) {
        setBusyMessage(`영상을 업로드하고 있어요… (${index + 1}/${selectedFiles.length})`);
        const target = presign.uploads[index] as {
          url: string;
          method: string;
          headers?: Record<string, string>;
        };
        const uploadResponse = await fetch(target.url, {
          method: target.method || "PUT",
          headers: target.headers,
          body: selectedFiles[index].file,
        });
        if (!uploadResponse.ok) throw new Error(`영상 ${index + 1} 업로드에 실패했습니다.`);
      }

      setBusyMessage("분석 대기열에 등록하고 있어요…");
      const jobResponse = await fetch("/api/analyze/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: tab,
          clubHint: clubHint || undefined,
          videoIds: presign.uploads.map((upload: { videoId: string }) => upload.videoId),
          idempotencyKey: crypto.randomUUID(),
          poseSide: tab === "single" ? poseRef.current.side : undefined,
          poseFront: tab === "single" ? poseRef.current.front : undefined,
        }),
      });
      const jobData = await jobResponse.json();
      if (!jobResponse.ok) throw new Error(jobData?.error ?? "분석 작업 등록 실패");

      const deadline = Date.now() + 15 * 60 * 1000;
      let data: unknown = null;
      while (Date.now() < deadline) {
        setBusyMessage("코치가 영상을 분석하고 있어요… 페이지를 닫아도 작업은 계속돼요.");
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const statusResponse = await fetch(`/api/analyze/jobs/${jobData.jobId}`, {
          cache: "no-store",
        });
        const statusData = await statusResponse.json();
        if (!statusResponse.ok) throw new Error(statusData?.error ?? "분석 상태 확인 실패");
        if (statusData.status === "completed") {
          data = statusData.result;
          break;
        }
        if (statusData.status === "failed") {
          throw new Error(statusData.error ?? "분석을 완료하지 못했습니다.");
        }
      }
      if (!data) throw new Error("분석 시간이 초과됐어요. 기록 화면에서 잠시 후 다시 확인해 주세요.");
      const skeletonSources: SkeletonSource[] = [];
      if (tab === "single") {
        if (sideFile && poseRef.current.side) {
          skeletonSources.push({ view: "side", file: sideFile, track: poseRef.current.side });
        }
        if (frontFile && poseRef.current.front) {
          skeletonSources.push({ view: "front", file: frontFile, track: poseRef.current.front });
        }
      }
      onResult(data, skeletonSources);
      setSideFile(null);
      setFrontFile(null);
      setMultiSwings(emptyMultiSwings());
      if (sideRef.current) sideRef.current.value = "";
      if (frontRef.current) frontRef.current.value = "";
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류");
    } finally {
      setBusy(false);
      setBusyMessage(null);
    }
  }

  const sizeMB = (f: File) => Math.round((f.size / 1024 / 1024) * 10) / 10;
  const hasFile = sideFile !== null || frontFile !== null;
  const selectedMultiCount = multiSwings.filter((s) => s.side || s.front).length;
  const selectedSideCount = multiSwings.filter((s) => s.side).length;
  const selectedFrontCount = multiSwings.filter((s) => s.front).length;

  function updateMultiFile(index: number, view: "side" | "front", file: File | null) {
    setMultiSwings((current) =>
      current.map((swing, i) => (i === index ? { ...swing, [view]: file } : swing)),
    );
  }

  return (
    <section className="rounded-2xl border border-fairway-100 bg-white p-4 shadow-sm sm:p-6">
      <h2 className="text-base font-semibold text-fairway-900">
        스윙 영상 업로드
      </h2>

      {/* 분석 모드 탭 */}
      <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-fairway-50 p-1">
        {(
          [
            { value: "single", label: "정밀 분석", sub: "측면+정면 1스윙" },
            { value: "multi", label: "멀티샷", sub: "정면·측면 최대 3스윙" },
          ] as { value: UploadTab; label: string; sub: string }[]
        ).map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => {
              setTab(t.value);
              setError(null);
            }}
            className={`min-h-[48px] rounded-lg px-3 py-2 text-center transition ${
              tab === t.value
                ? "bg-white font-semibold text-fairway-900 shadow-sm"
                : "text-fairway-700/70"
            }`}
          >
            <span className="block text-sm">{t.label}</span>
            <span className="block text-[10px] opacity-70">{t.sub}</span>
          </button>
        ))}
      </div>

      <p className="mt-2 text-sm text-fairway-700/80">
        {tab === "single" ? (
          <>측면샷과 정면샷을 함께 올리면 더 정확해요. 한 시점만 올려도 분석 가능합니다.
        스마트폰에서는 <strong>카메라로 즉석 촬영</strong>도 됩니다.</>
        ) : (
          <>같은 클럽으로 친 스윙 <strong>2~3개</strong>를 등록하고, 각 스윙마다
        측면·정면 영상을 함께 올릴 수 있어요. 반복되는 <strong>공통 문제</strong>와
        빈도는 낮지만 결과에 큰 영향을 주는 <strong>크리티컬 문제</strong>를 분리해 진단합니다.</>
        )}
      </p>

      {tab === "multi" && (
        <div className="mt-4 rounded-xl border-2 border-dashed border-fairway-100 p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-fairway-900">
              스윙별 영상 등록
              <span className="ml-1.5 rounded bg-fairway-700 px-1.5 py-0.5 text-[10px] font-bold text-white">
                최대 3스윙
              </span>
            </span>
            {selectedMultiCount > 0 && (
              <button
                type="button"
                onClick={() => setMultiSwings(emptyMultiSwings())}
                className="rounded px-2 py-1 text-[11px] text-fairway-700/70 underline"
              >
                전체 제거
              </button>
            )}
          </div>
          <p className="mt-0.5 text-[11px] text-fairway-700/70">
            같은 번호의 측면·정면은 동일한 스윙이어야 해요. 한 시점만 있어도 등록할 수 있습니다.
          </p>
          <div className="mt-3 space-y-2">
            {multiSwings.map((swing, index) => (
              <div key={index} className="rounded-lg border border-fairway-100 bg-fairway-50/50 p-2.5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-bold text-fairway-900">스윙 {index + 1}</span>
                  {(swing.side || swing.front) && (
                    <button
                      type="button"
                      onClick={() => {
                        updateMultiFile(index, "side", null);
                        updateMultiFile(index, "front", null);
                      }}
                      className="text-[10px] text-fairway-700/60 underline"
                    >
                      비우기
                    </button>
                  )}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(["side", "front"] as const).map((view) => (
                    <label key={view} className="block rounded-md border border-fairway-100 bg-white p-2">
                      <span className="block text-[11px] font-semibold text-fairway-900">
                        {view === "side" ? "측면 영상" : "정면 영상"}
                      </span>
                      <input
                        key={`${view}-${swing[view]?.name ?? "empty"}-${swing[view]?.lastModified ?? 0}`}
                        type="file"
                        accept="video/mp4,video/quicktime,video/x-m4v,video/webm,video/*"
                        onChange={(e) => updateMultiFile(index, view, e.target.files?.[0] ?? null)}
                        className="mt-1 block w-full text-[10px] file:mr-1.5 file:rounded file:border-0 file:bg-fairway-500 file:px-2 file:py-1 file:text-white"
                      />
                      {swing[view] && (
                        <span className="mt-1 block truncate text-[10px] text-fairway-700/70">
                          {swing[view]!.name} · {sizeMB(swing[view]!)}MB
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-fairway-700/70">
            현재 스윙 {selectedMultiCount}/3 · 측면 {selectedSideCount} · 정면 {selectedFrontCount}
          </p>
          {selectedMultiCount === 1 && (
            <p className="mt-1.5 text-[11px] text-amber-700">
              1개로는 공통 문제의 빈도를 판단할 수 없어요. 스윙을 하나 더 등록해 주세요.
            </p>
          )}
        </div>
      )}

      <div className={tab === "single" ? "mt-4 grid gap-3 sm:grid-cols-2" : "hidden"}>
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
          {tab === "multi" && (
            <span className="ml-1.5 rounded bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
              필수
            </span>
          )}
        </label>
        <p className="text-xs text-fairway-700/60">
          {tab === "multi"
            ? "멀티샷은 같은 클럽 영상끼리 비교합니다. 어떤 클럽으로 쳤는지 선택하세요."
            : "자동 인식이 어려울 때 직접 지정"}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(
            [
              { value: "", label: "자동 인식" },
              { value: "driver", label: "드라이버" },
              { value: "iron", label: "아이언" },
              { value: "approach", label: "어프로치" },
            ] as { value: ClubHint; label: string }[]
          )
            .filter((opt) => tab === "single" || opt.value !== "")
            .map((opt) => (
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

      <fieldset className="mt-5 space-y-2 rounded-xl border border-fairway-100 bg-fairway-50/60 p-3">
        <legend className="px-1 text-xs font-semibold text-fairway-900">이용 및 데이터 처리 동의</legend>
        <ConsentCheckbox checked={termsAccepted} onChange={setTermsAccepted}>
          <a href="/terms" target="_blank" className="font-semibold underline">이용약관</a>에 동의합니다. (필수)
        </ConsentCheckbox>
        <ConsentCheckbox checked={privacyAccepted} onChange={setPrivacyAccepted}>
          <a href="/privacy" target="_blank" className="font-semibold underline">개인정보처리방침</a>과 영상·관절 데이터의 AI 분석에 동의합니다. (필수)
        </ConsentCheckbox>
        <ConsentCheckbox checked={age18Confirmed} onChange={setAge18Confirmed}>
          만 18세 이상입니다. (필수)
        </ConsentCheckbox>
        <ConsentCheckbox checked={videoRightsConfirmed} onChange={setVideoRightsConfirmed}>
          본인이 촬영했거나 업로드 권한이 있는 영상이며 제3자의 권리를 침해하지 않습니다. (필수)
        </ConsentCheckbox>
        <ConsentCheckbox checked={modelImprovementConsent} onChange={setModelImprovementConsent}>
          판독 정확도 개선을 위한 데이터 활용에 동의합니다. 동의하지 않아도 분석할 수 있습니다. (선택)
        </ConsentCheckbox>
      </fieldset>

      <button
        onClick={submit}
        disabled={busy}
        className="mt-5 min-h-[52px] w-full rounded-xl bg-fairway-700 px-4 py-3 text-base font-semibold text-white shadow-sm transition active:bg-fairway-900 disabled:opacity-50"
      >
        {busy
          ? "코치가 영상을 보는 중…"
          : tab === "multi"
            ? selectedMultiCount >= 2
              ? `멀티샷 분석 시작 (스윙 ${selectedMultiCount}개)`
              : "멀티샷 분석 시작"
            : hasFile
              ? `AI 코치에게 보내기 (${[sideFile && "측면", frontFile && "정면"]
                  .filter(Boolean)
                  .join("+")})`
              : "AI 코치에게 보내기"}
      </button>

      {tab === "single" && hasFile && (
        <div className="mt-3 flex flex-col gap-1 text-xs text-fairway-700/80">
          {sideFile && (
            <span>
              · 측면샷: {sideFile.name} ({sizeMB(sideFile)}MB){" "}
              <PoseBadge
                state={poseState.side}
                onRetry={() => startPoseExtraction("side", sideFile)}
              />
            </span>
          )}
          {frontFile && (
            <span>
              · 정면샷: {frontFile.name} ({sizeMB(frontFile)}MB){" "}
              <PoseBadge
                state={poseState.front}
                onRetry={() => startPoseExtraction("front", frontFile)}
              />
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
          {busyMessage ?? (tab === "multi"
            ? "스윙별 측면·정면 위상 정렬 → 독립 채점 → 공통 문제와 크리티컬 문제 빈도 집계 → 코치 티칭 순으로 진행돼요. 1~2분 걸릴 수 있어요."
            : "각 영상별 키 프레임 추출 → Gemini 업로드 → 헤드코치 판정 → 전담 코치 분석 → 헤드코치 리뷰. 영상 2개일 경우 1분 정도 걸려요.")}
        </div>
      )}
    </section>
  );
}

function ConsentCheckbox({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-[11px] leading-relaxed text-fairway-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-fairway-300 text-fairway-700"
      />
      <span>{children}</span>
    </label>
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
  inputRef: React.RefObject<HTMLInputElement | null>;
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
          <div className="flex h-full flex-col items-center justify-center gap-1 px-4 py-2">
            <span className="rounded bg-white/15 px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-white/90">
              촬영 각도 예시
            </span>
            <div className="min-h-0 w-full flex-1">
              <ViewGuideIllustration view={view} />
            </div>
            <p className="text-center text-[10px] leading-snug text-white/70">
              {view === "side"
                ? "옆(뒤쪽)에서 손 높이 · 전신과 클럽 헤드가 모두 보이게"
                : "정면 가슴 높이 · 양발과 클럽 전체가 모두 보이게"}
            </p>
          </div>
        )}
        {previewUrl && (
          <>
            <div className="pointer-events-none absolute inset-[8%] rounded-lg border border-dashed border-emerald-300/80" />
            <div className="pointer-events-none absolute bottom-[10%] left-[12%] right-[12%] border-t border-emerald-300/70" />
            <div className="pointer-events-none absolute bottom-[10%] left-1/2 top-[8%] border-l border-emerald-300/50" />
            <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[9px] text-white">
              머리·발·클럽이 점선 안쪽
            </span>
          </>
        )}
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

function PoseBadge({ state, onRetry }: { state: PoseState; onRetry: () => void }) {
  if (state.status === "idle") return null;

  if (state.status === "extracting") {
    return (
      <span className="ml-1 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-800">
        관절 추적 중…
      </span>
    );
  }

  if (state.status === "ready" && state.result) {
    const { detectedFrames, attemptedFrames, delegate, failure } = state.result;
    return (
      <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">
        스켈레톤 준비됨 ✓ · {detectedFrames}/{attemptedFrames}프레임 · {delegate}
        {failure?.code === "timeout" ? " (부분 결과)" : ""}
      </span>
    );
  }

  const failure = state.result?.failure;
  const counts = state.result?.attemptedFrames
    ? ` · ${state.result.detectedFrames}/${state.result.attemptedFrames}프레임`
    : "";
  return (
    <span className="ml-1 inline-flex flex-wrap items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900">
      <span>
        {failure?.message ?? "관절 추적에 실패했어요."}{counts} · AI 영상 분석은 계속 가능
      </span>
      {failure?.retryable !== false && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded bg-white/80 px-1.5 py-0.5 font-semibold underline underline-offset-2"
        >
          다시 시도
        </button>
      )}
    </span>
  );
}
