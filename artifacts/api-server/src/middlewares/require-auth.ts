import type { RequestHandler } from "express";
import { COOKIE, readToken, type Role } from "../lib/auth";

export const requireAuth =
  (role?: Role): RequestHandler =>
  (req, res, next) => {
    const s = readToken(req.cookies?.[COOKIE]);
    if (!s || (role && s.role !== role)) {
      res.status(s ? 403 : 401).json({ error: s ? "Acesso negado." : "Autenticação necessária." });
      return;
    }
    next();
  };
