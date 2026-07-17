import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";

let failures = 0;
function check(condition: boolean, label: string) {
  if (condition) console.log(`  ✅ ${label}`);
  else {
    console.error(`  ❌ ${label}`);
    failures += 1;
  }
}

async function main() {
// 영속 파일 잠금의 영향을 받지 않는 완전 격리 DB로 반복 실행 안정성을 확보한다.
process.env.PGLITE_DATA_DIR = "memory://";
process.env.SESSION_SECRET = "deployment-test-secret-at-least-32-bytes";

const { closeDatabase } = await import("../src/lib/database");
const { getOrCreateUser, hasCurrentRequiredConsent, recordUserConsent } = await import("../src/lib/db");
const {
  consumeRateLimit,
  claimJob,
  createAnalysisJob,
  createVideoReservations,
  completeJob,
  getJobByIdempotencyKey,
  getVideoForUser,
  getJobForUser,
  failJob,
} = await import("../src/lib/deployment-db");
const { validateUploadBatch } = await import("../src/lib/upload-policy");
const {
  createOwnerToken,
  createPilotAccessToken,
  hasPilotAccess,
  verifyOwnerToken,
  verifyPilotAccessCode,
} = await import("../src/lib/identity");
const { LOCAL_MIGRATIONS } = await import("../src/lib/local-migrations.generated");
const { productionConfigurationErrors } = await import("../src/lib/runtime-config");

try {
  console.log("\n[0] 로컬·운영 마이그레이션 일치");
  for (const migration of LOCAL_MIGRATIONS) {
    const source = await fs.readFile(new URL(`../migrations/${migration.name}`, import.meta.url), "utf8");
    check(source.trim() === migration.sql.trim(), `${migration.name} 번들 사본 일치`);
  }

  console.log("\n[1] 서명된 사용자 ID");
  const ownerId = randomUUID();
  const token = createOwnerToken(ownerId);
  check(verifyOwnerToken(token) === ownerId, "정상 소유권 토큰 검증");
  check(verifyOwnerToken(`${token}tampered`) === null, "변조된 토큰 거부");

  process.env.PILOT_ACCESS_REQUIRED = "true";
  const pilotCode = "pilot-test-code";
  process.env.PILOT_ACCESS_CODE_SHA256 = createHash("sha256").update(pilotCode).digest("hex");
  check(verifyPilotAccessCode(pilotCode), "정상 파일럿 초대 코드 검증");
  check(!verifyPilotAccessCode(`${pilotCode}-wrong`), "잘못된 파일럿 초대 코드 거부");
  check(
    hasPilotAccess(
      new Request("http://localhost", {
        headers: { cookie: `golf_pilot=${createPilotAccessToken()}` },
      }),
    ),
    "승인된 파일럿 쿠키 검증",
  );
  process.env.PILOT_ACCESS_REQUIRED = "false";

  console.log("\n[2] 사용자별 영상 소유권");
  const userA = await getOrCreateUser(randomUUID(), "동일닉네임");
  const userB = await getOrCreateUser(randomUUID(), "동일닉네임");
  check(userA.id !== userB.id, "같은 닉네임이어도 사용자 ID 분리");
  check(!(await hasCurrentRequiredConsent(userA.id)), "동의 전 업로드 권한 없음");
  await recordUserConsent(userA.id, {
    termsAccepted: true,
    privacyAccepted: true,
    serviceAnalysisAccepted: true,
    age18Confirmed: true,
    videoRightsConfirmed: true,
    modelImprovementConsent: false,
  });
  check(await hasCurrentRequiredConsent(userA.id), "현재 약관·개인정보 필수 동의 확인");
  const [video] = await createVideoReservations(userA.id, [
    {
      name: "front.mp4",
      type: "video/mp4",
      size: 1024,
      view: "front",
      swingIndex: 0,
    },
  ]);
  check((await getVideoForUser(userA.id, video.id))?.id === video.id, "소유자는 영상 조회 가능");
  check((await getVideoForUser(userB.id, video.id)) === null, "다른 사용자는 영상 조회 불가");

  console.log("\n[3] 업로드 정책");
  let rejected = false;
  try {
    validateUploadBatch([
      {
        name: "fake.exe",
        type: "application/octet-stream",
        size: 1024,
        view: "front",
        swingIndex: 0,
      },
    ]);
  } catch {
    rejected = true;
  }
  check(rejected, "허용되지 않은 MIME 차단");

  console.log("\n[4] 요청 제한과 중복 작업 방지");
  await consumeRateLimit(userA.id, "analysis", 1, 60);
  let limited = false;
  try {
    await consumeRateLimit(userA.id, "analysis", 1, 60);
  } catch {
    limited = true;
  }
  check(limited, "동일 윈도우의 초과 요청 차단");
  const payload = {
    mode: "single" as const,
    videos: [
      {
        id: video.id,
        objectKey: video.objectKey,
        mimeType: video.mimeType,
        view: video.view,
        swingIndex: video.swingIndex,
        sizeBytes: video.sizeBytes,
      },
    ],
  };
  const key = randomUUID();
  const first = await createAnalysisJob(userA.id, key, payload);
  const second = await createAnalysisJob(userA.id, key, payload);
  check(first.created && !second.created, "동일 idempotency key는 작업 한 개만 생성");
  check(first.job.id === second.job.id, "중복 요청이 기존 작업 ID 반환");
  check(
    (await getJobByIdempotencyKey(userA.id, key))?.id === first.job.id,
    "재전송 검사는 영상 상태 확인 전에 기존 작업 조회 가능",
  );
  check((await claimJob(first.job.id))?.status === "processing", "queued 작업 원자 claim");
  await failJob(first.job.id, "TEST_FAILURE", "test");
  const failedJob = await getJobForUser(userA.id, first.job.id);
  check(failedJob?.status === "failed", "실패 작업 상태 저장");
  check(failedJob?.payload.videos.length === 0, "완료된 작업의 영상·관절 payload 제거");
  check(!(await completeJob(first.job.id, randomUUID())), "이미 실패한 작업의 늦은 완료 거부");

  console.log("\n[5] 운영 환경 fail-fast 설정");
  const originalEnv = { ...process.env };
  Object.assign(process.env, { NODE_ENV: "production" });
  for (const key of [
    "SESSION_SECRET",
    "STORAGE_SIGNING_SECRET",
    "DATABASE_URL",
    "REDIS_URL",
    "GEMINI_API_KEY",
    "FFMPEG_PATH",
    "PRIVACY_CONTACT_EMAIL",
    "PILOT_ACCESS_CODE_SHA256",
    "PUBLIC_APP_ORIGIN",
  ]) delete process.env[key];
  check(productionConfigurationErrors().length > 0, "필수 운영 변수 누락 거부");
  Object.assign(process.env, {
    SESSION_SECRET: "session-secret-for-production-test-1234567890",
    STORAGE_SIGNING_SECRET: "storage-secret-for-production-test-123456789",
    DATABASE_URL: "postgres://example.invalid/db",
    REDIS_URL: "redis://example.invalid",
    GEMINI_API_KEY: "production-test-key",
    GEMINI_PAID_SERVICE_ACKNOWLEDGED: "true",
    FFMPEG_PATH: "/usr/local/bin/ffmpeg",
    PRIVACY_CONTACT_EMAIL: "privacy@example.com",
    PILOT_ACCESS_REQUIRED: "true",
    PILOT_ACCESS_CODE_SHA256: "a".repeat(64),
    PUBLIC_APP_ORIGIN: "https://pilot.example.com",
    QUEUE_MODE: "redis",
    STORAGE_MODE: "s3",
    BUCKET_ENDPOINT: "https://bucket.example.com",
    BUCKET_NAME: "pilot",
    BUCKET_ACCESS_KEY_ID: "access",
    BUCKET_SECRET_ACCESS_KEY: "secret",
  });
  check(productionConfigurationErrors().length === 0, "안전한 운영 변수 구성 통과");
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
} finally {
  await closeDatabase();
}

if (failures > 0) {
  console.error(`\n${failures}개 배포 기반 테스트 실패`);
  process.exitCode = 1;
} else {
  console.log("\n배포 기반 테스트 모두 통과 ✅");
}
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
