import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import type Database from "better-sqlite3";
import { createApp } from "../src/app";
import { openDb } from "../src/db";

describe("GET /trial-balance", () => {
  let db: Database.Database;
  let cashId: string;
  let revenueId: string;

  beforeEach(() => {
    db = openDb(":memory:");
    const now = new Date().toISOString();
    db.prepare(
      "INSERT INTO accounts (id, code, name, type, created_at, updated_at) VALUES ('cash','1000','Cash','asset',@now,@now)"
    ).run({ now });
    db.prepare(
      "INSERT INTO accounts (id, code, name, type, created_at, updated_at) VALUES ('rev','4000','Revenue','revenue',@now,@now)"
    ).run({ now });
    cashId = "cash";
    revenueId = "rev";
  });

  afterEach(() => {
    if (db.open) db.close();
  });

  it("displays the balance from posted transactions (happy path)", async () => {
    const app = createApp(db);

    const created = await request(app).post("/journal-entries").send({
      entry_date: "2026-09-08",
      lines: [
        { account_id: cashId, debit: 150 },
        { account_id: revenueId, credit: 150 },
      ],
    });
    await request(app).post(`/journal-entries/${created.body.id}/post`);

    const res = await request(app).get("/trial-balance");

    expect(res.status).toBe(200);
    expect(res.body.accounts).toHaveLength(2);
    expect(res.body.totals).toEqual({ debit_cents: 15000, credit_cents: 15000 });
    expect(res.body.totals.debit_cents).toBe(res.body.totals.credit_cents);

    const audit = db.prepare("SELECT * FROM audit_log WHERE action = 'trial_balance_generated'").get() as
      | { entity_type: string }
      | undefined;
    expect(audit).toBeTruthy();
    expect(audit?.entity_type).toBe("trial_balance");
  });

  it("shows a zero balance when there are no transactions (acceptance criterion)", async () => {
    const app = createApp(db);

    const res = await request(app).get("/trial-balance");

    expect(res.status).toBe(200);
    expect(res.body.accounts).toEqual([]);
    expect(res.body.totals).toEqual({ debit_cents: 0, credit_cents: 0 });

    const audit = db.prepare("SELECT COUNT(*) c FROM audit_log WHERE action = 'trial_balance_generated'").get() as {
      c: number;
    };
    expect(audit.c).toBe(1);
  });

  it("does not include draft (unposted) entries in the balance", async () => {
    const app = createApp(db);

    await request(app).post("/journal-entries").send({
      entry_date: "2026-09-08",
      lines: [
        { account_id: cashId, debit: 500 },
        { account_id: revenueId, credit: 500 },
      ],
    });
    // Deliberately not posted.

    const res = await request(app).get("/trial-balance");

    expect(res.status).toBe(200);
    expect(res.body.accounts).toEqual([]);
    expect(res.body.totals).toEqual({ debit_cents: 0, credit_cents: 0 });
  });

  it("returns a 500 without leaking internals on a calculation/database error (failure path)", async () => {
    const app = createApp(db);
    db.close(); // force the aggregation query to throw

    const res = await request(app).get("/trial-balance");

    expect(res.status).toBe(500);
    expect(res.body.error).toBeTruthy();
    expect(JSON.stringify(res.body)).not.toMatch(/SqliteError|node_modules|at Object/);
  });
});
