import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { recordAuditEvent } from "./auditLog";
import { createJournalEntry } from "./journalEntries";
import { postJournalEntry } from "./generalLedger";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DIRECTIONS = ["deposit", "withdrawal"];

function isPositiveAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export interface ValidationResult {
  valid: boolean;
  missing: string[];
  invalid: string[];
}

export class DuplicateBankTransactionError extends Error {
  constructor(reference: string) {
    super(`A bank transaction with reference "${reference}" already exists.`);
    this.name = "DuplicateBankTransactionError";
  }
}

export class BankTransactionNotFoundError extends Error {
  constructor(id: string) {
    super(`No bank transaction with id "${id}" exists.`);
    this.name = "BankTransactionNotFoundError";
  }
}

export class ReconciliationError extends Error {
  reasons: string[];
  constructor(reasons: string[]) {
    super(`Reconciliation cannot be processed: ${reasons.join("; ")}`);
    this.name = "ReconciliationError";
    this.reasons = reasons;
  }
}

export interface BankTransactionInput {
  reference: string;
  cash_account_id: string;
  contra_account_id: string;
  amount: number;
  direction: string;
  transaction_date: string;
}

export interface BankTransaction {
  id: string;
  reference: string;
  cash_account_id: string;
  contra_account_id: string;
  amount_cents: number;
  direction: "deposit" | "withdrawal";
  transaction_date: string;
  status: "unreconciled" | "reconciled";
  journal_entry_id: string | null;
  created_at: string;
  reconciled_at: string | null;
}

export function validateBankTransactionInput(db: Database.Database, input: Record<string, unknown>): ValidationResult {
  const missing: string[] = [];
  const invalid: string[] = [];

  for (const field of ["reference", "cash_account_id", "contra_account_id", "amount", "direction", "transaction_date"] as const) {
    const value = input[field];
    if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) {
      missing.push(field);
    }
  }

  if (!missing.includes("cash_account_id")) {
    const account = db.prepare("SELECT id FROM accounts WHERE id = ?").get(input.cash_account_id);
    if (!account) invalid.push("cash_account_id (no account with that id exists)");
  }

  if (!missing.includes("contra_account_id")) {
    const account = db.prepare("SELECT id FROM accounts WHERE id = ?").get(input.contra_account_id);
    if (!account) invalid.push("contra_account_id (no account with that id exists)");
  }

  if (!missing.includes("amount") && !isPositiveAmount(input.amount)) {
    invalid.push("amount (expected a positive number)");
  }

  if (!missing.includes("direction") && (typeof input.direction !== "string" || !DIRECTIONS.includes(input.direction))) {
    invalid.push(`direction (expected one of: ${DIRECTIONS.join(", ")})`);
  }

  if (!missing.includes("transaction_date")) {
    if (typeof input.transaction_date !== "string" || !ISO_DATE.test(input.transaction_date)) {
      invalid.push("transaction_date (expected YYYY-MM-DD)");
    }
  }

  return { valid: missing.length === 0 && invalid.length === 0, missing, invalid };
}

export function createBankTransaction(db: Database.Database, input: BankTransactionInput, userId: string): BankTransaction {
  const now = new Date().toISOString();
  const direction = input.direction as "deposit" | "withdrawal";
  const transaction: BankTransaction = {
    id: randomUUID(),
    reference: input.reference,
    cash_account_id: input.cash_account_id,
    contra_account_id: input.contra_account_id,
    amount_cents: Math.round(input.amount * 100),
    direction,
    transaction_date: input.transaction_date,
    status: "unreconciled",
    journal_entry_id: null,
    created_at: now,
    reconciled_at: null,
  };

  const insert = db.prepare(`
    INSERT INTO bank_transactions (id, reference, cash_account_id, contra_account_id, amount_cents, direction, transaction_date, status, created_at)
    VALUES (@id, @reference, @cash_account_id, @contra_account_id, @amount_cents, @direction, @transaction_date, @status, @created_at)
  `);

  const tx = db.transaction(() => {
    insert.run(transaction);
    recordAuditEvent(db, {
      entityType: "bank_transaction",
      entityId: transaction.id,
      action: "bank_transaction_created",
      userId,
      occurredAt: now,
      details: { reference: transaction.reference, direction, amount_cents: transaction.amount_cents },
    });
  });

  try {
    tx();
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE") {
      throw new DuplicateBankTransactionError(transaction.reference);
    }
    throw err;
  }

  return transaction;
}

/**
 * Reconciles a bank transaction by creating and posting a real, balanced
 * journal entry through the existing ledger pipeline — a deposit debits
 * cash and credits the contra account; a withdrawal does the reverse.
 * Idempotent: reconciling an already-reconciled transaction returns the
 * same result instead of posting a second time.
 */
export function reconcileBankTransaction(db: Database.Database, transactionId: string, userId: string): BankTransaction {
  const transaction = db.prepare("SELECT * FROM bank_transactions WHERE id = ?").get(transactionId) as BankTransaction | undefined;
  if (!transaction) {
    throw new BankTransactionNotFoundError(transactionId);
  }

  if (transaction.status === "reconciled") {
    return transaction;
  }

  // Re-validate both accounts still exist, independent of the checks done
  // at creation time — same defense-in-depth idiom postJournalEntry already
  // uses, since data could in principle have changed since.
  const reasons: string[] = [];
  if (!db.prepare("SELECT id FROM accounts WHERE id = ?").get(transaction.cash_account_id)) {
    reasons.push(`cash_account_id "${transaction.cash_account_id}" no longer references an existing account`);
  }
  if (!db.prepare("SELECT id FROM accounts WHERE id = ?").get(transaction.contra_account_id)) {
    reasons.push(`contra_account_id "${transaction.contra_account_id}" no longer references an existing account`);
  }
  if (reasons.length > 0) {
    throw new ReconciliationError(reasons);
  }

  const amount = transaction.amount_cents / 100;
  const lines =
    transaction.direction === "deposit"
      ? [
          { account_id: transaction.cash_account_id, debit: amount },
          { account_id: transaction.contra_account_id, credit: amount },
        ]
      : [
          { account_id: transaction.contra_account_id, debit: amount },
          { account_id: transaction.cash_account_id, credit: amount },
        ];

  const entry = createJournalEntry(
    db,
    {
      entry_date: transaction.transaction_date,
      memo: `Bank reconciliation for ${transaction.reference}`,
      lines,
    },
    userId
  );
  postJournalEntry(db, entry.id, userId);

  const now = new Date().toISOString();
  db.prepare(
    "UPDATE bank_transactions SET status = 'reconciled', reconciled_at = @reconciled_at, journal_entry_id = @journal_entry_id WHERE id = @id"
  ).run({ id: transactionId, reconciled_at: now, journal_entry_id: entry.id });
  recordAuditEvent(db, {
    entityType: "bank_transaction",
    entityId: transactionId,
    action: "bank_transaction_reconciled",
    userId,
    occurredAt: now,
    details: { journal_entry_id: entry.id, amount_cents: transaction.amount_cents },
  });

  return { ...transaction, status: "reconciled", reconciled_at: now, journal_entry_id: entry.id };
}
