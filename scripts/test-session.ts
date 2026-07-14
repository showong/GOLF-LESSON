/**
 * 복수 스윙 세션 집계 회귀 테스트 (결정적 로직)
 * 실행: npm run test:session
 */
import {
  aggregateMedianScores,
  aggregateSession,
  classifyFaults,
  computeConsistencyScore,
  type PerSwingJudgement,
} from "../src/lib/session";
import { MECHANICS_DIMENSIONS, type MechanicsScore } from "../src/lib/types";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) console.log(`  ✅ ${name}`);
  else {
    failures++;
    console.error(`  ❌ ${name}\n     expected ${e}\n     actual   ${a}`);
  }
}

function mkScores(scores: number[], unobservableIdx: number[] = []): MechanicsScore[] {
  return MECHANICS_DIMENSIONS.map((dim, i) => ({
    dim,
    score: scores[i] as 0 | 1 | 2 | 3,
    note: "",
    observable: !unobservableIdx.includes(i),
    confidence: unobservableIdx.includes(i) ? 0 : 0.8,
  }));
}

function mkSwing(
  swing: number,
  scores: number[],
  faults: { title: string; severity: "minor" | "major" }[] = [],
  clubMatches = true,
  unobservableIdx: number[] = [],
): PerSwingJudgement {
  return { swing, scores: mkScores(scores, unobservableIdx), faults, clubMatches };
}

console.log("\n[1] 중앙값 집계 — 한 번의 최악 스윙이 등급을 못 흔든다");
{
  // 5스윙: 4개는 전부 2점, 1개는 전부 0점(대실패 스윙)
  const swings = [
    mkSwing(1, [2, 2, 2, 2, 2, 2, 2, 2]),
    mkSwing(2, [2, 2, 2, 2, 2, 2, 2, 2]),
    mkSwing(3, [0, 0, 0, 0, 0, 0, 0, 0]),
    mkSwing(4, [2, 2, 2, 2, 2, 2, 2, 2]),
    mkSwing(5, [2, 2, 2, 2, 2, 2, 2, 2]),
  ];
  const med = aggregateMedianScores(swings);
  check("중앙값 = 2 (대실패 스윙 무시됨)", med.every((s) => s.score === 2), true);
}

console.log("\n[2] 관찰 가능성 — 과반 미만 관찰 항목은 제외");
{
  // 3스윙 중 tempo(6번 인덱스)가 1개 스윙에서만 관찰됨
  const swings = [
    mkSwing(1, [2, 2, 2, 2, 2, 2, 2, 2], [], true, [6]),
    mkSwing(2, [2, 2, 2, 2, 2, 2, 2, 2], [], true, [6]),
    mkSwing(3, [2, 2, 2, 2, 2, 2, 1, 2]),
  ];
  const med = aggregateMedianScores(swings);
  const tempo = med.find((s) => s.dim === "tempo")!;
  check("tempo(1/3 관찰) → observable=false", tempo.observable, false);
  const address = med.find((s) => s.dim === "address")!;
  check("address(3/3 관찰) → observable=true", address.observable, true);
}

console.log("\n[3] 일관성 점수");
{
  const identical = [
    mkSwing(1, [2, 2, 2, 2, 2, 2, 2, 2]),
    mkSwing(2, [2, 2, 2, 2, 2, 2, 2, 2]),
    mkSwing(3, [2, 2, 2, 2, 2, 2, 2, 2]),
  ];
  check("동일 스윙 반복 = 100", computeConsistencyScore(identical), 100);

  const chaotic = [
    mkSwing(1, [3, 3, 3, 3, 3, 3, 3, 3]),
    mkSwing(2, [0, 0, 0, 0, 0, 0, 0, 0]),
    mkSwing(3, [3, 0, 3, 0, 3, 0, 3, 0]),
  ];
  check("완전 들쭉날쭉 = 0", computeConsistencyScore(chaotic), 0);

  const mild = [
    mkSwing(1, [2, 2, 2, 2, 2, 2, 2, 2]),
    mkSwing(2, [2, 1, 2, 2, 2, 2, 2, 2]), // takeaway만 1점 차이
  ];
  // 평균 범위 = 1/8 = 0.125 → 100×(1-0.125/3) ≈ 96
  check("미세 편차 ≈ 96", computeConsistencyScore(mild), 96);
}

console.log("\n[4] 결함 빈도 분류");
{
  const swings = [
    mkSwing(1, [1,1,1,1,1,1,1,1], [
      { title: "팔이 먼저 내려오는 전환", severity: "minor" },
      { title: "탑에서 오버스윙", severity: "minor" },
    ]),
    mkSwing(2, [1,1,1,1,1,1,1,1], [
      { title: "팔이 먼저 내려오는 전환", severity: "minor" },
    ]),
    mkSwing(3, [1,1,1,1,1,1,1,1], [
      { title: "팔이 먼저 내려오는 전환", severity: "minor" },
      { title: "탑에서 오버스윙", severity: "minor" },
    ]),
    mkSwing(4, [1,1,1,1,1,1,1,1], [
      { title: "임팩트 직전 헤드업", severity: "major" },
    ]),
    mkSwing(5, [1,1,1,1,1,1,1,1], [
      { title: "팔이 먼저 내려오는 전환", severity: "minor" },
      { title: "미세한 그립 흔들림", severity: "minor" },
    ]),
  ];
  const f = classifyFaults(swings);
  check(
    "4/5 발생 → 습관적",
    f.habitual.map((x) => `${x.title}:${x.count}`),
    ["팔이 먼저 내려오는 전환:4"],
  );
  check(
    "2/5 발생 → 간헐적",
    f.intermittent.map((x) => `${x.title}:${x.count}`),
    ["탑에서 오버스윙:2"],
  );
  check(
    "1회 + major → 드물지만 치명적",
    f.rareCritical.map((x) => x.title),
    ["임팩트 직전 헤드업"],
  );
  check("1회 + minor → 노이즈로 버림",
    [...f.habitual, ...f.intermittent, ...f.rareCritical].some((x) => x.title === "미세한 그립 흔들림"),
    false,
  );
}

console.log("\n[5] 클럽 불일치 스윙 감지");
{
  const swings = [
    mkSwing(1, [1,1,1,1,1,1,1,1], [], true),
    mkSwing(2, [1,1,1,1,1,1,1,1], [], false), // 다른 클럽으로 판정
    mkSwing(3, [1,1,1,1,1,1,1,1], [], true),
  ];
  const agg = aggregateSession(swings);
  check("불일치 스윙 번호 = [2]", agg.mismatchedSwings, [2]);
  check("perSwingWeighted 길이 = 3", agg.perSwingWeighted.length, 3);
}

if (failures > 0) {
  console.error(`\n${failures}개 실패`);
  process.exit(1);
}
console.log("\n모든 케이스 통과 ✅");
