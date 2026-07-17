const MIN_SECRET_LENGTH = 32;

function text(name: string): string {
  return process.env[name]?.trim() ?? "";
}

function requireText(errors: string[], name: string) {
  if (!text(name)) errors.push(`${name} 환경 변수가 필요합니다.`);
}

function requireSecret(errors: string[], name: string) {
  const value = text(name);
  if (value.length < MIN_SECRET_LENGTH) {
    errors.push(`${name}은 ${MIN_SECRET_LENGTH}자 이상이어야 합니다.`);
  }
  if (/replace|example|change-me|your_/i.test(value)) {
    errors.push(`${name}에 예시 값을 사용할 수 없습니다.`);
  }
}

function requireInteger(
  errors: string[],
  name: string,
  fallback: number,
  min: number,
  max: number,
) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    errors.push(`${name}은 ${min}~${max} 범위의 정수여야 합니다.`);
  }
}

export function productionConfigurationErrors(): string[] {
  if (process.env.NODE_ENV !== "production") return [];

  const errors: string[] = [];
  requireSecret(errors, "SESSION_SECRET");
  requireSecret(errors, "STORAGE_SIGNING_SECRET");
  requireText(errors, "DATABASE_URL");
  requireText(errors, "REDIS_URL");
  requireText(errors, "GEMINI_API_KEY");
  requireText(errors, "FFMPEG_PATH");
  requireText(errors, "PRIVACY_CONTACT_EMAIL");

  if (text("PILOT_ACCESS_REQUIRED") !== "true") {
    errors.push("파일럿 운영 환경에서는 PILOT_ACCESS_REQUIRED=true가 필요합니다.");
  }
  if (!/^[0-9a-f]{64}$/i.test(text("PILOT_ACCESS_CODE_SHA256"))) {
    errors.push("PILOT_ACCESS_CODE_SHA256는 초대 코드의 SHA-256 16진수 값이어야 합니다.");
  }

  if (text("QUEUE_MODE") !== "redis") {
    errors.push("운영 QUEUE_MODE는 redis여야 합니다.");
  }
  if (text("STORAGE_MODE") !== "s3") {
    errors.push("운영 STORAGE_MODE는 s3여야 합니다.");
  }
  for (const name of [
    "BUCKET_ENDPOINT",
    "BUCKET_NAME",
    "BUCKET_ACCESS_KEY_ID",
    "BUCKET_SECRET_ACCESS_KEY",
  ]) {
    const awsAlternative: Record<string, string> = {
      BUCKET_ENDPOINT: "AWS_ENDPOINT_URL",
      BUCKET_NAME: "AWS_S3_BUCKET_NAME",
      BUCKET_ACCESS_KEY_ID: "AWS_ACCESS_KEY_ID",
      BUCKET_SECRET_ACCESS_KEY: "AWS_SECRET_ACCESS_KEY",
    };
    if (!text(name) && !text(awsAlternative[name])) {
      errors.push(`${name} 또는 ${awsAlternative[name]} 환경 변수가 필요합니다.`);
    }
  }
  if (text("GEMINI_PAID_SERVICE_ACKNOWLEDGED") !== "true") {
    errors.push("실사용자 영상은 유료 Gemini 프로젝트임을 확인해야 합니다.");
  }
  if (text("YOUTUBE_RECOMMENDATIONS_ENABLED") === "true" && !text("YOUTUBE_API_KEY")) {
    errors.push("YouTube 추천을 활성화하려면 YOUTUBE_API_KEY가 필요합니다.");
  }

  const origin = text("PUBLIC_APP_ORIGIN");
  if (!origin || !/^https:\/\/[^/]+/i.test(origin)) {
    errors.push("PUBLIC_APP_ORIGIN은 https URL이어야 합니다.");
  }
  const contact = text("PRIVACY_CONTACT_EMAIL");
  if (contact && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) {
    errors.push("PRIVACY_CONTACT_EMAIL 형식이 올바르지 않습니다.");
  }

  requireInteger(errors, "PG_POOL_MAX", 10, 1, 50);
  requireInteger(errors, "WORKER_CONCURRENCY", 1, 1, 4);
  requireInteger(errors, "MAX_UPLOAD_FILE_BYTES", 80 * 1024 * 1024, 1024, 200 * 1024 * 1024);
  requireInteger(errors, "MAX_UPLOAD_TOTAL_BYTES", 240 * 1024 * 1024, 1024, 600 * 1024 * 1024);
  requireInteger(errors, "MAX_VIDEO_DURATION_SECONDS", 45, 1, 120);
  requireInteger(errors, "MAX_VIDEO_PIXELS", 3840 * 2160, 320 * 240, 7680 * 4320);
  requireInteger(errors, "UPLOAD_REQUESTS_PER_MINUTE", 6, 1, 60);
  requireInteger(errors, "ANALYSIS_REQUESTS_PER_HOUR", 12, 1, 200);
  requireInteger(errors, "VIDEO_RETENTION_DAYS", 30, 1, 365);
  requireInteger(errors, "GEMINI_HTTP_TIMEOUT_MS", 120_000, 10_000, 300_000);
  requireInteger(errors, "WORKER_LOCK_DURATION_MS", 600_000, 60_000, 1_800_000);
  requireInteger(errors, "ANALYSIS_JOB_TIMEOUT_MINUTES", 45, 15, 180);

  return errors;
}

export function assertProductionConfiguration(): void {
  const errors = productionConfigurationErrors();
  if (errors.length > 0) {
    throw new Error(`운영 환경 설정이 안전하지 않습니다:\n- ${errors.join("\n- ")}`);
  }
}

export function youtubeRecommendationsEnabled(): boolean {
  return process.env.YOUTUBE_RECOMMENDATIONS_ENABLED === "true";
}
