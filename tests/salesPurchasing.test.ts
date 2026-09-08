import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import type Database from "better-sqlite3";
import { createApp } from "../src/app";
import { openDb } from "../src/db";

describe("Sales and purchasing workflows", () => {
  let db: Database.Database;
  let customerId: string;
  let vendorId: string;
  let itemId: string;

  beforeEach(async () => {
    db = openDb(":memory:");
    const now = new Date().toISOString();
    db.prepare("INSERT INTO business_partners (id, type, name, created_at, updated_at) VALUES ('cust1','customer','Acme',@now,@now)").run({ now });
    db.prepare("INSERT INTO business_partners (id, type, name, created_at, updated_at) VALUES ('vend1','vendor','Supplier Co',@now,@now)").run({ now });
    db.prepare(
      "INSERT INTO inventory_items (id, sku, name, quantity_on_hand, created_at, updated_at) VALUES ('item1','SKU-1','Widget',10,@now,@now)"
    ).run({ now });
    customerId = "cust1";
    vendorId = "vend1";
    itemId = "item1";
  });

  afterEach(() => {
    if (db.open) db.close();
  });

  describe("POST /sales-orders/:id/process", () => {
    async function createOrder(app: ReturnType<typeof createApp>, orderNumber = "SO-001", quantity = 3) {
      const res = await request(app).post("/sales-orders").send({
        order_number: orderNumber,
        customer_id: customerId,
        lines: [{ inventory_item_id: itemId, quantity, unit_price: 15 }],
      });
      return res.body.id as string;
    }

    it("processes the order, updating inventory and sales records (happy path)", async () => {
      const app = createApp(db);
      const orderId = await createOrder(app);

      const res = await request(app).post(`/sales-orders/${orderId}/process`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("processed");

      const item = db.prepare("SELECT quantity_on_hand FROM inventory_items WHERE id = ?").get(itemId) as {
        quantity_on_hand: number;
      };
      expect(item.quantity_on_hand).toBe(7);

      const order = db.prepare("SELECT status FROM sales_orders WHERE id = ?").get(orderId) as { status: string };
      expect(order.status).toBe("processed");
    });

    it("rejects an invalid sales order without saving it (failure path)", async () => {
      const app = createApp(db);

      const res = await request(app).post("/sales-orders").send({ order_number: "SO-BAD", customer_id: customerId });

      expect(res.status).toBe(400);
      expect(res.body.missing_fields).toContain("lines");

      const count = db.prepare("SELECT COUNT(*) c FROM sales_orders").get() as { c: number };
      expect(count.c).toBe(0);
    });

    it("rejects processing when there isn't enough stock, leaving inventory untouched (Inventory error failure path)", async () => {
      const app = createApp(db);
      const orderId = await createOrder(app, "SO-002", 1000);

      const res = await request(app).post(`/sales-orders/${orderId}/process`);

      expect(res.status).toBe(400);
      expect(res.body.reasons.join(" ")).toMatch(/insufficient stock/);

      const item = db.prepare("SELECT quantity_on_hand FROM inventory_items WHERE id = ?").get(itemId) as {
        quantity_on_hand: number;
      };
      expect(item.quantity_on_hand).toBe(10);

      const order = db.prepare("SELECT status FROM sales_orders WHERE id = ?").get(orderId) as { status: string };
      expect(order.status).toBe("draft");
    });

    it("rejects processing a sales order that does not exist (failure path)", async () => {
      const app = createApp(db);

      const res = await request(app).post("/sales-orders/does-not-exist/process");

      expect(res.status).toBe(404);
    });

    it("rejects a duplicate order number without creating a second row (failure path)", async () => {
      const app = createApp(db);
      await createOrder(app, "SO-DUP");

      const res = await request(app).post("/sales-orders").send({
        order_number: "SO-DUP",
        customer_id: customerId,
        lines: [{ inventory_item_id: itemId, quantity: 1, unit_price: 15 }],
      });

      expect(res.status).toBe(409);
      const count = db.prepare("SELECT COUNT(*) c FROM sales_orders").get() as { c: number };
      expect(count.c).toBe(1);
    });

    it("is idempotent: processing an already-processed order does not touch inventory again", async () => {
      const app = createApp(db);
      const orderId = await createOrder(app);

      await request(app).post(`/sales-orders/${orderId}/process`);
      await request(app).post(`/sales-orders/${orderId}/process`);

      const item = db.prepare("SELECT quantity_on_hand FROM inventory_items WHERE id = ?").get(itemId) as {
        quantity_on_hand: number;
      };
      expect(item.quantity_on_hand).toBe(7);
    });

    it("logs order creation and processing to the audit trail (Trust criterion)", async () => {
      const app = createApp(db);
      const orderId = await createOrder(app);
      await request(app).post(`/sales-orders/${orderId}/process`);

      const events = db
        .prepare("SELECT action FROM audit_log WHERE entity_type = 'sales_order' AND entity_id = ?")
        .all(orderId) as { action: string }[];
      const actions = events.map((e) => e.action);
      expect(actions).toContain("sales_order_created");
      expect(actions).toContain("sales_order_processed");
    });
  });

  describe("POST /purchase-orders/:id/process", () => {
    it("receives stock into inventory (happy path)", async () => {
      const app = createApp(db);
      const created = await request(app).post("/purchase-orders").send({
        order_number: "PO-001",
        vendor_id: vendorId,
        lines: [{ inventory_item_id: itemId, quantity: 20, unit_cost: 8 }],
      });

      const res = await request(app).post(`/purchase-orders/${created.body.id}/process`);

      expect(res.status).toBe(200);
      const item = db.prepare("SELECT quantity_on_hand FROM inventory_items WHERE id = ?").get(itemId) as {
        quantity_on_hand: number;
      };
      expect(item.quantity_on_hand).toBe(30);
    });
  });
});
