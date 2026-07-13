/**
 * 포즈 기반 위상 감지·정량 지표 회귀 테스트 (결정적 로직)
 * 실행: npm run test:pose
 *
 * 합성 스윙 궤적(어드레스 정지 → 백스윙 상승 → 다운스윙 급강하 → 임팩트 → 피니시)으로
 * detectPhasesFromPose가 순서·근사 위치를 정확히 잡는지 고정한다.
 */
import {
  computePoseMetrics,
  detectPhasesFromPose,
  validatePoseTrack,
  type PoseFrame,
  type PoseTrack,
} from "../src/lib/pose";

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ✅ ${name}`);
  else {
    failures++;
    console.error(`  ❌ ${name}`, extra ?? "");
  }
}

/** 33개 랜드마크 프레임 생성기: 핵심 관절만 채우고 나머지는 저가시성 */
function makeFrame(
  t: number,
  wrist: { x: number; y: number },
  nose: { x: number; y: number },
  hip: { x: number; y: number },
): PoseFrame {
  const lm: [number, number, number][] = Array.from({ length: 33 }, () => [0, 0, 0]);
  lm[0] = [nose.x, nose.y, 0.95]; // nose
  lm[11] = [0.45, 0.4, 0.95]; // shoulders (고정, 폭 0.1)
  lm[12] = [0.55, 0.4, 0.95];
  lm[15] = [wrist.x, wrist.y, 0.95]; // wrists
  lm[16] = [wrist.x, wrist.y, 0.95];
  lm[23] = [hip.x - 0.05, hip.y, 0.95]; // hips
  lm[24] = [hip.x + 0.05, hip.y, 0.95];
  return { t, lm };
}

/**
 * 합성 스윙 (30fps, 4초):
 *  0.0~1.5s  어드레스 정지 (손목 y=0.65)
 *  1.5~2.4s  백스윙: 손목이 y=0.65→0.25로 상승 (0.9s)
 *  2.4~2.7s  다운스윙: y=0.25→0.65로 급강하 (0.3s) → 임팩트 ≈ 2.7s
 *  2.7~3.3s  팔로우스루 감속
 *  3.3~4.0s  피니시 정지
 */
function syntheticSwing(): PoseTrack {
  const frames: PoseFrame[] = [];
  const fps = 30;
  for (let i = 0; i <= 4 * fps; i++) {
    const t = i / fps;
    let wy: number;
    let wx = 0.5;
    if (t < 1.5) wy = 0.65;
    else if (t < 2.4) {
      const p = (t - 1.5) / 0.9;
      wy = 0.65 - 0.4 * p;
      wx = 0.5 + 0.15 * p;
    } else if (t < 2.7) {
      const p = (t - 2.4) / 0.3;
      wy = 0.25 + 0.4 * p;
      wx = 0.65 - 0.2 * p;
    } else if (t < 3.3) {
      const p = (t - 2.7) / 0.6;
      wy = 0.65 - 0.35 * p;
      wx = 0.45 - 0.1 * p;
    } else {
      wy = 0.3;
      wx = 0.35;
    }
    // 머리: 백스윙에서 살짝 우측(+x 0.02), 임팩트에서 살짝 하강
    const nose = {
      x: 0.5 + (t >= 1.5 && t < 2.4 ? 0.02 : 0),
      y: 0.2 + (t >= 2.4 && t < 2.8 ? 0.01 : 0),
    };
    const hip = { x: 0.5 + (t >= 1.5 && t < 2.4 ? 0.015 : 0), y: 0.6 };
    frames.push(makeFrame(t, { x: wx, y: wy }, nose, hip));
  }
  return { view: "front", sampleFps: fps, frames };
}

console.log("\n[1] validatePoseTrack");
{
  const track = syntheticSwing();
  check("정상 트랙 통과", validatePoseTrack(track) !== null);
  check("프레임 부족 거부", validatePoseTrack({ ...track, frames: track.frames.slice(0, 5) }) === null);
  check("잘못된 형식 거부", validatePoseTrack({ view: "side", frames: "x" }) === null);
}

console.log("\n[2] 위상 감지 (합성 스윙: 어드레스~1.5s, 탑≈2.4s, 임팩트≈2.7s)");
{
  const phases = detectPhasesFromPose(syntheticSwing());
  check("위상 감지 성공", phases !== null, phases);
  if (phases) {
    check(
      `어드레스 ≈ 1.5s 부근 (실제 ${phases.address})`,
      phases.address !== undefined && phases.address >= 1.2 && phases.address <= 1.7,
      phases.address,
    );
    check(
      `탑 ≈ 2.4s 부근 (실제 ${phases.top})`,
      phases.top !== undefined && phases.top >= 2.2 && phases.top <= 2.6,
      phases.top,
    );
    check(
      `임팩트 ≈ 2.55~2.85s (실제 ${phases.impact})`,
      phases.impact !== undefined && phases.impact >= 2.5 && phases.impact <= 2.9,
      phases.impact,
    );
    const ordered =
      phases.address! < phases["mid-backswing"]! &&
      phases["mid-backswing"]! < phases.top! &&
      phases.top! < phases.impact! &&
      phases.impact! < phases.finish!;
    check("위상 시간 순서 보장", ordered);
  }
}

console.log("\n[3] 스윙 아닌 입력 거부");
{
  // 정지 영상 (손목이 안 움직임)
  const still: PoseTrack = {
    view: "front",
    sampleFps: 30,
    frames: Array.from({ length: 60 }, (_, i) =>
      makeFrame(i / 30, { x: 0.5, y: 0.65 }, { x: 0.5, y: 0.2 }, { x: 0.5, y: 0.6 }),
    ),
  };
  check("정지 영상 → null", detectPhasesFromPose(still) === null);
}

console.log("\n[4] 정량 지표 (상대 단위)");
{
  const track = syntheticSwing();
  const phases = detectPhasesFromPose(track)!;
  const m = computePoseMetrics(track, phases);
  check("지표 계산 성공", m !== null);
  if (m) {
    // 어깨 폭 0.1, 머리 이동 0.02 → 20%
    check(
      `머리 좌우 이동 ≈ 20% (실제 ${m.headSwayPct}%)`,
      m.headSwayPct !== null && m.headSwayPct >= 10 && m.headSwayPct <= 30,
      m.headSwayPct,
    );
    check(
      `템포 ≈ 3:1 (실제 ${m.tempoRatio}:1)`,
      m.tempoRatio !== null && m.tempoRatio >= 2.0 && m.tempoRatio <= 4.5,
      m.tempoRatio,
    );
    check("cm 단위 없음 (모두 %·비율·도)", !JSON.stringify(m).includes("cm"));
  }
}

if (failures > 0) {
  console.error(`\n${failures}개 실패`);
  process.exit(1);
}
console.log("\n모든 케이스 통과 ✅");
