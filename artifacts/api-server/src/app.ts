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

const canonicalHost = (process.env.CANONICAL_HOST ?? "itcont-uefs.onrender.com")
  .trim()
  .replace(/^https?:\/\//i, "")
  .replace(/\/+$/, "")
  .toLowerCase();
if (!/^[a-z0-9.-]+$/.test(canonicalHost)) {
  throw new Error("CANONICAL_HOST must be a hostname without a path or port");
}
const LEGACY_HOSTS = new Set(["icaro-0q50.onrender.com"]);

const itcontCsp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https://static.even3.com https://images.even3.com https://server.arcgisonline.com https://gibs.earthdata.nasa.gov",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https://server.arcgisonline.com https://gibs.earthdata.nasa.gov",
  "worker-src 'self' blob:",
  "media-src 'self' data: blob:",
  "frame-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");

const icaroCsp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "script-src 'self' 'wasm-unsafe-eval' https://open.spotify.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https://static.even3.com https://images.even3.com https://server.arcgisonline.com https://gibs.earthdata.nasa.gov https://www.solarsystemscope.com https://i.scdn.co https://image-cdn-ak.spotifycdn.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https://api.bcb.gov.br https://open.er-api.com https://api.open-meteo.com https://geocoding-api.open-meteo.com https://nominatim.openstreetmap.org https://photon.komoot.io https://server.arcgisonline.com https://gibs.earthdata.nasa.gov https://www.solarsystemscope.com https://open.spotify.com",
  "worker-src 'self' blob:",
  "media-src 'self' data: blob:",
  "frame-src 'self' https://open.spotify.com https://calendar.google.com https://www.google.com",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");

app.use((req, res, next) => {
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");

  const path = req.path.replace(/\/+$/, "") || "/";
  const hostHeader = (req.get("host") ?? "").toLowerCase();
  const hostName = (hostHeader.startsWith("[")
    ? hostHeader.slice(1, hostHeader.indexOf("]"))
    : hostHeader.replace(/:\d+$/, "")).replace(/\.$/, "");
  if (LEGACY_HOSTS.has(hostName) && path !== "/api/healthz") {
    const requestTarget = req.originalUrl.startsWith("/") ? req.originalUrl : "/";
    res.redirect(301, `https://${canonicalHost}${requestTarget}`);
    return;
  }

  const isApiRoute = path === "/api" || path.startsWith("/api/");
  const isAssetPath = /\/[^/]*\.[a-z\d]{1,12}$/i.test(path);
  if (!isApiRoute && !isAssetPath) {
    const isItcontRoute = path === "/" || path === "/itcont" || path.startsWith("/itcont/");
    res.setHeader(
      "Permissions-Policy",
      isItcontRoute
        ? "camera=(), geolocation=(), microphone=(), payment=()"
        : "camera=(), geolocation=(self), microphone=(self), payment=()",
    );
    const cspHeader = process.env.CSP_REPORT_ONLY === "1"
      ? "Content-Security-Policy-Report-Only"
      : "Content-Security-Policy";
    res.setHeader(cspHeader, isItcontRoute ? itcontCsp : icaroCsp);
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
const indexHtmlPath = path.join(staticDir, "index.html");
if (fs.existsSync(indexHtmlPath)) {
  const indexHtmlTemplate = fs.readFileSync(indexHtmlPath, "utf8");
  const configuredBasePath = (process.env.BASE_PATH ?? "").replace(/\/+$/, "");
  const stripConfiguredBasePath = (pathname: string): string => {
    if (!configuredBasePath) return pathname || "/";
    if (pathname === configuredBasePath) return "/";
    if (pathname.startsWith(`${configuredBasePath}/`)) return pathname.slice(configuredBasePath.length) || "/";
    return pathname || "/";
  };
  const escapeHtmlAttribute = (value: string): string =>
    value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const setTagAttribute = (
    html: string,
    tagName: "link" | "meta",
    identifierAttribute: "rel" | "name" | "property",
    identifierValue: string,
    targetAttribute: "href" | "content",
    targetValue: string,
  ): string => {
    const escapedIdentifier = identifierValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const identifierPattern = new RegExp(`\\b${identifierAttribute}=["']${escapedIdentifier}["']`, "i");
    const targetPattern = new RegExp(`\\b${targetAttribute}=(["'])[^"']*\\1`, "i");
    const escapedValue = escapeHtmlAttribute(targetValue);
    return html.replace(new RegExp(`<${tagName}\\b[^>]*>`, "gi"), (tag) => {
      if (!identifierPattern.test(tag)) return tag;
      if (targetPattern.test(tag)) return tag.replace(targetPattern, `${targetAttribute}="${escapedValue}"`);
      return tag.replace(/\/?>$/, ` ${targetAttribute}="${escapedValue}"$&`);
    });
  };
  const withRouteIcon = (html: string, id: string, route: "itcont" | "icaro", size: 16 | 32 | 48 | 180): string =>
    html.replace(/<link\b[^>]*>/gi, (tag) => {
      const linkId = tag.match(/\bid=["']([^"']+)["']/i)?.[1];
      if (linkId !== id) return tag;
      const href = tag.match(/\bhref=["']([^"']+)["']/i)?.[1];
      if (!href) return tag;
      const lastSlash = href.lastIndexOf("/");
      const baseHref = lastSlash >= 0 ? href.slice(0, lastSlash + 1) : "/";
      return tag.replace(/\bhref=["'][^"']+["']/i, `href="${baseHref}favicon-${route}-${size}.png"`);
    });
  const routeIndexHtml = (pathname: string): string => {
    const appPath = stripConfiguredBasePath(pathname).replace(/\/+$/, "") || "/";
    const route = appPath === "/" || /^\/itcont(?:\/|$)/.test(appPath) ? "itcont" : "icaro";
    const title = route === "itcont"
      ? "ITCONT 2026 · I Imersão Tecnológica Contábil"
      : "Ícaro Inteligência e Operações";
    const description = route === "itcont"
      ? "ITCONT 2026: I Imersão Tecnológica Contábil, na Universidade Estadual de Feira de Santana."
      : "Ícaro, assistente de inteligência e operações com respostas por texto e voz.";
    const publicBasePath = configuredBasePath ? `${configuredBasePath}/` : "/";
    const canonicalPath = route === "itcont"
      ? publicBasePath
      : `${publicBasePath}${appPath.replace(/^\/+/, "")}`;
    const canonicalUrl = `https://${canonicalHost}${canonicalPath}`;
    const ogImage = `https://${canonicalHost}${publicBasePath}${route === "itcont" ? "itcont-event-logo.png" : "favicon-icaro-180.png"}`;
    const withSmallFavicon = withRouteIcon(indexHtmlTemplate, "route-favicon-16", route, 16);
    const withFavicon = withRouteIcon(withSmallFavicon, "route-favicon", route, 32);
    const withLargeFavicon = withRouteIcon(withFavicon, "route-favicon-48", route, 48);
    const withAppleIcon = withRouteIcon(withLargeFavicon, "route-apple-icon", route, 180);
    let html = withAppleIcon.replace(/<title\b[^>]*>[\s\S]*?<\/title>/i, `<title>${title}</title>`);
    html = setTagAttribute(html, "link", "rel", "canonical", "href", canonicalUrl);
    html = setTagAttribute(html, "meta", "name", "description", "content", description);
    html = setTagAttribute(html, "meta", "property", "og:title", "content", title);
    html = setTagAttribute(html, "meta", "property", "og:description", "content", description);
    html = setTagAttribute(html, "meta", "property", "og:url", "content", canonicalUrl);
    html = setTagAttribute(html, "meta", "property", "og:image", "content", ogImage);
    html = setTagAttribute(html, "meta", "name", "twitter:title", "content", title);
    html = setTagAttribute(html, "meta", "name", "twitter:description", "content", description);
    return html;
  };

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
  app.get(/^\/(?!api(\/|$)).*/, (req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.type("html").send(routeIndexHtml(req.path));
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
