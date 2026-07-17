import { v4 as uuidv4 } from "uuid";
import { query, withTransaction } from "./database";
import { extensionForMime, type UploadFileInput } from "./upload-policy";
import type { ClubType, VideoView } from "./types";

export type VideoStatus = "pending" | "uploaded" | "processing" | "ready" | "failed" | "deleted";
export interface VideoRow {
  id: string;
  userId: string;
  objectKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  view: VideoView;
  swingIndex: number;
  status: VideoStatus;
}

type VideoDbRow = {
  id: string;
  user_id: string;
  object_key: string;
  original_name: string;
  mime_type: string;
  size_bytes: string | number;
  view_type: VideoView;
  swing_index: number;
  status: VideoStatus;
};

function videoFromRow(row: VideoDbRow): VideoRow {
  return {
    id: row.id,
    userId: row.user_id,
    objectKey: row.object_key,
    originalName: row.original_name,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    view: row.view_type,
    swingIndex: row.swing_index,
    status: row.status,
  };
}

export async function consumeRateLimit(
  userId: string,
  action: "upload" | "analysis",
  limit: number,
  windowSeconds: number,
) {
  await withTransaction(async (db) => {
    // 사용자 행 잠금으로 같은 사용자의 병렬 요청이 제한을 우회하지 못하게 한다.
    const owner = await db.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [userId]);
    if (!owner.rows[0]) throw new Error("사용자를 찾을 수 없습니다.");
    const count = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM rate_limit_events
       WHERE user_id = $1 AND action = $2
         AND created_at >= NOW() - ($3::text || ' seconds')::interval`,
      [userId, action, windowSeconds],
    );
    if (Number(count.rows[0]?.count ?? 0) >= limit) {
      const error = new Error("요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.");
      (error as Error & { code?: string }).code = "RATE_LIMITED";
      throw error;
    }
    await db.query(
      "INSERT INTO rate_limit_events(id, user_id, action) VALUES ($1, $2, $3)",
      [uuidv4(), userId, action],
    );
  });
}

export async function createVideoReservations(
  userId: string,
  files: UploadFileInput[],
): Promise<VideoRow[]> {
  const rows: VideoRow[] = [];
  await withTransaction(async (db) => {
    for (const file of files) {
      const id = uuidv4();
      const objectKey = `users/${userId}/uploads/${id}${extensionForMime(file.type)}`;
      const result = await db.query<VideoDbRow>(
        `INSERT INTO videos
          (id, user_id, object_key, original_name, mime_type, size_bytes, view_type, swing_index)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [id, userId, objectKey, file.name, file.type, file.size, file.view, file.swingIndex],
      );
      rows.push(videoFromRow(result.rows[0]));
    }
  });
  return rows;
}

export async function getVideoForUser(userId: string, videoId: string): Promise<VideoRow | null> {
  const result = await query<VideoDbRow>(
    "SELECT * FROM videos WHERE id = $1 AND user_id = $2",
    [videoId, userId],
  );
  return result.rows[0] ? videoFromRow(result.rows[0]) : null;
}

export async function getVideosForUser(userId: string, videoIds: string[]): Promise<VideoRow[]> {
  if (videoIds.length === 0) return [];
  const result = await query<VideoDbRow>(
    "SELECT * FROM videos WHERE user_id = $1 AND id = ANY($2::text[])",
    [userId, videoIds],
  );
  return result.rows.map(videoFromRow);
}

export async function setVideoStatus(videoId: string, status: VideoStatus) {
  await query("UPDATE videos SET status = $2, updated_at = NOW() WHERE id = $1", [videoId, status]);
}

export interface AnalysisJobPayload {
  mode: "single" | "multi";
  clubHint?: ClubType;
  videos: Array<Pick<VideoRow, "id" | "objectKey" | "mimeType" | "view" | "swingIndex" | "sizeBytes">>;
  poseSide?: unknown;
  poseFront?: unknown;
}

export type JobStatus = "queued" | "processing" | "completed" | "failed";
export interface AnalysisJobRow {
  id: string;
  userId: string;
  status: JobStatus;
  mode: "single" | "multi";
  clubHint?: ClubType;
  payload: AnalysisJobPayload;
  resultAnalysisId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  attempts: number;
}

type JobDbRow = {
  id: string;
  user_id: string;
  status: JobStatus;
  mode: "single" | "multi";
  club_hint: ClubType | null;
  payload_json: AnalysisJobPayload | string;
  result_analysis_id: string | null;
  error_code: string | null;
  error_message: string | null;
  attempts: number;
};

function jobFromRow(row: JobDbRow): AnalysisJobRow {
  return {
    id: row.id,
    userId: row.user_id,
    status: row.status,
    mode: row.mode,
    clubHint: row.club_hint ?? undefined,
    payload: typeof row.payload_json === "string" ? JSON.parse(row.payload_json) : row.payload_json,
    resultAnalysisId: row.result_analysis_id,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    attempts: row.attempts,
  };
}

export async function createAnalysisJob(
  userId: string,
  idempotencyKey: string,
  payload: AnalysisJobPayload,
): Promise<{ job: AnalysisJobRow; created: boolean }> {
  const id = uuidv4();
  const result = await query<JobDbRow>(
    `INSERT INTO analysis_jobs
       (id, user_id, idempotency_key, mode, club_hint, payload_json)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     ON CONFLICT (user_id, idempotency_key) DO NOTHING
     RETURNING *`,
    [id, userId, idempotencyKey, payload.mode, payload.clubHint ?? null, JSON.stringify(payload)],
  );
  if (result.rows[0]) return { job: jobFromRow(result.rows[0]), created: true };
  const existing = await query<JobDbRow>(
    "SELECT * FROM analysis_jobs WHERE user_id = $1 AND idempotency_key = $2",
    [userId, idempotencyKey],
  );
  return { job: jobFromRow(existing.rows[0]), created: false };
}

export async function getJobByIdempotencyKey(
  userId: string,
  idempotencyKey: string,
): Promise<AnalysisJobRow | null> {
  const result = await query<JobDbRow>(
    "SELECT * FROM analysis_jobs WHERE user_id = $1 AND idempotency_key = $2",
    [userId, idempotencyKey],
  );
  return result.rows[0] ? jobFromRow(result.rows[0]) : null;
}

export async function getJobForUser(userId: string, jobId: string): Promise<AnalysisJobRow | null> {
  const result = await query<JobDbRow>(
    "SELECT * FROM analysis_jobs WHERE id = $1 AND user_id = $2",
    [jobId, userId],
  );
  return result.rows[0] ? jobFromRow(result.rows[0]) : null;
}

export async function claimJob(jobId: string): Promise<AnalysisJobRow | null> {
  const result = await query<JobDbRow>(
    `UPDATE analysis_jobs SET status = 'processing', started_at = NOW(), attempts = attempts + 1
     WHERE id = $1 AND status = 'queued'
     RETURNING *`,
    [jobId],
  );
  return result.rows[0] ? jobFromRow(result.rows[0]) : null;
}

export async function completeJob(jobId: string, analysisId: string) {
  await query(
    `UPDATE analysis_jobs SET status = 'completed', result_analysis_id = $2,
       completed_at = NOW(), error_code = NULL, error_message = NULL WHERE id = $1`,
    [jobId, analysisId],
  );
}

export async function failJob(jobId: string, code: string, message: string) {
  await query(
    `UPDATE analysis_jobs SET status = 'failed', error_code = $2, error_message = $3,
       completed_at = NOW() WHERE id = $1`,
    [jobId, code.slice(0, 80), message.slice(0, 500)],
  );
}

export async function getJob(jobId: string): Promise<AnalysisJobRow | null> {
  const result = await query<JobDbRow>("SELECT * FROM analysis_jobs WHERE id = $1", [jobId]);
  return result.rows[0] ? jobFromRow(result.rows[0]) : null;
}
