import { createHmac, timingSafeEqual } from "node:crypto";

export type Role = "user" | "admin";
export type Session = { u: string; role: Role; exp: number };

export const COOKIE = "icaro_session";
export const SESSION_MS = 12 * 60 * 60 * 1000;

const ACCOUNTS: Record<string, { env: string; role: Role }> = {
  user1: { env: "ICARO_USER1_CODE", role: "user" },
  admin: { env: "ICARO_ADMIN_CODE", role: "admin" },
};

const secret = () => {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not configured");
  return s;
};

const sign = (body: string) => createHmac("sha256", secret()).update(body).digest("base64url");

const safeEqual = (a: string, b: string) => {
  const ha = createHmac("sha256", "cmp").update(a).digest();
  const hb = createHmac("sha256", "cmp").update(b).digest();
  return timingSafeEqual(ha, hb);
};

export type LoginResult = { ok: true; role: Role } | { ok: false; reason: "invalid" | "unconfigured" };

export function checkCredentials(username: string, password: string): LoginResult {
  const acc = Object.hasOwn(ACCOUNTS, username) ? ACCOUNTS[username] : undefined;
  if (!acc) return { ok: false, reason: "invalid" };
  const expected = process.env[acc.env];
  if (!expected) return { ok: false, reason: "unconfigured" };
  return safeEqual(password, expected) ? { ok: true, role: acc.role } : { ok: false, reason: "invalid" };
}

export function issueToken(u: string, role: Role): string {
  const body = Buffer.from(JSON.stringify({ u, role, exp: Date.now() + SESSION_MS } satisfies Session)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function readToken(token: unknown): Session | null {
  if (typeof token !== "string") return null;
  const [body, sig] = token.split(".");
  if (!body || !sig || !safeEqual(sig, sign(body))) return null;
  try {
    const s = JSON.parse(Buffer.from(body, "base64url").toString()) as Session;
    return s.exp > Date.now() && (s.role === "user" || s.role === "admin") ? s : null;
  } catch {
    return null;
  }
}
