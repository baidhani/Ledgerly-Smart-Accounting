import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

export interface StatementLine {
  account_id: string | null;
  code: string;
  name: string;
  net_cents: number;
}

export interface IncomeStatement {
  revenue: StatementLine[];
  expenses: StatementLine[];
  total_revenue_cents: number;
  total_expenses_cents: number;
  net_income_cents: number;
}

export interface BalanceSheet {
  assets: StatementLine[];
  liabilities: StatementLine[];
  equity: StatementLine[];
  total_assets_cents: number;
  total_liabilities_cents: number;
  total_equity_cents: number;
  balanced: boolean;
}

export interface FinancialStatements {
  generated_at: string;
  income_statement: IncomeStatement;
  balance_sheet: BalanceSheet;
}

export class IncompleteDataError extends Error {
  reasons: string[];
  constructor(reasons: string[]) {
    super(`Cannot generate financial statements: ${reasons.join("; ")}`);
    this.name = "IncompleteDataError";
    this.reasons = reasons;
  }
}

interface LedgerAggregateRow {
  account_id: string;
  code: string;
  name: string;
  type: string;
  debit_cents: number;
  credit_cents: number;
}

function sumNet(lines: StatementLine[]): number {
  return lines.reduce((total, line) => total + line.net_cents, 0);
}

/**
 * Produces a basic income statement and balance sheet from posted
 * transactions. Requires a company profile and at least one account to
 * exist first — those are real prerequisites, not just "no activity yet"
 * (which produces a valid, all-zero statement instead of this error).
 */
export function generateFinancialStatements(db: Database.Database, userId: string): FinancialStatements {
  const reasons: string[] = [];

  const company = db.prepare("SELECT id FROM companies LIMIT 1").get();
  if (!company) reasons.push("no company profile has been created yet");

  const accountCount = (db.prepare("SELECT COUNT(*) c FROM accounts").get() as { c: number }).c;
  if (accountCount === 0) reasons.push("the chart of accounts is empty");

  if (reasons.length > 0) {
    throw new IncompleteDataError(reasons);
  }

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
    .all() as LedgerAggregateRow[];

  const revenue: StatementLine[] = [];
  const expenses: StatementLine[] = [];
  const assets: StatementLine[] = [];
  const liabilities: StatementLine[] = [];
  const equity: StatementLine[] = [];

  for (const row of rows) {
    const debitNormal = row.type === "asset" || row.type === "expense";
    const net_cents = debitNormal ? row.debit_cents - row.credit_cents : row.credit_cents - row.debit_cents;
    const line: StatementLine = { account_id: row.account_id, code: row.code, name: row.name, net_cents };

    if (row.type === "revenue") revenue.push(line);
    else if (row.type === "expense") expenses.push(line);
    else if (row.type === "asset") assets.push(line);
    else if (row.type === "liability") liabilities.push(line);
    else if (row.type === "equity") equity.push(line);
  }

  const total_revenue_cents = sumNet(revenue);
  const total_expenses_cents = sumNet(expenses);
  const net_income_cents = total_revenue_cents - total_expenses_cents;

  const equityWithEarnings = [
    ...equity,
    { account_id: null, code: "NET_INCOME", name: "Net income (current period)", net_cents: net_income_cents },
  ];

  const total_assets_cents = sumNet(assets);
  const total_liabilities_cents = sumNet(liabilities);
  const total_equity_cents = sumNet(equityWithEarnings);

  const generatedAt = new Date().toISOString();

  db.prepare(
    `
    INSERT INTO audit_log (id, entity_type, entity_id, action, occurred_at, user_id, details)
    VALUES (@id, 'financial_statements', @entity_id, 'financial_statements_generated', @occurred_at, @user_id, @details)
  `
  ).run({
    id: randomUUID(),
    entity_id: randomUUID(),
    occurred_at: generatedAt,
    user_id: userId,
    details: JSON.stringify({
      net_income_cents,
      total_assets_cents,
      total_liabilities_cents,
      total_equity_cents,
    }),
  });

  return {
    generated_at: generatedAt,
    income_statement: { revenue, expenses, total_revenue_cents, total_expenses_cents, net_income_cents },
    balance_sheet: {
      assets,
      liabilities,
      equity: equityWithEarnings,
      total_assets_cents,
      total_liabilities_cents,
      total_equity_cents,
      balanced: total_assets_cents === total_liabilities_cents + total_equity_cents,
    },
  };
}
