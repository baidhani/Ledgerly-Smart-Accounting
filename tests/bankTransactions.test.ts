import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import type Database from "better-sqlite3";
import { createApp } from "../src/app";
import { openDb } from "../src/db";

describe("Cash and bank transactions", () => {
  let db: Database.Database;
  let cashAccountId: string;
  let revenueAccountId: string;
  let expenseAccountId: string;

  beforeEach(() => {
    db = openDb(":memory:");
    const now = new Date().toISOString();
    db.prepare(
      "INSERT INTO accounts (id, code, name, type, created_at, updated_at) VALUES ('cash1','1000','Cash','asset',@now,@now)"
    ).run({ now });
    db.prepare(
      "INSERT INTO accounts (id, code, name, type, created_at, updated_at) VALUES ('rev1','4000','Revenue','revenue',@now,@now)"
    ).run({ now });
    db.prepare(
      "INSERT INTO accounts (id, code, name, type, created_at, updated_at) VALUES ('exp1','5000','Office Expense','expense',@now,@now)"
    ).run({ now });
    cashAccountId = "cash1";
    revenueAccountId = "rev1";
    expenseAccountId = "exp1";
  });

  afterEach(() => {
    if (db.open) db.close();
  });

  async function createTransaction(
    app: ReturnType<typeof createApp>,
    reference: string,
    direction: "deposit" | "withdrawal",
    contraAccountId: string,
    amount = 250
  ) {
    const res = await request(app).post("/bank-transactions").send({
      reference,
      cash_account_id: cashAccountId,
      contra_account_id: contraAccountId,
      amount,
      direction,
      transaction_date: "2026-09-08",
    });
    return res.body.id as string;
  }

  it("reconciles a deposit, updating cash records via a real balanced journal entry (happy path)", async () => {
    const app = createApp(db);
    const txId = await createTransaction(app, "REF-001", "deposit", revenueAccountId);

    const res = await request(app).post(`/bank-transactions/${txId}/reconcile`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("reconciled");
    expect(res.body.journal_entry_id).toBeTruthy();

    const glRows = db
      .prepare("SELECT account_id, debit_cents, credit_cents FROM general_ledger WHERE journal_entry_id = ?")
      .all(res.body.journal_entry_id) as { account_id: string; debit_cents: number; credit_cents: number }[];
    const cashLine = glRows.find((r) => r.account_id === cashAccountId);
    const revLine = glRows.find((r) => r.account_id === revenueAccountId);
    expect(cashLine?.debit_cents).toBe(25000);
    expect(revLine?.credit_cents).toBe(25000);
  });

  it("reconciles a withdrawal in the opposite direction (happy path)", async () => {
    const app = createApp(db);
    const txId = await createTransaction(app, "REF-002", "withdrawal", expenseAccountId, 120);

    const res = await request(app).post(`/bank-transactions/${txId}/reconcile`);

    expect(res.status).toBe(200);
    const glRows = db
      .prepare("SELECT account_id, debit_cents, credit_cents FROM general_ledger WHERE journal_entry_id = ?")
      .all(res.body.journal_entry_id) as { account_id: string; debit_cents: number; credit_cents: number }[];
    const cashLine = glRows.find((r) => r.account_id === cashAccountId);
    const expLine = glRows.find((r) => r.account_id === expenseAccountId);
    expect(cashLine?.credit_cents).toBe(12000);
    expect(expLine?.debit_cents).toBe(12000);
  });

  it("alerts on a reconciliation error when the transaction does not exist (failure path)", async () => {
    const app = createApp(db);

    const res = await request(app).post("/bank-transactions/does-not-exist/reconcile");

    expect(res.status).toBe(404);
    expect(res.body.error).toBeTruthy();
  });

  it("rejects a duplicate reference without creating a second row (failure path)", async () => {
    const app = createApp(db);
    await createTransaction(app, "REF-DUP", "deposit", revenueAccountId);

    const res = await request(app).post("/bank-transactions").send({
      reference: "REF-DUP",
      cash_account_id: cashAccountId,
      contra_account_id: revenueAccountId,
      amount: 10,
      direction: "deposit",
      transaction_date: "2026-09-08",
    });

    expect(res.status).toBe(409);
    const count = db.prepare("SELECT COUNT(*) c FROM bank_transactions").get() as { c: number };
    expect(count.c).toBe(1);
  });

  it("is idempotent: reconciling an already-reconciled transaction does not post a second journal entry", async () => {
    const app = createApp(db);
    const txId = await createTransaction(app, "REF-003", "deposit", revenueAccountId);

    const first = await request(app).post(`/bank-transactions/${txId}/reconcile`);
    const second = await request(app).post(`/bank-transactions/${txId}/reconcile`);

    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);

    const glCount = (db.prepare("SELECT COUNT(*) c FROM general_ledger").get() as { c: number }).c;
    expect(glCount).toBe(2);
  });

  it("logs creation and reconciliation to the audit trail (Trust criterion)", async () => {
    const app = createApp(db);
    const txId = await createTransaction(app, "REF-004", "deposit", revenueAccountId);
    await request(app).post(`/bank-transactions/${txId}/reconcile`);

    const events = db
      .prepare("SELECT action FROM audit_log WHERE entity_type = 'bank_transaction' AND entity_id = ?")
      .all(txId) as { action: string }[];
    const actions = events.map((e) => e.action);
    expect(actions).toContain("bank_transaction_created");
    expect(actions).toContain("bank_transaction_reconciled");
  });
});
