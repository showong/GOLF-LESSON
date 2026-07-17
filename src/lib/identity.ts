import crypto from "node:crypto";
import { v4 as uuidv4 } from "uuid";

export const OWNER_COOKIE = "golf_owner";

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (value) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET 환경 변수가 필요합니다.");
  }
  return "local-development-only-change-me";
}

function signature(userId: string): string {
  return crypto.createHmac("sha256", secret()).update(userId).digest("base64url");
}

export function createOwnerToken(userId = uuidv4()): string {
  return `${userId}.${signature(userId)}`;
}

export function verifyOwnerToken(token: string | null | undefined): string | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const userId = token.slice(0, dot);
  const supplied = token.slice(dot + 1);
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return null;
  const expected = signature(userId);
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return userId;
}

export function ownerIdFromRequest(request: Request): string | null {
  const cookie = request.headers.get("cookie") ?? "";
  const value = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${OWNER_COOKIE}=`))
    ?.slice(OWNER_COOKIE.length + 1);
  return verifyOwnerToken(value ? decodeURIComponent(value) : null);
}

export const ownerCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
};
