import express, { Router, type IRouter } from "express";
import { getGroqApiKey } from "../lib/groq";

const router: IRouter = Router();
const STT_WINDOW_MS = 10 * 60 * 1000;
const STT_LIMIT = 80;
const hits = new Map<string, { count: number; resetAt: number }>();
const VOCABULARY = "Ícaro, UEFS, Feira de Santana, ITCONT, contabilidade, reforma tributária, IBS, CBS, split payment, Simples Nacional, MEI, Groq.";
const EXT: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};

export function getSttModel(env: Record<string, string | undefined> = process.env) {
  return env.GROQ_STT_MODEL?.trim() || "whisper-large-v3-turbo";
}

function isRateLimited(key: string) {
  const now = Date.now();
  if (hits.size > 1000) {
    for (const [entryKey, entry] of hits) if (now >= entry.resetAt) hits.delete(entryKey);
  }
  const entry = hits.get(key);
  if (!entry || now >= entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + STT_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > STT_LIMIT;
}

router.post(
  "/ai/stt",
  express.raw({ type: ["audio/*", "application/octet-stream"], limit: "8mb" }),
  async (req, res) => {
    if (isRateLimited(req.ip || req.socket.remoteAddress || "unknown")) {
      res.status(429).json({ error: "Muitas gravações em sequência. Aguarde alguns minutos." });
      return;
    }
    const audio = req.body as Buffer;
    if (!Buffer.isBuffer(audio) || audio.length < 1000) {
      res.status(400).json({ error: "Áudio vazio ou curto demais." });
      return;
    }
    const apiKey = getGroqApiKey();
    if (!apiKey) {
      res.status(503).json({ error: "Transcrição pelo servidor indisponível: falta GROQ_API_KEY nos Secrets." });
      return;
    }
    const contentType = String(req.headers["content-type"] || "audio/webm")
      .split(";")[0].trim().toLowerCase();
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(audio)], { type: contentType }), `fala.${EXT[contentType] ?? "webm"}`);
    form.append("model", getSttModel());
    form.append("language", "pt");
    form.append("response_format", "json");
    form.append("temperature", "0");
    form.append("prompt", VOCABULARY);

    const startedAt = Date.now();
    try {
      const upstream = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: AbortSignal.timeout(20_000),
      });
      if (!upstream.ok) {
        req.log.error({ upstreamStatus: upstream.status }, "Groq STT failed");
        res.status(upstream.status === 429 ? 429 : 502).json({
          error: upstream.status === 429
            ? "Limite da transcrição atingido. Aguarde e tente de novo."
            : "A transcrição pelo servidor falhou. Tente de novo.",
        });
        return;
      }
      const payload = (await upstream.json()) as { text?: unknown };
      const text = typeof payload.text === "string" ? payload.text.trim() : "";
      const elapsedMs = Date.now() - startedAt;
      req.log.info({ ms: elapsedMs, bytes: audio.length, chars: text.length }, "stt transcribed");
      res.json({ text, ms: elapsedMs });
    } catch (error) {
      req.log.error({ err: error }, "Groq STT errored");
      res.status(502).json({ error: "Não foi possível transcrever agora. Tente de novo." });
    }
  },
);

export default router;