import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import type Database from "better-sqlite3";
import { createApp } from "../src/app";
import { openDb } from "../src/db";

describe("Data import/export", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openDb(":memory:");
  });

  afterEach(() => {
    if (db.open) db.close();
  });

  describe("POST /accounts/import", () => {
    it("imports a valid CSV file (happy path)", async () => {
      const app = createApp(db);
      const csv = "code,name,type,parent_account_id\n1000,Cash,asset,\n4000,Sales Revenue,revenue,\n";

      const res = await request(app).post("/accounts/import").set("Content-Type", "text/csv").send(csv);

      expect(res.status).toBe(201);
      expect(res.body.imported_count).toBe(2);

      const count = db.prepare("SELECT COUNT(*) c FROM accounts").get() as { c: number };
      expect(count.c).toBe(2);
    });

    it("rejects a file missing a required column, alerting with a clear error (invalid file failure path)", async () => {
      const app = createApp(db);
      const csv = "code,name\n1000,Cash\n";

      const res = await request(app).post("/accounts/import").set("Content-Type", "text/csv").send(csv);

      expect(res.status).toBe(400);
      expect(res.body.errors[0].invalid.join(" ")).toMatch(/missing required column/);
      const count = db.prepare("SELECT COUNT(*) c FROM accounts").get() as { c: number };
      expect(count.c).toBe(0);
    });

    it("rejects a row with an invalid account type (data integrity failure path)", async () => {
      const app = createApp(db);
      const csv = "code,name,type\n9999,Weird,not_a_real_type\n";

      const res = await request(app).post("/accounts/import").set("Content-Type", "text/csv").send(csv);

      expect(res.status).toBe(400);
      expect(res.body.errors[0].invalid.join(" ")).toMatch(/expected one of/);
    });

    it("rejects an empty file (boundary case)", async () => {
      const app = createApp(db);

      const res = await request(app).post("/accounts/import").set("Content-Type", "text/csv").send("");

      expect(res.status).toBe(400);
      expect(res.body.errors[0].invalid.join(" ")).toMatch(/empty/);
    });

    it("is atomic: a file with one row duplicating an existing account imports nothing (data consistency guardrail)", async () => {
      const app = createApp(db);
      await request(app).post("/accounts/import").set("Content-Type", "text/csv").send("code,name,type\n1000,Cash,asset\n");

      const csv = "code,name,type\n6000,Good Account,expense\n1000,Duplicate,asset\n";
      const res = await request(app).post("/accounts/import").set("Content-Type", "text/csv").send(csv);

      expect(res.status).toBe(400);
      expect(res.body.errors[0].invalid.join(" ")).toMatch(/already exists/);

      const count = db.prepare("SELECT COUNT(*) c FROM accounts").get() as { c: number };
      expect(count.c).toBe(1);
      const notImported = db.prepare("SELECT * FROM accounts WHERE code = '6000'").get();
      expect(notImported).toBeUndefined();
    });

    it("rejects a file with a duplicate code within itself (invalid file failure path)", async () => {
      const app = createApp(db);
      const csv = "code,name,type\n5000,First,expense\n5000,Second,expense\n";

      const res = await request(app).post("/accounts/import").set("Content-Type", "text/csv").send(csv);

      expect(res.status).toBe(400);
      expect(res.body.errors[0].invalid.join(" ")).toMatch(/duplicated within this file/);
    });
  });

  describe("GET /accounts/export", () => {
    it("exports the chart of accounts as CSV (happy path)", async () => {
      const app = createApp(db);
      await request(app).post("/accounts/import").set("Content-Type", "text/csv").send("code,name,type\n1000,Cash,asset\n");

      const res = await request(app).get("/accounts/export");

      expect(res.status).toBe(200);
      expect(res.text).toContain("1000,Cash,asset");
    });
  });

  it("logs import and export actions to the audit trail, including a rejected import (Trust criterion)", async () => {
    const app = createApp(db);

    await request(app)
      .post("/accounts/import")
      .set("Content-Type", "text/csv")
      .set("X-User-Id", "alice")
      .send("code,name,type\n1000,Cash,asset\n");
    await request(app).post("/accounts/import").set("Content-Type", "text/csv").set("X-User-Id", "alice").send("");
    await request(app).get("/accounts/export").set("X-User-Id", "alice");

    const events = db
      .prepare("SELECT action, user_id FROM audit_log WHERE entity_type IN ('data_import', 'data_export')")
      .all() as { action: string; user_id: string }[];

    const actions = events.map((e) => e.action);
    expect(actions).toContain("data_import_completed");
    expect(actions).toContain("data_import_rejected");
    expect(actions).toContain("data_export_completed");
    expect(events.every((e) => e.user_id === "alice")).toBe(true);
  });
});
