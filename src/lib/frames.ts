import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { v4 as uuidv4 } from "uuid";
import ffmpegPathImport from "ffmpeg-static";
import {
  VIDEO_VIEW_LABEL,
  type VideoQualityReport,
  type VideoView,
} from "./types";

// ffmpeg-static은 default export로 binary 경로 문자열을 줌(미지원 플랫폼은 null).
const ffmpegPath = ffmpegPathImport as unknown as string | null;

export interface ExtractedFrame {
  /** 영상 시점 (측면/정면) */
  view: VideoView;
  /** 사용자에게 노출되는 라벨 (예: "측면샷 1/5 어드레스 (t=0.45s)") */
  label: string;
  /** 골프 스윙 단계 추정값 */
  phase: SwingPhase;
  /** 영상 내 절대 타임스탬프(초) */
  timestampSec: number;
  /** base64 인코딩된 JPEG 데이터 */
  base64: string;
  mimeType: "image/jpeg";
  /** 임팩트 기준 상대 프레임. 일반 키프레임은 0 */
  frameOffset?: number;
}

export type SwingPhase =
  | "address"
  | "mid-backswing"
  | "top"
  | "impact"
  | "finish";

const PHASES: { ratio: number; phase: SwingPhase; label: string }[] = [
  { ratio: 0.1, phase: "address",       label: "어드레스" },
  { ratio: 0.3, phase: "mid-backswing", label: "백스윙 중간" },
  { ratio: 0.5, phase: "top",           label: "탑/전환" },
  { ratio: 0.7, phase: "impact",        label: "임팩트 부근" },
  { ratio: 0.9, phase: "finish",        label: "피니시" },
];

function ensureBinary(): string {
  if (!ffmpegPath) {
    throw new Error("ffmpeg-static 바이너리를 찾지 못했습니다. 이 플랫폼은 지원되지 않습니다.");
  }
  return ffmpegPath;
}

export interface VideoMetadata {
  durationSec: number;
  width: number;
  height: number;
  fps: number;
}

export async function inspectVideoMetadata(filePath: string): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ensureBinary(), ["-hide_banner", "-i", filePath]);
    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("error", reject);
    proc.on("close", () => {
      // ffmpeg는 출력 미지정 시 비정상 종료하지만 Duration은 stderr에 찍힘.
      const match = stderr.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
      if (!match) {
        return reject(new Error("ffmpeg: 영상 길이를 파싱할 수 없습니다."));
      }
      const [, h, m, s] = match;
      const seconds = parseInt(h, 10) * 3600 + parseInt(m, 10) * 60 + parseFloat(s);
      const videoLine = stderr.split("\n").find((line) => /Video:/.test(line)) ?? "";
      const sizeMatch = videoLine.match(/(\d{2,5})x(\d{2,5})/);
      const fpsMatch = videoLine.match(/([\d.]+)\s*fps/);
      if (!sizeMatch) {
        return reject(new Error("ffmpeg: 영상 해상도를 파싱할 수 없습니다."));
      }
      resolve({
        durationSec: seconds,
        width: Number(sizeMatch[1]),
        height: Number(sizeMatch[2]),
        fps: fpsMatch ? Number(fpsMatch[1]) : 30,
      });
    });
  });
}

export function technicalQualityReport(
  view: VideoView,
  metadata: VideoMetadata,
): VideoQualityReport {
  const warnings: string[] = [];
  const shortEdge = Math.min(metadata.width, metadata.height);
  if (shortEdge < 720) warnings.push("720p 미만이라 손목·클럽 판독 정확도가 낮아질 수 있어요");
  if (metadata.fps < 50) warnings.push("60fps 미만이라 임팩트 순간 판독 신뢰도가 낮아질 수 있어요");
  if (metadata.durationSec > 30) warnings.push("영상이 길어 본 스윙 탐색 오차가 커질 수 있어요");
  if (metadata.durationSec < 1) warnings.push("영상이 너무 짧아 전체 스윙을 확인하기 어려워요");
  return {
    view,
    width: metadata.width,
    height: metadata.height,
    fps: metadata.fps,
    durationSec: metadata.durationSec,
    mainSwingFound: true,
    framing: "unknown",
    clubVisible: null,
    ballVisible: null,
    stable: null,
    warnings,
    passed: metadata.durationSec >= 1 && shortEdge >= 360,
  };
}

/** ffmpeg 모션 분석 결과: 프레임 간 휘도 차이(YDIF) 기반 스윙 구간 추정 */
export interface MotionAnalysis {
  /** 움직임 최대 지점 ≈ 임팩트 후보 (초) */
  impactCandidateSec: number;
  /** 임팩트 직전 마지막 정지 구간 종료 ≈ 어드레스 후보 (초) */
  swingStartSec: number;
  /** 피크 이후 움직임이 잦아드는 지점 ≈ 피니시 부근 (초) */
  swingEndSec: number;
}

/**
 * LLM 없이 결정적(deterministic)으로 스윙 구간을 추정한다.
 * ffmpeg signalstats의 YDIF(프레임 간 평균 휘도 차이)를 프레임별로 뽑아
 * 최대 움직임 지점(≈임팩트)과 그 앞의 정지 구간(≈어드레스)을 찾는다.
 * 같은 영상은 항상 같은 결과 → 위상 감지 실패 시 고정 비율보다 나은 폴백,
 * 그리고 Gemini 위상 감지의 사전 힌트로 사용.
 */
export async function analyzeMotion(
  videoPath: string,
): Promise<MotionAnalysis | null> {
  const stdout = await new Promise<string>((resolve, reject) => {
    const proc = spawn(ensureBinary(), [
      "-hide_banner",
      "-i", videoPath,
      "-vf", "scale=160:-2,signalstats,metadata=print:file=-",
      "-f", "null",
      "-",
    ]);
    let out = "";
    proc.stdout.on("data", (chunk) => {
      // 30초 60fps 상한에서도 수 MB 수준이지만 폭주 방지 캡
      if (out.length < 16 * 1024 * 1024) out += chunk.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`ffmpeg motion analysis exit ${code}`));
    });
  });

  // "frame:N pts:... pts_time:T" 라인과 "lavfi.signalstats.YDIF=x" 라인 페어 파싱
  const samples: { t: number; ydif: number }[] = [];
  let currentT: number | null = null;
  for (const line of stdout.split("\n")) {
    const tMatch = line.match(/pts_time:([\d.]+)/);
    if (tMatch) {
      currentT = parseFloat(tMatch[1]);
      continue;
    }
    const yMatch = line.match(/lavfi\.signalstats\.YDIF=([\d.]+)/);
    if (yMatch && currentT !== null) {
      samples.push({ t: currentT, ydif: parseFloat(yMatch[1]) });
      currentT = null;
    }
  }
  if (samples.length < 10) return null;

  // 3-포인트 이동평균으로 노이즈 완화
  const smoothed = samples.map((s, i) => {
    const a = samples[Math.max(0, i - 1)].ydif;
    const b = s.ydif;
    const c = samples[Math.min(samples.length - 1, i + 1)].ydif;
    return { t: s.t, v: (a + b + c) / 3 };
  });

  // 피크(최대 움직임) = 임팩트 후보. 첫 프레임(장면 전환 노이즈)은 제외.
  let peakIdx = 1;
  for (let i = 2; i < smoothed.length; i++) {
    if (smoothed[i].v > smoothed[peakIdx].v) peakIdx = i;
  }
  const peak = smoothed[peakIdx];
  if (peak.v <= 0) return null;

  // 정지 임계값: 피크의 12% (경험적). 어드레스는 이 이하의 지속 구간.
  const quiet = peak.v * 0.12;

  // 피크에서 뒤로 걸어가며 마지막 정지 구간의 끝을 찾는다 (≈ 어드레스 종료 = 스윙 시작)
  let startIdx = 0;
  for (let i = peakIdx; i >= 0; i--) {
    if (smoothed[i].v < quiet) {
      startIdx = i;
      break;
    }
  }

  // 피크에서 앞으로 걸어가며 움직임이 잦아드는 지점 (≈ 피니시)
  let endIdx = smoothed.length - 1;
  for (let i = peakIdx; i < smoothed.length; i++) {
    if (smoothed[i].v < quiet) {
      endIdx = i;
      break;
    }
  }

  return {
    impactCandidateSec: Math.round(peak.t * 1000) / 1000,
    swingStartSec: Math.round(smoothed[startIdx].t * 1000) / 1000,
    swingEndSec: Math.round(smoothed[endIdx].t * 1000) / 1000,
  };
}

/**
 * 모션 분석 결과 → 위상 타임스탬프 폴백 생성.
 * 고정 비율(10~90%)보다 훨씬 나은 근사. 템포 3:1 가정으로 탑 위치 추정.
 */
export function motionToTimestamps(motion: MotionAnalysis): PhaseTimestamps {
  const { swingStartSec: start, impactCandidateSec: impact, swingEndSec: end } = motion;
  const span = Math.max(0.2, impact - start);
  // 백스윙:다운스윙 ≈ 3:1 → 탑은 스윙 구간의 약 75% 지점
  const top = start + span * 0.75;
  return {
    address: start,
    "mid-backswing": start + (top - start) * 0.5,
    top,
    impact,
    finish: Math.min(end, impact + 1.0),
  };
}

async function extractSingleFrame(
  inputPath: string,
  timestampSec: number,
  outPath: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    // -ss를 -i 뒤에 두어 디코딩 후 정확한 프레임 위치에서 추출한다.
    // 임팩트 전후 버스트는 속도보다 프레임 정확도가 중요하다.
    const proc = spawn(ensureBinary(), [
      "-y",
      "-i", inputPath,
      "-ss", timestampSec.toFixed(6),
      "-frames:v", "1",
      "-vf", "scale=720:-2",
      "-q:v", "3",
      outPath,
    ]);
    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-500)}`));
    });
  });
}

/** Gemini 위상 감지 결과: 각 스윙 단계의 타임스탬프(초) */
export type PhaseTimestamps = Partial<Record<SwingPhase, number>>;

/**
 * 스윙 영상에서 5개 기본 위상과 임팩트 전후 버스트 프레임을 추출한다.
 * timestamps가 주어지면 해당 위상의 실제 타임스탬프를 사용하고 (2-pass 정밀 추출),
 * 없으면 영상 길이의 10/30/50/70/90% 지점으로 폴백한다.
 */
export interface ExtractOptions {
  /** 임팩트 전후 버스트 프레임 추출 여부 (기본 true) */
  impactBurst?: boolean;
  /** 추출할 위상 서브셋 (기본: 5개 전부). 세션 모드는 3개로 비용 절감 */
  phases?: SwingPhase[];
  /** 라벨 접두어 (예: "스윙 2") — 세션 모드에서 스윙 구분용 */
  labelPrefix?: string;
}

export async function extractKeyFrames(
  videoPath: string,
  view: VideoView,
  timestamps?: PhaseTimestamps,
  options?: ExtractOptions,
): Promise<ExtractedFrame[]> {
  const metadata = await inspectVideoMetadata(videoPath);
  const duration = metadata.durationSec;
  const fps = Math.max(1, metadata.fps);
  const tmpDir = path.join(os.tmpdir(), `gtutor-frames-${uuidv4()}`);
  await fs.mkdir(tmpDir, { recursive: true });
  const wantBurst = options?.impactBurst !== false;
  const phaseFilter = options?.phases;
  const prefix = options?.labelPrefix ? `${options.labelPrefix} ` : "";

  const clamp = (t: number) =>
    Math.max(0, Math.min(Math.max(0, duration - 0.05), t));

  try {
    const viewLabel = VIDEO_VIEW_LABEL[view];
    const frames: ExtractedFrame[] = [];
    for (let i = 0; i < PHASES.length; i++) {
      const { ratio, phase, label } = PHASES[i];
      if (phaseFilter && !phaseFilter.includes(phase)) continue;
      const detected = timestamps?.[phase];
      const usedDetected =
        typeof detected === "number" && Number.isFinite(detected) && detected >= 0;
      const rawTs = clamp(usedDetected ? detected : duration * ratio);
      // 실제 영상 프레임 경계로 스냅해 재실행 시 같은 프레임을 사용한다.
      const ts = clamp(Math.round(rawTs * fps) / fps);
      const out = path.join(tmpDir, `f${i}.jpg`);
      await extractSingleFrame(videoPath, ts, out);
      const data = await fs.readFile(out);
      frames.push({
        view,
        label: `${prefix}${viewLabel} ${label} (t=${ts.toFixed(2)}s${usedDetected ? ", 위상 감지" : ""})`,
        phase,
        timestampSec: ts,
        base64: data.toString("base64"),
        mimeType: "image/jpeg",
        frameOffset: 0,
      });

      // 임팩트는 단일 프레임 대신 전후 2프레임을 추가해 손-헤드 관계와
      // 자세 변화가 타임스탬프 오차에 좌우되지 않도록 한다.
      // (±3 → ±2 축소: 인접 프레임은 거의 동일 이미지라 한계효용 낮고 토큰 비용만 큼)
      if (phase === "impact" && wantBurst) {
        for (const offset of [-2, -1, 1, 2]) {
          const burstTs = clamp(ts + offset / fps);
          const burstOut = path.join(tmpDir, `f${i}-impact-${offset}.jpg`);
          await extractSingleFrame(videoPath, burstTs, burstOut);
          const burstData = await fs.readFile(burstOut);
          frames.push({
            view,
            label: `${prefix}${viewLabel} 임팩트 ${offset > 0 ? "+" : ""}${offset}프레임 (t=${burstTs.toFixed(3)}s)`,
            phase: "impact",
            timestampSec: burstTs,
            base64: burstData.toString("base64"),
            mimeType: "image/jpeg",
            frameOffset: offset,
          });
        }
      }
    }
    return frames;
  } finally {
    fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
