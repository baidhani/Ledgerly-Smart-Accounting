import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { recordAuditEvent } from "./auditLog";
import { generateTrialBalance } from "./trialBalance";

/**
 * Rule-based financial analysis - deliberately not a call to an external
 * LLM provider (see STORY-015's design discussion: that would require a
 * paid API credential, a governance-boundary decision this codebase hasn't
 * made). Every function here only reads existing tables; none of them
 * contain an INSERT/UPDATE/DELETE. That is what makes REQ-021 ("AI-generated
 * analysis must not alter authoritative accounting records without user
 * approval") true by construction rather than by convention - there is no
 * write path for this module to misuse, on purpose.
 */

export const KNOWN_QUERY_TYPES = ["unbalanced_risk", "budget_variance_flags", "asset_position_summary"] as const;
export type InsightQueryType = (typeof KNOWN_QUERY_TYPES)[number];

export class UnknownInsightQueryError extends Error {
  constructor(query: string) {
    super(`Unrecognized financial query "${query}". Known queries: ${KNOWN_QUERY_TYPES.join(", ")}.`);
    this.name = "UnknownInsightQueryError";
  }
}

export interface InsightResult {
  query: InsightQueryType;
  generated_at: string;
  summary: string;
  data: unknown;
}

function analyzeUnbalancedRisk(db: Database.Database): { summary: string; data: unknown } {
  const rows = db
    .prepare(
      `
      SELECT je.id, je.entry_date, je.memo,
             SUM(jl.debit_cents) AS total_debit_cents,
             SUM(jl.credit_cents) AS total_credit_cents
      FROM journal_entries je
      JOIN journal_lines jl ON jl.journal_entry_id = je.id
      WHERE je.status = 'posted'
      GROUP BY je.id
      HAVING total_debit_cents != total_credit_cents
    `
    )
    .all();

  const summary =
    rows.length === 0
      ? "No unbalanced posted entries found. The balanced-entry guardrail is holding as expected."
      : `${rows.length} posted entr${rows.length === 1 ? "y is" : "ies are"} unbalanced - this should never happen given the posting guardrail and warrants investigation.`;

  return { summary, data: { unbalanced_entries: rows } };
}

function analyzeBudgetVarianceFlags(db: Database.Database): { summary: string; data: unknown } {
  const rows = db
    .prepare(
      `
      SELECT cc.name AS cost_center_name, a.name AS account_name, b.period, b.amount_cents
      FROM budgets b
      JOIN cost_centers cc ON cc.id = b.cost_center_id
      JOIN accounts a ON a.id = b.account_id
      ORDER BY b.amount_cents DESC
    `
    )
    .all();

  const summary =
    rows.length === 0
      ? "No budget allocations exist yet, so no variance analysis is possible."
      : `${rows.length} budget allocation(s) found. Actual-vs-budget variance is not available - there is no mapping from budget periods to real date ranges yet, so this lists allocations by size rather than flagging overspend.`;

  return { summary, data: { budgets_by_size: rows } };
}

function analyzeAssetPosition(db: Database.Database, userId: string): { summary: string; data: unknown } {
  const trialBalance = generateTrialBalance(db, userId);
  const assetLines = trialBalance.accounts.filter((a) => a.type === "asset");
  const netAssetCents = assetLines.reduce((sum, a) => sum + a.debit_cents - a.credit_cents, 0);

  const summary =
    assetLines.length === 0
      ? "No posted transactions touch asset accounts yet."
      : `Net asset position across ${assetLines.length} account(s): ${(netAssetCents / 100).toFixed(2)}.`;

  return { summary, data: { asset_accounts: assetLines, net_asset_cents: netAssetCents } };
}

export function generateInsights(db: Database.Database, query: string, userId: string): InsightResult {
  if (!KNOWN_QUERY_TYPES.includes(query as InsightQueryType)) {
    throw new UnknownInsightQueryError(query);
  }
  const queryType = query as InsightQueryType;
  const now = new Date().toISOString();

  let result: { summary: string; data: unknown };
  switch (queryType) {
    case "unbalanced_risk":
      result = analyzeUnbalancedRisk(db);
      break;
    case "budget_variance_flags":
      result = analyzeBudgetVarianceFlags(db);
      break;
    case "asset_position_summary":
      result = analyzeAssetPosition(db, userId);
      break;
  }

  recordAuditEvent(db, {
    entityType: "financial_insight",
    entityId: randomUUID(),
    action: "ai_analysis_requested",
    userId,
    occurredAt: now,
    details: { query: queryType, outcome: "success" },
  });

  return { query: queryType, generated_at: now, summary: result.summary, data: result.data };
}

/**
 * Logs a failed/rejected analysis request to the audit trail too - Trust
 * criterion 3 says "all AI analysis requests," not just successful ones.
 */
export function logFailedInsightRequest(db: Database.Database, query: string, userId: string): void {
  recordAuditEvent(db, {
    entityType: "financial_insight",
    entityId: randomUUID(),
    action: "ai_analysis_requested",
    userId,
    occurredAt: new Date().toISOString(),
    details: { query, outcome: "failure" },
  });
}
