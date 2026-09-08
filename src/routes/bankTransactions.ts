import { Router } from "express";
import type Database from "better-sqlite3";
import {
  createBankTransaction,
  reconcileBankTransaction,
  validateBankTransactionInput,
  DuplicateBankTransactionError,
  BankTransactionNotFoundError,
  ReconciliationError,
} from "../bankTransactions";
import { getUserId } from "../actor";

export function bankTransactionsRouter(db: Database.Database): Router {
  const router = Router();

  router.post("/bank-transactions", (req, res) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const { valid, missing, invalid } = validateBankTransactionInput(db, body);

    if (!valid) {
      res.status(400).json({ error: "Bank transaction is incomplete or invalid.", missing_fields: missing, invalid_fields: invalid });
      return;
    }

    try {
      const transaction = createBankTransaction(db, {
        reference: body.reference,
        cash_account_id: body.cash_account_id,
        contra_account_id: body.contra_account_id,
        amount: body.amount,
        direction: body.direction,
        transaction_date: body.transaction_date,
      }, getUserId(req));
      res.status(201).json(transaction);
    } catch (err) {
      if (err instanceof DuplicateBankTransactionError) {
        res.status(409).json({ error: err.message });
        return;
      }
      console.error(JSON.stringify({
        level: "error",
        event: "bank_transaction_save_failed",
        error_class: err instanceof Error ? err.constructor.name : "UnknownError",
        outcome: "failure",
      }));
      res.status(500).json({ error: "Could not save the bank transaction. Please try again." });
    }
  });

  router.post("/bank-transactions/:id/reconcile", (req, res) => {
    try {
      const transaction = reconcileBankTransaction(db, req.params.id, getUserId(req));
      res.status(200).json(transaction);
    } catch (err) {
      if (err instanceof BankTransactionNotFoundError) {
        res.status(404).json({ error: err.message });
        return;
      }
      if (err instanceof ReconciliationError) {
        res.status(400).json({ error: err.message, reasons: err.reasons });
        return;
      }
      console.error(JSON.stringify({
        level: "error",
        event: "bank_transaction_reconcile_failed",
        error_class: err instanceof Error ? err.constructor.name : "UnknownError",
        outcome: "failure",
      }));
      res.status(500).json({ error: "Could not reconcile the bank transaction. Please try again." });
    }
  });

  return router;
}
