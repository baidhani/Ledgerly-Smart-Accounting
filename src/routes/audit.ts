import { Router } from "express";
import type Database from "better-sqlite3";
import { getAuditTrail } from "../auditTrail";

export function auditRouter(db: Database.Database): Router {
  const router = Router();

  router.get("/audit-log", (req, res) => {
    try {
      const entries = getAuditTrail(db, {
        entity_type: typeof req.query.entity_type === "string" ? req.query.entity_type : undefined,
        entity_id: typeof req.query.entity_id === "string" ? req.query.entity_id : undefined,
      });
      res.status(200).json({ entries });
    } catch (err) {
      console.error(JSON.stringify({
        level: "error",
        event: "audit_trail_read_failed",
        error_class: err instanceof Error ? err.constructor.name : "UnknownError",
        outcome: "failure",
      }));
      res.status(500).json({ error: "Could not read the audit trail. Please try again." });
    }
  });

  return router;
}
