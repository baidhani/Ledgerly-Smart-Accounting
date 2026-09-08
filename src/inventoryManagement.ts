import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { recordAuditEvent } from "./auditLog";

export interface ValidationResult {
  valid: boolean;
  missing: string[];
  invalid: string[];
}

export class DuplicateStockUpdateError extends Error {
  constructor(reference: string) {
    super(`A stock update with reference "${reference}" already exists.`);
    this.name = "DuplicateStockUpdateError";
  }
}

export interface StockUpdateInput {
  reference: string;
  inventory_item_id: string;
  quantity_change: number;
  reason?: string | null;
}

export interface StockUpdate {
  id: string;
  reference: string;
  inventory_item_id: string;
  quantity_change: number;
  reason: string | null;
  created_at: string;
  quantity_on_hand_after: number;
}

function isNonZeroInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value !== 0;
}

export function validateStockUpdateInput(db: Database.Database, input: Record<string, unknown>): ValidationResult {
  const missing: string[] = [];
  const invalid: string[] = [];

  for (const field of ["reference", "inventory_item_id", "quantity_change"] as const) {
    const value = input[field];
    if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) {
      missing.push(field);
    }
  }

  if (!missing.includes("inventory_item_id")) {
    const item = db.prepare("SELECT quantity_on_hand FROM inventory_items WHERE id = ?").get(input.inventory_item_id) as
      | { quantity_on_hand: number }
      | undefined;
    if (!item) {
      invalid.push("inventory_item_id (no inventory item with that id exists)");
    } else if (!missing.includes("quantity_change") && isNonZeroInteger(input.quantity_change)) {
      const resulting = item.quantity_on_hand + input.quantity_change;
      if (resulting < 0) {
        invalid.push(
          `quantity_change (would leave quantity_on_hand at ${resulting}, below zero — current stock is ${item.quantity_on_hand})`
        );
      }
    }
  }

  if (!missing.includes("quantity_change") && !isNonZeroInteger(input.quantity_change)) {
    invalid.push("quantity_change (expected a non-zero whole number)");
  }

  if (input.reason !== undefined && input.reason !== null && typeof input.reason !== "string") {
    invalid.push("reason");
  }

  return { valid: missing.length === 0 && invalid.length === 0, missing, invalid };
}

/**
 * Applies a direct inventory adjustment (count correction, write-off) —
 * distinct from quantity_on_hand changing as a side effect of sales/purchase
 * order processing (STORY-009). Rejects an update that would drive stock
 * negative before touching anything, rather than relying solely on the
 * CHECK constraint to catch it after the fact.
 */
export function applyStockUpdate(db: Database.Database, input: StockUpdateInput, userId: string): StockUpdate {
  const now = new Date().toISOString();
  const update: StockUpdate & { quantity_on_hand_after: number } = {
    id: randomUUID(),
    reference: input.reference,
    inventory_item_id: input.inventory_item_id,
    quantity_change: input.quantity_change,
    reason: input.reason ?? null,
    created_at: now,
    quantity_on_hand_after: 0,
  };

  const insertUpdate = db.prepare(`
    INSERT INTO stock_updates (id, reference, inventory_item_id, quantity_change, reason, created_at)
    VALUES (@id, @reference, @inventory_item_id, @quantity_change, @reason, @created_at)
  `);
  const applyDelta = db.prepare(
    "UPDATE inventory_items SET quantity_on_hand = quantity_on_hand + @qty, updated_at = @now WHERE id = @id"
  );
  const readQuantity = db.prepare("SELECT quantity_on_hand FROM inventory_items WHERE id = ?");

  const tx = db.transaction(() => {
    insertUpdate.run(update);
    applyDelta.run({ id: input.inventory_item_id, qty: input.quantity_change, now });
    const row = readQuantity.get(input.inventory_item_id) as { quantity_on_hand: number };
    update.quantity_on_hand_after = row.quantity_on_hand;
    recordAuditEvent(db, {
      entityType: "inventory_item",
      entityId: input.inventory_item_id,
      action: "inventory_stock_updated",
      userId,
      occurredAt: now,
      details: { reference: input.reference, quantity_change: input.quantity_change, reason: input.reason ?? null },
    });
  });

  try {
    tx();
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE") {
      throw new DuplicateStockUpdateError(input.reference);
    }
    throw err;
  }

  return update;
}
