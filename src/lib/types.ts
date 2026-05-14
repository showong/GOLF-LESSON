export type ClubType = "driver" | "iron" | "approach";

export const CLUB_LABEL: Record<ClubType, string> = {
  driver: "드라이버",
  iron: "아이언",
  approach: "어프로치",
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

export interface SwingAnalysis {
  clubType: ClubType;
  clubConfidence: number;
  clubCues: string[];
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
 * 8개 항목 × 0~3점 = 0~24점. 점수를 등급/단계로 결정적으로 매핑한다.
 * 같은 점수면 항상 같은 등급/단계가 나오도록 보장한다.
 */
export function scoreToGradeLevel(total: number): { grade: Grade; level: Level } {
  const t = Math.max(0, Math.min(24, Math.round(total)));
  // beginner 0-5, amateur 6-11, semipro 12-17, pro 18-24
  // 각 등급 내부에서 3단계로 나눔
  const buckets: { grade: Grade; min: number; max: number; level: Level }[] = [
    { grade: "beginner", min: 0,  max: 1,  level: 1 },
    { grade: "beginner", min: 2,  max: 3,  level: 2 },
    { grade: "beginner", min: 4,  max: 5,  level: 3 },
    { grade: "amateur",  min: 6,  max: 7,  level: 1 },
    { grade: "amateur",  min: 8,  max: 9,  level: 2 },
    { grade: "amateur",  min: 10, max: 11, level: 3 },
    { grade: "semipro",  min: 12, max: 13, level: 1 },
    { grade: "semipro",  min: 14, max: 15, level: 2 },
    { grade: "semipro",  min: 16, max: 17, level: 3 },
    { grade: "pro",      min: 18, max: 19, level: 1 },
    { grade: "pro",      min: 20, max: 21, level: 2 },
    { grade: "pro",      min: 22, max: 24, level: 3 },
  ];
  const b = buckets.find((b) => t >= b.min && t <= b.max)!;
  return { grade: b.grade, level: b.level };
}

export interface ProgressDelta {
  clubType: ClubType;
  previous?: { grade: Grade; level: Level; createdAt: string };
  current: { grade: Grade; level: Level; createdAt: string };
  direction: "up" | "down" | "same" | "new";
  note: string;
}
