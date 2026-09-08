import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { recordAuditEvent } from "./auditLog";

export interface TrialBalanceLine {
  account_id: string;
  code: string;
  name: string;
  type: string;
  debit_cents: number;
  credit_cents: number;
}

export interface TrialBalance {
  generated_at: string;
  accounts: TrialBalanceLine[];
  totals: { debit_cents: number; credit_cents: number };
}

/**
 * Aggregates the general ledger (posted transactions only, never draft
 * journal_lines) into a trial balance, and logs the generation itself to
 * the audit trail. With no posted transactions yet, returns an empty
 * account list and zero totals rather than an error.
 */
export function generateTrialBalance(db: Database.Database, userId: string): TrialBalance {
  const rows = db
    .prepare(
      `
      SELECT a.id AS account_id, a.code, a.name, a.type,
             SUM(gl.debit_cents) AS debit_cents,
             SUM(gl.credit_cents) AS credit_cents
      FROM general_ledger gl
      JOIN accounts a ON a.id = gl.account_id
      GROUP BY a.id
      ORDER BY a.code
    `
    )
    .all() as TrialBalanceLine[];

  const totals = rows.reduce(
    (acc, row) => ({
      debit_cents: acc.debit_cents + row.debit_cents,
      credit_cents: acc.credit_cents + row.credit_cents,
    }),
    { debit_cents: 0, credit_cents: 0 }
  );

  const generatedAt = new Date().toISOString();

  recordAuditEvent(db, {
    entityType: "trial_balance",
    entityId: randomUUID(),
    action: "trial_balance_generated",
    userId,
    occurredAt: generatedAt,
    details: {
      account_count: rows.length,
      debit_cents: totals.debit_cents,
      credit_cents: totals.credit_cents,
    },
  });

  return { generated_at: generatedAt, accounts: rows, totals };
}
