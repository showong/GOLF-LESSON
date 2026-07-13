"use client";

/**
 * 브라우저에서 MediaPipe Pose로 영상의 관절 좌표를 추출한다.
 * - 사용자 기기에서 실행 → 서버 비용 0, Python 의존성 없음
 * - 결과(관절 시계열 JSON, 수십~수백 KB)만 영상과 함께 업로드
 * - 모델/WASM 로드 실패, 미지원 기기 등 어떤 실패든 null 반환 →
 *   서버는 Gemini 위상 감지 → ffmpeg 모션 분석 순으로 폴백
 */
import type { PoseFrame, PoseTrack } from "./pose";
import type { VideoView } from "./types";

// jsdelivr CDN: tasks-vision WASM 런타임 + Google 호스팅 포즈 모델(lite).
// 오프라인/차단 환경에서는 로드 실패 → null 폴백이 정상 동작.
const WASM_BASE =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

/** 샘플링 상한: 15fps · 최대 240프레임 (16초 분량) */
const TARGET_FPS = 15;
const MAX_FRAMES = 240;
const EXTRACTION_TIMEOUT_MS = 45_000;

let landmarkerPromise: Promise<unknown> | null = null;

async function getLandmarker(): Promise<{
  detectForVideo: (
    video: HTMLVideoElement,
    tsMs: number,
  ) => { landmarks?: { x: number; y: number; visibility?: number }[][] };
} | null> {
  try {
    if (!landmarkerPromise) {
      landmarkerPromise = (async () => {
        const vision = await import("@mediapipe/tasks-vision");
        const fileset = await vision.FilesetResolver.forVisionTasks(WASM_BASE);
        return vision.PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
          runningMode: "VIDEO",
          numPoses: 1,
        });
      })();
    }
    return (await landmarkerPromise) as Awaited<
      ReturnType<typeof getLandmarker>
    >;
  } catch (e) {
    console.warn("MediaPipe 초기화 실패 (서버 폴백 사용):", e);
    landmarkerPromise = null;
    return null;
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
 * 영상 파일에서 포즈 트랙 추출. 실패 시 null (분석은 서버 폴백으로 정상 진행).
 */
export async function extractPoseTrack(
  file: File,
  view: VideoView,
  onProgress?: (ratio: number) => void,
): Promise<PoseTrack | null> {
  if (typeof window === "undefined") return null;

  const landmarker = await getLandmarker();
  if (!landmarker) return null;

  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;

  const cleanup = () => {
    video.src = "";
    URL.revokeObjectURL(url);
  };

  const deadline = Date.now() + EXTRACTION_TIMEOUT_MS;

  try {
    await new Promise<void>((resolve, reject) => {
      video.addEventListener("loadedmetadata", () => resolve(), { once: true });
      video.addEventListener("error", () => reject(new Error("video load error")), {
        once: true,
      });
    });

    const duration = video.duration;
    if (!Number.isFinite(duration) || duration < 0.5) return null;

    const step = Math.max(1 / TARGET_FPS, duration / MAX_FRAMES);
    const frames: PoseFrame[] = [];

    for (let t = 0; t < duration; t += step) {
      if (Date.now() > deadline) {
        console.warn("포즈 추출 시간 초과, 부분 결과 사용");
        break;
      }
      await seekTo(video, Math.min(t, Math.max(0, duration - 0.05)));
      const result = landmarker.detectForVideo(video, Math.round(t * 1000));
      const lms = result.landmarks?.[0];
      if (lms && lms.length === 33) {
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

    if (frames.length < 20) return null;
    onProgress?.(1);
    return { view, sampleFps: Math.round(1 / step), frames };
  } catch (e) {
    console.warn(`포즈 추출 실패 (${view}):`, e);
    return null;
  } finally {
    cleanup();
  }
}
