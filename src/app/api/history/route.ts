import { NextResponse } from "next/server";
import { getUserById, listHistory } from "@/lib/db";
import { ownerIdFromRequest } from "@/lib/identity";
import { CLUB_LABEL, type ClubType } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const userId = ownerIdFromRequest(req);
  if (!userId) {
    return NextResponse.json(
      { error: "사용자 세션이 필요합니다." },
      { status: 401 },
    );
  }
  const user = await getUserById(userId);
  if (!user) {
    return NextResponse.json({ error: "사용자를 찾을 수 없습니다." }, { status: 404 });
  }
  const records = await listHistory(user.id);

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
