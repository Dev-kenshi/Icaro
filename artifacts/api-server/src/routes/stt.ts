import express, { Router, type IRouter } from "express";
import { getGroqApiKey } from "../lib/groq";

/**
 * Transcrição pelo servidor (Whisper na Groq): plano B quando o reconhecimento de voz
 * do navegador não funciona (rede que bloqueia o serviço do Google, navegador sem suporte,
 * microfone que não é o padrão do sistema). O palco grava a fala e envia o áudio aqui.
 */
const router: IRouter = Router();
const STT_WINDOW_MS = 10 * 60 * 1000;
const STT_LIMIT = 80;
const hits = new Map<string, { count: number; resetAt: number }>();
const VOCABULARIO = "Ícaro, UEFS, Feira de Santana, ITCONT, contabilidade, reforma tributária, IBS, CBS, split payment, Simples Nacional, MEI, Groq.";

export function getSttModel(env: Record<string, string | undefined> = process.env) {
  return env.GROQ_STT_MODEL?.trim() || "whisper-large-v3-turbo";
}

function limited(key: string) {
  const now = Date.now();
  if (hits.size > 1000) for (const [k, v] of hits) if (now >= v.resetAt) hits.delete(k);
  const e = hits.get(key);
  if (!e || now >= e.resetAt) { hits.set(key, { count: 1, resetAt: now + STT_WINDOW_MS }); return false; }
  e.count += 1;
  return e.count > STT_LIMIT;
}

const EXT: Record<string, string> = { "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-wav": "wav" };

router.post(
  "/ai/stt",
  express.raw({ type: ["audio/*", "application/octet-stream"], limit: "8mb" }),
  async (req, res) => {
    if (limited(req.ip || req.socket.remoteAddress || "unknown")) {
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
    const type = String(req.headers["content-type"] || "audio/webm").split(";")[0].trim().toLowerCase();
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(audio)], { type }), `fala.${EXT[type] ?? "webm"}`);
    form.append("model", getSttModel());
    form.append("language", "pt");
    form.append("response_format", "json");
    form.append("temperature", "0");
    form.append("prompt", VOCABULARIO);
    const t0 = Date.now();
    try {
      const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: AbortSignal.timeout(20_000),
      });
      if (!r.ok) {
        req.log.error({ upstreamStatus: r.status }, "Groq STT failed");
        res.status(r.status === 429 ? 429 : 502).json({
          error: r.status === 429 ? "Limite da transcrição atingido. Aguarde e tente de novo." : "A transcrição pelo servidor falhou. Tente de novo.",
        });
        return;
      }
      const j = (await r.json()) as { text?: unknown };
      const text = typeof j.text === "string" ? j.text.trim() : "";
      req.log.info({ ms: Date.now() - t0, bytes: audio.length, chars: text.length }, "stt transcribed");
      res.json({ text, ms: Date.now() - t0 });
    } catch (error) {
      req.log.error({ err: error }, "Groq STT errored");
      res.status(502).json({ error: "Não foi possível transcrever agora. Tente de novo." });
    }
  },
);

export default router;
