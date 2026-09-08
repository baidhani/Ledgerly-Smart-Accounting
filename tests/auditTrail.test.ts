import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import type Database from "better-sqlite3";
import { createApp } from "../src/app";
import { openDb } from "../src/db";

describe("GET /audit-log", () => {
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

  it("displays a posted transaction's details and status (happy path)", async () => {
    const app = createApp(db);

    const created = await request(app)
      .post("/journal-entries")
      .set("X-User-Id", "alice")
      .send({ entry_date: "2026-09-08", lines: [{ account_id: cashId, debit: 100 }, { account_id: revenueId, credit: 100 }] });
    await request(app).post(`/journal-entries/${created.body.id}/post`).set("X-User-Id", "alice");

    const res = await request(app).get(`/audit-log?entity_id=${created.body.id}`);

    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(2);
    const posted = res.body.entries.find((e: { action: string }) => e.action === "transaction_posted");
    expect(posted.status).toBe("success");
    expect(posted.user_id).toBe("alice");
    expect(posted.details).toEqual({ line_count: 2 });
  });

  it("displays a failed transaction attempt's details and failure reason (failure path)", async () => {
    const app = createApp(db);

    await request(app).post("/journal-entries/does-not-exist/post").set("X-User-Id", "bob");

    const res = await request(app).get("/audit-log?entity_id=does-not-exist");

    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].status).toBe("failure");
    expect(res.body.entries[0].user_id).toBe("bob");
    expect(res.body.entries[0].details.reasons.join(" ")).toMatch(/no journal entry/);
  });

  it("records every transaction attempt with a timestamp and user id, defaulting to 'system' with no header (Trust criterion)", async () => {
    const app = createApp(db);

    await request(app).post("/journal-entries").send({
      entry_date: "2026-09-08",
      lines: [{ account_id: cashId, debit: 50 }, { account_id: revenueId, credit: 50 }],
    }); // no X-User-Id header

    const res = await request(app).get("/audit-log");

    expect(res.status).toBe(200);
    const entry = res.body.entries.find((e: { action: string }) => e.action === "journal_entry_created");
    expect(entry.user_id).toBe("system");
    expect(entry.occurred_at).toBeTruthy();
    expect(new Date(entry.occurred_at).toString()).not.toBe("Invalid Date");
  });

  it("returns null details for a row with missing or malformed details instead of crashing (failure path)", async () => {
    const app = createApp(db);

    // Simulate a legacy or corrupted row — malformed JSON in details.
    db.prepare(
      "INSERT INTO audit_log (id, entity_type, entity_id, action, occurred_at, user_id, details) VALUES ('a1','journal_entry','bad-entity','transaction_posted','2026-09-08T00:00:00.000Z','alice','{not valid json')"
    ).run();
    // Simulate a row with no details at all.
    db.prepare(
      "INSERT INTO audit_log (id, entity_type, entity_id, action, occurred_at, user_id, details) VALUES ('a2','journal_entry','bad-entity','transaction_posted','2026-09-08T00:00:01.000Z',NULL,NULL)"
    ).run();

    const res = await request(app).get("/audit-log?entity_id=bad-entity");

    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(2);
    expect(res.body.entries.every((e: { details: unknown }) => e.details === null)).toBe(true);
  });
});
