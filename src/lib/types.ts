export type ClubType = "driver" | "iron" | "approach";

export const CLUB_LABEL: Record<ClubType, string> = {
  driver: "드라이버",
  iron: "아이언",
  approach: "어프로치",
};

export type VideoView = "side" | "front";

export const VIDEO_VIEW_LABEL: Record<VideoView, string> = {
  side: "측면샷",
  front: "정면샷",
};

export type Grade = "beginner" | "amateur" | "semipro" | "pro";

export const GRADE_LABEL: Record<Grade, string> = {
  beginner: "골린이",
  amateur: "아마추어",
  semipro: "세미프로",
  pro: "프로",
};

export const GRADE_ORDER: Grade[] = ["beginner", "amateur", "semipro", "pro"];

export type Level = 1 | 2 | 3;

export const MECHANICS_DIMENSIONS = [
  "address",
  "takeaway",
  "top",
  "transition",
  "impact",
  "finish",
  "tempo",
  "balance",
] as const;

export type MechanicsDim = (typeof MECHANICS_DIMENSIONS)[number];

export const MECHANICS_LABEL: Record<MechanicsDim, string> = {
  address: "어드레스/셋업",
  takeaway: "테이크어웨이·백스윙 플레인",
  top: "탑 포지션",
  transition: "전환·다운스윙 시퀀스",
  impact: "임팩트",
  finish: "팔로우스루·피니시",
  tempo: "템포·리듬",
  balance: "밸런스·축 안정성",
};

export interface MechanicsScore {
  dim: MechanicsDim;
  score: 0 | 1 | 2 | 3;
  note: string;
}

export interface SwingPoint {
  title: string;
  detail: string;
  emphasis?: "key" | "normal";
}

export interface SwingFocus {
  title: string;
  detail: string;
  why: string;
}

export interface ReviewBreakdown {
  gradeMatch: number;
  clubSpecific: number;
  mechanicsAlignment: number;
  drillFit: number;
  conciseness: number;
}

export interface ReviewResult {
  score: number;
  passed: boolean;
  feedback: string;
  attemptCount: number;
  breakdown: ReviewBreakdown;
}

export interface SwingAnalysis {
  /** 이 분석에 사용된 영상 시점들 */
  views?: VideoView[];
  clubType: ClubType;
  clubConfidence: number;
  clubCues: string[];
  /** 헤드코치가 채운 정형 관찰 표 (클럽 인식 단서, 디버깅·투명성용) */
  clubObservations?: Record<string, string>;
  /** 단서 투표 점수: { driver, iron, approach } */
  clubScores?: Record<ClubType, number>;
  grade: Grade;
  level: Level;
  gradeRationale: string;
  mechanicsScores: MechanicsScore[];
  mechanicsTotal: number;
  topFocus: SwingFocus;
  strengths: SwingPoint[];
  weaknesses: SwingPoint[];
  drills: SwingPoint[];
  coachMessage: string;
  oneLineSummary: string;
  review: ReviewResult;
}

export interface AnalysisRecord {
  id: string;
  userId: string;
  createdAt: string;
  clubType: ClubType;
  grade: Grade;
  level: Level;
  oneLineSummary: string;
  analysis: SwingAnalysis;
}

/**
 * 8개 항목 × 0~3점 = 0~24점.
 *
 * [강화된 매핑 — 너무 후한 등급 부여 방지]
 *  - 등급 밴드를 한 단계씩 위로 push (amateur는 8점부터, semipro는 14점부터, pro는 20점부터)
 *  - 하드 게이트로 핵심 조건 미달 시 자동 강등:
 *    · pro: 8항목 모두 ≥2점 + 3점이 4개 이상 필요. 미달 시 semipro LV-3
 *    · semipro/pro: 기본기 4항목(★) 모두 ≥2점 필요. 미달 시 amateur LV-3
 *    · amateur: 8항목 중 ≥1점이 4개 이상 필요. 미달 시 beginner LV-3
 *  - 합계가 높아도 기본기 한 항목이라도 1점이면 semipro/pro 절대 불가.
 */
export function scoreToGradeLevel(
  scores: MechanicsScore[],
): { grade: Grade; level: Level; total: number; gateNote?: string } {
  const total = scores.reduce((s, m) => s + m.score, 0);

  const fundamentals: MechanicsDim[] = ["address", "takeaway", "transition", "balance"];
  const fundOk = scores
    .filter((s) => fundamentals.includes(s.dim))
    .every((s) => s.score >= 2);
  const allDimsOk = scores.every((s) => s.score >= 2);
  const numThrees = scores.filter((s) => s.score === 3).length;
  const numAtLeast1 = scores.filter((s) => s.score >= 1).length;

  // 1) 합계로 기본 등급 산출 (강화된 밴드)
  let grade: Grade;
  let level: Level;
  if (total <= 7) {
    grade = "beginner";
    level = (total <= 2 ? 1 : total <= 5 ? 2 : 3) as Level;
  } else if (total <= 13) {
    grade = "amateur";
    level = (total <= 9 ? 1 : total <= 11 ? 2 : 3) as Level;
  } else if (total <= 19) {
    grade = "semipro";
    level = (total <= 15 ? 1 : total <= 17 ? 2 : 3) as Level;
  } else {
    grade = "pro";
    level = (total <= 21 ? 1 : total <= 22 ? 2 : 3) as Level;
  }

  // 2) 하드 게이트 (위에서 아래로 검사)
  let gateNote: string | undefined;
  if (grade === "pro" && (!allDimsOk || numThrees < 4)) {
    grade = "semipro";
    level = 3;
    gateNote = "프로 게이트 미달(8항목 ≥2 + 3점 4개↑ 필요). 세미프로 LV-3로 조정.";
  }
  if ((grade === "pro" || grade === "semipro") && !fundOk) {
    grade = "amateur";
    level = 3;
    gateNote = "기본기 게이트 미달(★ 4항목 모두 ≥2 필요). 아마추어 LV-3로 조정.";
  }
  if (grade === "amateur" && numAtLeast1 < 4) {
    grade = "beginner";
    level = 3;
    gateNote = "아마추어 게이트 미달(≥1점 4개↑ 필요). 골린이 LV-3로 조정.";
  }

  return { grade, level, total, gateNote };
}

export interface ProgressDelta {
  clubType: ClubType;
  previous?: { grade: Grade; level: Level; createdAt: string };
  current: { grade: Grade; level: Level; createdAt: string };
  direction: "up" | "down" | "same" | "new";
  note: string;
}
