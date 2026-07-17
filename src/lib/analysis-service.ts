import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";
import {
  computeDelta,
  getAnalysisForUser,
  getUserById,
  previousForClub,
  recentRecordsForClub,
  recentSummaryForClub,
  saveAnalysis,
} from "./db";
import {
  claimJob,
  completeJob,
  failJob,
  getJob,
  setVideoStatus,
  type AnalysisJobPayload,
} from "./deployment-db";
import { analyzeSwingSession, analyzeSwingVideo, type PreviousAnalysisContext } from "./gemini";
import { validatePoseTrack, type PoseTrack } from "./pose";
import { materializeVideo } from "./storage";
import { findRecommendations } from "./youtube";
import { getCoach, HEAD_COACH } from "./coaches";
import {
  CLUB_LABEL,
  GRADE_LABEL,
  MECHANICS_DIMENSIONS,
  nextLevelTarget,
  type ClubType,
} from "./types";

async function previousContexts(userId: string) {
  const result: Partial<Record<ClubType, PreviousAnalysisContext>> = {};
  for (const club of ["driver", "iron", "approach"] as ClubType[]) {
    const recent = await recentRecordsForClub(userId, club, 3);
    const latest = recent[0];
    if (!latest?.analysis?.topFocus?.title) continue;
    const lowestDimOf = (record: (typeof recent)[number]) => {
      const observed = (record.analysis.mechanicsScores ?? []).filter(
        (score) => score.observable !== false,
      );
      if (observed.length === 0) return null;
      return observed.reduce((min, score) => (score.score < min.score ? score : min)).dim;
    };
    const lowestDims = recent.map(lowestDimOf);
    const recurringWeakDim =
      recent.length >= 3 &&
      lowestDims[0] !== null &&
      lowestDims.every((dim) => dim === lowestDims[0])
        ? lowestDims[0]
        : null;
    result[club] = {
      createdAt: latest.createdAt,
      topFocusTitle: latest.analysis.topFocus.title,
      mechanicsScores: latest.analysis.mechanicsScores.map((score) => ({
        dim: score.dim,
        score: score.score,
        observable: score.observable,
        confidence: score.confidence,
      })),
      focusHistory: recent.map((record) => ({
        createdAt: record.createdAt,
        title: record.analysis.topFocus.title,
      })),
      recurringWeakDim,
    };
  }
  return result;
}

function poseFromPayload(value: unknown, expectedView: "side" | "front"): PoseTrack | undefined {
  const track = validatePoseTrack(value);
  return track?.view === expectedView ? track : undefined;
}

async function executeAnalysis(userId: string, nickname: string, payload: AnalysisJobPayload) {
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "golf-analysis-"));
  try {
    const localVideos = await Promise.all(
      payload.videos.map(async (video) => {
        const ext = path.extname(video.objectKey) || ".mp4";
        const filePath = path.join(tempDir, `${uuidv4()}${ext}`);
        await setVideoStatus(video.id, "processing");
        await materializeVideo(
          {
            ...video,
            userId,
            originalName: path.basename(video.objectKey),
            status: "processing",
          },
          filePath,
        );
        return { ...video, filePath };
      }),
    );

    const history = (
      await Promise.all(
        (["driver", "iron", "approach"] as ClubType[]).map(async (club) =>
          (await recentSummaryForClub(userId, club, 2)).map((entry) => ({
            ...entry,
            clubType: club,
          })),
        ),
      )
    ).flat();
    const previousByClub = await previousContexts(userId);

    const analysis =
      payload.mode === "multi"
        ? await analyzeSwingSession({
            nickname,
            clubType: payload.clubHint!,
            swings: [...new Set(localVideos.map((video) => video.swingIndex))]
              .sort((a, b) => a - b)
              .map((swingIndex) => ({
                videos: localVideos
                  .filter((video) => video.swingIndex === swingIndex)
                  .map((video) => ({
                    view: video.view,
                    filePath: video.filePath,
                    mimeType: video.mimeType,
                  })),
              })),
            previousByClub,
          })
        : await analyzeSwingVideo({
            nickname,
            videos: localVideos.map((video) => ({
              view: video.view,
              filePath: video.filePath,
              mimeType: video.mimeType,
              pose:
                video.view === "side"
                  ? poseFromPayload(payload.poseSide, "side")
                  : poseFromPayload(payload.poseFront, "front"),
            })),
            clubHint: payload.clubHint,
            history,
            previousByClub,
          });

    try {
      analysis.recommendations = await findRecommendations({
        clubType: analysis.clubType,
        grade: analysis.grade,
        topFocus: analysis.topFocus,
        weaknesses: analysis.weaknesses,
      });
    } catch (error) {
      console.warn("YouTube 추천 영상 검색 실패:", error);
      analysis.recommendations = [];
    }
    const record = await saveAnalysis(userId, analysis);
    await Promise.all(localVideos.map((video) => setVideoStatus(video.id, "ready")));
    return record;
  } finally {
    await fsp.rm(tempDir, { recursive: true, force: true });
  }
}

export async function processAnalysisJob(jobId: string) {
  const job = await claimJob(jobId);
  if (!job) return;
  const user = await getUserById(job.userId);
  if (!user) {
    await failJob(job.id, "USER_NOT_FOUND", "사용자를 찾을 수 없습니다.");
    return;
  }
  try {
    const record = await executeAnalysis(user.id, user.nickname, job.payload);
    await completeJob(job.id, record.id);
  } catch (error) {
    await Promise.all(job.payload.videos.map((video) => setVideoStatus(video.id, "failed")));
    const message = error instanceof Error ? error.message : "분석 중 오류가 발생했습니다.";
    console.error(`analysis job failed (${job.id})`, error);
    await failJob(job.id, "ANALYSIS_FAILED", message);
    throw error;
  }
}

export async function buildAnalysisResponse(userId: string, analysisId: string) {
  const [user, record] = await Promise.all([
    getUserById(userId),
    getAnalysisForUser(userId, analysisId),
  ]);
  if (!user || !record) return null;
  const analysis = record.analysis;
  const prev = await previousForClub(userId, analysis.clubType, record.createdAt);
  const delta = computeDelta(prev, record);
  const coverageCapped = analysis.mechanicsCoverage?.capped === true;
  const target = coverageCapped
    ? { nextAt: null, toNext: null, nextLabel: null }
    : nextLevelTarget(analysis.mechanicsWeighted ?? 0);
  const prevScores = prev?.analysis?.mechanicsScores;
  const dimensionDeltas = prevScores
    ? MECHANICS_DIMENSIONS.map((dim) => ({
        dim,
        prev: (() => {
          const score = prevScores.find((entry) => entry.dim === dim);
          return score && score.observable !== false ? score.score : null;
        })(),
        current: (() => {
          const score = analysis.mechanicsScores.find((entry) => entry.dim === dim);
          return score && score.observable !== false ? score.score : null;
        })(),
      }))
    : null;
  return {
    user,
    record,
    delta,
    coach: getCoach(analysis.grade),
    headCoach: HEAD_COACH,
    progress: {
      weighted: coverageCapped ? null : (analysis.mechanicsWeighted ?? null),
      nextAt: target.nextAt,
      toNext: target.toNext,
      nextLabel: target.nextLabel,
      dimensionDeltas,
      coverageCapped,
    },
    labels: {
      club: CLUB_LABEL[analysis.clubType],
      grade: GRADE_LABEL[analysis.grade],
    },
  };
}

export async function getAnalysisJob(jobId: string) {
  return getJob(jobId);
}
