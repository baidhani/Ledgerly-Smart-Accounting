import express, { Express } from "express";
import type Database from "better-sqlite3";
import { createCompanyProfile, validateCompanyProfileInput } from "./companies";
import { createAccount, validateAccountInput, DuplicateAccountError } from "./accounts";
import { createJournalEntry, validateJournalEntryInput } from "./journalEntries";
import { postJournalEntry, JournalEntryNotFoundError, UnpostableTransactionError } from "./generalLedger";
import { generateTrialBalance } from "./trialBalance";
import { generateFinancialStatements, IncompleteDataError } from "./financialStatements";

export function createApp(db: Database.Database): Express {
  const app = express();
  app.use(express.json());
  app.locals.db = db;

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.post("/companies", (req, res) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const { valid, missing, invalid } = validateCompanyProfileInput(body);

    if (!valid) {
      res.status(400).json({
        error: "Company profile is incomplete or invalid.",
        missing_fields: missing,
        invalid_fields: invalid,
      });
      return;
    }

    try {
      const company = createCompanyProfile(db, {
        name: body.name,
        legal_entity_type: body.legal_entity_type,
        fiscal_year_start: body.fiscal_year_start,
        base_currency: body.base_currency,
      });
      res.status(201).json(company);
    } catch (err) {
      console.error(JSON.stringify({
        level: "error",
        event: "company_profile_save_failed",
        error_class: err instanceof Error ? err.constructor.name : "UnknownError",
        outcome: "failure",
      }));
      res.status(500).json({ error: "Could not save the company profile. Please try again." });
    }
  });

  app.post("/accounts", (req, res) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};

    try {
      const { valid, missing, invalid } = validateAccountInput(db, body);

      if (!valid) {
        res.status(400).json({
          error: "Account details are incomplete or invalid.",
          missing_fields: missing,
          invalid_fields: invalid,
        });
        return;
      }

      const account = createAccount(db, {
        code: body.code,
        name: body.name,
        type: body.type,
        parent_account_id: body.parent_account_id ?? null,
      });
      res.status(201).json(account);
    } catch (err) {
      if (err instanceof DuplicateAccountError) {
        res.status(409).json({ error: err.message });
        return;
      }
      console.error(JSON.stringify({
        level: "error",
        event: "account_save_failed",
        error_class: err instanceof Error ? err.constructor.name : "UnknownError",
        outcome: "failure",
      }));
      res.status(500).json({ error: "Could not save the account. Please try again." });
    }
  });

  app.post("/journal-entries", (req, res) => {
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
      });
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

  app.post("/journal-entries/:id/post", (req, res) => {
    try {
      const posted = postJournalEntry(db, req.params.id);
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

  app.get("/trial-balance", (_req, res) => {
    try {
      const trialBalance = generateTrialBalance(db);
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

  app.get("/financial-statements", (_req, res) => {
    try {
      const statements = generateFinancialStatements(db);
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

  return app;
}
