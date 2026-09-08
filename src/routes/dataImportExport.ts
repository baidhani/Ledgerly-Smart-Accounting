import { Router } from "express";
import type Database from "better-sqlite3";
import { validateImportFile, importAccounts, exportAccounts, logFailedImport } from "../dataImportExport";
import { DuplicateAccountError } from "../accounts";
import { getUserId } from "../actor";

export function dataImportExportRouter(db: Database.Database): Router {
  const router = Router();

  router.post("/accounts/import", (req, res) => {
    const userId = getUserId(req);
    const csvText = typeof req.body === "string" ? req.body : "";

    const { valid, errors, rows } = validateImportFile(db, csvText);

    if (!valid) {
      logFailedImport(db, userId, errors);
      res.status(400).json({ error: "The data file is invalid and was not imported.", errors });
      return;
    }

    try {
      const created = importAccounts(db, rows, userId);
      res.status(201).json({ imported_count: created.length, accounts: created });
    } catch (err) {
      if (err instanceof DuplicateAccountError) {
        logFailedImport(db, userId, [{ row: 0, missing: [], invalid: [err.message] }]);
        res.status(409).json({ error: err.message });
        return;
      }
      console.error(JSON.stringify({
        level: "error",
        event: "data_import_failed",
        error_class: err instanceof Error ? err.constructor.name : "UnknownError",
        outcome: "failure",
      }));
      res.status(500).json({ error: "Could not import the data file. No records were created." });
    }
  });

  router.get("/accounts/export", (req, res) => {
    try {
      const csv = exportAccounts(db, getUserId(req));
      res.status(200).set("Content-Type", "text/csv").send(csv);
    } catch (err) {
      console.error(JSON.stringify({
        level: "error",
        event: "data_export_failed",
        error_class: err instanceof Error ? err.constructor.name : "UnknownError",
        outcome: "failure",
      }));
      res.status(500).json({ error: "Could not export the data. Please try again." });
    }
  });

  return router;
}
