"use client";

/**
 * 브라우저에서 MediaPipe Pose로 영상의 관절 좌표를 추출한다.
 * - 사용자 기기에서 실행 → 서버 비용 0, Python 의존성 없음
 * - 결과(관절 시계열 JSON, 수십~수백 KB)만 영상과 함께 업로드
 * - 영상마다 PoseLandmarker 인스턴스를 분리해 정면·측면 동시 처리 충돌 방지
 * - GPU 초기화 실패 시 CPU로 재시도
 * - 실패 원인과 검출 프레임 수를 UI에 전달하고, 서버 분석은 계속 진행
 */
import type { PoseFrame, PoseTrack } from "./pose";
import type { VideoView } from "./types";

// jsdelivr CDN: tasks-vision WASM 런타임 + Google 호스팅 포즈 모델(lite).
// 오프라인/차단 환경에서는 로드 실패 → null 폴백이 정상 동작.
const WASM_BASE =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

/** 샘플링 상한: 15fps · 최대 240프레임 (16초 분량) */
const TARGET_FPS = 15;
const MAX_FRAMES = 240;
const EXTRACTION_TIMEOUT_MS = 45_000;

export type PoseFailureCode =
  | "unsupported-browser"
  | "model-load"
  | "video-load"
  | "video-too-short"
  | "video-seek"
  | "insufficient-landmarks"
  | "timeout"
  | "processing";

export interface PoseExtractionResult {
  track: PoseTrack | null;
  attemptedFrames: number;
  detectedFrames: number;
  delegate: "GPU" | "CPU" | null;
  failure?: {
    code: PoseFailureCode;
    message: string;
    retryable: boolean;
  };
}

type Landmarker = {
  detectForVideo: (
    video: HTMLVideoElement,
    tsMs: number,
  ) => { landmarks?: { x: number; y: number; visibility?: number }[][] };
  close?: () => void;
};

type WasmFileset = Awaited<
  ReturnType<
    (typeof import("@mediapipe/tasks-vision"))["FilesetResolver"]["forVisionTasks"]
  >
>;

let filesetPromise: Promise<WasmFileset> | null = null;

async function getFileset() {
  if (!filesetPromise) {
    filesetPromise = import("@mediapipe/tasks-vision").then(({ FilesetResolver }) =>
      FilesetResolver.forVisionTasks(WASM_BASE),
    );
  }
  try {
    return await filesetPromise;
  } catch (error) {
    filesetPromise = null;
    throw error;
  }
}

async function createLandmarker(): Promise<{
  landmarker: Landmarker;
  delegate: "GPU" | "CPU";
}> {
  const vision = await import("@mediapipe/tasks-vision");
  const fileset = await getFileset();
  let gpuError: unknown;

  try {
    const landmarker = await vision.PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
      runningMode: "VIDEO",
      numPoses: 1,
    });
    return { landmarker: landmarker as Landmarker, delegate: "GPU" };
  } catch (error) {
    gpuError = error;
    console.warn("MediaPipe GPU 초기화 실패, CPU로 재시도합니다:", error);
  }

  try {
    const landmarker = await vision.PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
      runningMode: "VIDEO",
      numPoses: 1,
    });
    return { landmarker: landmarker as Landmarker, delegate: "CPU" };
  } catch (cpuError) {
    console.warn("MediaPipe CPU 초기화도 실패했습니다:", cpuError);
    throw new Error("pose model initialization failed", { cause: gpuError ?? cpuError });
  }
}

function seekTo(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      resolve();
    };
    const onError = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      reject(new Error("video seek error"));
    };
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    video.currentTime = t;
  });
}

/**
 * 영상 파일에서 포즈 트랙과 진단 정보를 함께 추출한다.
 */
export async function extractPoseTrackDetailed(
  file: File,
  view: VideoView,
  onProgress?: (ratio: number) => void,
): Promise<PoseExtractionResult> {
  const failed = (
    code: PoseFailureCode,
    message: string,
    retryable: boolean,
    attemptedFrames = 0,
    detectedFrames = 0,
    delegate: "GPU" | "CPU" | null = null,
  ): PoseExtractionResult => ({
    track: null,
    attemptedFrames,
    detectedFrames,
    delegate,
    failure: { code, message, retryable },
  });

  if (typeof window === "undefined") {
    return failed("unsupported-browser", "현재 환경에서는 관절 추적을 실행할 수 없어요.", false);
  }

  let landmarker: Landmarker;
  let delegate: "GPU" | "CPU";
  try {
    ({ landmarker, delegate } = await createLandmarker());
  } catch (error) {
    console.warn("MediaPipe 모델을 불러오지 못했습니다:", error);
    return failed("model-load", "관절 모델을 불러오지 못했어요.", true);
  }

  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;

  const cleanup = () => {
    video.src = "";
    URL.revokeObjectURL(url);
    landmarker.close?.();
  };

  const deadline = Date.now() + EXTRACTION_TIMEOUT_MS;
  let attemptedFrames = 0;
  let detectedFrames = 0;
  let timedOut = false;

  try {
    await new Promise<void>((resolve, reject) => {
      video.addEventListener("loadedmetadata", () => resolve(), { once: true });
      video.addEventListener("error", () => reject(new Error("video load error")), {
        once: true,
      });
    });

    const duration = video.duration;
    if (!Number.isFinite(duration) || duration < 0.5) {
      return failed("video-too-short", "영상이 너무 짧거나 길이를 확인할 수 없어요.", false, 0, 0, delegate);
    }

    const step = Math.max(1 / TARGET_FPS, duration / MAX_FRAMES);
    const frames: PoseFrame[] = [];

    for (let t = 0; t < duration; t += step) {
      if (Date.now() > deadline) {
        console.warn("포즈 추출 시간 초과, 부분 결과 사용");
        timedOut = true;
        break;
      }
      await seekTo(video, Math.min(t, Math.max(0, duration - 0.05)));
      attemptedFrames += 1;
      const result = landmarker.detectForVideo(video, Math.round(t * 1000));
      const lms = result.landmarks?.[0];
      if (lms && lms.length === 33) {
        detectedFrames += 1;
        frames.push({
          t: Math.round(t * 1000) / 1000,
          lm: lms.map(
            (l) =>
              [
                Math.round(l.x * 10000) / 10000,
                Math.round(l.y * 10000) / 10000,
                Math.round((l.visibility ?? 0) * 100) / 100,
              ] as [number, number, number],
          ),
        });
      }
      onProgress?.(Math.min(1, t / duration));
    }

    if (frames.length < 20) {
      return failed(
        timedOut ? "timeout" : "insufficient-landmarks",
        timedOut
          ? "관절 추적 시간이 초과됐어요."
          : "사람의 전신 관절을 충분히 찾지 못했어요.",
        true,
        attemptedFrames,
        detectedFrames,
        delegate,
      );
    }
    onProgress?.(1);
    return {
      track: { view, sampleFps: Math.round(1 / step), frames },
      attemptedFrames,
      detectedFrames,
      delegate,
      ...(timedOut
        ? {
            failure: {
              code: "timeout" as const,
              message: "시간 제한까지 검출한 관절 프레임을 사용해요.",
              retryable: true,
            },
          }
        : {}),
    };
  } catch (error) {
    console.warn(`포즈 추출 실패 (${view}):`, error);
    const message = error instanceof Error ? error.message : "";
    return failed(
      message.includes("seek") ? "video-seek" : message.includes("load") ? "video-load" : "processing",
      message.includes("seek") || message.includes("load")
        ? "브라우저가 영상 프레임을 읽지 못했어요."
        : "관절 추적 중 오류가 발생했어요.",
      true,
      attemptedFrames,
      detectedFrames,
      delegate,
    );
  } finally {
    cleanup();
  }
}

/** 기존 호출부 호환용: 실패 시 null. */
export async function extractPoseTrack(
  file: File,
  view: VideoView,
  onProgress?: (ratio: number) => void,
): Promise<PoseTrack | null> {
  return (await extractPoseTrackDetailed(file, view, onProgress)).track;
}
