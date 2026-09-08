import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import type Database from "better-sqlite3";
import { createApp } from "../src/app";
import { openDb } from "../src/db";

describe("POST /branches/bulk-configure", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openDb(":memory:");
  });

  afterEach(() => {
    if (db.open) db.close();
  });

  it("configures multiple branches in one request (happy path)", async () => {
    const app = createApp(db);

    const res = await request(app)
      .post("/branches/bulk-configure")
      .send({ branches: [{ code: "NYC", name: "New York" }, { code: "LA", name: "Los Angeles" }, { code: "CHI", name: "Chicago" }] });

    expect(res.status).toBe(201);
    expect(res.body.branches).toHaveLength(3);
    expect(res.body.branches.map((b: { code: string }) => b.code)).toEqual(["NYC", "LA", "CHI"]);

    const count = db.prepare("SELECT COUNT(*) c FROM branches").get() as { c: number };
    expect(count.c).toBe(3);
  });

  it("rejects a batch with a duplicate code within itself (failure path)", async () => {
    const app = createApp(db);

    const res = await request(app)
      .post("/branches/bulk-configure")
      .send({ branches: [{ code: "SF", name: "SF1" }, { code: "SF", name: "SF2" }] });

    expect(res.status).toBe(400);
    expect(res.body.errors[0].invalid.join(" ")).toMatch(/duplicated within this batch/);
  });

  it("rejects a batch with a code that collides with an existing branch (failure path)", async () => {
    const app = createApp(db);
    await request(app).post("/branches/bulk-configure").send({ branches: [{ code: "NYC", name: "New York" }] });

    const res = await request(app).post("/branches/bulk-configure").send({ branches: [{ code: "NYC", name: "Duplicate" }] });

    expect(res.status).toBe(400);
    expect(res.body.errors[0].invalid.join(" ")).toMatch(/already exists/);
  });

  it("rejects an empty batch (boundary case)", async () => {
    const app = createApp(db);

    const res = await request(app).post("/branches/bulk-configure").send({ branches: [] });

    expect(res.status).toBe(400);
    expect(res.body.errors[0].invalid.join(" ")).toMatch(/non-empty array/);
  });

  it("rejects a batch item with missing fields, reporting the specific index (boundary case)", async () => {
    const app = createApp(db);

    const res = await request(app)
      .post("/branches/bulk-configure")
      .send({ branches: [{ code: "BOS", name: "Boston" }, { name: "No code here" }] });

    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors[0].index).toBe(1);
    expect(res.body.errors[0].missing).toContain("code");
  });

  it("is atomic: a mixed valid+invalid batch saves nothing at all (data consistency guardrail)", async () => {
    const app = createApp(db);
    await request(app).post("/branches/bulk-configure").send({ branches: [{ code: "NYC", name: "New York" }] });

    const res = await request(app)
      .post("/branches/bulk-configure")
      .send({ branches: [{ code: "SEA", name: "Seattle" }, { code: "NYC", name: "Duplicate of existing" }] });

    expect(res.status).toBe(400);
    const count = db.prepare("SELECT COUNT(*) c FROM branches").get() as { c: number };
    expect(count.c).toBe(1);
    const sea = db.prepare("SELECT * FROM branches WHERE code = 'SEA'").get();
    expect(sea).toBeUndefined();
  });

  it("logs every branch created in the batch to the audit trail (Trust criterion)", async () => {
    const app = createApp(db);

    await request(app)
      .post("/branches/bulk-configure")
      .set("X-User-Id", "alice")
      .send({ branches: [{ code: "NYC", name: "New York" }, { code: "LA", name: "Los Angeles" }] });

    const events = db.prepare("SELECT action, user_id FROM audit_log WHERE action = 'branch_created'").all() as {
      action: string;
      user_id: string;
    }[];

    expect(events).toHaveLength(2);
    expect(events.every((e) => e.user_id === "alice")).toBe(true);
  });
});
