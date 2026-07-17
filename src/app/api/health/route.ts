import { NextResponse } from "next/server";
import { query } from "@/lib/database";
import { checkQueueHealth } from "@/lib/queue";
import { assertProductionConfiguration } from "@/lib/runtime-config";
import { checkStorageHealth, storageMode } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    assertProductionConfiguration();
    await Promise.all([
      query("SELECT 1 AS ok"),
      checkQueueHealth(),
      checkStorageHealth(),
    ]);
    return NextResponse.json({
      ok: true,
      database: "ready",
      queue: "ready",
      storage: storageMode(),
    });
  } catch (error) {
    console.error("health check failed", error);
    return NextResponse.json({ ok: false, status: "unavailable" }, { status: 503 });
  }
}
