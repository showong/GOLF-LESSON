import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { v4 as uuidv4 } from "uuid";
import type {
  AnalysisRecord,
  ClubType,
  Grade,
  Level,
  ProgressDelta,
  SwingAnalysis,
} from "./types";
import { GRADE_ORDER } from "./types";

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (_db) return _db;
  const dbPath = process.env.SQLITE_PATH ?? "./data/golf-lesson.db";
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  _db = new Database(dbPath);
  _db.pragma("journal_mode = WAL");
  initSchema(_db);
  return _db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      nickname TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS analyses (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      club_type TEXT NOT NULL,
      grade TEXT NOT NULL,
      level INTEGER NOT NULL,
      one_line_summary TEXT NOT NULL,
      analysis_json TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_analyses_user_club
      ON analyses(user_id, club_type, created_at DESC);
  `);
}

export function getOrCreateUser(nickname: string): { id: string; nickname: string } {
  const db = getDb();
  const clean = nickname.trim();
  if (!clean) throw new Error("닉네임이 비어있습니다.");
  const existing = db
    .prepare("SELECT id, nickname FROM users WHERE nickname = ?")
    .get(clean) as { id: string; nickname: string } | undefined;
  if (existing) return existing;
  const id = uuidv4();
  db.prepare(
    "INSERT INTO users (id, nickname, created_at) VALUES (?, ?, ?)",
  ).run(id, clean, new Date().toISOString());
  return { id, nickname: clean };
}

export function saveAnalysis(
  userId: string,
  analysis: SwingAnalysis,
): AnalysisRecord {
  const db = getDb();
  const id = uuidv4();
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO analyses
       (id, user_id, created_at, club_type, grade, level, one_line_summary, analysis_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    userId,
    createdAt,
    analysis.clubType,
    analysis.grade,
    analysis.level,
    analysis.oneLineSummary,
    JSON.stringify(analysis),
  );
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
  created_at: string;
  club_type: ClubType;
  grade: Grade;
  level: number;
  one_line_summary: string;
  analysis_json: string;
};

function rowToRecord(row: Row): AnalysisRecord {
  return {
    id: row.id,
    userId: row.user_id,
    createdAt: row.created_at,
    clubType: row.club_type,
    grade: row.grade,
    level: row.level as Level,
    oneLineSummary: row.one_line_summary,
    analysis: JSON.parse(row.analysis_json) as SwingAnalysis,
  };
}

export function listHistory(userId: string): AnalysisRecord[] {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT * FROM analyses WHERE user_id = ? ORDER BY created_at DESC LIMIT 100",
    )
    .all(userId) as Row[];
  return rows.map(rowToRecord);
}

export function previousForClub(
  userId: string,
  clubType: ClubType,
  beforeIso?: string,
): AnalysisRecord | null {
  const db = getDb();
  const row = (
    beforeIso
      ? db
          .prepare(
            `SELECT * FROM analyses
             WHERE user_id = ? AND club_type = ? AND created_at < ?
             ORDER BY created_at DESC LIMIT 1`,
          )
          .get(userId, clubType, beforeIso)
      : db
          .prepare(
            `SELECT * FROM analyses
             WHERE user_id = ? AND club_type = ?
             ORDER BY created_at DESC LIMIT 1`,
          )
          .get(userId, clubType)
  ) as Row | undefined;
  return row ? rowToRecord(row) : null;
}

/** 같은 클럽의 최근 N개 전체 기록 (숙제 누적 추적용, 최신순) */
export function recentRecordsForClub(
  userId: string,
  clubType: ClubType,
  limit = 3,
): AnalysisRecord[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM analyses
       WHERE user_id = ? AND club_type = ?
       ORDER BY created_at DESC LIMIT ?`,
    )
    .all(userId, clubType, limit) as Row[];
  return rows.map(rowToRecord);
}

/**
 * 새 분석을 저장하기 직전, 같은 클럽의 가장 최근 기록을 요약해서
 * Gemini에게 컨텍스트로 넣어주기 위한 함수.
 */
export function recentSummaryForClub(
  userId: string,
  clubType: ClubType,
  limit = 3,
): { createdAt: string; grade: Grade; level: Level; oneLineSummary: string }[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT created_at, grade, level, one_line_summary
       FROM analyses
       WHERE user_id = ? AND club_type = ?
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(userId, clubType, limit) as {
    created_at: string;
    grade: Grade;
    level: number;
    one_line_summary: string;
  }[];
  return rows.map((r) => ({
    createdAt: r.created_at,
    grade: r.grade,
    level: r.level as Level,
    oneLineSummary: r.one_line_summary,
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
      current: {
        grade: current.grade,
        level: current.level,
        createdAt: current.createdAt,
      },
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
    previous: {
      grade: prev.grade,
      level: prev.level,
      createdAt: prev.createdAt,
    },
    current: {
      grade: current.grade,
      level: current.level,
      createdAt: current.createdAt,
    },
    direction,
    note,
  };
}

export function closeDb() {
  _db?.close();
  _db = null;
}
