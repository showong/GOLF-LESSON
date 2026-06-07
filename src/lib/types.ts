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

export interface VideoRecommendation {
  videoId: string;
  title: string;
  channelTitle: string;
  channelId: string;
  thumbnailUrl: string;
  publishedAt: string;
  url: string;
  isWhitelisted: boolean;
  matchedQuery: string;
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
  /** 8항목 0~3점 원본 합계 (0~24). UI에서 항목별 점수 합으로 표시 */
  mechanicsTotal: number;
  /** 기본기 가중치 1.5배 적용 합계 (0~30). 등급 판정에 사용 */
  mechanicsWeighted?: number;
  /** 자기보정 단계에서 점수 조정이 있었는지 + 사유 */
  calibrationNote?: string;
  topFocus: SwingFocus;
  strengths: SwingPoint[];
  weaknesses: SwingPoint[];
  drills: SwingPoint[];
  coachMessage: string;
  oneLineSummary: string;
  review: ReviewResult;
  /** 약점/포커스 키워드 기반 YouTube 추천 영상 (화이트리스트 우선) */
  recommendations?: VideoRecommendation[];
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

/** 기본기 4항목(가중치 1.5배). 화려한 4항목은 1.0배 */
const FUNDAMENTAL_DIMS: MechanicsDim[] = [
  "address",
  "takeaway",
  "transition",
  "balance",
];

/**
 * 가중 점수 계산: 기본기 4항목 × 1.5 + 화려한 4항목 × 1.0
 * 최댓값 = 4×3×1.5 + 4×3×1.0 = 18 + 12 = 30
 */
export function weightedTotal(scores: MechanicsScore[]): number {
  return scores.reduce((sum, s) => {
    const w = FUNDAMENTAL_DIMS.includes(s.dim) ? 1.5 : 1.0;
    return sum + s.score * w;
  }, 0);
}

/**
 * 가중 점수 → 등급/단계 매핑.
 *
 * [개편: 가중 채점(기본기 1.5배) + 인구분포 비대칭 밴드 + 강한 게이트]
 *  - 한국 골퍼 분포: 골린이 60% / 아마추어 32% / 세미프로 7% / 프로 1%
 *  - 밴드(가중 0~30):
 *    · 골린이 : 0-9  (10폭)  ← 입문/평균 이하
 *    · 아마추어: 10-19 (10폭) ← 가장 넓은 밴드. 일반 주말 골퍼
 *    · 세미프로: 20-26 (7폭)  ← 싱글 핸디캡
 *    · 프로  : 27-30 (4폭)  ← 거의 도달 불가
 *  - 강한 하드 게이트 (원본 0~3 점수 기준):
 *    · pro: 8항목 모두 ≥2 + 3점 4개↑ + 기본기 모두 = 3. 미달 시 semipro LV-3
 *    · semipro/pro: 기본기 4항목 모두 ≥2점 필요. 미달 시 amateur LV-3
 *    · amateur: 기본기 3개↑가 ≥1점 + 8항목 중 ≥1점 4개↑. 미달 시 beginner LV-3
 */
export function scoreToGradeLevel(
  scores: MechanicsScore[],
): {
  grade: Grade;
  level: Level;
  total: number;
  weighted: number;
  gateNote?: string;
} {
  const total = scores.reduce((s, m) => s + m.score, 0);
  const weighted = weightedTotal(scores);

  // 게이트 체크용 원본 점수 통계
  const fundamentals = scores.filter((s) => FUNDAMENTAL_DIMS.includes(s.dim));
  const fundOk = fundamentals.every((s) => s.score >= 2);
  const fundAllThree = fundamentals.every((s) => s.score === 3);
  const fundAtLeast1Count = fundamentals.filter((s) => s.score >= 1).length;
  const allDimsOk = scores.every((s) => s.score >= 2);
  const numThrees = scores.filter((s) => s.score === 3).length;
  const numAtLeast1 = scores.filter((s) => s.score >= 1).length;

  // 1) 가중 점수로 기본 등급/단계 산출
  let grade: Grade;
  let level: Level;
  const w = Math.floor(weighted);
  if (w < 10) {
    grade = "beginner";
    level = (w <= 3 ? 1 : w <= 6 ? 2 : 3) as Level;
  } else if (w < 20) {
    grade = "amateur";
    level = (w <= 13 ? 1 : w <= 16 ? 2 : 3) as Level;
  } else if (w < 27) {
    grade = "semipro";
    level = (w <= 21 ? 1 : w <= 24 ? 2 : 3) as Level;
  } else {
    grade = "pro";
    level = (w <= 27 ? 1 : w <= 29 ? 2 : 3) as Level;
  }

  // 2) 강한 하드 게이트
  let gateNote: string | undefined;
  if (grade === "pro" && (!allDimsOk || numThrees < 4 || !fundAllThree)) {
    grade = "semipro";
    level = 3;
    gateNote =
      "프로 게이트 미달(8항목 ≥2 + 3점 4개↑ + 기본기 모두 3점 필요). 세미프로 LV-3로 조정.";
  }
  if ((grade === "pro" || grade === "semipro") && !fundOk) {
    grade = "amateur";
    level = 3;
    gateNote =
      "기본기 게이트 미달(★ 4항목 모두 ≥2점 필요). 아마추어 LV-3로 조정.";
  }
  if (grade === "amateur" && (numAtLeast1 < 4 || fundAtLeast1Count < 3)) {
    grade = "beginner";
    level = 3;
    gateNote =
      "아마추어 게이트 미달(기본기 3개↑가 ≥1점 + 8항목 중 ≥1점 4개↑ 필요). 골린이 LV-3로 조정.";
  }

  return { grade, level, total, weighted, gateNote };
}

export interface ProgressDelta {
  clubType: ClubType;
  previous?: { grade: Grade; level: Level; createdAt: string };
  current: { grade: Grade; level: Level; createdAt: string };
  direction: "up" | "down" | "same" | "new";
  note: string;
}
