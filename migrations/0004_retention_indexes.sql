-- 보관 기간 정리 작업(src/lib/retention.ts)이 전체 테이블을 훑지 않도록 하는 인덱스.
CREATE INDEX IF NOT EXISTS idx_videos_created ON videos(created_at);
CREATE INDEX IF NOT EXISTS idx_users_updated ON users(updated_at);
CREATE INDEX IF NOT EXISTS idx_rate_limit_created ON rate_limit_events(created_at);
CREATE INDEX IF NOT EXISTS idx_shared_rate_limit_created ON shared_rate_limit_events(created_at);
