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
  /** 해당 시점/부위가 영상에서 실제로 판독 가능했는지. 과거 기록은 undefined=true로 취급 */
  observable?: boolean;
  /** 판독 신뢰도 0~1. 관찰 불가이면 0 */
  confidence?: number;
  /** note가 인용한 관찰 출처: 부위별 분석관(lower/upper/axis) 또는 직접 관찰(direct) */
  evidenceSource?: "lower" | "upper" | "axis" | "direct" | null;
}

export interface VideoQualityReport {
  view: VideoView;
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  mainSwingFound: boolean;
  framing: "full" | "partial" | "unknown";
  clubVisible: boolean | null;
  ballVisible: boolean | null;
  stable: boolean | null;
  warnings: string[];
  passed: boolean;
}

export interface SwingPoint {
  title: string;
  detail: string;
  emphasis?: "key" | "normal";
  /** 이 진단의 관찰 근거 (프레임/위상/부위 인용). 약점 항목은 필수 */
  evidence?: string;
  /** 드릴 전용: 감별 트리의 서브타입명 (예: "시퀀스형"). 감별 불필요 시 "일반" */
  targetSubtype?: string;
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
  /** 개별성(바넘 테스트): 다른 골퍼에게 복사해도 성립하는 일반론이면 감점 */
  individuality?: number;
  drillFit: number;
  conciseness: number;
}

/** 신체 부위별 전문 분석관 보고서 */
export type BodyRegion = "lower" | "upper" | "axis";

export const BODY_REGION_LABEL: Record<BodyRegion, string> = {
  lower: "하체 (발·무릎·골반)",
  upper: "상체 (어깨·팔·손목)",
  axis: "축 (머리·척추각)",
};

export interface RegionReport {
  region: BodyRegion;
  /** 위상별 정형 관찰: { phase, item, value } */
  observations: { phase: string; item: string; value: string }[];
  /** 스윙 내 자기 비교 (어드레스 vs 임팩트 등) */
  selfComparisons: string[];
  /** 이 부위에서 발견된 특이사항 */
  flags: string[];
}

/** 지난 분석의 topFocus 숙제 검사 결과 */
export interface HomeworkCheck {
  previousFocus: string;
  verdict: "improved" | "same" | "regressed" | "not_observable";
  comment: string;
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
  /** 관찰 가능 항목을 8항목 기준으로 환산한 점수 (0~24) */
  mechanicsTotal: number;
  /** 관찰 가능 항목에 기본기 가중치 1.5배를 적용해 환산한 점수 (0~30) */
  mechanicsWeighted?: number;
  /** 실제 판독에 사용된 항목 수와 평균 신뢰도. capped=판독 부족으로 등급 상한 제한됨 */
  mechanicsCoverage?: {
    observed: number;
    total: number;
    averageConfidence: number;
    capped?: boolean;
  };
  /** 시점별 기술/시각 품질 사전 검사 */
  videoQuality?: VideoQualityReport[];
  /** 자기보정 단계에서 점수 조정이 있었는지 + 사유 */
  calibrationNote?: string;
  /** 부위별 전문 분석관 3인의 관찰 보고서 */
  regionReports?: RegionReport[];
  /** 지난 topFocus 숙제 검사 (이전 기록이 있을 때만) */
  homeworkCheck?: HomeworkCheck | null;
  /** 입력 품질(신뢰도·관찰 한계) 미달 시 잠정 등급 표시 */
  provisional?: boolean;
  provisionalReason?: string;
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
 * 가중 점수 계산: 관찰 가능 항목만 기본기 × 1.5, 나머지 × 1.0으로 계산한 뒤
 * 전체 30점 기준으로 정규화한다.
 * 최댓값 = 4×3×1.5 + 4×3×1.0 = 18 + 12 = 30
 */
export function weightedTotal(scores: MechanicsScore[]): number {
  const observed = scores.filter((s) => s.observable !== false);
  if (observed.length === 0) return 0;
  const earned = observed.reduce((sum, s) => {
    const w = FUNDAMENTAL_DIMS.includes(s.dim) ? 1.5 : 1.0;
    return sum + s.score * w;
  }, 0);
  const availableMax = observed.reduce(
    (sum, s) => sum + 3 * (FUNDAMENTAL_DIMS.includes(s.dim) ? 1.5 : 1.0),
    0,
  );
  return Math.round((earned / availableMax) * 30 * 10) / 10;
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
  observedCount: number;
  averageConfidence: number;
  /** 판독 범위 부족으로 등급 상한이 제한됐는지 (점수 문제가 아님) */
  coverageCapped: boolean;
} {
  // 과거 데이터에는 observable이 없으므로 관찰 가능으로 취급한다.
  const observed = scores.filter((s) => s.observable !== false);
  const observedCount = observed.length;
  const rawTotal = observed.reduce((s, m) => s + m.score, 0);
  const total = observedCount > 0
    ? Math.round((rawTotal / observedCount) * 8 * 10) / 10
    : 0;
  const weighted = weightedTotal(scores);
  const averageConfidence = observedCount > 0
    ? Math.round(
        (observed.reduce((sum, s) => sum + (s.confidence ?? 0.7), 0) / observedCount) * 100,
      ) / 100
    : 0;

  // 게이트 체크용 원본 점수 통계
  const fundamentals = observed.filter((s) => FUNDAMENTAL_DIMS.includes(s.dim));
  const fundOk = fundamentals.length === 4 && fundamentals.every((s) => s.score >= 2);
  const fundAllThree = fundamentals.length === 4 && fundamentals.every((s) => s.score === 3);
  const fundAtLeast1Count = fundamentals.filter((s) => s.score >= 1).length;
  const allDimsOk = observed.length === 8 && observed.every((s) => s.score >= 2);
  const numThrees = observed.filter((s) => s.score === 3).length;
  const numAtLeast1 = observed.filter((s) => s.score >= 1).length;

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

  // 2) 커버리지 캡 — 점수 게이트보다 먼저 검사한다.
  //    "안 보인 것"과 "못 하는 것"을 구분하기 위해, 판독 범위가 부족하면
  //    점수 기반 게이트를 평가하지 않고 상한만 제한한다 (감점 아님).
  let gateNote: string | undefined;
  let coverageCapped = false;

  if (observedCount < 6 || fundamentals.length < 3) {
    coverageCapped = true;
    if (grade !== "beginner") {
      grade = "beginner";
      level = 3;
    }
    gateNote = `판독 범위 부족(${observedCount}/8, 기본기 ${fundamentals.length}/4). 점수 감점 없이 골린이 LV-3 잠정 상한 적용.`;
  } else if (
    (observedCount < 8 || fundamentals.length < 4) &&
    (grade === "pro" || grade === "semipro")
  ) {
    coverageCapped = true;
    grade = "amateur";
    level = 3;
    gateNote = `상위 등급 확정에 필요한 판독 범위 부족(${observedCount}/8). 점수 감점 없이 아마추어 LV-3 잠정 상한 적용.`;
  }

  // 3) 점수 기반 하드 게이트 — 판독 범위가 충분할 때만 평가.
  //    커버리지 캡이 걸린 경우 "기본기 미달" 같은 실력 지적 메시지를 내면 안 된다.
  if (!coverageCapped) {
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
  }

  return {
    grade,
    level,
    total,
    weighted,
    gateNote,
    observedCount,
    averageConfidence,
    coverageCapped,
  };
}

/**
 * 성장 게이지: 현재 가중 점수에서 다음 단계 경계까지 남은 점수.
 * 등급은 엄격하게 유지하되, 세밀한 진척을 사용자에게 보여주기 위한 용도.
 */
export function nextLevelTarget(weighted: number): {
  nextAt: number | null;
  toNext: number | null;
  nextLabel: string | null;
} {
  const thresholds: { at: number; label: string }[] = [
    { at: 4, label: "골린이 LV-2" },
    { at: 7, label: "골린이 LV-3" },
    { at: 10, label: "아마추어 LV-1" },
    { at: 14, label: "아마추어 LV-2" },
    { at: 17, label: "아마추어 LV-3" },
    { at: 20, label: "세미프로 LV-1" },
    { at: 22, label: "세미프로 LV-2" },
    { at: 25, label: "세미프로 LV-3" },
    { at: 27, label: "프로 LV-1" },
    { at: 28, label: "프로 LV-2" },
    { at: 30, label: "프로 LV-3" },
  ];
  const next = thresholds.find((t) => weighted < t.at);
  if (!next) return { nextAt: null, toNext: null, nextLabel: null };
  return {
    nextAt: next.at,
    toNext: Math.round((next.at - weighted) * 10) / 10,
    nextLabel: next.label,
  };
}

export interface ProgressDelta {
  clubType: ClubType;
  previous?: { grade: Grade; level: Level; createdAt: string };
  current: { grade: Grade; level: Level; createdAt: string };
  direction: "up" | "down" | "same" | "new";
  note: string;
}
