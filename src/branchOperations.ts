import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { recordAuditEvent } from "./auditLog";

export interface ValidationResult {
  valid: boolean;
  missing: string[];
  invalid: string[];
}

export class DuplicateBranchError extends Error {
  constructor(code: string) {
    super(`A branch with code "${code}" already exists.`);
    this.name = "DuplicateBranchError";
  }
}

export class BranchNotFoundError extends Error {
  constructor(id: string) {
    super(`No branch with id "${id}" exists.`);
    this.name = "BranchNotFoundError";
  }
}

export interface BulkBranchValidationResult {
  valid: boolean;
  errors: { index: number; missing: string[]; invalid: string[] }[];
}

export interface BranchCreateInput {
  code: string;
  name: string;
  manager_name?: string | null;
}

export interface Branch {
  id: string;
  code: string;
  name: string;
  manager_name: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BranchUpdateInput {
  name?: string;
  manager_name?: string | null;
  is_active?: boolean;
}

interface BranchRow {
  id: string;
  code: string;
  name: string;
  manager_name: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

function toBranch(row: BranchRow): Branch {
  return { ...row, is_active: row.is_active === 1 };
}

export function validateBranchCreateInput(input: Record<string, unknown>): ValidationResult {
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

  if (input.manager_name !== undefined && input.manager_name !== null && typeof input.manager_name !== "string") {
    invalid.push("manager_name");
  }

  return { valid: missing.length === 0 && invalid.length === 0, missing, invalid };
}

export function createBranch(db: Database.Database, input: BranchCreateInput, userId: string): Branch {
  const now = new Date().toISOString();
  const row: BranchRow = {
    id: randomUUID(),
    code: input.code,
    name: input.name,
    manager_name: input.manager_name ?? null,
    is_active: 1,
    created_at: now,
    updated_at: now,
  };

  const insert = db.prepare(`
    INSERT INTO branches (id, code, name, manager_name, is_active, created_at, updated_at)
    VALUES (@id, @code, @name, @manager_name, @is_active, @created_at, @updated_at)
  `);

  const tx = db.transaction(() => {
    insert.run(row);
    recordAuditEvent(db, {
      entityType: "branch",
      entityId: row.id,
      action: "branch_created",
      userId,
      occurredAt: now,
      details: { code: row.code, name: row.name },
    });
  });

  try {
    tx();
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE") {
      throw new DuplicateBranchError(input.code);
    }
    throw err;
  }

  return toBranch(row);
}

/**
 * Validates a branch update against the branch it would apply to. Requires
 * db + id (rather than just the body) so it can catch "no fields supplied"
 * and "branch does not exist" as invalid, not just malformed field types —
 * the same reasoning as validateStockUpdateInput checking against live state.
 */
export function validateBranchUpdateInput(
  db: Database.Database,
  id: string,
  input: Record<string, unknown>
): ValidationResult {
  const missing: string[] = [];
  const invalid: string[] = [];

  const branch = db.prepare("SELECT id FROM branches WHERE id = ?").get(id);
  if (!branch) {
    invalid.push("id (no branch with that id exists)");
    return { valid: false, missing, invalid };
  }

  const hasName = input.name !== undefined;
  const hasManagerName = input.manager_name !== undefined;
  const hasIsActive = input.is_active !== undefined;

  if (!hasName && !hasManagerName && !hasIsActive) {
    missing.push("at least one of: name, manager_name, is_active");
  }

  if (hasName && (typeof input.name !== "string" || input.name.trim() === "")) {
    invalid.push("name");
  }
  if (hasManagerName && input.manager_name !== null && typeof input.manager_name !== "string") {
    invalid.push("manager_name");
  }
  if (hasIsActive && typeof input.is_active !== "boolean") {
    invalid.push("is_active");
  }

  return { valid: missing.length === 0 && invalid.length === 0, missing, invalid };
}

export function updateBranch(db: Database.Database, id: string, input: BranchUpdateInput, userId: string): Branch {
  const now = new Date().toISOString();
  const existing = db.prepare("SELECT * FROM branches WHERE id = ?").get(id) as BranchRow | undefined;
  if (!existing) {
    throw new BranchNotFoundError(id);
  }

  const updated: BranchRow = {
    ...existing,
    name: input.name ?? existing.name,
    manager_name: input.manager_name !== undefined ? input.manager_name : existing.manager_name,
    is_active: input.is_active !== undefined ? (input.is_active ? 1 : 0) : existing.is_active,
    updated_at: now,
  };

  const update = db.prepare(`
    UPDATE branches SET name = @name, manager_name = @manager_name, is_active = @is_active, updated_at = @updated_at
    WHERE id = @id
  `);

  const tx = db.transaction(() => {
    update.run(updated);
    recordAuditEvent(db, {
      entityType: "branch",
      entityId: id,
      action: "branch_updated",
      userId,
      occurredAt: now,
      details: { name: updated.name, manager_name: updated.manager_name, is_active: updated.is_active === 1 },
    });
  });

  tx();

  return toBranch(updated);
}

/**
 * Validates a whole multi-branch setup request before anything is saved:
 * per-item field validity, duplicate codes within the batch itself, and
 * duplicate codes against branches that already exist. This is the "data
 * consistency across branches" the brief calls for - a batch that would
 * leave two branches sharing a code, or half-save if one item is bad, is
 * rejected wholesale rather than partially applied.
 */
export function validateBulkBranchInput(db: Database.Database, items: unknown): BulkBranchValidationResult {
  const errors: { index: number; missing: string[]; invalid: string[] }[] = [];

  if (!Array.isArray(items) || items.length === 0) {
    return { valid: false, errors: [{ index: -1, missing: [], invalid: ["expected a non-empty array of branch configurations"] }] };
  }

  const existingCodes = new Set(
    (db.prepare("SELECT code FROM branches").all() as { code: string }[]).map((r) => r.code)
  );
  const seenInBatch = new Map<string, number>();

  items.forEach((item, index) => {
    if (item === null || typeof item !== "object") {
      errors.push({ index, missing: [], invalid: ["expected an object"] });
      return;
    }
    const { valid, missing, invalid } = validateBranchCreateInput(item as Record<string, unknown>);
    const itemInvalid = [...invalid];

    const code = (item as Record<string, unknown>).code;
    if (typeof code === "string" && code.trim() !== "") {
      if (existingCodes.has(code)) {
        itemInvalid.push(`code (a branch with code "${code}" already exists)`);
      } else if (seenInBatch.has(code)) {
        itemInvalid.push(`code (duplicated within this batch at index ${seenInBatch.get(code)})`);
      } else {
        seenInBatch.set(code, index);
      }
    }

    if (missing.length > 0 || itemInvalid.length > 0) {
      errors.push({ index, missing, invalid: itemInvalid });
    }
  });

  return { valid: errors.length === 0, errors };
}

/**
 * Saves a multi-branch setup request atomically: either every branch in the
 * request is created, or none are - a partial save would itself be a data
 * consistency violation. Callers must validate with validateBulkBranchInput
 * first; this assumes the batch is already known-good.
 */
export function bulkConfigureBranches(db: Database.Database, items: BranchCreateInput[], userId: string): Branch[] {
  const tx = db.transaction(() => items.map((item) => createBranch(db, item, userId)));
  return tx();
}
