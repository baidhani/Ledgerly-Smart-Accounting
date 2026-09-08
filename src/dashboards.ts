import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { recordAuditEvent } from "./auditLog";
import { generateTrialBalance } from "./trialBalance";

export interface ValidationResult {
  valid: boolean;
  missing: string[];
  invalid: string[];
}

export class DuplicateDashboardError extends Error {
  constructor(name: string) {
    super(`A dashboard named "${name}" already exists.`);
    this.name = "DuplicateDashboardError";
  }
}

export class DashboardNotFoundError extends Error {
  constructor(id: string) {
    super(`No dashboard with id "${id}" exists.`);
    this.name = "DashboardNotFoundError";
  }
}

export const KNOWN_WIDGET_TYPES = ["trial_balance", "budget_summary", "branch_summary"] as const;
export type WidgetType = (typeof KNOWN_WIDGET_TYPES)[number];

export interface DashboardInput {
  name: string;
  widgets: string[];
}

export interface Dashboard {
  id: string;
  name: string;
  widgets: WidgetType[];
  created_at: string;
  updated_at: string;
}

interface DashboardRow {
  id: string;
  name: string;
  widgets: string;
  created_at: string;
  updated_at: string;
}

function toDashboard(row: DashboardRow): Dashboard {
  return { ...row, widgets: JSON.parse(row.widgets) as WidgetType[] };
}

export function validateDashboardInput(input: Record<string, unknown>): ValidationResult {
  const missing: string[] = [];
  const invalid: string[] = [];

  if (input.name === undefined || input.name === null || (typeof input.name === "string" && input.name.trim() === "")) {
    missing.push("name");
  } else if (typeof input.name !== "string") {
    invalid.push("name");
  }

  if (input.widgets === undefined || input.widgets === null) {
    missing.push("widgets");
  } else if (!Array.isArray(input.widgets) || input.widgets.length === 0) {
    invalid.push("widgets (expected a non-empty array of widget types)");
  } else {
    const unknown = input.widgets.filter((w) => !KNOWN_WIDGET_TYPES.includes(w as WidgetType));
    if (unknown.length > 0) {
      invalid.push(`widgets (unknown widget type(s): ${unknown.join(", ")}; known types: ${KNOWN_WIDGET_TYPES.join(", ")})`);
    }
  }

  return { valid: missing.length === 0 && invalid.length === 0, missing, invalid };
}

export function createDashboard(db: Database.Database, input: DashboardInput, userId: string): Dashboard {
  const now = new Date().toISOString();
  const row: DashboardRow = {
    id: randomUUID(),
    name: input.name,
    widgets: JSON.stringify(input.widgets),
    created_at: now,
    updated_at: now,
  };

  const insert = db.prepare(`
    INSERT INTO dashboards (id, name, widgets, created_at, updated_at)
    VALUES (@id, @name, @widgets, @created_at, @updated_at)
  `);

  const tx = db.transaction(() => {
    insert.run(row);
    recordAuditEvent(db, {
      entityType: "dashboard",
      entityId: row.id,
      action: "dashboard_configured",
      userId,
      occurredAt: now,
      details: { name: row.name, widgets: input.widgets },
    });
  });

  try {
    tx();
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE") {
      throw new DuplicateDashboardError(input.name);
    }
    throw err;
  }

  return toDashboard(row);
}

function computeBudgetSummary(db: Database.Database): { cost_center_id: string; cost_center_name: string; total_budgeted_cents: number }[] {
  return db
    .prepare(
      `
      SELECT cc.id AS cost_center_id, cc.name AS cost_center_name, SUM(b.amount_cents) AS total_budgeted_cents
      FROM budgets b
      JOIN cost_centers cc ON cc.id = b.cost_center_id
      GROUP BY cc.id
      ORDER BY cc.name
    `
    )
    .all() as { cost_center_id: string; cost_center_name: string; total_budgeted_cents: number }[];
}

function computeBranchSummary(db: Database.Database): { total: number; active: number; inactive: number } {
  const row = db
    .prepare(
      `
      SELECT COUNT(*) AS total, SUM(is_active) AS active
      FROM branches
    `
    )
    .get() as { total: number; active: number | null };
  const active = row.active ?? 0;
  return { total: row.total, active, inactive: row.total - active };
}

/**
 * Renders a saved dashboard config into real-time widget data. Each widget
 * is computed live from current tables, never from a stored snapshot.
 * Widget computation is wrapped per-widget so one broken widget produces a
 * clear per-widget error rather than aborting the whole render.
 */
export function renderDashboard(db: Database.Database, id: string, userId: string): { dashboard: Dashboard; widgets: Record<string, unknown> } {
  const row = db.prepare("SELECT * FROM dashboards WHERE id = ?").get(id) as DashboardRow | undefined;
  if (!row) {
    throw new DashboardNotFoundError(id);
  }
  const dashboard = toDashboard(row);
  const now = new Date().toISOString();

  const widgets: Record<string, unknown> = {};
  for (const widgetType of dashboard.widgets) {
    try {
      switch (widgetType) {
        case "trial_balance":
          widgets[widgetType] = generateTrialBalance(db, userId);
          break;
        case "budget_summary":
          widgets[widgetType] = computeBudgetSummary(db);
          break;
        case "branch_summary":
          widgets[widgetType] = computeBranchSummary(db);
          break;
      }
    } catch (err) {
      widgets[widgetType] = { error: err instanceof Error ? err.message : "Could not compute this widget." };
    }
  }

  recordAuditEvent(db, {
    entityType: "dashboard",
    entityId: id,
    action: "dashboard_report_generated",
    userId,
    occurredAt: now,
    details: { name: dashboard.name, widgets: dashboard.widgets },
  });

  return { dashboard, widgets };
}
