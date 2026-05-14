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
import { analyzeSwingVideo } from "@/lib/gemini";
import { getCoach, HEAD_COACH } from "@/lib/coaches";
import { CLUB_LABEL, GRADE_LABEL } from "@/lib/types";
import type { ClubType } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const ALLOWED_MIME = new Set([
  "video/mp4",
  "video/quicktime",
  "video/x-m4v",
  "video/webm",
]);

export async function POST(req: Request) {
  const form = await req.formData();
  const nickname = String(form.get("nickname") ?? "").trim();
  const file = form.get("video");
  const rawHint = String(form.get("clubHint") ?? "").trim();
  const clubHint: ClubType | undefined =
    rawHint === "driver" || rawHint === "iron" || rawHint === "approach"
      ? rawHint
      : undefined;

  if (!nickname) {
    return NextResponse.json({ error: "닉네임이 필요합니다." }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "스윙 영상 파일을 첨부해 주세요." },
      { status: 400 },
    );
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json(
      { error: `지원하지 않는 영상 형식입니다: ${file.type || "unknown"}` },
      { status: 400 },
    );
  }
  if (file.size > 80 * 1024 * 1024) {
    return NextResponse.json(
      { error: "영상이 너무 큽니다(최대 80MB)." },
      { status: 413 },
    );
  }

  const user = getOrCreateUser(nickname);

  const uploadDir = process.env.UPLOAD_DIR ?? "./uploads";
  await fs.mkdir(uploadDir, { recursive: true });
  const ext = path.extname(file.name) || ".mp4";
  const tmpPath = path.join(uploadDir, `${uuidv4()}${ext}`);
  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(tmpPath, buf);

  try {
    // 어느 클럽일지 모르는 상태이므로 최근 모든 클럽의 기록 일부를 컨텍스트로 전달.
    const history = (
      ["driver", "iron", "approach"] as ClubType[]
    ).flatMap((c) =>
      recentSummaryForClub(user.id, c, 2).map((h) => ({ ...h, clubType: c })),
    );

    const analysis = await analyzeSwingVideo({
      nickname: user.nickname,
      filePath: tmpPath,
      mimeType: file.type,
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
    await fs.unlink(tmpPath).catch(() => {});
  }
}
