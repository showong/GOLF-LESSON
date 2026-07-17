import { v4 as uuidv4 } from "uuid";
import { query } from "./database";
import type {
  AnalysisRecord,
  ClubType,
  Grade,
  Level,
  ProgressDelta,
  SwingAnalysis,
} from "./types";
import { GRADE_ORDER } from "./types";

type UserRow = { id: string; nickname: string };

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export async function getUserById(
  userId: string,
): Promise<{ id: string; nickname: string } | null> {
  const result = await query<UserRow>(
    "SELECT id, nickname FROM users WHERE id = $1",
    [userId],
  );
  return result.rows[0] ?? null;
}

export async function getOrCreateUser(
  userId: string,
  nickname: string,
): Promise<{ id: string; nickname: string }> {
  const clean = nickname.trim().slice(0, 40);
  if (!clean) throw new Error("닉네임이 비어있습니다.");
  const result = await query<UserRow>(
    `INSERT INTO users (id, nickname)
     VALUES ($1, $2)
     ON CONFLICT (id) DO UPDATE
       SET nickname = EXCLUDED.nickname, updated_at = NOW()
     RETURNING id, nickname`,
    [userId, clean],
  );
  return result.rows[0];
}

export async function saveAnalysis(
  userId: string,
  analysis: SwingAnalysis,
): Promise<AnalysisRecord> {
  const id = uuidv4();
  const result = await query<{ created_at: string | Date }>(
    `INSERT INTO analyses
       (id, user_id, club_type, grade, level, one_line_summary, analysis_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     RETURNING created_at`,
    [
      id,
      userId,
      analysis.clubType,
      analysis.grade,
      analysis.level,
      analysis.oneLineSummary,
      JSON.stringify(analysis),
    ],
  );
  const createdAt = iso(result.rows[0].created_at);
  return {
    id,
    userId,
    createdAt,
    clubType: analysis.clubType,
    grade: analysis.grade,
    level: analysis.level,
    oneLineSummary: analysis.oneLineSummary,
    analysis,
  };
}

type Row = {
  id: string;
  user_id: string;
  created_at: string | Date;
  club_type: ClubType;
  grade: Grade;
  level: number;
  one_line_summary: string;
  analysis_json: SwingAnalysis | string;
};

function rowToRecord(row: Row): AnalysisRecord {
  return {
    id: row.id,
    userId: row.user_id,
    createdAt: iso(row.created_at),
    clubType: row.club_type,
    grade: row.grade,
    level: row.level as Level,
    oneLineSummary: row.one_line_summary,
    analysis:
      typeof row.analysis_json === "string"
        ? (JSON.parse(row.analysis_json) as SwingAnalysis)
        : row.analysis_json,
  };
}

export async function getAnalysisForUser(
  userId: string,
  analysisId: string,
): Promise<AnalysisRecord | null> {
  const result = await query<Row>(
    "SELECT * FROM analyses WHERE id = $1 AND user_id = $2",
    [analysisId, userId],
  );
  return result.rows[0] ? rowToRecord(result.rows[0]) : null;
}

export async function listHistory(userId: string): Promise<AnalysisRecord[]> {
  const result = await query<Row>(
    "SELECT * FROM analyses WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100",
    [userId],
  );
  return result.rows.map(rowToRecord);
}

export async function previousForClub(
  userId: string,
  clubType: ClubType,
  beforeIso?: string,
): Promise<AnalysisRecord | null> {
  const result = await query<Row>(
    beforeIso
      ? `SELECT * FROM analyses
         WHERE user_id = $1 AND club_type = $2 AND created_at < $3
         ORDER BY created_at DESC LIMIT 1`
      : `SELECT * FROM analyses
         WHERE user_id = $1 AND club_type = $2
         ORDER BY created_at DESC LIMIT 1`,
    beforeIso ? [userId, clubType, beforeIso] : [userId, clubType],
  );
  return result.rows[0] ? rowToRecord(result.rows[0]) : null;
}

export async function recentRecordsForClub(
  userId: string,
  clubType: ClubType,
  limit = 3,
): Promise<AnalysisRecord[]> {
  const result = await query<Row>(
    `SELECT * FROM analyses
     WHERE user_id = $1 AND club_type = $2
     ORDER BY created_at DESC LIMIT $3`,
    [userId, clubType, limit],
  );
  return result.rows.map(rowToRecord);
}

export async function recentSummaryForClub(
  userId: string,
  clubType: ClubType,
  limit = 3,
): Promise<{ createdAt: string; grade: Grade; level: Level; oneLineSummary: string }[]> {
  const result = await query<{
    created_at: string | Date;
    grade: Grade;
    level: number;
    one_line_summary: string;
  }>(
    `SELECT created_at, grade, level, one_line_summary
     FROM analyses WHERE user_id = $1 AND club_type = $2
     ORDER BY created_at DESC LIMIT $3`,
    [userId, clubType, limit],
  );
  return result.rows.map((row) => ({
    createdAt: iso(row.created_at),
    grade: row.grade,
    level: row.level as Level,
    oneLineSummary: row.one_line_summary,
  }));
}

function gradeRank(grade: Grade, level: Level): number {
  return GRADE_ORDER.indexOf(grade) * 3 + (level - 1);
}

export function computeDelta(
  prev: AnalysisRecord | null,
  current: AnalysisRecord,
): ProgressDelta {
  if (!prev) {
    return {
      clubType: current.clubType,
      current: { grade: current.grade, level: current.level, createdAt: current.createdAt },
      direction: "new",
      note: "이 클럽으로는 첫 분석이에요. 다음 영상부터 변화 추이를 보여드릴게요.",
    };
  }
  const prevRank = gradeRank(prev.grade, prev.level);
  const curRank = gradeRank(current.grade, current.level);
  let direction: ProgressDelta["direction"] = "same";
  let note = "지난번과 비슷한 수준이에요. 같은 부분을 한 단계 더 다듬어봐요.";
  if (curRank > prevRank) {
    direction = "up";
    note = "지난번보다 등급/단계가 올라갔어요. 좋은 흐름입니다.";
  } else if (curRank < prevRank) {
    direction = "down";
    note = "지난번보다 살짝 흔들렸어요. 컨디션·셋업부터 다시 점검해봐요.";
  }
  return {
    clubType: current.clubType,
    previous: { grade: prev.grade, level: prev.level, createdAt: prev.createdAt },
    current: { grade: current.grade, level: current.level, createdAt: current.createdAt },
    direction,
    note,
  };
}
