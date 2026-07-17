import { Queue } from "bullmq";
import IORedis from "ioredis";

export const ANALYSIS_QUEUE = "golf-swing-analysis";
let connection: IORedis | null = null;
let queue: Queue | null = null;

export function redisConnection(): IORedis {
  if (connection) return connection;
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL 환경 변수가 필요합니다.");
  connection = new IORedis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
  return connection;
}

function shouldUseRedisQueue() {
  return process.env.QUEUE_MODE === "redis" || Boolean(process.env.REDIS_URL);
}

export async function enqueueAnalysis(jobId: string) {
  if (!shouldUseRedisQueue()) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("프로덕션에서는 REDIS_URL과 QUEUE_MODE=redis가 필요합니다.");
    }
    // 로컬 전용 인라인 실행. DB의 queued -> processing 원자 전환이 중복 실행을 막는다.
    setTimeout(() => {
      import("./analysis-service")
        .then(({ processAnalysisJob }) => processAnalysisJob(jobId))
        .catch((error) => console.error("로컬 분석 작업 실패:", error));
    }, 0);
    return;
  }
  if (!queue) queue = new Queue(ANALYSIS_QUEUE, { connection: redisConnection() });
  await queue.add(
    "analyze",
    { jobId },
    {
      jobId,
      // DB 상태 전환과 영상 수명주기가 한 번의 실행을 전제로 한다. 자동 재시도는
      // 같은 영상을 중복 분석할 수 있으므로 실패 작업은 사용자가 새 요청으로 재시도한다.
      attempts: 1,
      removeOnComplete: 100,
      removeOnFail: 200,
    },
  );
}

export async function closeQueue() {
  await queue?.close();
  await connection?.quit();
  queue = null;
  connection = null;
}

export async function checkQueueHealth(): Promise<void> {
  if (!shouldUseRedisQueue()) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("운영 환경에서는 Redis 작업 큐가 필요합니다.");
    }
    return;
  }
  const pong = await redisConnection().ping();
  if (pong !== "PONG") throw new Error("Redis ping 응답이 올바르지 않습니다.");
}
