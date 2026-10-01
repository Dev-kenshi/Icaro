import { Router, type IRouter } from "express";
import { COOKIE, SESSION_MS, checkCredentials, issueToken, readToken } from "../lib/auth";

const router: IRouter = Router();
const fails = new Map<string, { n: number; until: number }>();
const MAX = 5;
const LOCK_MS = 60_000;

const cookieOpts = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_MS };

router.post("/auth/login", (req, res) => {
  const { username, password } = (req.body ?? {}) as { username?: unknown; password?: unknown };
  if (typeof username !== "string" || typeof password !== "string" || !username || !password || password.length > 200) {
    res.status(400).json({ error: "Informe usuário e senha." });
    return;
  }
  const key = `${req.ip}|${username.toLowerCase()}`;
  const f = fails.get(key);
  if (f && f.n >= MAX && f.until > Date.now()) {
    res.status(429).json({ error: "Muitas tentativas. Aguarde um minuto." });
    return;
  }
  const r = checkCredentials(username.toLowerCase(), password);
  if (!r.ok) {
    if (r.reason === "unconfigured") {
      req.log.error({ username }, "login password secret not configured");
      res.status(503).json({ error: "Acesso indisponível: senha não configurada no servidor." });
      return;
    }
    fails.set(key, { n: (f && f.until > Date.now() ? f.n : 0) + 1, until: Date.now() + LOCK_MS });
    res.status(401).json({ error: "Usuário ou senha inválidos." });
    return;
  }
  fails.delete(key);
  const u = username.toLowerCase();
  res.cookie(COOKIE, issueToken(u, r.role), cookieOpts);
  res.json({ username: u, role: r.role });
});

router.post("/auth/logout", (_req, res) => {
  res.clearCookie(COOKIE, { ...cookieOpts, maxAge: undefined });
  res.status(204).end();
});

router.get("/auth/me", (req, res) => {
  const s = readToken(req.cookies?.[COOKIE]);
  if (!s) {
    res.status(401).json({ error: "Não autenticado." });
    return;
  }
  res.json({ username: s.u, role: s.role });
});

export default router;
