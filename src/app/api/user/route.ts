import { NextResponse } from "next/server";
import { deleteUserRecord, getOrCreateUser, recordUserConsent } from "@/lib/db";
import { listVideosForUser } from "@/lib/deployment-db";
import {
  createOwnerToken,
  createPilotAccessToken,
  hasPilotAccess,
  OWNER_COOKIE,
  ownerCookieOptions,
  ownerIdFromRequest,
  PILOT_COOKIE,
  pilotCookieOptions,
  verifyPilotAccessCode,
} from "@/lib/identity";
import { deleteStoredVideo } from "@/lib/storage";

export const runtime = "nodejs";

async function handlePost(req: Request) {
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > 16 * 1024) {
    return NextResponse.json({ error: "사용자 요청 정보가 너무 큽니다." }, { status: 413 });
  }
  const body = (await req.json()) as {
    nickname?: string;
    pilotAccessCode?: string;
    termsAccepted?: boolean;
    privacyAccepted?: boolean;
    serviceAnalysisAccepted?: boolean;
    age18Confirmed?: boolean;
    videoRightsConfirmed?: boolean;
    modelImprovementConsent?: boolean;
  };
  const nickname = (body.nickname ?? "").trim();
  if (!nickname || nickname.length > 40) {
    return NextResponse.json(
      { error: "닉네임을 입력해 주세요." },
      { status: 400 },
    );
  }
  const accessGranted = hasPilotAccess(req) || verifyPilotAccessCode(body.pilotAccessCode);
  if (!accessGranted) {
    return NextResponse.json({ error: "유효한 파일럿 초대 코드가 필요합니다." }, { status: 403 });
  }
  if (
    body.termsAccepted !== true ||
    body.privacyAccepted !== true ||
    body.serviceAnalysisAccepted !== true ||
    body.age18Confirmed !== true ||
    body.videoRightsConfirmed !== true
  ) {
    return NextResponse.json(
      { error: "필수 이용 동의와 영상 권리 확인이 필요합니다." },
      { status: 400 },
    );
  }
  const currentOwnerId = ownerIdFromRequest(req);
  const ownerToken = currentOwnerId ? null : createOwnerToken();
  const userId = currentOwnerId ?? ownerToken!.slice(0, ownerToken!.lastIndexOf("."));
  const user = await getOrCreateUser(userId, nickname);
  await recordUserConsent(userId, {
    termsAccepted: body.termsAccepted === true,
    privacyAccepted: body.privacyAccepted === true,
    serviceAnalysisAccepted: body.serviceAnalysisAccepted === true,
    age18Confirmed: body.age18Confirmed === true,
    videoRightsConfirmed: body.videoRightsConfirmed === true,
    modelImprovementConsent: body.modelImprovementConsent === true,
  });
  const response = NextResponse.json({ user });
  if (ownerToken) {
    response.cookies.set(OWNER_COOKIE, ownerToken, ownerCookieOptions);
  }
  if (!hasPilotAccess(req)) {
    response.cookies.set(PILOT_COOKIE, createPilotAccessToken(), pilotCookieOptions);
  }
  return response;
}

export async function POST(req: Request) {
  try {
    return await handlePost(req);
  } catch (error) {
    console.warn("user session request rejected", error);
    return NextResponse.json({ error: "사용자 정보를 확인해 주세요." }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const userId = ownerIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "사용자 세션이 필요합니다." }, { status: 401 });
  }
  try {
    const videos = await listVideosForUser(userId);
    const deletions = await Promise.allSettled(videos.map((video) => deleteStoredVideo(video)));
    const failed = deletions.filter((result) => result.status === "rejected");
    if (failed.length > 0) {
      console.error("account storage deletion failed", failed);
      return NextResponse.json(
        { error: "영상 삭제를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요." },
        { status: 503 },
      );
    }
    await deleteUserRecord(userId);
    const response = NextResponse.json({ deleted: true });
    response.cookies.set(OWNER_COOKIE, "", { ...ownerCookieOptions, maxAge: 0 });
    response.cookies.set(PILOT_COOKIE, "", { ...pilotCookieOptions, maxAge: 0 });
    return response;
  } catch (error) {
    console.error("account deletion failed", error);
    return NextResponse.json({ error: "계정 데이터 삭제에 실패했습니다." }, { status: 500 });
  }
}
