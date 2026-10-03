import { Router, type IRouter } from "express";
import { GetCosmosFeedsResponse } from "@workspace/api-zod";
import { getCosmosFeeds } from "../lib/cosmos-feeds";

const router: IRouter = Router();

router.get("/cosmos/feeds", async (req, res): Promise<void> => {
  try {
    const feeds = GetCosmosFeedsResponse.parse(await getCosmosFeeds());
    res.setHeader("Cache-Control", `public, max-age=${feeds.ttlSeconds}`);
    res.json(feeds);
  } catch (error) {
    req.log.error({ err: error }, "Public cosmos feeds are unavailable");
    res.status(502).json({ error: "Os feeds públicos estão temporariamente indisponíveis." });
  }
});

export default router;