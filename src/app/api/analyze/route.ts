import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(
    {
      error: "대용량 직접 업로드 API로 이전되었습니다.",
      uploadEndpoint: "/api/uploads/presign",
      jobEndpoint: "/api/analyze/jobs",
    },
    { status: 410 },
  );
}
