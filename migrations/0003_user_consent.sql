-- 이용약관·개인정보처리방침(국외 이전 포함), 만 18세 이상, 영상 권리 보증에 대한 동의 기록.
ALTER TABLE users ADD COLUMN IF NOT EXISTS consented_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS consent_terms_version TEXT;
