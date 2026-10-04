import type { SharedLimit } from "./deployment-db";
import { clientKeyFromRequest } from "./identity";

function envNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** 쿠키를 지워 새 사용자로 위장해도 적용되는 업로드 제한. */
export function uploadSharedLimits(request: Request): SharedLimit[] {
  const clientKey = clientKeyFromRequest(request);
  return clientKey
    ? [
        {
          subject: clientKey,
          limit: envNumber("UPLOAD_REQUESTS_PER_IP_PER_MINUTE", 12),
          windowSeconds: 60,
        },
      ]
    : [];
}

/** IP별 분석 제한과 서비스 전체 24시간 상한(Gemini 비용 상한). */
export function analysisSharedLimits(request: Request): SharedLimit[] {
  const clientKey = clientKeyFromRequest(request);
  return [
    ...(clientKey
      ? [
          {
            subject: clientKey,
            limit: envNumber("ANALYSIS_REQUESTS_PER_IP_PER_HOUR", 20),
            windowSeconds: 60 * 60,
          },
        ]
      : []),
    {
      subject: "global",
      limit: envNumber("ANALYSIS_GLOBAL_DAILY_LIMIT", 500),
      windowSeconds: 24 * 60 * 60,
      message: "오늘 준비된 분석 횟수가 모두 소진되었어요. 내일 다시 시도해 주세요.",
    },
  ];
}
