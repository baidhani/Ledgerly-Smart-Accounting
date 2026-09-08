import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import type Database from "better-sqlite3";
import { createApp } from "../src/app";
import { openDb } from "../src/db";

describe("POST /accounts", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openDb(":memory:");
  });

  afterEach(() => {
    if (db.open) db.close();
  });

  it("adds the account on valid details (happy path)", async () => {
    const app = createApp(db);

    const res = await request(app).post("/accounts").send({
      code: "1000",
      name: "Cash",
      type: "asset",
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ code: "1000", name: "Cash", type: "asset", is_active: true });
    expect(res.body.id).toBeTruthy();

    const stored = db.prepare("SELECT * FROM accounts WHERE id = ?").get(res.body.id);
    expect(stored).toBeTruthy();

    const audit = db.prepare("SELECT * FROM audit_log WHERE entity_id = ?").get(res.body.id) as
      | { action: string }
      | undefined;
    expect(audit).toBeTruthy();
    expect(audit?.action).toBe("account_created");
  });

  it("rejects the request on invalid details (failure path)", async () => {
    const app = createApp(db);

    const res = await request(app).post("/accounts").send({
      code: "2000",
      name: "Bad Type",
      type: "not-a-real-type",
    });

    expect(res.status).toBe(400);
    expect(res.body.invalid_fields.length).toBeGreaterThan(0);

    const count = db.prepare("SELECT COUNT(*) c FROM accounts").get() as { c: number };
    expect(count.c).toBe(0);
  });

  it("rejects an incomplete request naming the missing fields (failure path)", async () => {
    const app = createApp(db);

    const res = await request(app).post("/accounts").send({ name: "Only a name" });

    expect(res.status).toBe(400);
    expect(res.body.missing_fields).toEqual(expect.arrayContaining(["code", "type"]));
  });

  it("rejects a duplicate account code without creating a second row (failure path)", async () => {
    const app = createApp(db);

    const first = await request(app).post("/accounts").send({ code: "1000", name: "Cash", type: "asset" });
    expect(first.status).toBe(201);

    const dup = await request(app).post("/accounts").send({ code: "1000", name: "Cash Again", type: "asset" });

    expect(dup.status).toBe(409);
    expect(dup.body.error).toMatch(/already exists/);

    const count = db.prepare("SELECT COUNT(*) c FROM accounts").get() as { c: number };
    expect(count.c).toBe(1);
  });

  it("returns a 500 without leaking internals when the database save fails (failure path)", async () => {
    const app = createApp(db);
    db.close(); // force the insert to throw

    const res = await request(app).post("/accounts").send({ code: "1000", name: "Cash", type: "asset" });

    expect(res.status).toBe(500);
    expect(res.body.error).toBeTruthy();
    expect(JSON.stringify(res.body)).not.toMatch(/SqliteError|node_modules|at Object/);
  });

  it("returns a 500 without leaking internals when the database fails during validation (failure path)", async () => {
    // validateAccountInput queries the DB to check parent_account_id, so a DB
    // failure can surface during validation, before createAccount ever runs.
    const app = createApp(db);
    db.close();

    const res = await request(app)
      .post("/accounts")
      .send({ code: "1000", name: "Cash", type: "asset", parent_account_id: "some-id" });

    expect(res.status).toBe(500);
    expect(res.body.error).toBeTruthy();
    expect(JSON.stringify(res.body)).not.toMatch(/SqliteError|node_modules|at Object/);
  });
});
