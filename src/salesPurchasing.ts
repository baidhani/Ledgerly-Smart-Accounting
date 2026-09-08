import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { recordAuditEvent } from "./auditLog";

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isPositiveAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export interface ValidationResult {
  valid: boolean;
  missing: string[];
  invalid: string[];
}

export class DuplicateSalesOrderError extends Error {
  constructor(orderNumber: string) {
    super(`A sales order with number "${orderNumber}" already exists.`);
    this.name = "DuplicateSalesOrderError";
  }
}

export class DuplicatePurchaseOrderError extends Error {
  constructor(orderNumber: string) {
    super(`A purchase order with number "${orderNumber}" already exists.`);
    this.name = "DuplicatePurchaseOrderError";
  }
}

export class SalesOrderNotFoundError extends Error {
  constructor(id: string) {
    super(`No sales order with id "${id}" exists.`);
    this.name = "SalesOrderNotFoundError";
  }
}

export class PurchaseOrderNotFoundError extends Error {
  constructor(id: string) {
    super(`No purchase order with id "${id}" exists.`);
    this.name = "PurchaseOrderNotFoundError";
  }
}

export class DuplicateInventoryItemError extends Error {
  constructor(sku: string) {
    super(`An inventory item with sku "${sku}" already exists.`);
    this.name = "DuplicateInventoryItemError";
  }
}

export class InventoryError extends Error {
  reasons: string[];
  constructor(reasons: string[]) {
    super(`Order cannot be processed: ${reasons.join("; ")}`);
    this.name = "InventoryError";
    this.reasons = reasons;
  }
}

// ---- Inventory items (bare creation only — no CRUD/adjustments beyond
// this; that's STORY-011's job. This exists purely so a sales/purchase
// order has something real to reference, not as an inventory feature.) ----

export interface InventoryItemInput {
  sku: string;
  name: string;
  quantity_on_hand?: number;
}

export interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  quantity_on_hand: number;
  created_at: string;
  updated_at: string;
}

export function validateInventoryItemInput(input: Record<string, unknown>): ValidationResult {
  const missing: string[] = [];
  const invalid: string[] = [];

  for (const field of ["sku", "name"] as const) {
    const value = input[field];
    if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) {
      missing.push(field);
    }
  }

  if (input.quantity_on_hand !== undefined && input.quantity_on_hand !== null) {
    if (typeof input.quantity_on_hand !== "number" || !Number.isInteger(input.quantity_on_hand) || input.quantity_on_hand < 0) {
      invalid.push("quantity_on_hand (expected a non-negative whole number)");
    }
  }

  return { valid: missing.length === 0 && invalid.length === 0, missing, invalid };
}

export function createInventoryItem(db: Database.Database, input: InventoryItemInput, userId: string): InventoryItem {
  const now = new Date().toISOString();
  const item: InventoryItem = {
    id: randomUUID(),
    sku: input.sku,
    name: input.name,
    quantity_on_hand: input.quantity_on_hand ?? 0,
    created_at: now,
    updated_at: now,
  };

  const insert = db.prepare(`
    INSERT INTO inventory_items (id, sku, name, quantity_on_hand, created_at, updated_at)
    VALUES (@id, @sku, @name, @quantity_on_hand, @created_at, @updated_at)
  `);

  const tx = db.transaction(() => {
    insert.run(item);
    recordAuditEvent(db, {
      entityType: "inventory_item",
      entityId: item.id,
      action: "inventory_item_created",
      userId,
      occurredAt: now,
      details: { sku: item.sku, name: item.name, quantity_on_hand: item.quantity_on_hand },
    });
  });

  try {
    tx();
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE") {
      throw new DuplicateInventoryItemError(item.sku);
    }
    throw err;
  }

  return item;
}

// ---- Sales orders ----

export interface OrderLineInput {
  inventory_item_id: string;
  quantity: number;
  unit_price: number;
}

export interface SalesOrderInput {
  order_number: string;
  customer_id: string;
  lines: OrderLineInput[];
}

export interface OrderLine {
  id: string;
  inventory_item_id: string;
  quantity: number;
  unit_price_cents: number;
}

export interface SalesOrder {
  id: string;
  order_number: string;
  customer_id: string;
  status: "draft" | "processed";
  created_at: string;
  processed_at: string | null;
  lines: OrderLine[];
}

export function validateSalesOrderInput(db: Database.Database, input: Record<string, unknown>): ValidationResult {
  const missing: string[] = [];
  const invalid: string[] = [];

  for (const field of ["order_number", "customer_id"] as const) {
    const value = input[field];
    if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) {
      missing.push(field);
    }
  }

  if (!missing.includes("customer_id")) {
    const customer = db.prepare("SELECT id FROM business_partners WHERE id = ? AND type = 'customer'").get(input.customer_id);
    if (!customer) invalid.push("customer_id (no customer with that id exists)");
  }

  if (input.lines === undefined || input.lines === null) {
    missing.push("lines");
  } else if (!Array.isArray(input.lines) || input.lines.length === 0) {
    invalid.push("lines (expected a non-empty array)");
  } else {
    input.lines.forEach((line, i) => {
      if (!line || typeof line !== "object") {
        invalid.push(`lines[${i}] (expected an object)`);
        return;
      }
      const { inventory_item_id, quantity, unit_price } = line as Record<string, unknown>;
      if (typeof inventory_item_id !== "string" || inventory_item_id.trim() === "") {
        invalid.push(`lines[${i}].inventory_item_id`);
      } else {
        const item = db.prepare("SELECT id FROM inventory_items WHERE id = ?").get(inventory_item_id);
        if (!item) invalid.push(`lines[${i}].inventory_item_id (no inventory item with that id exists)`);
      }
      if (!isPositiveInteger(quantity)) invalid.push(`lines[${i}].quantity (expected a positive whole number)`);
      if (!isPositiveAmount(unit_price)) invalid.push(`lines[${i}].unit_price (expected a positive number)`);
    });
  }

  return { valid: missing.length === 0 && invalid.length === 0, missing, invalid };
}

export function createSalesOrder(db: Database.Database, input: SalesOrderInput, userId: string): SalesOrder {
  const now = new Date().toISOString();
  const orderId = randomUUID();
  const lines: OrderLine[] = input.lines.map((line) => ({
    id: randomUUID(),
    inventory_item_id: line.inventory_item_id,
    quantity: line.quantity,
    unit_price_cents: Math.round(line.unit_price * 100),
  }));

  const insertOrder = db.prepare(`
    INSERT INTO sales_orders (id, order_number, customer_id, status, created_at)
    VALUES (@id, @order_number, @customer_id, 'draft', @created_at)
  `);
  const insertLine = db.prepare(`
    INSERT INTO sales_order_lines (id, sales_order_id, inventory_item_id, quantity, unit_price_cents)
    VALUES (@id, @sales_order_id, @inventory_item_id, @quantity, @unit_price_cents)
  `);

  const tx = db.transaction(() => {
    insertOrder.run({ id: orderId, order_number: input.order_number, customer_id: input.customer_id, created_at: now });
    for (const line of lines) {
      insertLine.run({ ...line, sales_order_id: orderId });
    }
    recordAuditEvent(db, {
      entityType: "sales_order",
      entityId: orderId,
      action: "sales_order_created",
      userId,
      occurredAt: now,
      details: { order_number: input.order_number, line_count: lines.length },
    });
  });

  try {
    tx();
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE") {
      throw new DuplicateSalesOrderError(input.order_number);
    }
    throw err;
  }

  return { id: orderId, order_number: input.order_number, customer_id: input.customer_id, status: "draft", created_at: now, processed_at: null, lines };
}

/**
 * Processes a draft sales order: checks every line against current stock
 * (the "Inventory error" failure path) before changing anything, then
 * decrements quantity_on_hand and marks the order processed. Idempotent:
 * processing an already-processed order returns the same result again
 * without touching inventory a second time.
 */
export function processSalesOrder(db: Database.Database, orderId: string, userId: string): SalesOrder {
  const order = db.prepare("SELECT * FROM sales_orders WHERE id = ?").get(orderId) as
    | { id: string; order_number: string; customer_id: string; status: string; created_at: string; processed_at: string | null }
    | undefined;
  if (!order) {
    throw new SalesOrderNotFoundError(orderId);
  }

  const lines = db.prepare("SELECT * FROM sales_order_lines WHERE sales_order_id = ?").all(orderId) as OrderLine[];

  if (order.status === "processed") {
    return { ...order, status: "processed", lines } as SalesOrder;
  }

  const reasons: string[] = [];
  for (const line of lines) {
    const item = db.prepare("SELECT quantity_on_hand FROM inventory_items WHERE id = ?").get(line.inventory_item_id) as
      | { quantity_on_hand: number }
      | undefined;
    if (!item || item.quantity_on_hand < line.quantity) {
      reasons.push(
        `insufficient stock for item "${line.inventory_item_id}": requested ${line.quantity}, available ${item?.quantity_on_hand ?? 0}`
      );
    }
  }
  if (reasons.length > 0) {
    throw new InventoryError(reasons);
  }

  const now = new Date().toISOString();
  const decrement = db.prepare("UPDATE inventory_items SET quantity_on_hand = quantity_on_hand - @qty, updated_at = @now WHERE id = @id");
  const updateOrder = db.prepare("UPDATE sales_orders SET status = 'processed', processed_at = @now WHERE id = @id");

  const tx = db.transaction(() => {
    for (const line of lines) {
      decrement.run({ id: line.inventory_item_id, qty: line.quantity, now });
    }
    updateOrder.run({ id: orderId, now });
    recordAuditEvent(db, {
      entityType: "sales_order",
      entityId: orderId,
      action: "sales_order_processed",
      userId,
      occurredAt: now,
      details: { line_count: lines.length },
    });
  });
  tx();

  return { ...order, status: "processed", processed_at: now, lines };
}

// ---- Purchase orders ----

export interface PurchaseOrderInput {
  order_number: string;
  vendor_id: string;
  lines: { inventory_item_id: string; quantity: number; unit_cost: number }[];
}

export interface PurchaseOrderLine {
  id: string;
  inventory_item_id: string;
  quantity: number;
  unit_cost_cents: number;
}

export interface PurchaseOrder {
  id: string;
  order_number: string;
  vendor_id: string;
  status: "draft" | "processed";
  created_at: string;
  processed_at: string | null;
  lines: PurchaseOrderLine[];
}

export function validatePurchaseOrderInput(db: Database.Database, input: Record<string, unknown>): ValidationResult {
  const missing: string[] = [];
  const invalid: string[] = [];

  for (const field of ["order_number", "vendor_id"] as const) {
    const value = input[field];
    if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) {
      missing.push(field);
    }
  }

  if (!missing.includes("vendor_id")) {
    const vendor = db.prepare("SELECT id FROM business_partners WHERE id = ? AND type = 'vendor'").get(input.vendor_id);
    if (!vendor) invalid.push("vendor_id (no vendor with that id exists)");
  }

  if (input.lines === undefined || input.lines === null) {
    missing.push("lines");
  } else if (!Array.isArray(input.lines) || input.lines.length === 0) {
    invalid.push("lines (expected a non-empty array)");
  } else {
    input.lines.forEach((line, i) => {
      if (!line || typeof line !== "object") {
        invalid.push(`lines[${i}] (expected an object)`);
        return;
      }
      const { inventory_item_id, quantity, unit_cost } = line as Record<string, unknown>;
      if (typeof inventory_item_id !== "string" || inventory_item_id.trim() === "") {
        invalid.push(`lines[${i}].inventory_item_id`);
      } else {
        const item = db.prepare("SELECT id FROM inventory_items WHERE id = ?").get(inventory_item_id);
        if (!item) invalid.push(`lines[${i}].inventory_item_id (no inventory item with that id exists)`);
      }
      if (!isPositiveInteger(quantity)) invalid.push(`lines[${i}].quantity (expected a positive whole number)`);
      if (!isPositiveAmount(unit_cost)) invalid.push(`lines[${i}].unit_cost (expected a positive number)`);
    });
  }

  return { valid: missing.length === 0 && invalid.length === 0, missing, invalid };
}

export function createPurchaseOrder(db: Database.Database, input: PurchaseOrderInput, userId: string): PurchaseOrder {
  const now = new Date().toISOString();
  const orderId = randomUUID();
  const lines: PurchaseOrderLine[] = input.lines.map((line) => ({
    id: randomUUID(),
    inventory_item_id: line.inventory_item_id,
    quantity: line.quantity,
    unit_cost_cents: Math.round(line.unit_cost * 100),
  }));

  const insertOrder = db.prepare(`
    INSERT INTO purchase_orders (id, order_number, vendor_id, status, created_at)
    VALUES (@id, @order_number, @vendor_id, 'draft', @created_at)
  `);
  const insertLine = db.prepare(`
    INSERT INTO purchase_order_lines (id, purchase_order_id, inventory_item_id, quantity, unit_cost_cents)
    VALUES (@id, @purchase_order_id, @inventory_item_id, @quantity, @unit_cost_cents)
  `);

  const tx = db.transaction(() => {
    insertOrder.run({ id: orderId, order_number: input.order_number, vendor_id: input.vendor_id, created_at: now });
    for (const line of lines) {
      insertLine.run({ ...line, purchase_order_id: orderId });
    }
    recordAuditEvent(db, {
      entityType: "purchase_order",
      entityId: orderId,
      action: "purchase_order_created",
      userId,
      occurredAt: now,
      details: { order_number: input.order_number, line_count: lines.length },
    });
  });

  try {
    tx();
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE") {
      throw new DuplicatePurchaseOrderError(input.order_number);
    }
    throw err;
  }

  return { id: orderId, order_number: input.order_number, vendor_id: input.vendor_id, status: "draft", created_at: now, processed_at: null, lines };
}

/**
 * Processes a draft purchase order: increments quantity_on_hand for each
 * line (receiving stock) and marks the order processed. Idempotent, same
 * as processSalesOrder.
 */
export function processPurchaseOrder(db: Database.Database, orderId: string, userId: string): PurchaseOrder {
  const order = db.prepare("SELECT * FROM purchase_orders WHERE id = ?").get(orderId) as
    | { id: string; order_number: string; vendor_id: string; status: string; created_at: string; processed_at: string | null }
    | undefined;
  if (!order) {
    throw new PurchaseOrderNotFoundError(orderId);
  }

  const lines = db.prepare("SELECT * FROM purchase_order_lines WHERE purchase_order_id = ?").all(orderId) as PurchaseOrderLine[];

  if (order.status === "processed") {
    return { ...order, status: "processed", lines } as PurchaseOrder;
  }

  const now = new Date().toISOString();
  const increment = db.prepare("UPDATE inventory_items SET quantity_on_hand = quantity_on_hand + @qty, updated_at = @now WHERE id = @id");
  const updateOrder = db.prepare("UPDATE purchase_orders SET status = 'processed', processed_at = @now WHERE id = @id");

  const tx = db.transaction(() => {
    for (const line of lines) {
      increment.run({ id: line.inventory_item_id, qty: line.quantity, now });
    }
    updateOrder.run({ id: orderId, now });
    recordAuditEvent(db, {
      entityType: "purchase_order",
      entityId: orderId,
      action: "purchase_order_processed",
      userId,
      occurredAt: now,
      details: { line_count: lines.length },
    });
  });
  tx();

  return { ...order, status: "processed", processed_at: now, lines };
}
