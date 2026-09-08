import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import type Database from "better-sqlite3";
import { createApp } from "../src/app";
import { openDb } from "../src/db";

describe("POST /stock-updates", () => {
  let db: Database.Database;
  let itemId: string;

  beforeEach(() => {
    db = openDb(":memory:");
    const now = new Date().toISOString();
    db.prepare(
      "INSERT INTO inventory_items (id, sku, name, quantity_on_hand, created_at, updated_at) VALUES ('item1','SKU-1','Widget',10,@now,@now)"
    ).run({ now });
    itemId = "item1";
  });

  afterEach(() => {
    if (db.open) db.close();
  });

  it("applies a valid stock update and records the resulting quantity (happy path)", async () => {
    const app = createApp(db);

    const res = await request(app)
      .post("/stock-updates")
      .set("X-User-Id", "alice")
      .send({ reference: "ADJ-1", inventory_item_id: itemId, quantity_change: -3, reason: "count correction" });

    expect(res.status).toBe(201);
    expect(res.body.quantity_on_hand_after).toBe(7);

    const item = db.prepare("SELECT quantity_on_hand FROM inventory_items WHERE id = ?").get(itemId) as {
      quantity_on_hand: number;
    };
    expect(item.quantity_on_hand).toBe(7);
  });

  it("rejects a stock update that would drive quantity_on_hand below zero, leaving inventory untouched (failure path)", async () => {
    const app = createApp(db);

    const res = await request(app)
      .post("/stock-updates")
      .send({ reference: "ADJ-2", inventory_item_id: itemId, quantity_change: -999 });

    expect(res.status).toBe(400);
    expect(res.body.invalid_fields.join(" ")).toMatch(/below zero/);

    const item = db.prepare("SELECT quantity_on_hand FROM inventory_items WHERE id = ?").get(itemId) as {
      quantity_on_hand: number;
    };
    expect(item.quantity_on_hand).toBe(10);

    const count = db.prepare("SELECT COUNT(*) c FROM stock_updates").get() as { c: number };
    expect(count.c).toBe(0);
  });

  it("rejects a stock update referencing an inventory item that does not exist (failure path)", async () => {
    const app = createApp(db);

    const res = await request(app)
      .post("/stock-updates")
      .send({ reference: "ADJ-3", inventory_item_id: "does-not-exist", quantity_change: 5 });

    expect(res.status).toBe(400);
    expect(res.body.invalid_fields.join(" ")).toMatch(/no inventory item/);
  });

  it("rejects an incomplete stock update (missing fields, boundary case)", async () => {
    const app = createApp(db);

    const res = await request(app).post("/stock-updates").send({});

    expect(res.status).toBe(400);
    expect(res.body.missing_fields).toEqual(
      expect.arrayContaining(["reference", "inventory_item_id", "quantity_change"])
    );
  });

  it("rejects a duplicate reference without applying it a second time (idempotency/failure path)", async () => {
    const app = createApp(db);
    await request(app).post("/stock-updates").send({ reference: "ADJ-DUP", inventory_item_id: itemId, quantity_change: -2 });

    const res = await request(app)
      .post("/stock-updates")
      .send({ reference: "ADJ-DUP", inventory_item_id: itemId, quantity_change: -2 });

    expect(res.status).toBe(409);

    const item = db.prepare("SELECT quantity_on_hand FROM inventory_items WHERE id = ?").get(itemId) as {
      quantity_on_hand: number;
    };
    expect(item.quantity_on_hand).toBe(8);

    const count = db.prepare("SELECT COUNT(*) c FROM stock_updates").get() as { c: number };
    expect(count.c).toBe(1);
  });

  it("logs the stock update to the audit trail (Trust criterion)", async () => {
    const app = createApp(db);

    await request(app)
      .post("/stock-updates")
      .set("X-User-Id", "alice")
      .send({ reference: "ADJ-4", inventory_item_id: itemId, quantity_change: 5 });

    const events = db
      .prepare("SELECT action, user_id FROM audit_log WHERE entity_type = 'inventory_item' AND entity_id = ?")
      .all(itemId) as { action: string; user_id: string }[];

    expect(events.map((e) => e.action)).toContain("inventory_stock_updated");
    expect(events[0].user_id).toBe("alice");
  });
});
