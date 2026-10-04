import { query, withTransaction } from "./database";
import {
  INACTIVE_ACCOUNT_RETENTION_DAYS,
  RATE_LIMIT_RETENTION_DAYS,
  VIDEO_RETENTION_DAYS,
} from "./legal";
import { deleteStoredObject, deleteUserObjects } from "./storage";

/**
 * 사용자의 영상 파일과 모든 DB 기록(영상·분석·작업·요청 제한)을 삭제한다.
 * 파일을 먼저 지워 DB 기록 없이 파일만 남는 일이 없게 한다. 중간에 실패해도 다시 호출하면 이어서 정리된다.
 */
export async function deleteUserData(userId: string) {
  await deleteUserObjects(userId);
  await query("DELETE FROM users WHERE id = $1", [userId]);
}

export interface RetentionReport {
  skipped: boolean;
  expiredVideos: number;
  inactiveUsers: number;
  rateLimitEvents: number;
}

const BATCH_SIZE = 200;

/**
 * 개인정보처리방침의 보유 기간을 집행한다. 여러 Worker가 동시에 실행해도
 * advisory lock으로 한 곳에서만 돌며, 한 번에 BATCH_SIZE씩 처리한다.
 */
export async function runRetention(): Promise<RetentionReport> {
  return withTransaction(async (db) => {
    const lock = await db.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_xact_lock(hashtext('golf-retention')) AS locked",
    );
    if (!lock.rows[0]?.locked) {
      return { skipped: true, expiredVideos: 0, inactiveUsers: 0, rateLimitEvents: 0 };
    }

    // 분석 중인 영상은 건드리지 않되, Worker 중단으로 하루 넘게 멈춘 영상은 정리한다.
    // 분석 기록(요약)은 남기고 원본 파일만 지운다.
    const expired = await db.query<{ id: string; object_key: string }>(
      `SELECT id, object_key FROM videos
       WHERE status <> 'deleted'
         AND (status <> 'processing' OR updated_at < NOW() - INTERVAL '1 day')
         AND created_at < NOW() - ($1::text || ' days')::interval
       ORDER BY created_at
       LIMIT $2`,
      [VIDEO_RETENTION_DAYS, BATCH_SIZE],
    );
    for (const video of expired.rows) {
      await deleteStoredObject(video.object_key);
      await db.query("UPDATE videos SET status = 'deleted', updated_at = NOW() WHERE id = $1", [
        video.id,
      ]);
    }

    // users.updated_at은 방문·업로드 때마다 갱신되므로 마지막 이용 시각으로 쓴다.
    const inactive = await db.query<{ id: string }>(
      `SELECT id FROM users
       WHERE updated_at < NOW() - ($1::text || ' days')::interval
       ORDER BY updated_at
       LIMIT $2`,
      [INACTIVE_ACCOUNT_RETENTION_DAYS, BATCH_SIZE],
    );
    for (const user of inactive.rows) {
      await deleteUserObjects(user.id);
      await db.query("DELETE FROM users WHERE id = $1", [user.id]);
    }

    const userEvents = await db.query(
      "DELETE FROM rate_limit_events WHERE created_at < NOW() - ($1::text || ' days')::interval",
      [RATE_LIMIT_RETENTION_DAYS],
    );
    const sharedEvents = await db.query(
      "DELETE FROM shared_rate_limit_events WHERE created_at < NOW() - ($1::text || ' days')::interval",
      [RATE_LIMIT_RETENTION_DAYS],
    );

    return {
      skipped: false,
      expiredVideos: expired.rows.length,
      inactiveUsers: inactive.rows.length,
      rateLimitEvents: (userEvents.rowCount ?? 0) + (sharedEvents.rowCount ?? 0),
    };
  });
}
