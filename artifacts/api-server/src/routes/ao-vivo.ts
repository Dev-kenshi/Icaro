import { Router, type IRouter } from "express";
import { falaFinancas, financas, previsao } from "../lib/ao-vivo";

/** Clima e painel financeiro do palco (portados do ÍCARO v5). */
const router: IRouter = Router();

router.get("/ao-vivo/financas", async (req, res) => {
  try {
    const fin = await financas();
    res.json({ ...fin, fala: falaFinancas(fin) });
  } catch (error) {
    req.log.warn({ message: error instanceof Error ? error.message : "falha" }, "painel financeiro indisponível");
    res.status(502).json({ error: "As cotações estão indisponíveis no momento." });
  }
});

router.get("/ao-vivo/tempo", async (req, res) => {
  const cidade = typeof req.query.cidade === "string" ? req.query.cidade : undefined;
  const dia = req.query.dia === "amanha" ? "amanha" : "hoje";
  try {
    res.json(await previsao(cidade, dia));
  } catch (error) {
    req.log.warn({ message: error instanceof Error ? error.message : "falha" }, "previsão do tempo indisponível");
    res.status(502).json({ error: "A previsão do tempo está indisponível no momento." });
  }
});

export default router;
