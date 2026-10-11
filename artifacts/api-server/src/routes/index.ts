import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import { requireAuth } from "../middlewares/require-auth";
import aiRouter from "./ai";
import ttsTimestampsRouter from "./tts-timestamps";
import sttRouter from "./stt";
import cosmosRouter from "./cosmos";
import itcontRouter from "./itcont";
import aoVivoRouter from "./ao-vivo";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(["/ai", "/tts-ts", "/itcont", "/ao-vivo"], requireAuth());
router.use(sttRouter);
router.use(aiRouter);
router.use(ttsTimestampsRouter);
router.use(cosmosRouter);
router.use(itcontRouter);
router.use(aoVivoRouter);

export default router;
