import { NextResponse } from "next/server";
import { getOrCreateUser, listHistory } from "@/lib/db";
import { CLUB_LABEL, type ClubType } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const nickname = (url.searchParams.get("nickname") ?? "").trim();
  if (!nickname) {
    return NextResponse.json(
      { error: "닉네임 쿼리 파라미터가 필요합니다." },
      { status: 400 },
    );
  }
  const user = getOrCreateUser(nickname);
  const records = listHistory(user.id);

  const sections: Record<ClubType, typeof records> = {
    driver: [],
    iron: [],
    approach: [],
  };
  for (const r of records) sections[r.clubType].push(r);

  return NextResponse.json({
    user,
    sections: (["driver", "iron", "approach"] as ClubType[]).map((c) => ({
      clubType: c,
      label: CLUB_LABEL[c],
      records: sections[c],
    })),
  });
}
