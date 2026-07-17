import { Worker } from "bullmq";
import { ANALYSIS_QUEUE, closeQueue, redisConnection } from "./lib/queue";
import { processAnalysisJob } from "./lib/analysis-service";
import { closeDatabase } from "./lib/database";
import { failStaleJobs } from "./lib/deployment-db";
import { assertFfmpegRuntime } from "./lib/frames";
import { assertProductionConfiguration } from "./lib/runtime-config";

let worker: Worker<{ jobId: string }> | null = null;
let staleJobTimer: NodeJS.Timeout | null = null;

async function main() {
  if (!process.env.REDIS_URL) throw new Error("Worker에는 REDIS_URL이 필요합니다.");
  if (!process.env.DATABASE_URL) throw new Error("Worker에는 DATABASE_URL이 필요합니다.");
  assertProductionConfiguration();
  await assertFfmpegRuntime();
  const staleMinutes = Number(process.env.ANALYSIS_JOB_TIMEOUT_MINUTES ?? 45);
  await failStaleJobs(staleMinutes);
  staleJobTimer = setInterval(() => {
    void failStaleJobs(staleMinutes).catch((error) =>
      console.error("stale analysis job cleanup failed", error),
    );
  }, 60_000);
  staleJobTimer.unref();

  worker = new Worker<{ jobId: string }>(
    ANALYSIS_QUEUE,
    async (job) => processAnalysisJob(job.data.jobId),
    {
      connection: redisConnection(),
      concurrency: Number(process.env.WORKER_CONCURRENCY ?? 1),
      lockDuration: Number(process.env.WORKER_LOCK_DURATION_MS ?? 10 * 60 * 1000),
      stalledInterval: 30_000,
      maxStalledCount: 1,
    },
  );

  worker.on("completed", (job) => console.log(`analysis job completed: ${job.id}`));
  worker.on("failed", (job, error) => console.error(`analysis job failed: ${job?.id}`, error));
}

async function shutdown() {
  if (staleJobTimer) clearInterval(staleJobTimer);
  await worker?.close();
  await closeQueue();
  await closeDatabase();
}

process.once("SIGTERM", () => void shutdown().finally(() => process.exit(0)));
process.once("SIGINT", () => void shutdown().finally(() => process.exit(0)));

main().catch((error) => {
  console.error("worker startup failed", error);
  process.exit(1);
});
