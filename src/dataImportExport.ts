import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { recordAuditEvent } from "./auditLog";
import { validateAccountInput, createAccount, type Account } from "./accounts";

const CSV_HEADER = ["code", "name", "type", "parent_account_id"];

export interface ImportRowError {
  row: number;
  missing: string[];
  invalid: string[];
}

export interface ImportValidationResult {
  valid: boolean;
  errors: ImportRowError[];
  rows: Record<string, unknown>[];
}

function parseCsv(text: string): { header: string[]; rows: string[][] } {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return { header: [], rows: [] };
  }

  const header = lines[0].split(",").map((h) => h.trim());
  const rows = lines.slice(1).map((line) => line.split(",").map((cell) => cell.trim()));
  return { header, rows };
}

/**
 * Validates an entire import file before anything is written - same
 * atomicity discipline as STORY-016's bulk branch configure. A malformed
 * file (wrong/missing columns, a row with invalid data) is rejected as a
 * whole; nothing is partially imported.
 */
export function validateImportFile(db: Database.Database, csvText: string): ImportValidationResult {
  if (typeof csvText !== "string" || csvText.trim() === "") {
    return { valid: false, errors: [{ row: 0, missing: [], invalid: ["file is empty"] }], rows: [] };
  }

  const { header, rows } = parseCsv(csvText);

  const requiredHeader = ["code", "name", "type"];
  const missingColumns = requiredHeader.filter((c) => !header.includes(c));
  if (missingColumns.length > 0) {
    return {
      valid: false,
      errors: [{ row: 0, missing: [], invalid: [`missing required column(s): ${missingColumns.join(", ")}`] }],
      rows: [],
    };
  }

  if (rows.length === 0) {
    return { valid: false, errors: [{ row: 0, missing: [], invalid: ["file has a header but no data rows"] }], rows: [] };
  }

  const errors: ImportRowError[] = [];
  const parsedRows: Record<string, unknown>[] = [];
  const seenCodes = new Set<string>();
  const existingCodes = new Set(
    (db.prepare("SELECT code FROM accounts").all() as { code: string }[]).map((r) => r.code)
  );

  rows.forEach((cells, i) => {
    const rowNumber = i + 2; // 1-indexed data row, after the header line
    if (cells.length !== header.length) {
      errors.push({ row: rowNumber, missing: [], invalid: [`expected ${header.length} column(s), got ${cells.length}`] });
      return;
    }

    const record: Record<string, unknown> = {};
    header.forEach((col, idx) => {
      record[col] = cells[idx] === "" ? undefined : cells[idx];
    });

    const { valid, missing, invalid } = validateAccountInput(db, record);
    const rowInvalid = [...invalid];

    const code = record.code;
    if (typeof code === "string") {
      if (existingCodes.has(code)) {
        rowInvalid.push(`code (an account with code "${code}" already exists)`);
      } else if (seenCodes.has(code)) {
        rowInvalid.push(`code (duplicated within this file at an earlier row)`);
      } else {
        seenCodes.add(code);
      }
    }

    if (missing.length > 0 || rowInvalid.length > 0) {
      errors.push({ row: rowNumber, missing, invalid: rowInvalid });
      return;
    }

    parsedRows.push(record);
  });

  return { valid: errors.length === 0, errors, rows: parsedRows };
}

/**
 * Imports an already-validated file's rows atomically: either every row is
 * created, or none are. Callers must validate with validateImportFile first.
 */
export function importAccounts(db: Database.Database, rows: Record<string, unknown>[], userId: string): Account[] {
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    const created = rows.map((row) =>
      createAccount(
        db,
        {
          code: row.code as string,
          name: row.name as string,
          type: row.type as string,
          parent_account_id: (row.parent_account_id as string | undefined) ?? null,
        },
        userId
      )
    );
    recordAuditEvent(db, {
      entityType: "data_import",
      entityId: randomUUID(),
      action: "data_import_completed",
      userId,
      occurredAt: now,
      details: { row_count: created.length, codes: created.map((a) => a.code) },
    });
    return created;
  });
  return tx();
}

export function logFailedImport(db: Database.Database, userId: string, errors: ImportRowError[]): void {
  recordAuditEvent(db, {
    entityType: "data_import",
    entityId: randomUUID(),
    action: "data_import_rejected",
    userId,
    occurredAt: new Date().toISOString(),
    details: { error_count: errors.length },
  });
}

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Exports the chart of accounts to CSV text and logs the export itself.
 * Read-only - never touches accounting records, same "no write path"
 * discipline as STORY-015's insights module.
 */
export function exportAccounts(db: Database.Database, userId: string): string {
  const accounts = db.prepare("SELECT code, name, type, parent_account_id FROM accounts ORDER BY code").all() as {
    code: string;
    name: string;
    type: string;
    parent_account_id: string | null;
  }[];

  const lines = [CSV_HEADER.join(",")];
  for (const a of accounts) {
    lines.push([a.code, a.name, a.type, a.parent_account_id ?? ""].map((v) => csvEscape(String(v))).join(","));
  }

  recordAuditEvent(db, {
    entityType: "data_export",
    entityId: randomUUID(),
    action: "data_export_completed",
    userId,
    occurredAt: new Date().toISOString(),
    details: { row_count: accounts.length },
  });

  return lines.join("\n");
}
