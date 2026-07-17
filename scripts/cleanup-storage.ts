import { closeDatabase } from "../src/lib/database";
import {
  deleteOldRateLimitEvents,
  listExpiredVideos,
  setVideoStatus,
} from "../src/lib/deployment-db";
import { assertProductionConfiguration } from "../src/lib/runtime-config";
import { deleteStoredVideo } from "../src/lib/storage";

async function main() {
  assertProductionConfiguration();
  const batchSize = Math.max(1, Math.min(500, Number(process.env.CLEANUP_BATCH_SIZE ?? 100)));
  let deleted = 0;

  while (true) {
    const videos = await listExpiredVideos(batchSize);
    if (videos.length === 0) break;
    let deletedInBatch = 0;
    for (const video of videos) {
      try {
        await deleteStoredVideo(video);
        await setVideoStatus(video.id, "deleted");
        deleted += 1;
        deletedInBatch += 1;
      } catch (error) {
        console.error(`expired video deletion failed (${video.id})`, error);
      }
    }
    if (deletedInBatch === 0) throw new Error("만료 영상 삭제가 모두 실패했습니다.");
    if (videos.length < batchSize) break;
  }

  const rateLimitEvents = await deleteOldRateLimitEvents();
  console.log(`expired video cleanup complete: ${deleted}; old rate-limit events: ${rateLimitEvents}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeDatabase());
