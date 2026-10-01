import { Router, type IRouter } from "express";

/**
 * Diagnóstico do microfone: a página /mic-test envia cada transcrição final
 * do reconhecimento de voz do navegador para cá. Ficam registradas no log do
 * servidor (e num buffer em memória) para verificar o que o Ícaro realmente ouviu.
 */
type MicEvent = "transcript" | "wake" | "question" | "answer" | "error";
type MicEntry = { at: string; type: MicEvent; text: string };
const entries: MicEntry[] = [];
const MAX_ENTRIES = 50;
const EVENT_TYPES = new Set<MicEvent>(["transcript", "wake", "question", "answer", "error"]);

const router: IRouter = Router();

router.post("/mic-test", (req, res) => {
  const type = typeof req.body?.type === "string" ? req.body.type as MicEvent : "transcript";
  const text = typeof req.body?.text === "string" ? req.body.text.slice(0, 500).trim() : "";
  if (!EVENT_TYPES.has(type) || !text) {
    res.status(400).json({ error: "Informe um tipo e um texto válidos para o teste." });
    return;
  }
  const entry: MicEntry = { at: new Date().toISOString(), type, text };
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) entries.shift();
  req.log.info({ micTest: entry }, `mic-test: ${type}`);
  res.json({ ok: true, total: entries.length });
});

router.get("/mic-test", (_req, res) => {
  res.json({ entries });
});

export default router;
