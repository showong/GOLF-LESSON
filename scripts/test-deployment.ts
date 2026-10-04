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
const os = await import("node:os");
const fsp = await import("node:fs/promises");
const path = await import("node:path");
const bucketDir = await fsp.mkdtemp(path.join(os.tmpdir(), "golf-bucket-test-"));
process.env.LOCAL_BUCKET_DIR = bucketDir;

const { closeDatabase, query } = await import("../src/lib/database");
const { deleteUserData, runRetention } = await import("../src/lib/retention");
const { localObjectPath } = await import("../src/lib/storage");
const { getOrCreateUser } = await import("../src/lib/db");
const {
  consumeRateLimit,
  createAnalysisJob,
  createVideoReservations,
  getJobByIdempotencyKey,
  getVideoForUser,
} = await import("../src/lib/deployment-db");
const { validateUploadBatch } = await import("../src/lib/upload-policy");
const { clientIpFromRequest, clientKeyFromRequest, createOwnerToken, verifyOwnerToken } =
  await import("../src/lib/identity");

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

  console.log("\n[4] 사용자별 요청 제한");
  await consumeRateLimit(userA.id, "analysis", 1, 60);
  let limited = false;
  try {
    await consumeRateLimit(userA.id, "analysis", 1, 60);
  } catch {
    limited = true;
  }
  check(limited, "동일 윈도우의 초과 요청 차단");

  console.log("\n[5] 쿠키와 무관한 IP·전체 제한");
  const forged = new Request("http://localhost/", {
    headers: { "x-forwarded-for": "6.6.6.6, 203.0.113.7" },
  });
  check(clientIpFromRequest(forged) === "203.0.113.7", "클라이언트가 위조한 왼쪽 IP 대신 프록시가 붙인 IP 사용");
  const ipKey = clientKeyFromRequest(forged);
  check(ipKey !== null && !ipKey.includes("203.0.113.7"), "IP 원문 대신 해시 저장");
  const ipRule = { subject: ipKey!, limit: 1, windowSeconds: 60 };
  const freshA = await getOrCreateUser(randomUUID(), "쿠키1");
  const freshB = await getOrCreateUser(randomUUID(), "쿠키2");
  await consumeRateLimit(freshA.id, "upload", 10, 60, [ipRule]);
  let ipLimited = false;
  try {
    await consumeRateLimit(freshB.id, "upload", 10, 60, [ipRule]);
  } catch (error) {
    ipLimited = (error as Error & { code?: string }).code === "RATE_LIMITED";
  }
  check(ipLimited, "쿠키를 새로 만들어도 같은 IP의 초과 요청 차단");
  const globalRule = { subject: "global", limit: 1, windowSeconds: 60, message: "전체 상한" };
  const freshC = await getOrCreateUser(randomUUID(), "쿠키3");
  await consumeRateLimit(freshA.id, "analysis", 10, 60, [globalRule]);
  let globalMessage = "";
  try {
    await consumeRateLimit(freshC.id, "analysis", 10, 60, [globalRule]);
  } catch (error) {
    globalMessage = (error as Error).message;
  }
  check(globalMessage === "전체 상한", "서비스 전체 상한 초과 시 전용 안내 문구");

  console.log("\n[6] 중복 작업 방지");
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

  console.log("\n[7] 기록 삭제와 보관 기간 정리");
  const exists = (file: string) => fsp.stat(file).then(() => true, () => false);
  const putLocalFile = async (objectKey: string) => {
    const file = localObjectPath(objectKey);
    await fsp.mkdir(path.dirname(file), { recursive: true });
    await fsp.writeFile(file, "video");
    return file;
  };
  const leaver = await getOrCreateUser(randomUUID(), "탈퇴자");
  const [leaverVideo] = await createVideoReservations(leaver.id, [
    { name: "a.mp4", type: "video/mp4", size: 5, view: "side", swingIndex: 0 },
  ]);
  const leaverFile = await putLocalFile(leaverVideo.objectKey);
  await deleteUserData(leaver.id);
  check(!(await exists(leaverFile)), "전체 삭제 시 영상 파일 삭제");
  const leftRows = await query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM videos WHERE user_id = $1",
    [leaver.id],
  );
  check(leftRows.rows[0].count === "0", "전체 삭제 시 DB 기록 삭제");

  const keeper = await getOrCreateUser(randomUUID(), "보관자");
  const [oldVideo, newVideo] = await createVideoReservations(keeper.id, [
    { name: "old.mp4", type: "video/mp4", size: 5, view: "side", swingIndex: 0 },
    { name: "new.mp4", type: "video/mp4", size: 5, view: "front", swingIndex: 0 },
  ]);
  const oldFile = await putLocalFile(oldVideo.objectKey);
  const newFile = await putLocalFile(newVideo.objectKey);
  await query("UPDATE videos SET created_at = NOW() - INTERVAL '31 days' WHERE id = $1", [oldVideo.id]);
  const dormant = await getOrCreateUser(randomUUID(), "휴면");
  await query("UPDATE users SET updated_at = NOW() - INTERVAL '366 days' WHERE id = $1", [dormant.id]);
  const report = await runRetention();
  check(!report.skipped && report.expiredVideos === 1, "30일 지난 영상만 정리 대상");
  check(!(await exists(oldFile)) && (await exists(newFile)), "만료 영상 파일만 삭제");
  check((await getVideoForUser(keeper.id, oldVideo.id))?.status === "deleted", "만료 영상 상태를 deleted로 표시");
  check((await getVideoForUser(keeper.id, newVideo.id))?.status === "pending", "보관 기간 내 영상 유지");
  const dormantRows = await query("SELECT id FROM users WHERE id = $1", [dormant.id]);
  check(dormantRows.rows.length === 0, "1년 넘게 이용하지 않은 사용자 삭제");
} finally {
  await closeDatabase();
  await fsp.rm(bucketDir, { recursive: true, force: true });
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
