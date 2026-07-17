// 운영 마이그레이션의 로컬 PGlite용 번들 사본입니다.
// SQL 파일을 동적으로 읽으면 Next.js NFT가 프로젝트 전체를 추적하므로 명시적으로 번들합니다.
export const LOCAL_MIGRATIONS = [
  {
    name: "0001_deployment_foundation.sql",
    sql: `CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  nickname TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0),
  view_type TEXT NOT NULL CHECK (view_type IN ('side', 'front')),
  swing_index INTEGER NOT NULL DEFAULT 0 CHECK (swing_index BETWEEN 0 AND 2),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'uploaded', 'processing', 'ready', 'failed', 'deleted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_videos_user_created
  ON videos(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS analyses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  club_type TEXT NOT NULL,
  grade TEXT NOT NULL,
  level INTEGER NOT NULL,
  one_line_summary TEXT NOT NULL,
  analysis_json JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_analyses_user_club
  ON analyses(user_id, club_type, created_at DESC);

CREATE TABLE IF NOT EXISTS analysis_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  mode TEXT NOT NULL CHECK (mode IN ('single', 'multi')),
  club_hint TEXT,
  payload_json JSONB NOT NULL,
  result_analysis_id TEXT REFERENCES analyses(id) ON DELETE SET NULL,
  error_code TEXT,
  error_message TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  UNIQUE(user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_jobs_user_created
  ON analysis_jobs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_status_created
  ON analysis_jobs(status, created_at);

CREATE TABLE IF NOT EXISTS rate_limit_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_user_action_created
  ON rate_limit_events(user_id, action, created_at DESC);

CREATE TABLE IF NOT EXISTS schema_migrations (
  name TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`,
  },
  {
    name: "0002_launch_safety.sql",
    sql: `ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

UPDATE videos
SET expires_at = created_at + INTERVAL '30 days'
WHERE expires_at IS NULL;

ALTER TABLE videos
  ALTER COLUMN expires_at SET DEFAULT (NOW() + INTERVAL '30 days'),
  ALTER COLUMN expires_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_videos_expiry_status
  ON videos(expires_at, status)
  WHERE status <> 'deleted';

CREATE TABLE IF NOT EXISTS user_consents (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  terms_version TEXT NOT NULL,
  privacy_version TEXT NOT NULL,
  terms_accepted BOOLEAN NOT NULL,
  privacy_accepted BOOLEAN NOT NULL,
  service_analysis_accepted BOOLEAN NOT NULL,
  age_18_confirmed BOOLEAN NOT NULL,
  video_rights_confirmed BOOLEAN NOT NULL,
  model_improvement_consent BOOLEAN NOT NULL DEFAULT FALSE,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  withdrawn_at TIMESTAMPTZ
);

ALTER TABLE analyses
  ADD COLUMN IF NOT EXISTS youtube_refreshed_at TIMESTAMPTZ;`,
  },
] as const;

