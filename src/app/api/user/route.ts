import { NextResponse } from "next/server";
import { getOrCreateUser, hasConsent, recordConsent } from "@/lib/db";
import {
  createOwnerToken,
  OWNER_COOKIE,
  ownerCookieOptions,
  ownerIdFromRequest,
} from "@/lib/identity";
import { TERMS_VERSION } from "@/lib/legal";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json()) as { nickname?: string; consentVersion?: string };
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
  if (body.consentVersion === TERMS_VERSION) await recordConsent(user.id, TERMS_VERSION);
  const consented = await hasConsent(user.id, TERMS_VERSION);
  const response = NextResponse.json({ user, consented, termsVersion: TERMS_VERSION });
  if (ownerToken) {
    response.cookies.set(OWNER_COOKIE, ownerToken, ownerCookieOptions);
  }
  return response;
}
