/**
 * 등급 매핑 회귀 테스트 (결정적 로직 전용 미니 하네스)
 * 실행: npm run test:grading  (tsx scripts/test-grading.ts)
 *
 * LLM 비결정성과 무관한 서버측 채점/게이트/게이지 로직을 검증한다.
 * 채점 의미론을 바꿀 때마다 여기에 케이스를 추가할 것.
 */
import {
  MECHANICS_DIMENSIONS,
  nextLevelTarget,
  scoreToGradeLevel,
  weightedTotal,
  type MechanicsDim,
  type MechanicsScore,
} from "../src/lib/types";

let failures = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ✅ ${name}`);
  } else {
    failures++;
    console.error(`  ❌ ${name}\n     expected ${e}\n     actual   ${a}`);
  }
}

function mk(
  scores: number[],
  unobservable: MechanicsDim[] = [],
): MechanicsScore[] {
  return MECHANICS_DIMENSIONS.map((dim, i) => ({
    dim,
    score: scores[i] as 0 | 1 | 2 | 3,
    note: "",
    observable: !unobservable.includes(dim),
    confidence: unobservable.includes(dim) ? 0 : 0.8,
  }));
}

console.log("\n[1] 기본 밴드 매핑 (전 항목 관찰 가능)");
{
  const r = scoreToGradeLevel(mk([0, 0, 1, 0, 0, 0, 1, 0]));
  check("진짜 초보 → 골린이 LV-1", [r.grade, r.level], ["beginner", 1]);
}
{
  const r = scoreToGradeLevel(mk([1, 1, 2, 1, 2, 2, 1, 1]));
  check("평범 주말골퍼 → 아마추어 LV-1", [r.grade, r.level], ["amateur", 1]);
}
{
  const r = scoreToGradeLevel(mk([2, 2, 3, 2, 2, 3, 2, 2]));
  check("싱글 → 세미프로 LV-2", [r.grade, r.level], ["semipro", 2]);
}
{
  const r = scoreToGradeLevel(mk([3, 3, 3, 3, 3, 3, 2, 3]));
  check("프로 수준 → 프로", r.grade, "pro");
}

console.log("\n[2] 점수 게이트 (판독 충분)");
{
  // 화려한 항목 높고 기본기(transition) 1점 → semipro 불가
  const r = scoreToGradeLevel(mk([2, 2, 3, 1, 3, 3, 2, 2]));
  check("기본기 1점 → 아마추어 LV-3 강등", [r.grade, r.level], ["amateur", 3]);
  check("기본기 게이트 메시지", r.gateNote?.includes("기본기 게이트"), true);
  check("커버리지 캡 아님", r.coverageCapped, false);
}

console.log("\n[3] 커버리지 캡 — 점수 게이트보다 우선 (수정 검증)");
{
  // 관찰 6개지만 기본기 2개만 관찰됨 → "기본기 미달"이 아니라 "판독 부족" 메시지
  const r = scoreToGradeLevel(
    mk([2, 2, 2, 0, 2, 2, 2, 0], ["transition", "balance"]),
  );
  check("기본기 2/4 관찰 → 골린이 LV-3 상한", [r.grade, r.level], ["beginner", 3]);
  check("coverageCapped = true", r.coverageCapped, true);
  check(
    "메시지가 '판독 범위 부족' (기본기 실력 지적 아님)",
    r.gateNote?.includes("판독 범위 부족"),
    true,
  );
}
{
  // 관찰 5개 → 커버리지 캡
  const r = scoreToGradeLevel(
    mk([2, 2, 2, 0, 2, 0, 0, 0], ["transition", "finish", "tempo"]),
  );
  check("관찰 5/8 → 골린이 LV-3 상한", [r.grade, r.level], ["beginner", 3]);
  check("coverageCapped = true", r.coverageCapped, true);
}
{
  // 관찰 7개(기본기 4개 모두 관찰) + 상급 점수 → 세미프로 후보지만 8개 미만 → 아마추어 LV-3
  const r = scoreToGradeLevel(mk([2, 2, 3, 2, 2, 3, 0, 2], ["tempo"]));
  check(
    "관찰 7/8 상급 → 아마추어 LV-3 상한 (세미프로 불가)",
    [r.grade, r.level],
    ["amateur", 3],
  );
  check("coverageCapped = true", r.coverageCapped, true);
  check("메시지가 판독 범위", r.gateNote?.includes("판독 범위"), true);
}
{
  // 극단: 잘한 4개만 관찰 → 정규화 만점이어도 골린이 LV-3 상한 (인플레이션 탈출 차단)
  const r = scoreToGradeLevel(
    mk([3, 3, 3, 0, 3, 0, 0, 0], ["transition", "finish", "tempo", "balance"]),
  );
  check("관찰 4개 만점 → 골린이 LV-3 상한", [r.grade, r.level], ["beginner", 3]);
  check("정규화 가중점수는 30 (감점 없음)", r.weighted, 30);
  check("coverageCapped = true", r.coverageCapped, true);
}

console.log("\n[4] 커버리지 캡 시 게이지 모순 방지 (UI 계약)");
{
  // coverageCapped=true인 결과는 route/UI에서 성장 게이지를 숨겨야 한다.
  // 여기서는 "capped인데 weighted가 밴드 최상위"인 모순 조합이 실제 발생함을 고정한다.
  const r = scoreToGradeLevel(
    mk([3, 3, 3, 0, 3, 0, 0, 0], ["transition", "finish", "tempo", "balance"]),
  );
  const target = nextLevelTarget(r.weighted);
  check(
    "모순 조합 존재: 골린이 LV-3 + weighted 30 (게이지 숨김 필요)",
    r.grade === "beginner" && target.nextAt === null,
    true,
  );
}

console.log("\n[5] weightedTotal 정규화");
{
  check("전 항목 만점 = 30", weightedTotal(mk([3, 3, 3, 3, 3, 3, 3, 3])), 30);
  check("전 항목 0점 = 0", weightedTotal(mk([0, 0, 0, 0, 0, 0, 0, 0])), 0);
  const half = weightedTotal(mk([2, 2, 2, 2, 2, 2, 2, 2]));
  check("전 항목 2점 = 20 (2/3 지점)", half, 20);
}

console.log("\n[6] 과거 데이터 하위 호환 (observable 필드 없음)");
{
  const legacy: MechanicsScore[] = MECHANICS_DIMENSIONS.map((dim, i) => ({
    dim,
    score: [1, 1, 2, 1, 2, 2, 1, 1][i] as 0 | 1 | 2 | 3,
    note: "",
  }));
  const r = scoreToGradeLevel(legacy);
  check("observable 미지정 → 전 항목 관찰로 취급", r.observedCount, 8);
  check("등급 산출 정상", [r.grade, r.level], ["amateur", 1]);
}

if (failures > 0) {
  console.error(`\n${failures}개 실패`);
  process.exit(1);
}
console.log("\n모든 케이스 통과 ✅");
