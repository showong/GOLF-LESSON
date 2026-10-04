import { NextResponse } from "next/server";
import { getOrCreateUser, hasConsent, recordConsent } from "@/lib/db";
import {
  createOwnerToken,
  OWNER_COOKIE,
  ownerCookieOptions,
  ownerIdFromRequest,
} from "@/lib/identity";
import { TERMS_VERSION } from "@/lib/legal";
import { deleteUserData } from "@/lib/retention";

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

/** 내 기록 전체 삭제: 영상 파일, 분석·작업·요청 기록, 닉네임을 지우고 식별 쿠키를 만료시킨다. */
export async function DELETE(req: Request) {
  const userId = ownerIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "사용자 세션이 필요합니다." }, { status: 401 });
  }
  try {
    await deleteUserData(userId);
  } catch (error) {
    console.error("user data deletion failed", error);
    return NextResponse.json(
      { error: "기록을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 500 },
    );
  }
  const response = NextResponse.json({ deleted: true });
  response.cookies.set(OWNER_COOKIE, "", { ...ownerCookieOptions, maxAge: 0 });
  return response;
}
