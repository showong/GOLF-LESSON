/**
 * 브라우저 MediaPipe Pose가 추출한 관절 좌표 시계열을 받아
 * 서버에서 결정적(deterministic)으로 처리하는 모듈.
 *
 * - 위상 감지: 손목 궤적의 변곡점 기반 → 같은 입력이면 항상 같은 결과
 * - 정량 지표: 상대 단위만 사용 (어깨 폭 기준 비율, 각도, 시간 비율).
 *   cm 단위는 카메라 캘리브레이션 없이는 거짓 정밀도이므로 절대 사용하지 않는다.
 *
 * MediaPipe Pose 33 랜드마크 인덱스 (정규화 좌표, y는 아래로 증가):
 * 0=nose, 11/12=shoulders(L/R), 15/16=wrists(L/R), 23/24=hips(L/R)
 */
import type { PhaseTimestamps } from "./frames";
import type { VideoView } from "./types";

/** 한 프레임의 포즈: t(초) + 33개 랜드마크 [x, y, visibility] */
export interface PoseFrame {
  t: number;
  /** [x, y, visibility] × 33. 소수 4자리로 반올림해 전송 */
  lm: [number, number, number][];
}

export interface PoseTrack {
  view: VideoView;
  /** 유효 샘플링 레이트 (fps) */
  sampleFps: number;
  frames: PoseFrame[];
}

const NOSE = 0;
const L_SHOULDER = 11;
const R_SHOULDER = 12;
const L_WRIST = 15;
const R_WRIST = 16;
const L_HIP = 23;
const R_HIP = 24;

const MIN_VISIBILITY = 0.5;
const MIN_FRAMES = 20;

function pt(frame: PoseFrame, idx: number): { x: number; y: number } | null {
  const l = frame.lm[idx];
  if (!l || l[2] < MIN_VISIBILITY) return null;
  return { x: l[0], y: l[1] };
}

function mid(
  a: { x: number; y: number } | null,
  b: { x: number; y: number } | null,
): { x: number; y: number } | null {
  if (a && b) return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  return a ?? b;
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function validatePoseTrack(raw: unknown): PoseTrack | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<PoseTrack>;
  if (r.view !== "side" && r.view !== "front") return null;
  if (!Array.isArray(r.frames) || r.frames.length < MIN_FRAMES) return null;
  if (r.frames.length > 600) return null; // 폭주 방지
  const frames: PoseFrame[] = [];
  for (const f of r.frames) {
    const ff = f as Partial<PoseFrame>;
    if (typeof ff.t !== "number" || !Array.isArray(ff.lm) || ff.lm.length !== 33)
      return null;
    frames.push({ t: ff.t, lm: ff.lm as PoseFrame["lm"] });
  }
  frames.sort((a, b) => a.t - b.t);
  return {
    view: r.view,
    sampleFps: typeof r.sampleFps === "number" ? r.sampleFps : 15,
    frames,
  };
}

/**
 * 손목 궤적으로 스윙 위상을 감지한다. LLM 없이 순수 수학 — 100% 재현 가능.
 * 반환 null = 궤적이 스윙 패턴이 아니거나 가시성 부족.
 */
export function detectPhasesFromPose(track: PoseTrack): PhaseTimestamps | null {
  const frames = track.frames;
  if (frames.length < MIN_FRAMES) return null;

  // 손목 중심 시계열 (한쪽만 보이면 그쪽 사용)
  const wrist = frames.map((f) => mid(pt(f, L_WRIST), pt(f, R_WRIST)));
  const validCount = wrist.filter(Boolean).length;
  if (validCount < frames.length * 0.6) return null;

  // 손목 이동 속도 (정규화 좌표/초)
  const speed: number[] = frames.map((_, i) => {
    if (i === 0) return 0;
    const a = wrist[i - 1];
    const b = wrist[i];
    if (!a || !b) return 0;
    const dt = Math.max(1e-3, frames[i].t - frames[i - 1].t);
    return dist(a, b) / dt;
  });
  // 3-포인트 이동평균
  const smooth = speed.map((_, i) => {
    const a = speed[Math.max(0, i - 1)];
    const b = speed[i];
    const c = speed[Math.min(speed.length - 1, i + 1)];
    return (a + b + c) / 3;
  });

  const peakSpeed = Math.max(...smooth);
  if (peakSpeed <= 0) return null;
  const quiet = peakSpeed * 0.1;

  // 다운스윙 대략 위치: 최대 속도 지점 (임팩트 확정은 아래에서 별도)
  const roughPeakIdx = smooth.indexOf(peakSpeed);

  // 어드레스: 최대 속도 지점에서 뒤로 가며 마지막 "정지 구간"(속도 < quiet 3프레임 지속)의 끝
  let addressIdx = 0;
  for (let i = roughPeakIdx; i >= 2; i--) {
    if (smooth[i] < quiet && smooth[i - 1] < quiet && smooth[i - 2] < quiet) {
      addressIdx = i;
      break;
    }
  }

  // 탑: 어드레스~최대속도 사이에서 손목이 가장 높은(y 최소) 지점
  let topIdx = addressIdx;
  let minY = Infinity;
  for (let i = addressIdx; i <= roughPeakIdx; i++) {
    const w = wrist[i];
    if (w && w.y < minY) {
      minY = w.y;
      topIdx = i;
    }
  }
  // 스윙 패턴 검증: 실제로 손이 올라갔는가
  const addrW = wrist[addressIdx];
  if (!addrW || topIdx <= addressIdx) return null;
  const rise = addrW.y - minY; // 정규화 좌표에서 상승량
  if (rise < 0.05) return null; // 손이 거의 안 올라감 → 스윙 아님

  // 임팩트: 탑 이후 손목이 어드레스 높이로 복귀하는 첫 지점.
  // (임팩트 순간 손 높이 ≈ 어드레스 손 높이라는 물리적 사실 이용 —
  //  "최대 속도 지점"은 다운스윙 초반에 찍히는 편향이 있어 사용하지 않음)
  let impactIdx = -1;
  for (let i = topIdx + 1; i < frames.length; i++) {
    const w = wrist[i];
    if (w && w.y >= addrW.y - 0.02) {
      impactIdx = i;
      break;
    }
  }
  if (impactIdx < 0) {
    // 복귀 지점을 못 찾으면 속도가 피크의 90% 이상인 마지막 프레임으로 폴백
    for (let i = frames.length - 1; i > topIdx; i--) {
      if (smooth[i] >= peakSpeed * 0.9) {
        impactIdx = i;
        break;
      }
    }
  }
  if (impactIdx <= topIdx) return null;

  // 피니시: 임팩트 이후 속도가 잦아드는 첫 지점
  let finishIdx = frames.length - 1;
  for (let i = impactIdx + 1; i < frames.length; i++) {
    if (smooth[i] < quiet) {
      finishIdx = i;
      break;
    }
  }

  const t = (i: number) => Math.round(frames[i].t * 1000) / 1000;
  const midBackIdx = Math.round((addressIdx + topIdx) / 2);

  return {
    address: t(addressIdx),
    "mid-backswing": t(midBackIdx),
    top: t(topIdx),
    impact: t(impactIdx),
    finish: t(finishIdx),
  };
}

/** 위상별 대표 프레임 찾기 (타임스탬프에 가장 가까운 프레임) */
function frameAt(track: PoseTrack, tSec: number): PoseFrame | null {
  let best: PoseFrame | null = null;
  let bestDiff = Infinity;
  for (const f of track.frames) {
    const d = Math.abs(f.t - tSec);
    if (d < bestDiff) {
      bestDiff = d;
      best = f;
    }
  }
  return bestDiff <= 0.25 ? best : null;
}

export interface PoseMetrics {
  view: VideoView;
  /** 백스윙:다운스윙 시간 비율 (예: 2.8) */
  tempoRatio: number | null;
  /** 머리 좌우 이동 (어드레스→탑), 어깨 폭 대비 % */
  headSwayPct: number | null;
  /** 머리 상하 이동 (어드레스→임팩트), 어깨 폭 대비 %. +는 하강 */
  headDropPct: number | null;
  /** 골반 중심 좌우 이동 (어드레스→탑), 어깨 폭 대비 % */
  hipSwayPct: number | null;
  /** 척추 기울기 변화 (어드레스→임팩트), 도(°). 시점에 따라 해석 다름 */
  spineTiltChangeDeg: number | null;
}

/**
 * 상대 단위 정량 지표. 어깨 폭(어드레스 기준)을 1로 하는 비율만 사용.
 * 시점별로 의미 있는 지표만 채우고 나머지는 null.
 */
export function computePoseMetrics(
  track: PoseTrack,
  phases: PhaseTimestamps,
): PoseMetrics | null {
  const addr = phases.address !== undefined ? frameAt(track, phases.address) : null;
  const top = phases.top !== undefined ? frameAt(track, phases.top) : null;
  const impact = phases.impact !== undefined ? frameAt(track, phases.impact) : null;
  if (!addr) return null;

  const shoulderL = pt(addr, L_SHOULDER);
  const shoulderR = pt(addr, R_SHOULDER);
  if (!shoulderL || !shoulderR) return null;
  const shoulderWidth = dist(shoulderL, shoulderR);
  if (shoulderWidth < 0.02) return null;

  const noseA = pt(addr, NOSE);
  const noseI = impact ? pt(impact, NOSE) : null;
  const hipA = mid(pt(addr, L_HIP), pt(addr, R_HIP));

  // 스웨이는 특정 순간이 아니라 백스윙 구간(어드레스→탑)의 "최대 이탈"로 측정.
  // 단일 프레임 측정은 탑 직전에 복귀하는 스웨이를 놓친다.
  const backswingFrames =
    phases.address !== undefined && phases.top !== undefined
      ? track.frames.filter((f) => f.t >= phases.address! && f.t <= phases.top!)
      : [];
  const maxDeviation = (
    idxA: number,
    idxB: number | null,
    ref: { x: number } | null,
  ): number | null => {
    if (!ref || backswingFrames.length === 0) return null;
    let max = 0;
    for (const f of backswingFrames) {
      const p =
        idxB === null ? pt(f, idxA) : mid(pt(f, idxA), pt(f, idxB));
      if (p) max = Math.max(max, Math.abs(p.x - ref.x));
    }
    return max;
  };
  const noseSway = maxDeviation(NOSE, null, noseA);
  const hipSway = maxDeviation(L_HIP, R_HIP, hipA);

  const pct = (v: number) => Math.round((v / shoulderWidth) * 100);

  // 템포: (탑-어드레스) : (임팩트-탑)
  let tempoRatio: number | null = null;
  if (
    phases.address !== undefined &&
    phases.top !== undefined &&
    phases.impact !== undefined
  ) {
    const back = phases.top - phases.address;
    const down = phases.impact - phases.top;
    if (down > 0.02) tempoRatio = Math.round((back / down) * 10) / 10;
  }

  // 척추 기울기: 어깨 중심-골반 중심 선의 수직 대비 각도
  const spineAngle = (f: PoseFrame): number | null => {
    const s = mid(pt(f, L_SHOULDER), pt(f, R_SHOULDER));
    const h = mid(pt(f, L_HIP), pt(f, R_HIP));
    if (!s || !h) return null;
    return (Math.atan2(s.x - h.x, h.y - s.y) * 180) / Math.PI;
  };
  const spineA = spineAngle(addr);
  const spineI = impact ? spineAngle(impact) : null;

  // 시점별 유효 지표: 좌우 이동은 정면샷에서만 의미. 상하는 양쪽 다 참고 가능.
  const isFront = track.view === "front";

  return {
    view: track.view,
    tempoRatio,
    headSwayPct: isFront && noseSway !== null ? pct(noseSway) : null,
    headDropPct: noseA && noseI ? pct(noseI.y - noseA.y) : null,
    hipSwayPct: isFront && hipSway !== null ? pct(hipSway) : null,
    spineTiltChangeDeg:
      spineA !== null && spineI !== null
        ? Math.round((spineI - spineA) * 10) / 10
        : null,
  };
}

/** 정량 지표 → 프롬프트 주입용 텍스트. 측정 한계를 함께 명시한다. */
export function renderPoseMetrics(metrics: PoseMetrics[]): string {
  if (metrics.length === 0) return "";
  const lines: string[] = [];
  for (const m of metrics) {
    const viewLabel = m.view === "side" ? "측면샷" : "정면샷";
    const parts: string[] = [];
    if (m.tempoRatio !== null)
      parts.push(`템포(백스윙:다운스윙) ≈ ${m.tempoRatio}:1 (일반적 안정 범위 2.5~3.5:1)`);
    if (m.headSwayPct !== null)
      parts.push(`머리 좌우 이동(어드레스→탑) ≈ 어깨 폭의 ${m.headSwayPct}%`);
    if (m.headDropPct !== null)
      parts.push(
        `머리 상하 이동(어드레스→임팩트) ≈ 어깨 폭의 ${Math.abs(m.headDropPct)}% ${m.headDropPct >= 0 ? "하강" : "상승(주의: 상체 기립 신호)"}`,
      );
    if (m.hipSwayPct !== null)
      parts.push(`골반 좌우 이동(어드레스→탑) ≈ 어깨 폭의 ${m.hipSwayPct}%`);
    if (m.spineTiltChangeDeg !== null)
      parts.push(`척추 기울기 변화(어드레스→임팩트) ≈ ${m.spineTiltChangeDeg}°`);
    if (parts.length > 0) {
      lines.push(`▶ ${viewLabel} (관절 좌표 측정)\n${parts.map((p) => `  - ${p}`).join("\n")}`);
    }
  }
  if (lines.length === 0) return "";
  return `[스켈레톤 정량 측정 — 브라우저 관절 추적 기반]
아래 수치는 2D 관절 좌표에서 계산된 근사값입니다. 카메라 각도에 따라 오차가 있으므로
단독 판정 근거가 아니라 관찰을 뒷받침하는 보조 증거로 사용하세요.
절대 길이(cm)가 아닌 어깨 폭 대비 비율임에 유의.

${lines.join("\n")}`;
}
