import { NextResponse } from "next/server";
import { getOrCreateUser } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json()) as { nickname?: string };
  const nickname = (body.nickname ?? "").trim();
  if (!nickname) {
    return NextResponse.json(
      { error: "닉네임을 입력해 주세요." },
      { status: 400 },
    );
  }
  const user = getOrCreateUser(nickname);
  return NextResponse.json({ user });
}
