import { API, check, done, login } from "./_check";
console.log("1. Acesso e segurança da API");
for (const [m, p] of [["GET", "/ai/status"], ["POST", "/ai/chat"], ["POST", "/ai/tts"], ["POST", "/tts-ts"], ["GET", "/ask/stats"]] as const) {
  const r = await fetch(API + p, { method: m, headers: { "Content-Type": "application/json" }, body: m === "POST" ? "{}" : undefined });
  check(r.status === 401, `${m} ${p} sem login → 401 (veio ${r.status})`);
}
const bad = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "user1", password: "errada-xyz" }) });
check(bad.status === 401, "senha errada → 401");
const { r, cookie } = await login("user1");
check(r.status === 200, "login user1 → 200");
const sc = r.headers.get("set-cookie") || "";
check(/httponly/i.test(sc) && /samesite=lax/i.test(sc), "cookie é httpOnly e SameSite=Lax");
const me = await fetch(`${API}/auth/me`, { headers: { Cookie: cookie } });
check(me.status === 200, "/auth/me com cookie → 200");
const forged = await fetch(`${API}/auth/me`, { headers: { Cookie: "icaro_session=eyJ1IjoiYSJ9.assinatura-falsa" } });
check(forged.status === 401, "cookie falsificado → 401");
const h = await fetch(`${API}/auth/me`, { headers: { Cookie: cookie } });
check(h.headers.get("x-content-type-options") === "nosniff", "cabeçalho nosniff");
check(!h.headers.get("x-powered-by"), "x-powered-by oculto");
check(!!h.headers.get("strict-transport-security"), "HSTS presente");
done("validate-auth");
