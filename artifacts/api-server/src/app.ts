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
