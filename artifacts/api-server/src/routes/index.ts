import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import { requireAuth } from "../middlewares/require-auth";
import aiRouter from "./ai";
import ttsTimestampsRouter from "./tts-timestamps";
import sttRouter from "./stt";
import cosmosRouter from "./cosmos";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(["/ai", "/tts-ts"], requireAuth());
router.use(sttRouter);
router.use(aiRouter);
router.use(ttsTimestampsRouter);
router.use(cosmosRouter);

export default router;
