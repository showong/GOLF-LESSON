import { NextResponse } from "next/server";
import { getOrCreateUser } from "@/lib/db";
import {
  createOwnerToken,
  OWNER_COOKIE,
  ownerCookieOptions,
  ownerIdFromRequest,
} from "@/lib/identity";

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
  const currentOwnerId = ownerIdFromRequest(req);
  const ownerToken = currentOwnerId ? null : createOwnerToken();
  const userId = currentOwnerId ?? ownerToken!.slice(0, ownerToken!.lastIndexOf("."));
  const user = await getOrCreateUser(userId, nickname);
  const response = NextResponse.json({ user });
  if (ownerToken) {
    response.cookies.set(OWNER_COOKIE, ownerToken, ownerCookieOptions);
  }
  return response;
}
