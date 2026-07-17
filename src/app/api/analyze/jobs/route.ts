import { NextResponse } from "next/server";
import {
  consumeRateLimit,
  createAnalysisJob,
  failJob,
  getJobByIdempotencyKey,
  getVideosForUser,
  setVideoStatus,
  type AnalysisJobPayload,
} from "@/lib/deployment-db";
import { ownerIdFromRequest } from "@/lib/identity";
import { validatePoseTrack } from "@/lib/pose";
import { enqueueAnalysis } from "@/lib/queue";
import { verifyStoredVideo } from "@/lib/storage";
import type { ClubType } from "@/lib/types";

export const runtime = "nodejs";

type CreateBody = {
  mode?: unknown;
  clubHint?: unknown;
  videoIds?: unknown;
  idempotencyKey?: unknown;
  poseSide?: unknown;
  poseFront?: unknown;
};

function validateClub(value: unknown): ClubType | undefined {
  return value === "driver" || value === "iron" || value === "approach" ? value : undefined;
}

export async function POST(request: Request) {
  const userId = ownerIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: "사용자 세션이 필요합니다." }, { status: 401 });
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 7 * 1024 * 1024) {
    return NextResponse.json({ error: "분석 요청 정보가 너무 큽니다." }, { status: 413 });
  }
  try {
    const body = (await request.json()) as CreateBody;
    const mode = body.mode === "multi" ? "multi" : body.mode === "single" ? "single" : null;
    if (!mode) throw new Error("분석 모드가 올바르지 않습니다.");
    const videoIds = Array.isArray(body.videoIds)
      ? body.videoIds.map(String).filter((id) => /^[0-9a-f-]{36}$/i.test(id))
      : [];
    if (videoIds.length < 1 || videoIds.length > 6 || new Set(videoIds).size !== videoIds.length) {
      throw new Error("분석할 영상 목록이 올바르지 않습니다.");
    }
    const idempotencyKey = String(body.idempotencyKey ?? "");
    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(idempotencyKey)) {
      throw new Error("중복 방지 키가 올바르지 않습니다.");
    }
    // 네트워크 재전송은 영상 상태·요청 제한을 다시 검사하기 전에 기존 작업을 반환한다.
    const existingJob = await getJobByIdempotencyKey(userId, idempotencyKey);
    if (existingJob) {
      return NextResponse.json({ jobId: existingJob.id, status: existingJob.status });
    }
    const videos = await getVideosForUser(userId, videoIds);
    if (videos.length !== videoIds.length) throw new Error("본인 소유가 아닌 영상이 포함되어 있습니다.");
    const views = videos.map((video) => `${video.swingIndex}:${video.view}`);
    if (new Set(views).size !== views.length) throw new Error("중복된 촬영 시점이 있습니다.");
    const clubHint = validateClub(body.clubHint);
    if (mode === "single") {
      if (videos.length > 2 || videos.some((video) => video.swingIndex !== 0)) {
        throw new Error("정밀 분석은 같은 스윙의 정면·측면 영상만 사용할 수 있습니다.");
      }
    } else {
      const swingCount = new Set(videos.map((video) => video.swingIndex)).size;
      if (!clubHint || swingCount < 2 || swingCount > 3) {
        throw new Error("멀티샷은 같은 클럽의 스윙 2~3개가 필요합니다.");
      }
    }

    for (const video of videos) {
      if (!(await verifyStoredVideo(video))) throw new Error(`영상 업로드가 완료되지 않았습니다: ${video.originalName}`);
      if (video.status === "pending") await setVideoStatus(video.id, "uploaded");
      if (video.status !== "pending" && video.status !== "uploaded") {
        throw new Error("이미 처리했거나 실패한 영상이 포함되어 있습니다.");
      }
    }

    const poseSide = mode === "single" ? validatePoseTrack(body.poseSide) ?? undefined : undefined;
    const poseFront = mode === "single" ? validatePoseTrack(body.poseFront) ?? undefined : undefined;
    const payload: AnalysisJobPayload = {
      mode,
      clubHint,
      videos: videos.map(({ id, objectKey, mimeType, view, swingIndex, sizeBytes }) => ({
        id,
        objectKey,
        mimeType,
        view,
        swingIndex,
        sizeBytes,
      })),
      poseSide,
      poseFront,
    };
    await consumeRateLimit(
      userId,
      "analysis",
      Number(process.env.ANALYSIS_REQUESTS_PER_HOUR ?? 12),
      60 * 60,
    );
    const { job, created } = await createAnalysisJob(userId, idempotencyKey, payload);
    if (created) {
      try {
        await enqueueAnalysis(job.id);
      } catch (error) {
        await failJob(job.id, "QUEUE_FAILED", "분석 대기열에 등록하지 못했습니다.");
        throw error;
      }
    }
    return NextResponse.json({ jobId: job.id, status: job.status }, { status: created ? 202 : 200 });
  } catch (error) {
    const code = (error as Error & { code?: string }).code;
    console.warn("analysis job request rejected", error);
    return NextResponse.json(
      { error: code === "RATE_LIMITED" ? (error as Error).message : "분석 요청을 확인해 주세요." },
      { status: code === "RATE_LIMITED" ? 429 : 400 },
    );
  }
}
