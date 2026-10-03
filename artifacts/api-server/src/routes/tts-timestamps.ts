import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Router, type IRouter } from "express";
import {
  SynthesizeTtsTimestampsBody,
  SynthesizeTtsTimestampsResponse,
} from "@workspace/api-zod";
import {
  applyTtsPronunciation,
  cleanTtsText,
  createTtsTimestampsService,
  TimestampedSpeechError,
  TTS_TIMESTAMP_MAX_TEXT,
} from "../lib/tts-timestamps";

const router: IRouter = Router();
const WINDOW_MS = 10 * 60 * 1000;
const REQUEST_LIMIT = 90;
const hits = new Map<string, { count: number; resetAt: number }>();
const API_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = process.env.ICARO_DATA_DIR || path.join(API_ROOT, ".data");
const timestampedSpeech = createTtsTimestampsService();

function isRateLimited(key: string) {
  const now = Date.now();
  if (hits.size >= 1000) {
    for (const [entryKey, value] of hits) {
      if (now >= value.resetAt) hits.delete(entryKey);
    }
  }
  const entry = hits.get(key);
  if (!entry || now >= entry.resetAt) {
    if (!entry && hits.size >= 1000) {
      const oldestKey = hits.keys().next().value;
      if (oldestKey !== undefined) hits.delete(oldestKey);
    }
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > REQUEST_LIMIT;
}

async function getExistingElevenLabsVoiceId(): Promise<string> {
  const configuredVoiceId = process.env.ELEVENLABS_VOICE_ID?.trim();
  if (configuredVoiceId) return configuredVoiceId;

  try {
    const saved = JSON.parse(
      await fs.readFile(path.join(DATA_DIR, "elevenlabs-voice.json"), "utf8"),
    ) as { voiceId?: unknown };
    return typeof saved.voiceId === "string" ? saved.voiceId.trim() : "";
  } catch {
    return "";
  }
}

router.post("/tts-ts", async (req, res): Promise<void> => {
  const clientKey = req.ip || req.socket.remoteAddress || "unknown";
  if (isRateLimited(clientKey)) {
    res.status(429).json({ error: "Muitas falas em sequência. Aguarde alguns minutos." });
    return;
  }

  const parsed = SynthesizeTtsTimestampsBody.safeParse(req.body);
  if (!parsed.success) {
    const rawText = req.body && typeof req.body === "object"
      ? (req.body as Record<string, unknown>).text
      : undefined;
    if (typeof rawText === "string" && rawText.length > TTS_TIMESTAMP_MAX_TEXT) {
      res.status(413).json({ error: "A frase ultrapassa o limite de 600 caracteres." });
      return;
    }
    res.status(400).json({ error: "O texto para fala é inválido." });
    return;
  }

  const originalText = cleanTtsText(parsed.data.text);
  if (!originalText) {
    res.status(400).json({ error: "O texto para fala está vazio." });
    return;
  }
  if (applyTtsPronunciation(originalText).length > TTS_TIMESTAMP_MAX_TEXT) {
    res.status(413).json({ error: "A frase ultrapassa o limite de 600 caracteres." });
    return;
  }

  const apiKey = process.env.ELEVENLABS_API_KEY || "";
  if (!apiKey) {
    res.status(503).json({ error: "O serviço de áudio com marcação de tempo não está configurado." });
    return;
  }

  const voiceId = await getExistingElevenLabsVoiceId();
  if (!voiceId) {
    res.status(503).json({ error: "O serviço de áudio com marcação de tempo não está configurado." });
    return;
  }
  if (req.aborted || res.destroyed) return;

  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 30_000);
  const abortForDisconnect = () => controller.abort();
  const abortForClosedResponse = () => {
    if (!res.writableEnded) controller.abort();
  };
  req.on("aborted", abortForDisconnect);
  res.on("close", abortForClosedResponse);

  try {
    const result = await timestampedSpeech.synthesize({
      text: originalText,
      previousText: parsed.data.previous_text || "",
      apiKey,
      voiceId,
      modelId: process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2",
      emotion: parsed.data.emotion,
      signal: controller.signal,
    });

    if (controller.signal.aborted || res.destroyed) return;
    res.json(SynthesizeTtsTimestampsResponse.parse(result));
  } catch (error) {
    if (controller.signal.aborted && !timedOut) return;
    if (error instanceof TimestampedSpeechError) {
      if (error.kind === "timeout" || timedOut) {
        res.status(504).json({ error: "A geração de áudio demorou demais. Tente novamente." });
        return;
      }
      if (error.statusCode) {
        req.log.warn({ provider: "elevenlabs", statusCode: error.statusCode }, "Timestamped TTS provider request failed");
      } else {
        req.log.warn({ provider: "elevenlabs" }, "Timestamped TTS provider response was invalid");
      }
      res.status(502).json({ error: "Não foi possível gerar o áudio com marcação de tempo." });
      return;
    }
    req.log.warn({ provider: "elevenlabs" }, "Timestamped TTS request failed");
    res.status(timedOut ? 504 : 502).json({
      error: timedOut
        ? "A geração de áudio demorou demais. Tente novamente."
        : "Não foi possível gerar o áudio com marcação de tempo.",
    });
  } finally {
    clearTimeout(timeout);
    req.off("aborted", abortForDisconnect);
    res.off("close", abortForClosedResponse);
  }
});

export default router;