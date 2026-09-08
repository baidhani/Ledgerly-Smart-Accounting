import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import type Database from "better-sqlite3";
import { createApp } from "../src/app";
import { openDb } from "../src/db";

describe("POST /customers and /vendors", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openDb(":memory:");
  });

  afterEach(() => {
    if (db.open) db.close();
  });

  it("saves the profile on valid details (happy path)", async () => {
    const app = createApp(db);

    const res = await request(app).post("/customers").send({ name: "Acme Corp", email: "billing@acme.com" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ type: "customer", name: "Acme Corp", email: "billing@acme.com" });
    expect(res.body.id).toBeTruthy();

    const stored = db.prepare("SELECT * FROM business_partners WHERE id = ?").get(res.body.id);
    expect(stored).toBeTruthy();

    const audit = db.prepare("SELECT * FROM audit_log WHERE entity_id = ?").get(res.body.id) as
      | { action: string; entity_type: string }
      | undefined;
    expect(audit).toBeTruthy();
    expect(audit?.action).toBe("business_partner_created");
    expect(audit?.entity_type).toBe("business_partner");
  });

  it("rejects the request on invalid details without saving (failure path)", async () => {
    const app = createApp(db);

    const res = await request(app).post("/vendors").send({ name: "Bad Vendor", email: "not-an-email" });

    expect(res.status).toBe(400);
    expect(res.body.invalid_fields.length).toBeGreaterThan(0);

    const count = db.prepare("SELECT COUNT(*) c FROM business_partners").get() as { c: number };
    expect(count.c).toBe(0);
  });

  it("rejects a duplicate (type, name) profile without creating a second row (failure path)", async () => {
    const app = createApp(db);

    const first = await request(app).post("/customers").send({ name: "Acme Corp" });
    expect(first.status).toBe(201);

    const dup = await request(app).post("/customers").send({ name: "Acme Corp" });

    expect(dup.status).toBe(409);
    expect(dup.body.error).toMatch(/already exists/);

    const count = db.prepare("SELECT COUNT(*) c FROM business_partners").get() as { c: number };
    expect(count.c).toBe(1);
  });

  it("allows the same name across different types (type is part of the natural key)", async () => {
    const app = createApp(db);

    const customer = await request(app).post("/customers").send({ name: "Acme Corp" });
    const vendor = await request(app).post("/vendors").send({ name: "Acme Corp" });

    expect(customer.status).toBe(201);
    expect(vendor.status).toBe(201);

    const count = db.prepare("SELECT COUNT(*) c FROM business_partners").get() as { c: number };
    expect(count.c).toBe(2);
  });

  it("pins the type from the route, ignoring a mismatched type in the request body", async () => {
    const app = createApp(db);

    const res = await request(app).post("/customers").send({ type: "vendor", name: "Sneaky Co" });

    expect(res.status).toBe(201);
    expect(res.body.type).toBe("customer");
  });

  it("returns a 500 without leaking internals when the database save fails (failure path)", async () => {
    const app = createApp(db);
    db.close(); // force the insert to throw

    const res = await request(app).post("/vendors").send({ name: "Acme Corp" });

    expect(res.status).toBe(500);
    expect(res.body.error).toBeTruthy();
    expect(JSON.stringify(res.body)).not.toMatch(/SqliteError|node_modules|at Object/);
  });
});
