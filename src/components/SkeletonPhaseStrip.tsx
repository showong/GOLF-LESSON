"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  detectPhasesFromPose,
  type PoseFrame,
  type PoseTrack,
} from "@/lib/pose";
import type {
  MechanicsDim,
  MechanicsScore,
  SwingAnalysis,
  VideoView,
} from "@/lib/types";

export interface SkeletonSource {
  view: VideoView;
  file: File;
  track: PoseTrack;
}

type PhaseKey = "address" | "mid-backswing" | "top" | "impact" | "finish";

interface PhaseDefinition {
  key: PhaseKey;
  label: string;
  dims: MechanicsDim[];
}

interface PhaseVisual extends PhaseDefinition {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  confidence: number;
  score: MechanicsScore | null;
  estimated: boolean;
}

const PHASES: PhaseDefinition[] = [
  { key: "address", label: "어드레스", dims: ["address"] },
  { key: "mid-backswing", label: "백스윙", dims: ["takeaway"] },
  { key: "top", label: "탑", dims: ["top"] },
  { key: "impact", label: "전환·임팩트", dims: ["transition", "impact"] },
  { key: "finish", label: "피니시", dims: ["finish", "balance"] },
];

const IMPROVEMENT_TIP: Record<MechanicsDim, string> = {
  address: "발·골반·어깨 정렬을 맞춘 뒤 3초간 자세를 유지해 보세요.",
  takeaway: "손보다 가슴 회전으로 시작하고, 손이 허리 높이일 때 클럽 길을 확인하세요.",
  top: "오버스윙을 줄이고 리드 팔과 손의 높이를 매번 같은 위치에 멈춰 보세요.",
  transition: "탑에서 팔을 먼저 당기지 말고 골반이 먼저 움직이는 순서를 느껴보세요.",
  impact: "머리 높이와 척추각을 유지한 채 손이 클럽 헤드보다 먼저 지나가게 해보세요.",
  finish: "동작을 급히 멈추지 말고 가슴이 타깃을 본 상태로 3초 버텨보세요.",
  tempo: "백스윙을 다운스윙보다 약 3배 길게 쓰는 리듬으로 반복해 보세요.",
  balance: "피니시에서 흔들리지 않고 왼발로 3초간 서 있는지 확인하세요.",
};

// MediaPipe Pose 33 랜드마크 연결선. 신체 자세 이해에 필요한 몸통·팔·다리만 표시한다.
const CONNECTIONS: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24], [23, 25], [25, 27],
  [27, 29], [29, 31], [24, 26], [26, 28], [28, 30], [30, 32],
];

const DISPLAY_LANDMARKS = Array.from(new Set(CONNECTIONS.flat()));

function nearestFrame(track: PoseTrack, timestamp: number): PoseFrame | null {
  let best: PoseFrame | null = null;
  let diff = Infinity;
  for (const frame of track.frames) {
    const current = Math.abs(frame.t - timestamp);
    if (current < diff) {
      best = frame;
      diff = current;
    }
  }
  return diff <= 0.3 ? best : null;
}

function frameConfidence(frame: PoseFrame): number {
  const values = DISPLAY_LANDMARKS
    .map((index) => frame.lm[index]?.[2] ?? 0)
    .filter((value) => Number.isFinite(value));
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function weakestScore(scores: MechanicsScore[], dims: MechanicsDim[]): MechanicsScore | null {
  const candidates = dims
    .map((dim) => scores.find((score) => score.dim === dim))
    .filter(
      (score): score is MechanicsScore =>
        score !== undefined && score.observable !== false,
    )
    .sort((a, b) => a.score - b.score);
  return candidates[0] ?? null;
}

function seekVideo(video: HTMLVideoElement, timestamp: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const target = Math.min(timestamp, Math.max(0, video.duration - 0.03));
    if (Math.abs(video.currentTime - target) < 0.005 && video.readyState >= 2) {
      resolve();
      return;
    }
    const done = () => {
      video.removeEventListener("seeked", done);
      video.removeEventListener("error", failed);
      resolve();
    };
    const failed = () => {
      video.removeEventListener("seeked", done);
      video.removeEventListener("error", failed);
      reject(new Error("영상 프레임을 불러오지 못했습니다."));
    };
    video.addEventListener("seeked", done, { once: true });
    video.addEventListener("error", failed, { once: true });
    video.currentTime = target;
  });
}

function drawSkeletonOverlay(
  ctx: CanvasRenderingContext2D,
  frame: PoseFrame,
  width: number,
  height: number,
) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(2, width / 220);
  ctx.strokeStyle = "rgba(52, 211, 153, 0.95)";
  ctx.shadowColor = "rgba(0, 0, 0, 0.65)";
  ctx.shadowBlur = Math.max(2, width / 250);

  for (const [from, to] of CONNECTIONS) {
    const a = frame.lm[from];
    const b = frame.lm[to];
    if (!a || !b || a[2] < 0.45 || b[2] < 0.45) continue;
    ctx.beginPath();
    ctx.moveTo(a[0] * width, a[1] * height);
    ctx.lineTo(b[0] * width, b[1] * height);
    ctx.stroke();
  }

  ctx.shadowBlur = 0;
  ctx.fillStyle = "#fbbf24";
  for (const index of DISPLAY_LANDMARKS) {
    const point = frame.lm[index];
    if (!point || point[2] < 0.45) continue;
    ctx.beginPath();
    ctx.arc(point[0] * width, point[1] * height, Math.max(2.5, width / 180), 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSkeletonFrame(
  video: HTMLVideoElement,
  frame: PoseFrame,
): { imageUrl: string; width: number; height: number } {
  const maxWidth = 640;
  const maxHeight = 480;
  const scale = Math.min(maxWidth / video.videoWidth, maxHeight / video.videoHeight, 1);
  const width = Math.max(1, Math.round(video.videoWidth * scale));
  const height = Math.max(1, Math.round(video.videoHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("스켈레톤 캔버스를 만들지 못했습니다.");
  ctx.drawImage(video, 0, 0, width, height);
  drawSkeletonOverlay(ctx, frame, width, height);
  return { imageUrl: canvas.toDataURL("image/jpeg", 0.82), width, height };
}

function estimatedPhaseTimestamps(track: PoseTrack): Record<PhaseKey, number> | null {
  const first = track.frames[0]?.t;
  const last = track.frames.at(-1)?.t;
  if (typeof first !== "number" || typeof last !== "number" || last - first < 0.5) {
    return null;
  }
  const at = (ratio: number) => first + (last - first) * ratio;
  return {
    address: at(0.1),
    "mid-backswing": at(0.3),
    top: at(0.5),
    impact: at(0.7),
    finish: at(0.9),
  };
}

async function buildPhaseVisuals(
  source: SkeletonSource,
  scores: MechanicsScore[],
): Promise<PhaseVisual[]> {
  const detectedTimestamps = detectPhasesFromPose(source.track);
  const timestamps = detectedTimestamps ?? estimatedPhaseTimestamps(source.track);
  if (!timestamps) return [];
  const estimated = detectedTimestamps === null;

  const objectUrl = URL.createObjectURL(source.file);
  const video = document.createElement("video");
  video.src = objectUrl;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  try {
    await new Promise<void>((resolve, reject) => {
      video.addEventListener("loadeddata", () => resolve(), { once: true });
      video.addEventListener("error", () => reject(new Error("영상을 불러오지 못했습니다.")), {
        once: true,
      });
    });
    const visuals: PhaseVisual[] = [];
    for (const phase of PHASES) {
      const timestamp = timestamps[phase.key];
      if (typeof timestamp !== "number") continue;
      const frame = nearestFrame(source.track, timestamp);
      if (!frame) continue;
      await seekVideo(video, timestamp);
      const rendered = drawSkeletonFrame(video, frame);
      visuals.push({
        ...phase,
        imageUrl: rendered.imageUrl,
        imageWidth: rendered.width,
        imageHeight: rendered.height,
        confidence: frameConfidence(frame),
        score: weakestScore(scores, phase.dims),
        estimated,
      });
    }
    return visuals;
  } finally {
    video.src = "";
    URL.revokeObjectURL(objectUrl);
  }
}

function SkeletonSlowMotion({ source }: { source: SkeletonSource }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [playbackRate, setPlaybackRate] = useState(0.25);
  const [aspectRatio, setAspectRatio] = useState("16 / 9");
  const [maxPlayerWidth, setMaxPlayerWidth] = useState(720);

  useEffect(() => {
    const url = URL.createObjectURL(source.file);
    setVideoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [source.file]);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !videoUrl) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let frameId = 0;

    const draw = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const frame = nearestFrame(source.track, video.currentTime);
        if (frame) drawSkeletonOverlay(ctx, frame, canvas.width, canvas.height);
      }
    };

    const animate = () => {
      draw();
      if (!video.paused && !video.ended) frameId = requestAnimationFrame(animate);
    };
    const start = () => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(animate);
    };
    const stop = () => {
      cancelAnimationFrame(frameId);
      draw();
    };

    video.addEventListener("play", start);
    video.addEventListener("loadeddata", draw);
    video.addEventListener("seeked", draw);
    video.addEventListener("pause", stop);
    video.addEventListener("ended", stop);
    draw();
    return () => {
      cancelAnimationFrame(frameId);
      video.removeEventListener("play", start);
      video.removeEventListener("loadeddata", draw);
      video.removeEventListener("seeked", draw);
      video.removeEventListener("pause", stop);
      video.removeEventListener("ended", stop);
    };
  }, [source.track, videoUrl]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = playbackRate;
  }, [playbackRate]);

  return (
    <div className="mt-4 rounded-xl bg-slate-950 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs font-bold text-white">스켈레톤 슬로모션</div>
          <div className="text-[10px] text-slate-300">4초 영상도 0.25배속이면 약 16초 동안 확인할 수 있어요.</div>
        </div>
        <div className="flex rounded-lg bg-white/10 p-0.5">
          {[0.25, 0.5, 1].map((rate) => (
            <button
              key={rate}
              type="button"
              onClick={() => setPlaybackRate(rate)}
              className={`rounded-md px-2 py-1 text-[10px] font-semibold ${
                playbackRate === rate ? "bg-white text-slate-900" : "text-white"
              }`}
            >
              {rate}×
            </button>
          ))}
        </div>
      </div>
      <div
        className="relative mx-auto w-full overflow-hidden rounded-lg bg-black"
        style={{ aspectRatio, maxWidth: `${maxPlayerWidth}px` }}
      >
        {videoUrl && (
          <video
            ref={videoRef}
            src={videoUrl}
            controls
            muted
            playsInline
            preload="metadata"
            className="absolute inset-0 h-full w-full"
            onLoadedMetadata={(event) => {
              const video = event.currentTarget;
              video.playbackRate = playbackRate;
              setAspectRatio(`${video.videoWidth} / ${video.videoHeight}`);
              setMaxPlayerWidth(
                Math.min(720, Math.round((520 * video.videoWidth) / video.videoHeight)),
              );
            }}
          />
        )}
        <canvas
          ref={canvasRef}
          className="pointer-events-none absolute inset-0 h-full w-full"
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

function statusFor(visual: PhaseVisual): {
  label: string;
  badge: string;
  border: string;
} {
  if (visual.confidence < 0.5 || !visual.score) {
    return { label: "관찰 불가", badge: "bg-slate-500", border: "border-slate-200" };
  }
  if (visual.score.score >= 2) {
    return { label: "양호", badge: "bg-emerald-600", border: "border-emerald-200" };
  }
  if (visual.score.score === 1) {
    return { label: "주의", badge: "bg-amber-500", border: "border-amber-300" };
  }
  return { label: "개선 필요", badge: "bg-rose-600", border: "border-rose-300" };
}

export default function SkeletonPhaseStrip({
  analysis,
  sources,
}: {
  analysis: SwingAnalysis;
  sources: SkeletonSource[];
}) {
  const availableSources = useMemo(
    () =>
      sources
        .filter((source) => source.track.frames.length >= 20)
        // 구간별 자세는 머리 이동·스웨이·정렬이 잘 보이는 정면샷을 기본으로 표시한다.
        .sort((a, b) => (a.view === "front" ? -1 : b.view === "front" ? 1 : 0)),
    [sources],
  );
  const [activeView, setActiveView] = useState<VideoView>(
    availableSources[0]?.view ?? "front",
  );
  const [visuals, setVisuals] = useState<PhaseVisual[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const activeSource = availableSources.find((source) => source.view === activeView);

  useEffect(() => {
    // 새 분석 결과가 들어오면 정면샷을 다시 기본 시점으로 선택한다.
    setActiveView(availableSources[0]?.view ?? "front");
  }, [availableSources]);

  useEffect(() => {
    const source = availableSources.find((candidate) => candidate.view === activeView);
    if (!source) {
      setLoading(false);
      setVisuals([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    buildPhaseVisuals(source, analysis.mechanicsScores)
      .then((next) => {
        if (!cancelled) setVisuals(next);
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setVisuals([]);
          setError(reason instanceof Error ? reason.message : "구간별 자세를 만들지 못했습니다.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeView, analysis.mechanicsScores, availableSources]);

  if (availableSources.length === 0) return null;

  return (
    <div className="rounded-2xl border border-fairway-100 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-fairway-900">🦴 구간별 나의 스윙 자세</h3>
          <p className="mt-0.5 text-[11px] text-fairway-700/70">
            정면샷을 우선 표시합니다. 초록선은 관절 연결, 노란점은 관절 위치이며 부족한 점과 다음 동작 체크를 함께 확인할 수 있어요.
          </p>
        </div>
        {availableSources.length > 1 && (
          <div className="flex rounded-lg bg-fairway-50 p-0.5">
            {availableSources.map((source) => (
              <button
                key={source.view}
                type="button"
                onClick={() => setActiveView(source.view)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold ${
                  activeView === source.view
                    ? "bg-white text-fairway-900 shadow-sm"
                    : "text-fairway-700/60"
                }`}
              >
                {source.view === "side" ? "측면" : "정면"}
              </button>
            ))}
          </div>
        )}
      </div>

      {activeSource && <SkeletonSlowMotion key={activeView} source={activeSource} />}

      {loading ? (
        <div className="mt-4 rounded-lg bg-fairway-50 px-3 py-8 text-center text-xs text-fairway-700/70">
          구간별 프레임에 스켈레톤을 그리고 있어요…
        </div>
      ) : error || visuals.length === 0 ? (
        <div className="mt-4 rounded-lg bg-slate-50 px-3 py-3 text-xs text-slate-600">
          {error ?? "관절 가시성이 낮아 구간별 자세를 표시하지 못했습니다."}
        </div>
      ) : (
        <div className="no-scrollbar mt-4 flex snap-x gap-3 overflow-x-auto pb-2">
          {visuals.map((visual) => {
            const status = statusFor(visual);
            const improvement = visual.score
              ? IMPROVEMENT_TIP[visual.score.dim]
              : "해당 구간이 모두 보이도록 촬영 각도와 조명을 조정해 주세요.";
            return (
              <article
                key={visual.key}
                className={`w-[250px] shrink-0 snap-start overflow-hidden rounded-xl border ${status.border} bg-white`}
              >
                <div
                  className="relative bg-slate-900"
                  style={{ aspectRatio: `${visual.imageWidth} / ${visual.imageHeight}` }}
                >
                  {/* 로컬 File에서 생성된 data URL이며 서버에는 저장되지 않는다. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={visual.imageUrl}
                    alt={`${visual.label} 스켈레톤 자세`}
                    className="h-full w-full object-contain"
                  />
                  <span className={`absolute left-2 top-2 rounded px-2 py-0.5 text-[10px] font-bold text-white ${status.badge}`}>
                    {status.label}
                  </span>
                  <span className="absolute right-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[9px] text-white">
                    신뢰도 {Math.round(visual.confidence * 100)}%
                  </span>
                  {visual.estimated && (
                    <span className="absolute bottom-2 right-2 rounded bg-amber-500/90 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                      시간 비율 추정 구간
                    </span>
                  )}
                </div>
                <div className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-bold text-fairway-900">{visual.label}</h4>
                    {visual.score && (
                      <span className="text-[10px] font-bold text-fairway-700/70">
                        헤드코치 {visual.score.score}/3
                      </span>
                    )}
                  </div>
                  <div className="mt-2 rounded-md bg-rose-50 px-2.5 py-2">
                    <div className="text-[10px] font-bold text-rose-700">
                      {visual.score && visual.score.score >= 2 ? "현재 관찰 내용" : "현재 부족한 점"}
                    </div>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-fairway-900">
                      {visual.score?.note || "이 구간은 뚜렷한 문제 없이 안정적으로 관찰됐어요."}
                    </p>
                  </div>
                  <div className="mt-2 rounded-md bg-sky-50 px-2.5 py-2">
                    <div className="text-[10px] font-bold text-sky-700">개선 체크</div>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-fairway-900">
                      {improvement}
                    </p>
                  </div>
                  {visual.score &&
                    analysis.topFocus.title &&
                    visual.score.dim ===
                      [...analysis.mechanicsScores]
                        .filter((score) => score.observable !== false)
                        .sort((a, b) => a.score - b.score)[0]?.dim && (
                      <p className="mt-2 text-[10px] font-semibold text-amber-700">
                        오늘의 #1 포커스 · {analysis.topFocus.title}
                      </p>
                    )}
                </div>
              </article>
            );
          })}
        </div>
      )}
      <p className="mt-1 text-[10px] leading-relaxed text-fairway-700/60">
        2D 관절 추적 기반 보조 시각화입니다. 클럽 헤드·볼 궤적은 포함하지 않으며 원본 영상은 저장하지 않습니다.
      </p>
    </div>
  );
}
