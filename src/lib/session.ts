/**
 * 복수 스윙 일관성 분석 — 서버측 집계 (순수 함수, LLM 비의존).
 *
 * 설계 원칙:
 * - LLM은 스윙별 관찰·채점만 한다. "무엇이 습관이고 무엇이 우연인지"는
 *   서버가 빈도 기반으로 결정적으로 계산한다 (같은 입력 → 같은 분류).
 * - 등급은 스윙별 점수의 "중앙값"으로 산출 → 한 번의 최고/최악 스윙이
 *   등급을 흔들지 못한다 (단일 스윙 분석의 분산 문제 해결).
 */
import {
  MECHANICS_DIMENSIONS,
  weightedTotal,
  type MechanicsDim,
  type MechanicsScore,
} from "./types";

/** LLM 세션 판정이 반환하는 스윙 1개 분량 */
export interface PerSwingJudgement {
  swing: number; // 1-base
  scores: MechanicsScore[];
  faults: { title: string; severity: "minor" | "major" }[];
  clubMatches: boolean;
}

export interface FaultBucket {
  title: string;
  count: number;
}

export interface SessionAggregate {
  /** 항목별 중앙값 점수 (등급 산출용) */
  medianScores: MechanicsScore[];
  /** 스윙 간 반복성 0~100 */
  consistencyScore: number;
  /** 스윙별 가중 점수 */
  perSwingWeighted: number[];
  habitualFaults: FaultBucket[];
  intermittentFaults: FaultBucket[];
  rareCriticalFaults: FaultBucket[];
  mismatchedSwings: number[];
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2); // 0~3 정수 유지
}

/**
 * 항목별 중앙값 점수. 해당 항목이 과반 스윙에서 관찰됐을 때만 observable.
 * 신뢰도는 관찰된 스윙들의 평균.
 */
export function aggregateMedianScores(
  perSwing: PerSwingJudgement[],
): MechanicsScore[] {
  return MECHANICS_DIMENSIONS.map((dim) => {
    const entries = perSwing
      .map((s) => s.scores.find((sc) => sc.dim === dim))
      .filter((sc): sc is MechanicsScore => sc !== undefined);
    const observed = entries.filter((sc) => sc.observable !== false);
    const majority = Math.ceil(perSwing.length / 2);

    if (observed.length < majority || observed.length === 0) {
      return {
        dim,
        score: 1 as const,
        note: `관찰 가능한 스윙이 ${observed.length}/${perSwing.length}개뿐이라 판독 제외`,
        observable: false,
        confidence: 0,
        evidenceSource: null,
      };
    }
    const med = Math.max(0, Math.min(3, median(observed.map((sc) => sc.score)))) as
      | 0
      | 1
      | 2
      | 3;
    const avgConf =
      observed.reduce((sum, sc) => sum + (sc.confidence ?? 0.6), 0) /
      observed.length;
    const scoreSpread =
      Math.max(...observed.map((sc) => sc.score)) -
      Math.min(...observed.map((sc) => sc.score));
    return {
      dim,
      score: med,
      note: `스윙 ${observed.length}개 중앙값 (편차 ${scoreSpread})`,
      observable: true,
      confidence: Math.round(avgConf * 100) / 100,
      evidenceSource: "direct" as const,
    };
  });
}

/**
 * 일관성 점수 0~100.
 * 각 항목의 스윙 간 점수 범위(max-min, 0~3)를 평균해서 환산.
 * 범위 0 = 완전히 같은 스윙 반복(100점), 평균 범위 3 = 완전히 들쭉날쭉(0점).
 */
export function computeConsistencyScore(perSwing: PerSwingJudgement[]): number {
  if (perSwing.length < 2) return 100;
  const ranges: number[] = [];
  for (const dim of MECHANICS_DIMENSIONS) {
    const observed = perSwing
      .map((s) => s.scores.find((sc) => sc.dim === dim))
      .filter(
        (sc): sc is MechanicsScore =>
          sc !== undefined && sc.observable !== false,
      );
    if (observed.length < 2) continue;
    const vals = observed.map((sc) => sc.score);
    ranges.push(Math.max(...vals) - Math.min(...vals));
  }
  if (ranges.length === 0) return 0;
  const avgRange = ranges.reduce((a, b) => a + b, 0) / ranges.length;
  return Math.max(0, Math.min(100, Math.round(100 * (1 - avgRange / 3))));
}

/**
 * 결함 빈도 분류.
 * - habitual: 스윙의 60% 이상에서 발생 → 습관적 문제 (교정 1순위)
 * - intermittent: 2개 이상 스윙, 60% 미만 → 간헐적 문제
 * - rareCritical: 1개 스윙뿐이지만 severity=major → 드물지만 치명적
 * - 1개 스윙 + minor는 노이즈로 간주해 버림
 *
 * 전제: LLM에게 "같은 결함은 스윙마다 동일한 title 문자열을 재사용"하도록
 * 프롬프트에서 강제한다 (집계는 title 완전 일치 기준).
 */
export function classifyFaults(perSwing: PerSwingJudgement[]): {
  habitual: FaultBucket[];
  intermittent: FaultBucket[];
  rareCritical: FaultBucket[];
} {
  const n = perSwing.length;
  const counts = new Map<string, { count: number; anyMajor: boolean }>();
  for (const s of perSwing) {
    const seen = new Set<string>(); // 같은 스윙 안의 중복 title은 1회로
    for (const f of s.faults) {
      const title = f.title.trim();
      if (!title || seen.has(title)) continue;
      seen.add(title);
      const cur = counts.get(title) ?? { count: 0, anyMajor: false };
      cur.count += 1;
      cur.anyMajor = cur.anyMajor || f.severity === "major";
      counts.set(title, cur);
    }
  }

  const habitual: FaultBucket[] = [];
  const intermittent: FaultBucket[] = [];
  const rareCritical: FaultBucket[] = [];
  for (const [title, { count, anyMajor }] of counts) {
    if (count / n >= 0.6) habitual.push({ title, count });
    else if (count >= 2) intermittent.push({ title, count });
    else if (anyMajor) rareCritical.push({ title, count });
    // count===1 && minor → 노이즈, 버림
  }
  const byCountDesc = (a: FaultBucket, b: FaultBucket) => b.count - a.count;
  return {
    habitual: habitual.sort(byCountDesc),
    intermittent: intermittent.sort(byCountDesc),
    rareCritical: rareCritical.sort(byCountDesc),
  };
}

export function aggregateSession(perSwing: PerSwingJudgement[]): SessionAggregate {
  const medianScores = aggregateMedianScores(perSwing);
  const faults = classifyFaults(perSwing);
  return {
    medianScores,
    consistencyScore: computeConsistencyScore(perSwing),
    perSwingWeighted: perSwing.map((s) => weightedTotal(s.scores)),
    habitualFaults: faults.habitual,
    intermittentFaults: faults.intermittent,
    rareCriticalFaults: faults.rareCritical,
    mismatchedSwings: perSwing.filter((s) => !s.clubMatches).map((s) => s.swing),
  };
}
