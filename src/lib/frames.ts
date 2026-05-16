import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { v4 as uuidv4 } from "uuid";
import ffmpegPathImport from "ffmpeg-static";
import { VIDEO_VIEW_LABEL, type VideoView } from "./types";

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

async function getVideoDurationSec(filePath: string): Promise<number> {
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
      resolve(seconds);
    });
  });
}

async function extractSingleFrame(
  inputPath: string,
  timestampSec: number,
  outPath: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    // -ss를 -i 앞에 두면 input seek로 빠르지만 약간 부정확.
    // 어드레스 등은 정지 구간이라 충분히 정확함.
    const proc = spawn(ensureBinary(), [
      "-y",
      "-ss", timestampSec.toFixed(3),
      "-i", inputPath,
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

/**
 * 스윙 영상에서 5개 키 프레임을 추출해 base64 JPEG으로 반환한다.
 * 영상 길이의 10/30/50/70/90% 지점을 사용한다.
 */
export async function extractKeyFrames(
  videoPath: string,
  view: VideoView,
): Promise<ExtractedFrame[]> {
  const duration = await getVideoDurationSec(videoPath);
  const tmpDir = path.join(os.tmpdir(), `gtutor-frames-${uuidv4()}`);
  await fs.mkdir(tmpDir, { recursive: true });

  try {
    const viewLabel = VIDEO_VIEW_LABEL[view];
    const frames: ExtractedFrame[] = [];
    for (let i = 0; i < PHASES.length; i++) {
      const { ratio, phase, label } = PHASES[i];
      const ts = Math.max(0, Math.min(Math.max(0, duration - 0.05), duration * ratio));
      const out = path.join(tmpDir, `f${i}.jpg`);
      await extractSingleFrame(videoPath, ts, out);
      const data = await fs.readFile(out);
      frames.push({
        view,
        label: `${viewLabel} ${i + 1}/${PHASES.length} ${label} (t=${ts.toFixed(2)}s)`,
        phase,
        timestampSec: ts,
        base64: data.toString("base64"),
        mimeType: "image/jpeg",
      });
    }
    return frames;
  } finally {
    fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
