import type { VideoView } from "./types";

export const ALLOWED_VIDEO_MIME = new Set([
  "video/mp4",
  "video/quicktime",
  "video/x-m4v",
  "video/webm",
]);

export const MAX_UPLOAD_FILE_BYTES = Number(
  process.env.MAX_UPLOAD_FILE_BYTES ?? 80 * 1024 * 1024,
);
export const MAX_UPLOAD_TOTAL_BYTES = Number(
  process.env.MAX_UPLOAD_TOTAL_BYTES ?? 240 * 1024 * 1024,
);
export const MAX_UPLOAD_FILES = 6;

export interface UploadFileInput {
  name: string;
  type: string;
  size: number;
  view: VideoView;
  swingIndex: number;
}

export function validateUploadBatch(raw: unknown): UploadFileInput[] {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_UPLOAD_FILES) {
    throw new Error(`영상은 한 번에 1~${MAX_UPLOAD_FILES}개까지 업로드할 수 있습니다.`);
  }
  const files = raw.map((item) => {
    const value = item as Partial<UploadFileInput>;
    const name = String(value.name ?? "").trim();
    const type = String(value.type ?? "").trim().toLowerCase();
    const size = Number(value.size);
    const view = value.view;
    const swingIndex = Number(value.swingIndex);
    if (!name || name.length > 180) throw new Error("영상 파일명이 올바르지 않습니다.");
    if (!ALLOWED_VIDEO_MIME.has(type)) {
      throw new Error(`지원하지 않는 영상 형식입니다: ${type || "unknown"}`);
    }
    if (!Number.isSafeInteger(size) || size < 1 || size > MAX_UPLOAD_FILE_BYTES) {
      throw new Error(`영상 한 개는 최대 ${Math.floor(MAX_UPLOAD_FILE_BYTES / 1024 / 1024)}MB입니다.`);
    }
    if (view !== "side" && view !== "front") throw new Error("촬영 시점이 올바르지 않습니다.");
    if (!Number.isInteger(swingIndex) || swingIndex < 0 || swingIndex > 2) {
      throw new Error("스윙 번호가 올바르지 않습니다.");
    }
    return { name, type, size, view, swingIndex };
  });
  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (total > MAX_UPLOAD_TOTAL_BYTES) {
    throw new Error(`전체 영상 용량은 최대 ${Math.floor(MAX_UPLOAD_TOTAL_BYTES / 1024 / 1024)}MB입니다.`);
  }
  const keys = files.map((file) => `${file.swingIndex}:${file.view}`);
  if (new Set(keys).size !== keys.length) {
    throw new Error("같은 스윙 번호와 촬영 시점의 영상은 한 개만 등록할 수 있습니다.");
  }
  return files;
}

export function extensionForMime(mimeType: string): string {
  if (mimeType === "video/quicktime") return ".mov";
  if (mimeType === "video/x-m4v") return ".m4v";
  if (mimeType === "video/webm") return ".webm";
  return ".mp4";
}
