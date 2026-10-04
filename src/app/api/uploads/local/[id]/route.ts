import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { NextResponse } from "next/server";
import { getVideoForUser } from "@/lib/deployment-db";
import { ownerIdFromRequest } from "@/lib/identity";
import { localObjectPath, storageMode, verifyLocalUploadToken } from "@/lib/storage";

export const runtime = "nodejs";

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (storageMode() !== "local") {
    return NextResponse.json({ error: "로컬 업로드가 비활성화되어 있습니다." }, { status: 404 });
  }
  const userId = ownerIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: "사용자 세션이 필요합니다." }, { status: 401 });
  const { id } = await context.params;
  const video = await getVideoForUser(userId, id);
  const token = new URL(request.url).searchParams.get("token");
  if (!video || !verifyLocalUploadToken(video, token)) {
    return NextResponse.json({ error: "업로드 권한이 없습니다." }, { status: 403 });
  }
  if (video.status !== "pending") {
    return NextResponse.json({ error: "이미 업로드된 영상입니다." }, { status: 409 });
  }
  const contentType = (request.headers.get("content-type") ?? "").toLowerCase();
  if (contentType !== video.mimeType) {
    return NextResponse.json({ error: "영상 형식이 예약 정보와 다릅니다." }, { status: 400 });
  }
  if (!request.body) {
    return NextResponse.json({ error: "영상 본문이 비어 있습니다." }, { status: 400 });
  }

  const target = localObjectPath(video.objectKey);
  const partial = `${target}.part`;
  await fsp.mkdir(path.dirname(target), { recursive: true });
  let received = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.length;
      if (received > video.sizeBytes) callback(new Error("예약된 크기를 초과했습니다."));
      else callback(null, chunk);
    },
  });
  try {
    await pipeline(
      Readable.fromWeb(request.body as unknown as WebReadableStream),
      limiter,
      fs.createWriteStream(partial),
    );
    if (received !== video.sizeBytes) throw new Error("영상 크기가 예약 정보와 다릅니다.");
    await fsp.rename(partial, target);
  } catch (error) {
    await fsp.rm(partial, { force: true });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "업로드에 실패했습니다." },
      { status: 400 },
    );
  }
  return new NextResponse(null, { status: 200 });
}
