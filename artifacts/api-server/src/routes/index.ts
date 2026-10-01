import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import { requireAuth } from "../middlewares/require-auth";
import aiRouter from "./ai";
import { askStats } from "../lib/brain";
import ttsTimestampsRouter from "./tts-timestamps";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(["/ai", "/tts-ts", "/ask"], requireAuth());
router.use(aiRouter);
router.get("/ask/stats", (_req, res) => { res.json(askStats()); });
router.use(ttsTimestampsRouter);

export default router;
