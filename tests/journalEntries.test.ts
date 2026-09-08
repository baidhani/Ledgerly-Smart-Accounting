import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import type Database from "better-sqlite3";
import { createApp } from "../src/app";
import { openDb } from "../src/db";

describe("POST /journal-entries", () => {
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

  it("records the entry on valid, balanced debit and credit amounts (happy path)", async () => {
    const app = createApp(db);

    const res = await request(app).post("/journal-entries").send({
      entry_date: "2026-09-08",
      memo: "cash sale",
      lines: [
        { account_id: cashId, debit: 250.75 },
        { account_id: revenueId, credit: 250.75 },
      ],
    });

    expect(res.status).toBe(201);
    expect(res.body.lines).toHaveLength(2);
    expect(res.body.lines[0].debit_cents).toBe(25075);
    expect(res.body.lines[1].credit_cents).toBe(25075);

    const storedEntry = db.prepare("SELECT * FROM journal_entries WHERE id = ?").get(res.body.id);
    expect(storedEntry).toBeTruthy();

    const storedLines = db.prepare("SELECT * FROM journal_lines WHERE journal_entry_id = ?").all(res.body.id);
    expect(storedLines).toHaveLength(2);

    const audit = db.prepare("SELECT * FROM audit_log WHERE entity_id = ?").get(res.body.id) as
      | { action: string }
      | undefined;
    expect(audit).toBeTruthy();
    expect(audit?.action).toBe("journal_entry_created");
  });

  it("rejects an unbalanced entry without saving anything (failure path)", async () => {
    const app = createApp(db);

    const res = await request(app).post("/journal-entries").send({
      entry_date: "2026-09-08",
      lines: [
        { account_id: cashId, debit: 100 },
        { account_id: revenueId, credit: 50 },
      ],
    });

    expect(res.status).toBe(400);
    expect(res.body.invalid_fields.join(" ")).toMatch(/unbalanced/);

    const count = db.prepare("SELECT COUNT(*) c FROM journal_entries").get() as { c: number };
    expect(count.c).toBe(0);
  });

  it("rejects a line referencing a nonexistent account (failure path)", async () => {
    const app = createApp(db);

    const res = await request(app).post("/journal-entries").send({
      entry_date: "2026-09-08",
      lines: [
        { account_id: "does-not-exist", debit: 100 },
        { account_id: revenueId, credit: 100 },
      ],
    });

    expect(res.status).toBe(400);
    expect(res.body.invalid_fields.join(" ")).toMatch(/no account with that id exists/);

    const count = db.prepare("SELECT COUNT(*) c FROM journal_entries").get() as { c: number };
    expect(count.c).toBe(0);
  });

  it("returns a 500 without leaking internals when the database save fails (failure path)", async () => {
    const app = createApp(db);
    db.close(); // force the insert to throw

    const res = await request(app).post("/journal-entries").send({
      entry_date: "2026-09-08",
      lines: [
        { account_id: cashId, debit: 100 },
        { account_id: revenueId, credit: 100 },
      ],
    });

    expect(res.status).toBe(500);
    expect(res.body.error).toBeTruthy();
    expect(JSON.stringify(res.body)).not.toMatch(/SqliteError|node_modules|at Object/);
  });
});
