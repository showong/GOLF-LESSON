import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";
import {
  computeDelta,
  getOrCreateUser,
  previousForClub,
  recentSummaryForClub,
  saveAnalysis,
} from "@/lib/db";
import {
  analyzeSwingVideo,
  type AnalyzeVideo,
  type PreviousAnalysisContext,
} from "@/lib/gemini";
import { findRecommendations } from "@/lib/youtube";
import { getCoach, HEAD_COACH } from "@/lib/coaches";
import {
  CLUB_LABEL,
  GRADE_LABEL,
  MECHANICS_DIMENSIONS,
  nextLevelTarget,
} from "@/lib/types";
import type { ClubType, VideoView } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const ALLOWED_MIME = new Set([
  "video/mp4",
  "video/quicktime",
  "video/x-m4v",
  "video/webm",
]);

const MAX_FILE_BYTES = 80 * 1024 * 1024;

interface SavedFile {
  view: VideoView;
  tmpPath: string;
  mimeType: string;
}

export async function POST(req: Request) {
  const form = await req.formData();
  const nickname = String(form.get("nickname") ?? "").trim();
  const rawHint = String(form.get("clubHint") ?? "").trim();
  const clubHint: ClubType | undefined =
    rawHint === "driver" || rawHint === "iron" || rawHint === "approach"
      ? rawHint
      : undefined;

  if (!nickname) {
    return NextResponse.json({ error: "닉네임이 필요합니다." }, { status: 400 });
  }

  // 측면샷(권장)과 정면샷(선택) 둘 다 받음. 둘 다 또는 둘 중 하나.
  // 하위 호환: 단일 "video" 필드만 들어오면 측면샷으로 간주.
  const candidates: { view: VideoView; field: string }[] = [
    { view: "side", field: "videoSide" },
    { view: "front", field: "videoFront" },
  ];

  const incoming: { view: VideoView; file: File }[] = [];
  for (const c of candidates) {
    const f = form.get(c.field);
    if (f instanceof File && f.size > 0) {
      incoming.push({ view: c.view, file: f });
    }
  }
  if (incoming.length === 0) {
    const legacy = form.get("video");
    if (legacy instanceof File && legacy.size > 0) {
      incoming.push({ view: "side", file: legacy });
    }
  }

  if (incoming.length === 0) {
    return NextResponse.json(
      { error: "측면샷 또는 정면샷 영상을 최소 1개 첨부해 주세요." },
      { status: 400 },
    );
  }

  for (const { file } of incoming) {
    if (!ALLOWED_MIME.has(file.type)) {
      return NextResponse.json(
        { error: `지원하지 않는 영상 형식입니다: ${file.type || "unknown"}` },
        { status: 400 },
      );
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: `영상이 너무 큽니다(${file.name}, 최대 80MB).` },
        { status: 413 },
      );
    }
  }

  const user = getOrCreateUser(nickname);

  const uploadDir = process.env.UPLOAD_DIR ?? "./uploads";
  await fs.mkdir(uploadDir, { recursive: true });

  const saved: SavedFile[] = [];
  try {
    for (const { view, file } of incoming) {
      const ext = path.extname(file.name) || ".mp4";
      const tmpPath = path.join(uploadDir, `${uuidv4()}${ext}`);
      const buf = Buffer.from(await file.arrayBuffer());
      await fs.writeFile(tmpPath, buf);
      saved.push({ view, tmpPath, mimeType: file.type });
    }

    const history = (
      ["driver", "iron", "approach"] as ClubType[]
    ).flatMap((c) =>
      recentSummaryForClub(user.id, c, 2).map((h) => ({ ...h, clubType: c })),
    );

    // 숙제 검사용: 클럽별 직전 분석의 topFocus + 항목 점수.
    // 아직 클럽을 모르므로 세 클럽 모두 조회하고 판정 후 해당 클럽 것만 사용됨.
    const previousByClub: Partial<Record<ClubType, PreviousAnalysisContext>> = {};
    for (const c of ["driver", "iron", "approach"] as ClubType[]) {
      const prevRec = previousForClub(user.id, c);
      if (prevRec?.analysis?.topFocus?.title) {
        previousByClub[c] = {
          createdAt: prevRec.createdAt,
          topFocusTitle: prevRec.analysis.topFocus.title,
          mechanicsScores: (prevRec.analysis.mechanicsScores ?? []).map((s) => ({
            dim: s.dim,
            score: s.score,
          })),
        };
      }
    }

    const videos: AnalyzeVideo[] = saved.map((s) => ({
      view: s.view,
      filePath: s.tmpPath,
      mimeType: s.mimeType,
    }));

    const analysis = await analyzeSwingVideo({
      nickname: user.nickname,
      videos,
      clubHint,
      history,
      previousByClub,
    });

    // 추천 영상 검색 (실패해도 분석 결과는 그대로 전달)
    try {
      analysis.recommendations = await findRecommendations({
        clubType: analysis.clubType,
        grade: analysis.grade,
        topFocus: analysis.topFocus,
        weaknesses: analysis.weaknesses,
      });
    } catch (e) {
      console.warn("YouTube 추천 영상 검색 실패:", e);
      analysis.recommendations = [];
    }

    const record = saveAnalysis(user.id, analysis);
    const prev = previousForClub(user.id, analysis.clubType, record.createdAt);
    const delta = computeDelta(prev, record);
    const coach = getCoach(analysis.grade);

    // 성장 게이지: 다음 단계까지 남은 가중 점수 + 항목별 변화(이전 분석 대비)
    const target = nextLevelTarget(analysis.mechanicsWeighted ?? 0);
    const prevScores = prev?.analysis?.mechanicsScores;
    const dimensionDeltas = prevScores
      ? MECHANICS_DIMENSIONS.map((d) => ({
          dim: d,
          prev: prevScores.find((s) => s.dim === d)?.score ?? null,
          current:
            analysis.mechanicsScores.find((s) => s.dim === d)?.score ?? null,
        }))
      : null;

    return NextResponse.json({
      user,
      record,
      delta,
      coach,
      headCoach: HEAD_COACH,
      progress: {
        weighted: analysis.mechanicsWeighted ?? null,
        nextAt: target.nextAt,
        toNext: target.toNext,
        nextLabel: target.nextLabel,
        dimensionDeltas,
      },
      labels: {
        club: CLUB_LABEL[analysis.clubType],
        grade: GRADE_LABEL[analysis.grade],
      },
    });
  } catch (err) {
    console.error(err);
    const message =
      err instanceof Error ? err.message : "분석 중 알 수 없는 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await Promise.all(
      saved.map((s) => fs.unlink(s.tmpPath).catch(() => {})),
    );
  }
}
