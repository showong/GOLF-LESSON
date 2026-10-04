import { Worker } from "bullmq";
import { ANALYSIS_QUEUE, closeQueue, redisConnection } from "./lib/queue";
import { processAnalysisJob } from "./lib/analysis-service";
import { closeDatabase } from "./lib/database";
import { runRetention } from "./lib/retention";

if (!process.env.REDIS_URL) throw new Error("Worker에는 REDIS_URL이 필요합니다.");
if (!process.env.DATABASE_URL) throw new Error("Worker에는 DATABASE_URL이 필요합니다.");

const worker = new Worker<{ jobId: string }>(
  ANALYSIS_QUEUE,
  async (job) => processAnalysisJob(job.data.jobId),
  {
    connection: redisConnection(),
    concurrency: Number(process.env.WORKER_CONCURRENCY ?? 1),
  },
);

worker.on("completed", (job) => console.log(`analysis job completed: ${job.id}`));
worker.on("failed", (job, error) => console.error(`analysis job failed: ${job?.id}`, error));

// 개인정보처리방침의 보유 기간(영상 30일 등)을 집행한다. 여러 Worker가 떠 있어도
// advisory lock으로 한 곳에서만 실행된다.
const RETENTION_INTERVAL_MS = 60 * 60 * 1000;
async function retentionTick() {
  try {
    const report = await runRetention();
    if (!report.skipped) console.log("retention", report);
  } catch (error) {
    console.error("retention failed", error);
  }
}
void retentionTick();
const retentionTimer = setInterval(() => void retentionTick(), RETENTION_INTERVAL_MS);

async function shutdown() {
  clearInterval(retentionTimer);
  await worker.close();
  await closeQueue();
  await closeDatabase();
}

process.once("SIGTERM", () => void shutdown().finally(() => process.exit(0)));
process.once("SIGINT", () => void shutdown().finally(() => process.exit(0)));
