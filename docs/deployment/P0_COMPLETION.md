# P0 배포 안전 작업 결과

기준 브랜치: `codex/golf-lesson-app-foundation`

## 코드에서 완료한 항목

- Next.js 16.2.10, UUID 14, PostCSS 8.5.10 및 `@google/genai` 고정
- PostgreSQL 순차 마이그레이션과 로컬 PGlite의 동일 SQL 검증
- 서명된 사용자 ID 기반 video/job/history 소유권 쿼리
- Railway Bucket presigned 직접 업로드와 크기·MIME·개수·시점 중복 검증
- Redis/BullMQ Worker 분리, DB 원자 claim, idempotency key, stalled job 제한
- 사용자·요청별 속도 제한과 분석 본문 크기 제한
- 업로드 후 실제 영상 길이·해상도·fps 검사와 FFmpeg 프로세스 시간 제한
- 운영 환경 필수 설정 fail-fast 검증과 DB·Redis·Bucket health check
- 초대 코드 SHA-256 및 HttpOnly 승인 쿠키 기반 비공개 파일럿 접근
- 이용약관·개인정보·영상 권리·18세 확인과 선택적 모델 개선 동의 분리
- 사용자 전체 데이터 삭제와 원본 영상 보존기한/Cron 정리 작업
- YouTube 추천 기본 비활성화 및 핵심 분석 완료 후 보강 처리
- `ffmpeg-static` 제거, FFmpeg 8.1.2 공식 소스의 LGPL 전용 컨테이너 빌드
- 다단계/non-root 이미지와 standalone 환경파일·소스·문서 제거 허용 목록
- 보안 헤더, 라이선스 검사, THIRD_PARTY_NOTICES 및 CycloneDX SBOM 생성

## Railway에서 완료해야 하는 운영 연결

- 별도 web/worker/cleanup 서비스 및 PostgreSQL/Redis/Bucket 생성
- `.env.example`의 운영 필수 변수와 service reference variable 등록
- Bucket CORS origin을 실제 web 도메인 한 개로 제한
- cleanup 서비스를 하루 한 번 실행하는 Cron 등록
- 유료 Gemini 프로젝트 키 확인
- Railway Docker 빌드에서 LGPL FFmpeg 기능 검사와 전체 테스트 통과 확인
- 개인정보처리방침의 사업자 정보와 국외 이전 문구에 대한 최종 법률 검토

운영 인프라 자격증명은 저장소에 커밋하지 않으며 Railway 변수로만 주입한다.
