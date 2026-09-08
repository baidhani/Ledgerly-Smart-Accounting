import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

export interface AccountInput {
  code: string;
  name: string;
  type: string;
  parent_account_id?: string | null;
}

export interface Account extends AccountInput {
  id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const REQUIRED_FIELDS: (keyof AccountInput)[] = ["code", "name", "type"];
const ACCOUNT_TYPES = ["asset", "liability", "equity", "revenue", "expense"];

export interface ValidationResult {
  valid: boolean;
  missing: string[];
  invalid: string[];
}

export function validateAccountInput(db: Database.Database, input: Record<string, unknown>): ValidationResult {
  const missing: string[] = [];
  const invalid: string[] = [];

  for (const field of REQUIRED_FIELDS) {
    const value = input[field];
    if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) {
      missing.push(field);
    }
  }

  for (const field of ["code", "name"] as const) {
    if (!missing.includes(field) && typeof input[field] !== "string") {
      invalid.push(field);
    }
  }

  if (!missing.includes("type")) {
    if (typeof input.type !== "string" || !ACCOUNT_TYPES.includes(input.type)) {
      invalid.push(`type (expected one of: ${ACCOUNT_TYPES.join(", ")})`);
    }
  }

  if (input.parent_account_id !== undefined && input.parent_account_id !== null) {
    if (typeof input.parent_account_id !== "string") {
      invalid.push("parent_account_id");
    } else {
      const parent = db.prepare("SELECT id FROM accounts WHERE id = ?").get(input.parent_account_id);
      if (!parent) {
        invalid.push("parent_account_id (no account with that id exists)");
      }
    }
  }

  return { valid: missing.length === 0 && invalid.length === 0, missing, invalid };
}

export class DuplicateAccountError extends Error {
  constructor(code: string) {
    super(`An account with code "${code}" already exists.`);
    this.name = "DuplicateAccountError";
  }
}

export function createAccount(db: Database.Database, input: AccountInput, userId: string): Account {
  const now = new Date().toISOString();
  const account: Account = {
    id: randomUUID(),
    code: input.code,
    name: input.name,
    type: input.type,
    parent_account_id: input.parent_account_id ?? null,
    is_active: true,
    created_at: now,
    updated_at: now,
  };

  const insertAccount = db.prepare(`
    INSERT INTO accounts (id, code, name, type, parent_account_id, is_active, created_at, updated_at)
    VALUES (@id, @code, @name, @type, @parent_account_id, @is_active, @created_at, @updated_at)
  `);
  const insertAudit = db.prepare(`
    INSERT INTO audit_log (id, entity_type, entity_id, action, occurred_at, user_id, details)
    VALUES (@id, 'account', @entity_id, 'account_created', @occurred_at, @user_id, @details)
  `);

  const tx = db.transaction(() => {
    insertAccount.run({ ...account, is_active: account.is_active ? 1 : 0 });
    insertAudit.run({
      id: randomUUID(),
      entity_id: account.id,
      occurred_at: now,
      user_id: userId,
      details: JSON.stringify({ code: account.code, name: account.name }),
    });
  });

  try {
    tx();
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE") {
      throw new DuplicateAccountError(account.code);
    }
    throw err;
  }

  return account;
}
