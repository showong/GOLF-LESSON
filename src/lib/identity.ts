import crypto from "node:crypto";
import { v4 as uuidv4 } from "uuid";

export const OWNER_COOKIE = "golf_owner";
export const PILOT_COOKIE = "golf_pilot";

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

function pilotSignature(): string {
  return crypto.createHmac("sha256", secret()).update("pilot-access-v1").digest("base64url");
}

function cookieValue(request: Request, name: string): string | null {
  const cookie = request.headers.get("cookie") ?? "";
  const value = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  return value ? decodeURIComponent(value) : null;
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
  return verifyOwnerToken(cookieValue(request, OWNER_COOKIE));
}

export const ownerCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
};

export const pilotCookieOptions = {
  ...ownerCookieOptions,
  maxAge: 60 * 60 * 24 * 30,
};

export function pilotAccessRequired(): boolean {
  return process.env.PILOT_ACCESS_REQUIRED === "true" || process.env.NODE_ENV === "production";
}

export function hasPilotAccess(request: Request): boolean {
  if (!pilotAccessRequired()) return true;
  const supplied = cookieValue(request, PILOT_COOKIE);
  const expected = pilotSignature();
  if (!supplied) return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function verifyPilotAccessCode(accessCode: string | null | undefined): boolean {
  if (!pilotAccessRequired()) return true;
  const expectedHex = process.env.PILOT_ACCESS_CODE_SHA256?.trim().toLowerCase() ?? "";
  if (!/^[0-9a-f]{64}$/.test(expectedHex) || !accessCode) return false;
  const suppliedHex = crypto.createHash("sha256").update(accessCode).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(suppliedHex), Buffer.from(expectedHex));
}

export function createPilotAccessToken(): string {
  return pilotSignature();
}
