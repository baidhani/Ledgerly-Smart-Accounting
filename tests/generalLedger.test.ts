import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import type Database from "better-sqlite3";
import { createApp } from "../src/app";
import { openDb } from "../src/db";

describe("POST /journal-entries/:id/post", () => {
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

  async function createDraftEntry(app: ReturnType<typeof createApp>) {
    const res = await request(app).post("/journal-entries").send({
      entry_date: "2026-09-08",
      memo: "cash sale",
      lines: [
        { account_id: cashId, debit: 100 },
        { account_id: revenueId, credit: 100 },
      ],
    });
    return res.body.id as string;
  }

  it("updates the general ledger on a valid transaction (happy path)", async () => {
    const app = createApp(db);
    const entryId = await createDraftEntry(app);

    const res = await request(app).post(`/journal-entries/${entryId}/post`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("posted");
    expect(res.body.ledger_lines).toHaveLength(2);

    const storedStatus = db.prepare("SELECT status FROM journal_entries WHERE id = ?").get(entryId) as {
      status: string;
    };
    expect(storedStatus.status).toBe("posted");

    const ledgerRows = db.prepare("SELECT COUNT(*) c FROM general_ledger").get() as { c: number };
    expect(ledgerRows.c).toBe(2);

    const audit = db.prepare("SELECT * FROM audit_log WHERE action = 'transaction_posted'").get() as
      | { entity_id: string }
      | undefined;
    expect(audit).toBeTruthy();
    expect(audit?.entity_id).toBe(entryId);
  });

  it("is idempotent: posting the same entry twice does not double-post (guardrail)", async () => {
    const app = createApp(db);
    const entryId = await createDraftEntry(app);

    const first = await request(app).post(`/journal-entries/${entryId}/post`);
    const second = await request(app).post(`/journal-entries/${entryId}/post`);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);

    const ledgerRows = db.prepare("SELECT COUNT(*) c FROM general_ledger").get() as { c: number };
    expect(ledgerRows.c).toBe(2);

    const auditCount = db.prepare("SELECT COUNT(*) c FROM audit_log WHERE action = 'transaction_posted'").get() as {
      c: number;
    };
    expect(auditCount.c).toBe(1);
  });

  it("rejects posting a transaction that does not exist (failure path: invalid transaction)", async () => {
    const app = createApp(db);

    const res = await request(app).post("/journal-entries/does-not-exist/post");

    expect(res.status).toBe(404);
    expect(res.body.error).toBeTruthy();
  });

  it("rejects an unbalanced posting without writing to the ledger (failure path)", async () => {
    const app = createApp(db);

    // Simulate an entry that became unbalanced after creation (e.g. imported some
    // other way) — bypasses createJournalEntry's own validation on purpose, to
    // exercise postJournalEntry's independent re-check at posting time.
    db.prepare(
      "INSERT INTO journal_entries (id, entry_date, memo, status, created_at) VALUES ('bad1','2026-09-08',NULL,'draft','now')"
    ).run();
    db.prepare(
      "INSERT INTO journal_lines (id, journal_entry_id, account_id, debit_cents, credit_cents) VALUES ('bl1','bad1','cash',10000,0)"
    ).run();
    db.prepare(
      "INSERT INTO journal_lines (id, journal_entry_id, account_id, debit_cents, credit_cents) VALUES ('bl2','bad1','rev',0,5000)"
    ).run();

    const res = await request(app).post("/journal-entries/bad1/post");

    expect(res.status).toBe(400);
    expect(res.body.reasons.join(" ")).toMatch(/unbalanced/);

    const ledgerRows = db.prepare("SELECT COUNT(*) c FROM general_ledger").get() as { c: number };
    expect(ledgerRows.c).toBe(0);

    const status = db.prepare("SELECT status FROM journal_entries WHERE id = 'bad1'").get() as { status: string };
    expect(status.status).toBe("draft");
  });

  it("returns a 500 without leaking internals when the database fails during posting (failure path)", async () => {
    const app = createApp(db);
    const entryId = await createDraftEntry(app);
    db.close(); // force the post to throw

    const res = await request(app).post(`/journal-entries/${entryId}/post`);

    expect(res.status).toBe(500);
    expect(res.body.error).toBeTruthy();
    expect(JSON.stringify(res.body)).not.toMatch(/SqliteError|node_modules|at Object/);
  });
});
