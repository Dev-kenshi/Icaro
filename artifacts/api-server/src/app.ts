import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type ErrorRequestHandler, type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.disable("x-powered-by");
// Replit serves this API through one trusted proxy and forwards the client IP.
app.set("trust proxy", 1);

const itcontCsp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https://static.even3.com https://images.even3.com https://server.arcgisonline.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https://server.arcgisonline.com",
  "worker-src 'self' blob:",
  "media-src 'self' data: blob:",
  "frame-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");

app.use((req, res, next) => {
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");

  const path = req.path.replace(/\/+$/, "") || "/";
  if (path === "/" || path === "/itcont") {
    res.setHeader("Permissions-Policy", "camera=(), geolocation=(), microphone=(), payment=()");
    const cspHeader = process.env.CSP_REPORT_ONLY === "1"
      ? "Content-Security-Policy-Report-Only"
      : "Content-Security-Policy";
    res.setHeader(cspHeader, itcontCsp);
  }

  next();
});

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Rota não encontrada." });
});

// Fora do Replit (ex.: Render) o mesmo processo serve o frontend buildado.
const staticDir =
  process.env.STATIC_DIR ||
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../icaro/dist/public");
if (fs.existsSync(path.join(staticDir, "index.html"))) {
  app.use(
    express.static(staticDir, {
      index: false,
      setHeaders: (res, file) => {
        res.setHeader(
          "Cache-Control",
          file.includes(`${path.sep}assets${path.sep}`) ? "public, max-age=31536000, immutable" : "no-cache",
        );
      },
    }),
  );
  app.get(/^\/(?!api(\/|$)).*/, (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(staticDir, "index.html"));
  });
}

app.use((_req, res) => {
  res.status(404).json({ error: "Rota não encontrada." });
});

const apiErrorHandler: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  const details = error as { status?: unknown; statusCode?: unknown };
  const candidate = typeof details?.status === "number" ? details.status : details?.statusCode;
  const statusCode = typeof candidate === "number"
    && Number.isInteger(candidate)
    && candidate >= 400
    && candidate <= 599
    ? candidate
    : 500;

  if (statusCode >= 500) req.log.error({ statusCode }, "API request failed");
  res.status(statusCode).json({
    error: statusCode === 413
      ? "A solicitação excede o limite permitido."
      : statusCode < 500
        ? "O corpo da solicitação é inválido."
        : "Erro interno do servidor.",
  });
};

app.use(apiErrorHandler);

export default app;
