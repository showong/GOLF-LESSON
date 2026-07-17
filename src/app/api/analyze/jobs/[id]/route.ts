import { NextResponse } from "next/server";
import { buildAnalysisResponse } from "@/lib/analysis-service";
import { getJobForUser } from "@/lib/deployment-db";
import { ownerIdFromRequest } from "@/lib/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const userId = ownerIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: "사용자 세션이 필요합니다." }, { status: 401 });
  const { id } = await context.params;
  const job = await getJobForUser(userId, id);
  if (!job) return NextResponse.json({ error: "분석 작업을 찾을 수 없습니다." }, { status: 404 });
  if (job.status === "completed" && job.resultAnalysisId) {
    const result = await buildAnalysisResponse(userId, job.resultAnalysisId);
    if (!result) return NextResponse.json({ error: "분석 결과를 찾을 수 없습니다." }, { status: 500 });
    return NextResponse.json({ jobId: job.id, status: job.status, result });
  }
  return NextResponse.json({
    jobId: job.id,
    status: job.status,
    error: job.status === "failed" ? "분석을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요." : undefined,
  });
}
