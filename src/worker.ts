import { Worker } from "bullmq";
import { ANALYSIS_QUEUE, closeQueue, redisConnection } from "./lib/queue";
import { processAnalysisJob } from "./lib/analysis-service";
import { closeDatabase } from "./lib/database";

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

async function shutdown() {
  await worker.close();
  await closeQueue();
  await closeDatabase();
}

process.once("SIGTERM", () => void shutdown().finally(() => process.exit(0)));
process.once("SIGINT", () => void shutdown().finally(() => process.exit(0)));
