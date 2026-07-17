import { randomUUID } from "node:crypto";

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
const { getOrCreateUser } = await import("../src/lib/db");
const {
  consumeRateLimit,
  createAnalysisJob,
  createVideoReservations,
  getJobByIdempotencyKey,
  getVideoForUser,
} = await import("../src/lib/deployment-db");
const { validateUploadBatch } = await import("../src/lib/upload-policy");
const { createOwnerToken, verifyOwnerToken } = await import("../src/lib/identity");

try {
  console.log("\n[1] 서명된 사용자 ID");
  const ownerId = randomUUID();
  const token = createOwnerToken(ownerId);
  check(verifyOwnerToken(token) === ownerId, "정상 소유권 토큰 검증");
  check(verifyOwnerToken(`${token}tampered`) === null, "변조된 토큰 거부");

  console.log("\n[2] 사용자별 영상 소유권");
  const userA = await getOrCreateUser(randomUUID(), "동일닉네임");
  const userB = await getOrCreateUser(randomUUID(), "동일닉네임");
  check(userA.id !== userB.id, "같은 닉네임이어도 사용자 ID 분리");
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
