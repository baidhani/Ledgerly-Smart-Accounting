import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

export interface GeneralLedgerLine {
  id: string;
  journal_entry_id: string;
  journal_line_id: string;
  account_id: string;
  debit_cents: number;
  credit_cents: number;
  posted_at: string;
}

export interface PostedJournalEntry {
  id: string;
  entry_date: string;
  memo: string | null;
  status: "posted";
  posted_at: string;
  ledger_lines: GeneralLedgerLine[];
}

export class JournalEntryNotFoundError extends Error {
  constructor(id: string) {
    super(`No journal entry with id "${id}" exists.`);
    this.name = "JournalEntryNotFoundError";
  }
}

export class UnpostableTransactionError extends Error {
  reasons: string[];
  constructor(reasons: string[]) {
    super(`Transaction cannot be posted: ${reasons.join("; ")}`);
    this.name = "UnpostableTransactionError";
    this.reasons = reasons;
  }
}

interface JournalEntryRow {
  id: string;
  entry_date: string;
  memo: string | null;
  status: string;
  posted_at: string | null;
  created_at: string;
}

interface JournalLineRow {
  id: string;
  journal_entry_id: string;
  account_id: string;
  debit_cents: number;
  credit_cents: number;
}

function logRejectedAttempt(db: Database.Database, journalEntryId: string, reasons: string[]): void {
  db.prepare(
    `
    INSERT INTO audit_log (id, entity_type, entity_id, action, occurred_at, details)
    VALUES (@id, 'journal_entry', @entity_id, 'transaction_post_rejected', @occurred_at, @details)
  `
  ).run({
    id: randomUUID(),
    entity_id: journalEntryId,
    occurred_at: new Date().toISOString(),
    details: JSON.stringify({ reasons }),
  });
}

function loadAlreadyPosted(db: Database.Database, entryId: string): PostedJournalEntry {
  const ledgerLines = db
    .prepare("SELECT * FROM general_ledger WHERE journal_entry_id = ?")
    .all(entryId) as GeneralLedgerLine[];
  const entry = db.prepare("SELECT * FROM journal_entries WHERE id = ?").get(entryId) as JournalEntryRow;
  return {
    id: entry.id,
    entry_date: entry.entry_date,
    memo: entry.memo,
    status: "posted",
    posted_at: entry.posted_at as string,
    ledger_lines: ledgerLines,
  };
}

/**
 * Re-validates a draft journal entry against the guardrail (balanced entries,
 * valid accounts) at posting time, independent of the checks already done
 * when the entry was created — data could in principle have changed since.
 */
function findPostingErrors(db: Database.Database, lines: JournalLineRow[]): string[] {
  const errors: string[] = [];
  let debitTotal = 0;
  let creditTotal = 0;

  for (const line of lines) {
    const account = db.prepare("SELECT id FROM accounts WHERE id = ?").get(line.account_id);
    if (!account) {
      errors.push(`line references account "${line.account_id}" which no longer exists`);
    }
    debitTotal += line.debit_cents;
    creditTotal += line.credit_cents;
  }

  if (lines.length === 0) {
    errors.push("journal entry has no lines to post");
  } else if (debitTotal !== creditTotal) {
    errors.push(`unbalanced posting: debits total ${debitTotal / 100}, credits total ${creditTotal / 100}`);
  }

  return errors;
}

/**
 * Posts a draft journal entry to the general ledger. Idempotent: posting an
 * already-posted entry returns the same result again instead of erroring or
 * writing a second time.
 */
export function postJournalEntry(db: Database.Database, journalEntryId: string): PostedJournalEntry {
  const entry = db.prepare("SELECT * FROM journal_entries WHERE id = ?").get(journalEntryId) as
    | JournalEntryRow
    | undefined;

  if (!entry) {
    logRejectedAttempt(db, journalEntryId, [`no journal entry with id "${journalEntryId}" exists`]);
    throw new JournalEntryNotFoundError(journalEntryId);
  }

  if (entry.status === "posted") {
    return loadAlreadyPosted(db, journalEntryId);
  }

  const lines = db
    .prepare("SELECT * FROM journal_lines WHERE journal_entry_id = ?")
    .all(journalEntryId) as JournalLineRow[];

  const errors = findPostingErrors(db, lines);
  if (errors.length > 0) {
    logRejectedAttempt(db, journalEntryId, errors);
    throw new UnpostableTransactionError(errors);
  }

  const now = new Date().toISOString();
  const ledgerLines: GeneralLedgerLine[] = lines.map((line) => ({
    id: randomUUID(),
    journal_entry_id: journalEntryId,
    journal_line_id: line.id,
    account_id: line.account_id,
    debit_cents: line.debit_cents,
    credit_cents: line.credit_cents,
    posted_at: now,
  }));

  const insertLedgerLine = db.prepare(`
    INSERT INTO general_ledger (id, journal_entry_id, journal_line_id, account_id, debit_cents, credit_cents, posted_at)
    VALUES (@id, @journal_entry_id, @journal_line_id, @account_id, @debit_cents, @credit_cents, @posted_at)
  `);
  const updateEntry = db.prepare(`
    UPDATE journal_entries SET status = 'posted', posted_at = @posted_at WHERE id = @id
  `);
  const insertAudit = db.prepare(`
    INSERT INTO audit_log (id, entity_type, entity_id, action, occurred_at, details)
    VALUES (@id, 'journal_entry', @entity_id, 'transaction_posted', @occurred_at, @details)
  `);

  const tx = db.transaction(() => {
    for (const line of ledgerLines) {
      insertLedgerLine.run(line);
    }
    updateEntry.run({ id: journalEntryId, posted_at: now });
    insertAudit.run({
      id: randomUUID(),
      entity_id: journalEntryId,
      occurred_at: now,
      details: JSON.stringify({ line_count: ledgerLines.length }),
    });
  });
  tx();

  return {
    id: entry.id,
    entry_date: entry.entry_date,
    memo: entry.memo,
    status: "posted",
    posted_at: now,
    ledger_lines: ledgerLines,
  };
}
