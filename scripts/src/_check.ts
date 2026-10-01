export const API = process.env.API_URL || `http://localhost:${process.env.API_PORT || 8080}/api`;
let failed = 0, passed = 0;
export function check(cond: unknown, msg: string) {
  if (cond) { passed++; console.log("  ok  ", msg); } else { failed++; console.log("  FALHA", msg); }
}
export function done(name: string): never {
  console.log(`\n${name}: ${passed} ok, ${failed} falha(s)`);
  process.exit(failed ? 1 : 0);
}
export async function login(user = "user1") {
  const code = process.env[user === "admin" ? "ICARO_ADMIN_CODE" : "ICARO_USER1_CODE"];
  if (!code) throw new Error("Código de acesso não configurado no ambiente.");
  const r = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: user, password: code }) });
  const cookie = (r.headers.get("set-cookie") || "").split(";")[0];
  return { r, cookie };
}
export async function ask(cookie: string, question: string) {
  const t = Date.now();
  const r = await fetch(`${API}/ai/chat`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ provider: "groq", persona: "icaro", question, history: [], dataset: null }) });
  const j = (await r.json()) as { answer?: string; fonte?: string; provider?: string; confianca?: number };
  return { status: r.status, ms: Date.now() - t, ...j };
}
