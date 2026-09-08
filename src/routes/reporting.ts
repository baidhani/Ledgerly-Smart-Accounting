import { Router } from "express";
import type Database from "better-sqlite3";
import { generateTrialBalance } from "../trialBalance";
import { generateFinancialStatements, IncompleteDataError } from "../financialStatements";
import { getUserId } from "../actor";

export function reportingRouter(db: Database.Database): Router {
  const router = Router();

  router.get("/trial-balance", (req, res) => {
    try {
      const trialBalance = generateTrialBalance(db, getUserId(req));
      res.status(200).json(trialBalance);
    } catch (err) {
      console.error(JSON.stringify({
        level: "error",
        event: "trial_balance_generation_failed",
        error_class: err instanceof Error ? err.constructor.name : "UnknownError",
        outcome: "failure",
      }));
      res.status(500).json({ error: "Could not generate the trial balance. Please try again." });
    }
  });

  router.get("/financial-statements", (req, res) => {
    try {
      const statements = generateFinancialStatements(db, getUserId(req));
      res.status(200).json(statements);
    } catch (err) {
      if (err instanceof IncompleteDataError) {
        res.status(400).json({ error: "Cannot generate financial statements: data is incomplete.", reasons: err.reasons });
        return;
      }
      console.error(JSON.stringify({
        level: "error",
        event: "financial_statements_generation_failed",
        error_class: err instanceof Error ? err.constructor.name : "UnknownError",
        outcome: "failure",
      }));
      res.status(500).json({ error: "Could not generate financial statements. Please try again." });
    }
  });

  return router;
}
