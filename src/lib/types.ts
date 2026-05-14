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

export interface ProgressDelta {
  clubType: ClubType;
  previous?: { grade: Grade; level: Level; createdAt: string };
  current: { grade: Grade; level: Level; createdAt: string };
  direction: "up" | "down" | "same" | "new";
  note: string;
}
