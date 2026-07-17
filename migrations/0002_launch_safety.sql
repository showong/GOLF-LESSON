ALTER TABLE videos
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
  ADD COLUMN IF NOT EXISTS youtube_refreshed_at TIMESTAMPTZ;
