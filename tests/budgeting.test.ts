import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import type Database from "better-sqlite3";
import { createApp } from "../src/app";
import { openDb } from "../src/db";

describe("Budgeting and cost centers", () => {
  let db: Database.Database;
  let accountId: string;

  beforeEach(() => {
    db = openDb(":memory:");
    const now = new Date().toISOString();
    db.prepare(
      "INSERT INTO accounts (id, code, name, type, is_active, created_at, updated_at) VALUES ('acc1','6000','Payroll Expense','expense',1,@now,@now)"
    ).run({ now });
    accountId = "acc1";
  });

  afterEach(() => {
    if (db.open) db.close();
  });

  describe("POST /cost-centers", () => {
    it("creates a cost center (happy path)", async () => {
      const app = createApp(db);

      const res = await request(app).post("/cost-centers").send({ code: "ENG", name: "Engineering" });

      expect(res.status).toBe(201);
      expect(res.body.code).toBe("ENG");

      const row = db.prepare("SELECT * FROM cost_centers WHERE code = 'ENG'").get();
      expect(row).toBeDefined();
    });

    it("rejects a duplicate cost center code without creating a second row (failure path)", async () => {
      const app = createApp(db);
      await request(app).post("/cost-centers").send({ code: "ENG", name: "Engineering" });

      const res = await request(app).post("/cost-centers").send({ code: "ENG", name: "Duplicate" });

      expect(res.status).toBe(409);
      const count = db.prepare("SELECT COUNT(*) c FROM cost_centers").get() as { c: number };
      expect(count.c).toBe(1);
    });

    it("rejects an incomplete cost center (boundary case)", async () => {
      const app = createApp(db);

      const res = await request(app).post("/cost-centers").send({});

      expect(res.status).toBe(400);
      expect(res.body.missing_fields).toEqual(expect.arrayContaining(["code", "name"]));
    });
  });

  describe("POST /budgets", () => {
    async function createCostCenter(app: ReturnType<typeof createApp>, code = "ENG") {
      const res = await request(app).post("/cost-centers").send({ code, name: "Engineering" });
      return res.body.id as string;
    }

    it("saves a valid budget allocation (happy path)", async () => {
      const app = createApp(db);
      const costCenterId = await createCostCenter(app);

      const res = await request(app)
        .post("/budgets")
        .send({ cost_center_id: costCenterId, account_id: accountId, period: "2026-Q4", amount_cents: 500000 });

      expect(res.status).toBe(201);
      expect(res.body.amount_cents).toBe(500000);

      const row = db.prepare("SELECT * FROM budgets WHERE id = ?").get(res.body.id);
      expect(row).toBeDefined();
    });

    it("rejects a budget allocation with a non-positive amount, saving nothing (failure path)", async () => {
      const app = createApp(db);
      const costCenterId = await createCostCenter(app);

      const res = await request(app)
        .post("/budgets")
        .send({ cost_center_id: costCenterId, account_id: accountId, period: "2026-Q1", amount_cents: 0 });

      expect(res.status).toBe(400);
      expect(res.body.invalid_fields.join(" ")).toMatch(/greater than zero/);

      const count = db.prepare("SELECT COUNT(*) c FROM budgets").get() as { c: number };
      expect(count.c).toBe(0);
    });

    it("rejects a budget allocation referencing a cost center that does not exist (failure path)", async () => {
      const app = createApp(db);

      const res = await request(app)
        .post("/budgets")
        .send({ cost_center_id: "does-not-exist", account_id: accountId, period: "2026-Q1", amount_cents: 100 });

      expect(res.status).toBe(400);
      expect(res.body.invalid_fields.join(" ")).toMatch(/no cost center/);
    });

    it("rejects a budget allocation referencing an account that does not exist (failure path)", async () => {
      const app = createApp(db);
      const costCenterId = await createCostCenter(app);

      const res = await request(app)
        .post("/budgets")
        .send({ cost_center_id: costCenterId, account_id: "does-not-exist", period: "2026-Q1", amount_cents: 100 });

      expect(res.status).toBe(400);
      expect(res.body.invalid_fields.join(" ")).toMatch(/no account/);
    });

    it("rejects an incomplete budget allocation (boundary case)", async () => {
      const app = createApp(db);

      const res = await request(app).post("/budgets").send({});

      expect(res.status).toBe(400);
      expect(res.body.missing_fields).toEqual(
        expect.arrayContaining(["cost_center_id", "account_id", "period", "amount_cents"])
      );
    });

    it("rejects a duplicate allocation for the same cost center, account, and period (idempotency/failure path)", async () => {
      const app = createApp(db);
      const costCenterId = await createCostCenter(app);
      await request(app)
        .post("/budgets")
        .send({ cost_center_id: costCenterId, account_id: accountId, period: "2026-Q4", amount_cents: 500000 });

      const res = await request(app)
        .post("/budgets")
        .send({ cost_center_id: costCenterId, account_id: accountId, period: "2026-Q4", amount_cents: 100 });

      expect(res.status).toBe(409);
      const count = db.prepare("SELECT COUNT(*) c FROM budgets").get() as { c: number };
      expect(count.c).toBe(1);
    });

    it("logs cost center and budget changes to the audit trail (Trust criterion)", async () => {
      const app = createApp(db);
      const costCenterId = await request(app)
        .post("/cost-centers")
        .set("X-User-Id", "alice")
        .send({ code: "ENG", name: "Engineering" })
        .then((r) => r.body.id as string);
      await request(app)
        .post("/budgets")
        .set("X-User-Id", "alice")
        .send({ cost_center_id: costCenterId, account_id: accountId, period: "2026-Q4", amount_cents: 500000 });

      const events = db
        .prepare("SELECT action, user_id FROM audit_log WHERE action IN ('cost_center_created', 'budget_created')")
        .all() as { action: string; user_id: string }[];

      const actions = events.map((e) => e.action);
      expect(actions).toContain("cost_center_created");
      expect(actions).toContain("budget_created");
      expect(events.every((e) => e.user_id === "alice")).toBe(true);
    });
  });
});
