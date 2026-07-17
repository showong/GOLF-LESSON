import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { VideoRow } from "./deployment-db";

let storageHealthCheckedAt = 0;

function isS3Mode() {
  return (
    process.env.STORAGE_MODE === "s3" ||
    Boolean(process.env.BUCKET_ENDPOINT ?? process.env.AWS_ENDPOINT_URL)
  );
}

function storageSecret() {
  return process.env.STORAGE_SIGNING_SECRET ?? process.env.SESSION_SECRET ?? "local-storage-only";
}

function localToken(video: VideoRow) {
  return crypto
    .createHmac("sha256", storageSecret())
    .update(`${video.id}:${video.userId}:${video.sizeBytes}:${video.mimeType}`)
    .digest("base64url");
}

export function verifyLocalUploadToken(video: VideoRow, token: string | null): boolean {
  if (!token) return false;
  const expected = Buffer.from(localToken(video));
  const supplied = Buffer.from(token);
  return expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied);
}

function s3Client() {
  const endpoint = process.env.BUCKET_ENDPOINT ?? process.env.AWS_ENDPOINT_URL;
  const accessKeyId = process.env.BUCKET_ACCESS_KEY_ID ?? process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey =
    process.env.BUCKET_SECRET_ACCESS_KEY ?? process.env.AWS_SECRET_ACCESS_KEY;
  const bucketName = process.env.BUCKET_NAME ?? process.env.AWS_S3_BUCKET_NAME;
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucketName) {
    throw new Error("Storage Bucket 환경 변수가 완전하지 않습니다.");
  }
  const urlStyle = process.env.AWS_S3_URL_STYLE;
  const forcePathStyle = process.env.BUCKET_FORCE_PATH_STYLE
    ? process.env.BUCKET_FORCE_PATH_STYLE === "true"
    : urlStyle === "path";
  return new S3Client({
    endpoint,
    region: process.env.BUCKET_REGION ?? process.env.AWS_DEFAULT_REGION ?? "auto",
    forcePathStyle,
    credentials: { accessKeyId, secretAccessKey },
  });
}

function bucketName() {
  const name = process.env.BUCKET_NAME ?? process.env.AWS_S3_BUCKET_NAME;
  if (!name) throw new Error("Storage Bucket 이름이 필요합니다.");
  return name;
}

function localBaseDir() {
  return path.resolve(
    /*turbopackIgnore: true*/
    process.env.LOCAL_BUCKET_DIR ?? "./data/local-bucket",
  );
}

export function localObjectPath(objectKey: string) {
  const target = path.resolve(/*turbopackIgnore: true*/ localBaseDir(), objectKey);
  const base = `${localBaseDir()}${path.sep}`;
  if (!target.startsWith(base)) throw new Error("잘못된 저장 경로입니다.");
  return target;
}

export async function createDirectUploadTarget(video: VideoRow) {
  if (!isS3Mode()) {
    return {
      url: `/api/uploads/local/${video.id}?token=${encodeURIComponent(localToken(video))}`,
      method: "PUT" as const,
      headers: { "Content-Type": video.mimeType },
    };
  }
  const command = new PutObjectCommand({
    Bucket: bucketName(),
    Key: video.objectKey,
    ContentType: video.mimeType,
    ContentLength: video.sizeBytes,
    Metadata: { owner: video.userId, video: video.id },
  });
  return {
    url: await getSignedUrl(s3Client(), command, { expiresIn: 15 * 60 }),
    method: "PUT" as const,
    headers: { "Content-Type": video.mimeType },
  };
}

export async function verifyStoredVideo(video: VideoRow): Promise<boolean> {
  if (!isS3Mode()) {
    const stat = await fsp
      .stat(/*turbopackIgnore: true*/ localObjectPath(video.objectKey))
      .catch(() => null);
    return stat?.isFile() === true && stat.size === video.sizeBytes;
  }
  const head = await s3Client().send(
    new HeadObjectCommand({ Bucket: bucketName(), Key: video.objectKey }),
  );
  return Number(head.ContentLength) === video.sizeBytes && head.ContentType === video.mimeType;
}

export async function materializeVideo(video: VideoRow, destination: string) {
  await fsp.mkdir(path.dirname(destination), { recursive: true });
  if (!isS3Mode()) {
    await fsp.copyFile(
      /*turbopackIgnore: true*/ localObjectPath(video.objectKey),
      destination,
    );
    return;
  }
  const response = await s3Client().send(
    new GetObjectCommand({ Bucket: bucketName(), Key: video.objectKey }),
  );
  if (!response.Body) throw new Error("Bucket에서 영상 본문을 받지 못했습니다.");
  await pipeline(response.Body as NodeJS.ReadableStream, fs.createWriteStream(destination));
}

export async function deleteStoredVideo(video: VideoRow): Promise<void> {
  if (!isS3Mode()) {
    await fsp.unlink(/*turbopackIgnore: true*/ localObjectPath(video.objectKey)).catch((error) => {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    });
    return;
  }
  await s3Client().send(new DeleteObjectCommand({ Bucket: bucketName(), Key: video.objectKey }));
}

export async function checkStorageHealth(): Promise<void> {
  if (!isS3Mode()) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("운영 환경에서는 로컬 저장소를 사용할 수 없습니다.");
    }
    await fsp.mkdir(/*turbopackIgnore: true*/ localBaseDir(), { recursive: true });
    return;
  }
  if (Date.now() - storageHealthCheckedAt < 30_000) return;
  await s3Client().send(new HeadBucketCommand({ Bucket: bucketName() }));
  storageHealthCheckedAt = Date.now();
}

export function storageMode() {
  return isS3Mode() ? "s3" : "local";
}
