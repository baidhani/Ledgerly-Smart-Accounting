import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import type Database from "better-sqlite3";
import { createApp } from "../src/app";
import { openDb } from "../src/db";

describe("GET /financial-statements", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openDb(":memory:");
  });

  afterEach(() => {
    if (db.open) db.close();
  });

  it("alerts to missing information when no company profile exists (failure path)", async () => {
    const app = createApp(db);

    const res = await request(app).get("/financial-statements");

    expect(res.status).toBe(400);
    expect(res.body.reasons).toEqual(expect.arrayContaining(["no company profile has been created yet"]));
  });

  it("alerts to missing information when a company exists but the chart of accounts is empty (failure path)", async () => {
    const app = createApp(db);
    await request(app).post("/companies").send({
      name: "Acme",
      legal_entity_type: "LLC",
      fiscal_year_start: "2026-01-01",
      base_currency: "USD",
    });

    const res = await request(app).get("/financial-statements");

    expect(res.status).toBe(400);
    expect(res.body.reasons).toEqual(expect.arrayContaining(["the chart of accounts is empty"]));
  });

  it("produces a valid, balanced, all-zero statement when accounts exist but nothing has been posted", async () => {
    const app = createApp(db);
    await request(app).post("/companies").send({
      name: "Acme",
      legal_entity_type: "LLC",
      fiscal_year_start: "2026-01-01",
      base_currency: "USD",
    });
    await request(app).post("/accounts").send({ code: "1000", name: "Cash", type: "asset" });

    const res = await request(app).get("/financial-statements");

    expect(res.status).toBe(200);
    expect(res.body.income_statement.net_income_cents).toBe(0);
    expect(res.body.balance_sheet.total_assets_cents).toBe(0);
    expect(res.body.balance_sheet.balanced).toBe(true);
  });

  it("produces an income statement and a balance sheet that actually balances (happy path)", async () => {
    const app = createApp(db);
    await request(app).post("/companies").send({
      name: "Acme",
      legal_entity_type: "LLC",
      fiscal_year_start: "2026-01-01",
      base_currency: "USD",
    });
    const cash = (await request(app).post("/accounts").send({ code: "1000", name: "Cash", type: "asset" })).body;
    const capital = (
      await request(app).post("/accounts").send({ code: "3000", name: "Owners Capital", type: "equity" })
    ).body;
    const revenue = (await request(app).post("/accounts").send({ code: "4000", name: "Revenue", type: "revenue" }))
      .body;
    const expense = (
      await request(app).post("/accounts").send({ code: "5000", name: "Rent Expense", type: "expense" })
    ).body;

    const invest = (
      await request(app)
        .post("/journal-entries")
        .send({ entry_date: "2026-09-08", lines: [{ account_id: cash.id, debit: 1000 }, { account_id: capital.id, credit: 1000 }] })
    ).body;
    await request(app).post(`/journal-entries/${invest.id}/post`);

    const sale = (
      await request(app)
        .post("/journal-entries")
        .send({ entry_date: "2026-09-08", lines: [{ account_id: cash.id, debit: 500 }, { account_id: revenue.id, credit: 500 }] })
    ).body;
    await request(app).post(`/journal-entries/${sale.id}/post`);

    const rent = (
      await request(app)
        .post("/journal-entries")
        .send({ entry_date: "2026-09-08", lines: [{ account_id: expense.id, debit: 200 }, { account_id: cash.id, credit: 200 }] })
    ).body;
    await request(app).post(`/journal-entries/${rent.id}/post`);

    const res = await request(app).get("/financial-statements");

    expect(res.status).toBe(200);
    expect(res.body.income_statement.total_revenue_cents).toBe(50000);
    expect(res.body.income_statement.total_expenses_cents).toBe(20000);
    expect(res.body.income_statement.net_income_cents).toBe(30000);

    const bs = res.body.balance_sheet;
    expect(bs.total_assets_cents).toBe(130000);
    expect(bs.balanced).toBe(true);
    expect(bs.total_assets_cents).toBe(bs.total_liabilities_cents + bs.total_equity_cents);

    const audit = db.prepare("SELECT * FROM audit_log WHERE action = 'financial_statements_generated'").get() as
      | { entity_type: string }
      | undefined;
    expect(audit).toBeTruthy();
    expect(audit?.entity_type).toBe("financial_statements");
  });

  it("returns a 500 without leaking internals on a database error (failure path)", async () => {
    const app = createApp(db);
    await request(app).post("/companies").send({
      name: "Acme",
      legal_entity_type: "LLC",
      fiscal_year_start: "2026-01-01",
      base_currency: "USD",
    });
    await request(app).post("/accounts").send({ code: "1000", name: "Cash", type: "asset" });
    db.close(); // force the aggregation query to throw

    const res = await request(app).get("/financial-statements");

    expect(res.status).toBe(500);
    expect(res.body.error).toBeTruthy();
    expect(JSON.stringify(res.body)).not.toMatch(/SqliteError|node_modules|at Object/);
  });
});
