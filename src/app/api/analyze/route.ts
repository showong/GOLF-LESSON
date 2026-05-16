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
import { analyzeSwingVideo, type AnalyzeVideo } from "@/lib/gemini";
import { getCoach, HEAD_COACH } from "@/lib/coaches";
import { CLUB_LABEL, GRADE_LABEL } from "@/lib/types";
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
    });

    const record = saveAnalysis(user.id, analysis);
    const prev = previousForClub(user.id, analysis.clubType, record.createdAt);
    const delta = computeDelta(prev, record);
    const coach = getCoach(analysis.grade);

    return NextResponse.json({
      user,
      record,
      delta,
      coach,
      headCoach: HEAD_COACH,
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
