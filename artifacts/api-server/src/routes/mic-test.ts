import { Router, type IRouter } from "express";

/**
 * Diagnóstico do microfone: a página /mic-test envia cada transcrição final
 * do reconhecimento de voz do navegador para cá. Ficam registradas no log do
 * servidor (e num buffer em memória) para verificar o que o Ícaro realmente ouviu.
 */
type MicEntry = { at: string; text: string };
const entries: MicEntry[] = [];
const MAX_ENTRIES = 50;

const router: IRouter = Router();

router.post("/mic-test", (req, res) => {
  const text = typeof req.body?.text === "string" ? req.body.text.slice(0, 500).trim() : "";
  if (!text) {
    res.status(400).json({ error: "Transcrição vazia." });
    return;
  }
  const entry: MicEntry = { at: new Date().toISOString(), text };
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) entries.shift();
  req.log.info({ micTest: entry }, "mic-test: transcrição recebida do navegador");
  res.json({ ok: true, total: entries.length });
});

router.get("/mic-test", (_req, res) => {
  res.json({ entries });
});

export default router;
