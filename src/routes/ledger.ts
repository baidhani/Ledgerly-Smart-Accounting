import { Router } from "express";
import type Database from "better-sqlite3";
import { createJournalEntry, validateJournalEntryInput } from "../journalEntries";
import { postJournalEntry, JournalEntryNotFoundError, UnpostableTransactionError } from "../generalLedger";
import { getUserId } from "../actor";

export function ledgerRouter(db: Database.Database): Router {
  const router = Router();

  router.post("/journal-entries", (req, res) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};

    try {
      const { valid, missing, invalid } = validateJournalEntryInput(db, body);

      if (!valid) {
        res.status(400).json({
          error: "Journal entry is incomplete or invalid.",
          missing_fields: missing,
          invalid_fields: invalid,
        });
        return;
      }

      const entry = createJournalEntry(db, {
        entry_date: body.entry_date,
        memo: body.memo ?? null,
        lines: body.lines,
      }, getUserId(req));
      res.status(201).json(entry);
    } catch (err) {
      console.error(JSON.stringify({
        level: "error",
        event: "journal_entry_save_failed",
        error_class: err instanceof Error ? err.constructor.name : "UnknownError",
        outcome: "failure",
      }));
      res.status(500).json({ error: "Could not save the journal entry. Please try again." });
    }
  });

  router.post("/journal-entries/:id/post", (req, res) => {
    try {
      const posted = postJournalEntry(db, req.params.id, getUserId(req));
      res.status(200).json(posted);
    } catch (err) {
      if (err instanceof JournalEntryNotFoundError) {
        res.status(404).json({ error: err.message });
        return;
      }
      if (err instanceof UnpostableTransactionError) {
        res.status(400).json({ error: "Transaction is invalid and cannot be posted.", reasons: err.reasons });
        return;
      }
      console.error(JSON.stringify({
        level: "error",
        event: "journal_entry_post_failed",
        error_class: err instanceof Error ? err.constructor.name : "UnknownError",
        outcome: "failure",
      }));
      res.status(500).json({ error: "Could not post the transaction. Please try again." });
    }
  });

  return router;
}
