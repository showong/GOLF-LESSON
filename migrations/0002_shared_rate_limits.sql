-- 사용자 ID(쿠키)와 무관한 요청 제한: IP 해시별 제한과 서비스 전체 일일 상한.
-- IP 원문은 저장하지 않고 HMAC 해시만 보관한다.
CREATE TABLE IF NOT EXISTS shared_rate_limit_events (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  action TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shared_rate_limit_subject_action_created
  ON shared_rate_limit_events(subject, action, created_at DESC);
