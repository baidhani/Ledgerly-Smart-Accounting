import { Router } from "express";
import type Database from "better-sqlite3";
import { generateInsights, UnknownInsightQueryError, logFailedInsightRequest } from "../financialInsights";
import { getUserId } from "../actor";

export function financialInsightsRouter(db: Database.Database): Router {
  const router = Router();

  router.post("/financial-insights", (req, res) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const query = body.query;
    const userId = getUserId(req);

    if (typeof query !== "string" || query.trim() === "") {
      res.status(400).json({ error: "A financial query is required." });
      return;
    }

    try {
      const result = generateInsights(db, query, userId);
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof UnknownInsightQueryError) {
        logFailedInsightRequest(db, query, userId);
        res.status(400).json({ error: err.message });
        return;
      }
      logFailedInsightRequest(db, query, userId);
      console.error(JSON.stringify({
        level: "error",
        event: "ai_analysis_failed",
        error_class: err instanceof Error ? err.constructor.name : "UnknownError",
        outcome: "failure",
      }));
      res.status(500).json({ error: "Could not generate financial insights. Please try again." });
    }
  });

  return router;
}
