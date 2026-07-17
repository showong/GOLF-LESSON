# Railway 배포 구성

한 Railway 프로젝트에 다음 서비스를 둔다.

1. `web`: 이 저장소의 Dockerfile, 시작 명령 `npm run start`
2. `worker`: 같은 저장소/이미지, 시작 명령 `npm run worker`
3. PostgreSQL
4. Redis
5. 비공개 Storage Bucket

## 필수 연결

- web과 worker 모두 `DATABASE_URL`, `REDIS_URL`, Gemini 및 Bucket 변수를 공유한다.
- web은 `QUEUE_MODE=redis`, `STORAGE_MODE=s3`를 사용한다.
- worker는 외부 도메인을 만들지 않고 private network만 사용한다.
- web의 pre-deploy 명령은 `npm run db:migrate`다.
- worker 동시성은 초기 `WORKER_CONCURRENCY=1`로 시작한다.

## Bucket CORS

Bucket에는 서비스 도메인에서 `PUT`, `HEAD`, `GET`을 허용하고,
허용 헤더에 `Content-Type`을 포함한다. 원본 영상은 public으로 전환하지 않는다.
최신 Railway Bucket은 virtual-hosted URL 방식이므로 `AWS_S3_URL_STYLE=virtual`
또는 `BUCKET_FORCE_PATH_STYLE=false`를 사용한다. Railway가 자동 주입하는
`AWS_ENDPOINT_URL`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
`AWS_S3_BUCKET_NAME`, `AWS_DEFAULT_REGION`을 그대로 사용할 수 있다.

## 실행 순서

1. GitHub 저장소에서 web 서비스를 만들고 PostgreSQL·Redis·Bucket을 추가한다.
2. web에 각 서비스의 reference variable과 앱 비밀키를 연결한다.
3. 같은 저장소로 worker 서비스를 추가하고 시작 명령만 `npm run worker`로 바꾼다.
4. web에만 public domain과 `/api/health` health check를 연결한다.
5. Bucket CORS의 허용 origin을 실제 web 도메인으로 제한한 뒤 테스트 업로드한다.

## 배포 전 확인

- `/api/health`가 200을 반환한다.
- `npm audit --omit=dev`에 high/critical이 없다.
- 동일 idempotency key를 두 번 제출해도 분석 작업이 하나만 생성된다.
- 다른 사용자 쿠키로 video/job/history를 조회할 수 없다.
- 6개 영상 합계가 `MAX_UPLOAD_TOTAL_BYTES`를 넘으면 presign 단계에서 차단된다.
- web 재배포 중에도 worker 작업과 PostgreSQL 기록이 유지된다.
