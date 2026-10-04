import { closeDatabase } from "../src/lib/database";
import { runRetention } from "../src/lib/retention";

// Worker 없이 수동 또는 외부 cron으로 보관 기간 정리를 한 번 실행한다.
runRetention()
  .then((report) => console.log("retention", report))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeDatabase());
