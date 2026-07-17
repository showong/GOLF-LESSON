# Railway 배포 구성

한 Railway 프로젝트에 다음 서비스를 둔다.

1. `web`: 이 저장소의 Dockerfile, 시작 명령 `npm run start`
2. `worker`: 같은 저장소/이미지, 시작 명령 `npm run worker`
3. `cleanup`: 같은 저장소/이미지, 시작 명령 `npm run storage:cleanup`, 매일 Cron
4. PostgreSQL
5. Redis
6. 비공개 Storage Bucket

## 필수 연결

- web과 worker 모두 `DATABASE_URL`, `REDIS_URL`, Gemini 및 Bucket 변수를 공유한다.
- web은 `QUEUE_MODE=redis`, `STORAGE_MODE=s3`를 사용한다.
- worker는 외부 도메인을 만들지 않고 private network만 사용한다.
- web의 pre-deploy 명령은 `npm run db:migrate`다.
- worker 동시성은 초기 `WORKER_CONCURRENCY=1`로 시작한다.
- worker 설정 파일은 `railway.worker.json`, cleanup은 `railway.cleanup.json`을 지정한다.
- cleanup 서비스는 하루 한 번 실행하고 `VIDEO_RETENTION_DAYS`가 지난 원본 영상을 삭제한다.

## 운영 필수 환경 변수

- `NODE_ENV=production`, `PUBLIC_APP_ORIGIN=https://...`, `PRIVACY_CONTACT_EMAIL=...`
- `SESSION_SECRET`, `STORAGE_SIGNING_SECRET`: 서로 다른 32자 이상의 무작위 값
- `PILOT_ACCESS_REQUIRED=true`, `PILOT_ACCESS_CODE_SHA256`: 초대 코드 원문의 SHA-256 값
- `DATABASE_URL`, `REDIS_URL`, `QUEUE_MODE=redis`
- `STORAGE_MODE=s3`와 Bucket/AWS 자동 주입 변수
- `GEMINI_API_KEY`, `GEMINI_PAID_SERVICE_ACKNOWLEDGED=true`
- `FFMPEG_PATH=/usr/local/bin/ffmpeg`, `REQUIRE_LGPL_FFMPEG=true`
- `YOUTUBE_RECOMMENDATIONS_ENABLED=false`로 파일럿을 시작한다.

앱은 필수 값, 약한 비밀키, 로컬 저장소·인라인 큐, 비유료 Gemini 확인 누락을 시작 시
거부한다. 초대 코드 원문은 Railway에도 저장하지 않고 SHA-256 값만 등록한다.

## Bucket CORS

Bucket에는 서비스 도메인에서 `PUT`, `HEAD`를 허용하고,
허용 헤더에 `Content-Type`을 포함한다. 원본 영상은 public으로 전환하지 않는다.
최신 Railway Bucket은 virtual-hosted URL 방식이므로 `AWS_S3_URL_STYLE=virtual`
또는 `BUCKET_FORCE_PATH_STYLE=false`를 사용한다. Railway가 자동 주입하는
`AWS_ENDPOINT_URL`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
`AWS_S3_BUCKET_NAME`, `AWS_DEFAULT_REGION`을 그대로 사용할 수 있다.

## 실행 순서

1. GitHub 저장소에서 web 서비스를 만들고 PostgreSQL·Redis·Bucket을 추가한다.
2. web에 각 서비스의 reference variable과 앱 비밀키를 연결한다.
3. 같은 저장소로 worker 서비스를 추가하고 시작 명령만 `npm run worker`로 바꾼다.
4. cleanup 서비스를 추가하고 하루 한 번 실행되는 Cron으로 설정한다.
5. web에만 public domain과 `/api/health` health check를 연결한다.
6. Bucket CORS의 허용 origin을 실제 web 도메인으로 제한한 뒤 테스트 업로드한다.

## 배포 전 확인

- `/api/health`가 200을 반환한다.
- 잘못된 초대 코드로 `/api/user`가 403을 반환한다.
- 필수 약관·개인정보·영상 권리 확인이 없으면 presign이 거부된다.
- `npm audit --omit=dev`에 high/critical이 없다.
- 동일 idempotency key를 두 번 제출해도 분석 작업이 하나만 생성된다.
- 다른 사용자 쿠키로 video/job/history를 조회할 수 없다.
- 6개 영상 합계가 `MAX_UPLOAD_TOTAL_BYTES`를 넘으면 presign 단계에서 차단된다.
- web 재배포 중에도 worker 작업과 PostgreSQL 기록이 유지된다.
- cleanup 실행 후 만료 Bucket 객체와 DB 상태가 함께 삭제 처리된다.
- 배포 이미지의 `/app`에 `.env`, `src`, `docs`, 개발 설정 파일이 없다.

## 배포 이미지 보안

- Node 22.14 런타임은 non-root `nextjs` 사용자로 실행한다.
- FFmpeg 8.1.2 공식 소스를 체크섬으로 검증하고 GPL/nonfree·외부 코덱 없이 빌드한다.
- `npm run verify:artifact`가 standalone 허용 목록을 검사한다.
- `npm run license:check`가 운영 의존성 라이선스를 검사하고 CycloneDX SBOM을 만든다.
- 실제 Railway 빌드 로그에서 FFmpeg configure 확인과 전체 테스트 통과를 확인해야 한다.
