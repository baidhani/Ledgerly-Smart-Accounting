import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { recordAuditEvent } from "./auditLog";

export interface ValidationResult {
  valid: boolean;
  missing: string[];
  invalid: string[];
}

export class DuplicateCostCenterError extends Error {
  constructor(code: string) {
    super(`A cost center with code "${code}" already exists.`);
    this.name = "DuplicateCostCenterError";
  }
}

export class DuplicateBudgetError extends Error {
  constructor(costCenterId: string, accountId: string, period: string) {
    super(`A budget for cost center "${costCenterId}", account "${accountId}", period "${period}" already exists.`);
    this.name = "DuplicateBudgetError";
  }
}

export interface CostCenterInput {
  code: string;
  name: string;
}

export interface CostCenter {
  id: string;
  code: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface BudgetInput {
  cost_center_id: string;
  account_id: string;
  period: string;
  amount_cents: number;
}

export interface Budget {
  id: string;
  cost_center_id: string;
  account_id: string;
  period: string;
  amount_cents: number;
  created_at: string;
}

export function validateCostCenterInput(input: Record<string, unknown>): ValidationResult {
  const missing: string[] = [];
  const invalid: string[] = [];

  for (const field of ["code", "name"] as const) {
    const value = input[field];
    if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) {
      missing.push(field);
    } else if (typeof value !== "string") {
      invalid.push(field);
    }
  }

  return { valid: missing.length === 0 && invalid.length === 0, missing, invalid };
}

export function createCostCenter(db: Database.Database, input: CostCenterInput, userId: string): CostCenter {
  const now = new Date().toISOString();
  const costCenter: CostCenter = {
    id: randomUUID(),
    code: input.code,
    name: input.name,
    created_at: now,
    updated_at: now,
  };

  const insert = db.prepare(`
    INSERT INTO cost_centers (id, code, name, created_at, updated_at)
    VALUES (@id, @code, @name, @created_at, @updated_at)
  `);

  const tx = db.transaction(() => {
    insert.run(costCenter);
    recordAuditEvent(db, {
      entityType: "cost_center",
      entityId: costCenter.id,
      action: "cost_center_created",
      userId,
      occurredAt: now,
      details: { code: costCenter.code, name: costCenter.name },
    });
  });

  try {
    tx();
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE") {
      throw new DuplicateCostCenterError(input.code);
    }
    throw err;
  }

  return costCenter;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function validateBudgetInput(db: Database.Database, input: Record<string, unknown>): ValidationResult {
  const missing: string[] = [];
  const invalid: string[] = [];

  for (const field of ["cost_center_id", "account_id", "period", "amount_cents"] as const) {
    const value = input[field];
    if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) {
      missing.push(field);
    }
  }

  if (!missing.includes("cost_center_id")) {
    const costCenter = db.prepare("SELECT id FROM cost_centers WHERE id = ?").get(input.cost_center_id);
    if (!costCenter) {
      invalid.push("cost_center_id (no cost center with that id exists)");
    }
  }

  if (!missing.includes("account_id")) {
    const account = db.prepare("SELECT id FROM accounts WHERE id = ?").get(input.account_id);
    if (!account) {
      invalid.push("account_id (no account with that id exists)");
    }
  }

  if (!missing.includes("amount_cents") && !isPositiveInteger(input.amount_cents)) {
    invalid.push("amount_cents (expected a whole number greater than zero)");
  }

  if (!missing.includes("period") && typeof input.period !== "string") {
    invalid.push("period");
  }

  return { valid: missing.length === 0 && invalid.length === 0, missing, invalid };
}

export function createBudget(db: Database.Database, input: BudgetInput, userId: string): Budget {
  const now = new Date().toISOString();
  const budget: Budget = {
    id: randomUUID(),
    cost_center_id: input.cost_center_id,
    account_id: input.account_id,
    period: input.period,
    amount_cents: input.amount_cents,
    created_at: now,
  };

  const insert = db.prepare(`
    INSERT INTO budgets (id, cost_center_id, account_id, period, amount_cents, created_at)
    VALUES (@id, @cost_center_id, @account_id, @period, @amount_cents, @created_at)
  `);

  const tx = db.transaction(() => {
    insert.run(budget);
    recordAuditEvent(db, {
      entityType: "budget",
      entityId: budget.id,
      action: "budget_created",
      userId,
      occurredAt: now,
      details: {
        cost_center_id: budget.cost_center_id,
        account_id: budget.account_id,
        period: budget.period,
        amount_cents: budget.amount_cents,
      },
    });
  });

  try {
    tx();
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE") {
      throw new DuplicateBudgetError(input.cost_center_id, input.account_id, input.period);
    }
    throw err;
  }

  return budget;
}
