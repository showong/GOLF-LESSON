import { NextResponse } from "next/server";
import { query } from "@/lib/database";
import { storageMode } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await query("SELECT 1 AS ok");
    return NextResponse.json({ ok: true, database: "ready", storage: storageMode() });
  } catch (error) {
    console.error("health check failed", error);
    return NextResponse.json({ ok: false, database: "unavailable" }, { status: 503 });
  }
}
