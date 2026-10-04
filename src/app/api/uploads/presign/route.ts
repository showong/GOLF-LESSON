import { NextResponse } from "next/server";
import { consumeRateLimit, createVideoReservations } from "@/lib/deployment-db";
import { ownerIdFromRequest } from "@/lib/identity";
import { uploadSharedLimits } from "@/lib/request-limits";
import { createDirectUploadTarget } from "@/lib/storage";
import { validateUploadBatch } from "@/lib/upload-policy";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const userId = ownerIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: "사용자 세션이 필요합니다." }, { status: 401 });
  try {
    const body = (await request.json()) as { files?: unknown };
    const files = validateUploadBatch(body.files);
    await consumeRateLimit(
      userId,
      "upload",
      Number(process.env.UPLOAD_REQUESTS_PER_MINUTE ?? 6),
      60,
      uploadSharedLimits(request),
    );
    const videos = await createVideoReservations(userId, files);
    const uploads = await Promise.all(
      videos.map(async (video) => ({
        videoId: video.id,
        ...(await createDirectUploadTarget(video)),
      })),
    );
    return NextResponse.json({ uploads });
  } catch (error) {
    const code = (error as Error & { code?: string }).code;
    console.warn("upload presign rejected", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "업로드를 준비하지 못했습니다." },
      { status: code === "RATE_LIMITED" ? 429 : 400 },
    );
  }
}
