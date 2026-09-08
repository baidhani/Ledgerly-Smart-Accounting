import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { recordAuditEvent } from "./auditLog";

export interface JournalLineInput {
  account_id: string;
  debit?: number;
  credit?: number;
}

export interface JournalEntryInput {
  entry_date: string;
  memo?: string | null;
  lines: JournalLineInput[];
}

export interface JournalLine {
  id: string;
  account_id: string;
  debit_cents: number;
  credit_cents: number;
}

export interface JournalEntry {
  id: string;
  entry_date: string;
  memo: string | null;
  created_at: string;
  lines: JournalLine[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface ValidationResult {
  valid: boolean;
  missing: string[];
  invalid: string[];
}

function toCents(amount: number): number {
  return Math.round(amount * 100);
}

function isValidAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function validateJournalEntryInput(db: Database.Database, input: Record<string, unknown>): ValidationResult {
  const missing: string[] = [];
  const invalid: string[] = [];

  if (input.entry_date === undefined || input.entry_date === null || input.entry_date === "") {
    missing.push("entry_date");
  } else if (typeof input.entry_date !== "string" || !ISO_DATE.test(input.entry_date)) {
    invalid.push("entry_date (expected YYYY-MM-DD)");
  }

  const lines = input.lines;
  if (lines === undefined || lines === null) {
    missing.push("lines");
    return { valid: false, missing, invalid };
  }

  if (!Array.isArray(lines) || lines.length < 2) {
    invalid.push("lines (expected an array of at least 2 debit/credit lines)");
    return { valid: false, missing, invalid };
  }

  let debitTotal = 0;
  let creditTotal = 0;

  lines.forEach((line, i) => {
    if (!line || typeof line !== "object") {
      invalid.push(`lines[${i}] (expected an object)`);
      return;
    }
    const { account_id, debit, credit } = line as Record<string, unknown>;

    if (typeof account_id !== "string" || account_id.trim() === "") {
      invalid.push(`lines[${i}].account_id`);
    } else {
      const account = db.prepare("SELECT id FROM accounts WHERE id = ?").get(account_id);
      if (!account) {
        invalid.push(`lines[${i}].account_id (no account with that id exists)`);
      }
    }

    const hasDebit = debit !== undefined && debit !== null;
    const hasCredit = credit !== undefined && credit !== null;

    if (hasDebit && hasCredit) {
      invalid.push(`lines[${i}] (a line cannot have both debit and credit)`);
    } else if (hasDebit) {
      if (!isValidAmount(debit)) {
        invalid.push(`lines[${i}].debit (expected a positive number)`);
      } else {
        debitTotal += toCents(debit);
      }
    } else if (hasCredit) {
      if (!isValidAmount(credit)) {
        invalid.push(`lines[${i}].credit (expected a positive number)`);
      } else {
        creditTotal += toCents(credit);
      }
    } else {
      invalid.push(`lines[${i}] (must have either debit or credit)`);
    }
  });

  if (invalid.length === 0 && debitTotal !== creditTotal) {
    invalid.push(
      `lines (unbalanced entry: debits total ${debitTotal / 100}, credits total ${creditTotal / 100})`
    );
  }

  return { valid: missing.length === 0 && invalid.length === 0, missing, invalid };
}

export function createJournalEntry(db: Database.Database, input: JournalEntryInput, userId: string): JournalEntry {
  const now = new Date().toISOString();
  const entryId = randomUUID();

  const lines: JournalLine[] = input.lines.map((line) => ({
    id: randomUUID(),
    account_id: line.account_id,
    debit_cents: line.debit !== undefined && line.debit !== null ? toCents(line.debit) : 0,
    credit_cents: line.credit !== undefined && line.credit !== null ? toCents(line.credit) : 0,
  }));

  const insertEntry = db.prepare(`
    INSERT INTO journal_entries (id, entry_date, memo, created_at)
    VALUES (@id, @entry_date, @memo, @created_at)
  `);
  const insertLine = db.prepare(`
    INSERT INTO journal_lines (id, journal_entry_id, account_id, debit_cents, credit_cents)
    VALUES (@id, @journal_entry_id, @account_id, @debit_cents, @credit_cents)
  `);
  const tx = db.transaction(() => {
    insertEntry.run({ id: entryId, entry_date: input.entry_date, memo: input.memo ?? null, created_at: now });
    for (const line of lines) {
      insertLine.run({ ...line, journal_entry_id: entryId });
    }
    recordAuditEvent(db, {
      entityType: "journal_entry",
      entityId: entryId,
      action: "journal_entry_created",
      userId,
      occurredAt: now,
      details: { entry_date: input.entry_date, line_count: lines.length },
    });
  });
  tx();

  return { id: entryId, entry_date: input.entry_date, memo: input.memo ?? null, created_at: now, lines };
}
