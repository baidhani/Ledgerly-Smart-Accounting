import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import type Database from "better-sqlite3";
import { createApp } from "../src/app";
import { openDb } from "../src/db";

describe("POST /financial-insights", () => {
  let db: Database.Database;
  let cashAccountId: string;
  let revenueAccountId: string;

  beforeEach(() => {
    db = openDb(":memory:");
    const now = new Date().toISOString();
    db.prepare(
      "INSERT INTO accounts (id, code, name, type, is_active, created_at, updated_at) VALUES ('cash1','1000','Cash','asset',1,@now,@now)"
    ).run({ now });
    db.prepare(
      "INSERT INTO accounts (id, code, name, type, is_active, created_at, updated_at) VALUES ('rev1','4000','Sales Revenue','revenue',1,@now,@now)"
    ).run({ now });
    db.prepare(
      "INSERT INTO journal_entries (id, entry_date, memo, status, posted_at, created_at) VALUES ('je1','2026-09-08','sale','posted',@now,@now)"
    ).run({ now });
    db.prepare(
      "INSERT INTO journal_lines (id, journal_entry_id, account_id, debit_cents, credit_cents) VALUES ('jl1','je1','cash1',10000,0)"
    ).run();
    db.prepare(
      "INSERT INTO journal_lines (id, journal_entry_id, account_id, debit_cents, credit_cents) VALUES ('jl2','je1','rev1',0,10000)"
    ).run();
    db.prepare(
      "INSERT INTO general_ledger (id, journal_entry_id, journal_line_id, account_id, debit_cents, credit_cents, posted_at) VALUES ('gl1','je1','jl1','cash1',10000,0,@now)"
    ).run({ now });
    db.prepare(
      "INSERT INTO general_ledger (id, journal_entry_id, journal_line_id, account_id, debit_cents, credit_cents, posted_at) VALUES ('gl2','je1','jl2','rev1',0,10000,@now)"
    ).run({ now });
    cashAccountId = "cash1";
    revenueAccountId = "rev1";
  });

  afterEach(() => {
    if (db.open) db.close();
  });

  it("provides asset_position_summary insights from real posted data (happy path)", async () => {
    const app = createApp(db);

    const res = await request(app).post("/financial-insights").send({ query: "asset_position_summary" });

    expect(res.status).toBe(200);
    expect(res.body.query).toBe("asset_position_summary");
    expect((res.body.data as { net_asset_cents: number }).net_asset_cents).toBe(10000);
  });

  it("provides unbalanced_risk insights confirming the guardrail holds (happy path)", async () => {
    const app = createApp(db);

    const res = await request(app).post("/financial-insights").send({ query: "unbalanced_risk" });

    expect(res.status).toBe(200);
    expect((res.body.data as { unbalanced_entries: unknown[] }).unbalanced_entries).toEqual([]);
  });

  it("provides budget_variance_flags insights (happy path)", async () => {
    const app = createApp(db);
    const cc = await request(app).post("/cost-centers").send({ code: "ENG", name: "Engineering" });
    await request(app)
      .post("/budgets")
      .send({ cost_center_id: cc.body.id, account_id: revenueAccountId, period: "2026-Q4", amount_cents: 500000 });

    const res = await request(app).post("/financial-insights").send({ query: "budget_variance_flags" });

    expect(res.status).toBe(200);
    expect((res.body.data as { budgets_by_size: unknown[] }).budgets_by_size).toHaveLength(1);
  });

  it("rejects an unrecognized query, alerting with a clear error (AI analysis error failure path)", async () => {
    const app = createApp(db);

    const res = await request(app).post("/financial-insights").send({ query: "predict_the_stock_market" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Unrecognized financial query/);
  });

  it("rejects a request with no query (boundary case)", async () => {
    const app = createApp(db);

    const res = await request(app).post("/financial-insights").send({});

    expect(res.status).toBe(400);
  });

  it("never alters accounting records as a side effect of any insights request (compliance guardrail)", async () => {
    const app = createApp(db);
    const before = {
      accounts: (db.prepare("SELECT COUNT(*) c FROM accounts").get() as { c: number }).c,
      journalEntries: (db.prepare("SELECT COUNT(*) c FROM journal_entries").get() as { c: number }).c,
      generalLedger: (db.prepare("SELECT COUNT(*) c FROM general_ledger").get() as { c: number }).c,
    };

    await request(app).post("/financial-insights").send({ query: "asset_position_summary" });
    await request(app).post("/financial-insights").send({ query: "unbalanced_risk" });
    await request(app).post("/financial-insights").send({ query: "budget_variance_flags" });
    await request(app).post("/financial-insights").send({ query: "not_a_real_query" });

    const after = {
      accounts: (db.prepare("SELECT COUNT(*) c FROM accounts").get() as { c: number }).c,
      journalEntries: (db.prepare("SELECT COUNT(*) c FROM journal_entries").get() as { c: number }).c,
      generalLedger: (db.prepare("SELECT COUNT(*) c FROM general_ledger").get() as { c: number }).c,
    };

    expect(after).toEqual(before);
  });

  it("logs every AI analysis request to the audit trail, success and failure alike (Trust criterion)", async () => {
    const app = createApp(db);

    await request(app).post("/financial-insights").set("X-User-Id", "alice").send({ query: "asset_position_summary" });
    await request(app).post("/financial-insights").set("X-User-Id", "alice").send({ query: "bogus_query" });

    const events = db
      .prepare("SELECT action, user_id, details FROM audit_log WHERE action = 'ai_analysis_requested'")
      .all() as { action: string; user_id: string; details: string }[];

    expect(events).toHaveLength(2);
    expect(events.every((e) => e.user_id === "alice")).toBe(true);
    const outcomes = events.map((e) => JSON.parse(e.details).outcome);
    expect(outcomes).toContain("success");
    expect(outcomes).toContain("failure");
  });
});
