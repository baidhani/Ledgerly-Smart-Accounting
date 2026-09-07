import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import type Database from "better-sqlite3";
import { createApp } from "../src/app";
import { openDb } from "../src/db";

describe("POST /companies", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openDb(":memory:");
  });

  afterEach(() => {
    if (db.open) db.close();
  });

  it("creates a company profile on a complete, valid request (happy path)", async () => {
    const app = createApp(db);

    const res = await request(app).post("/companies").send({
      name: "Acme Corp",
      legal_entity_type: "LLC",
      fiscal_year_start: "2026-01-01",
      base_currency: "USD",
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: "Acme Corp",
      legal_entity_type: "LLC",
      fiscal_year_start: "2026-01-01",
      base_currency: "USD",
    });
    expect(res.body.id).toBeTruthy();

    const stored = db.prepare("SELECT * FROM companies WHERE id = ?").get(res.body.id);
    expect(stored).toBeTruthy();

    const audit = db.prepare("SELECT * FROM audit_log WHERE entity_id = ?").get(res.body.id) as
      | { action: string }
      | undefined;
    expect(audit).toBeTruthy();
    expect(audit?.action).toBe("company_profile_created");
  });

  it("prompts for missing information on an incomplete request (failure path)", async () => {
    const app = createApp(db);

    const res = await request(app).post("/companies").send({ name: "Acme Corp" });

    expect(res.status).toBe(400);
    expect(res.body.missing_fields).toEqual(
      expect.arrayContaining(["legal_entity_type", "fiscal_year_start", "base_currency"])
    );

    const count = db.prepare("SELECT COUNT(*) c FROM companies").get() as { c: number };
    expect(count.c).toBe(0);
  });

  it("rejects invalid field formats without saving (failure path)", async () => {
    const app = createApp(db);

    const res = await request(app).post("/companies").send({
      name: "Acme Corp",
      legal_entity_type: "LLC",
      fiscal_year_start: "01/01/2026",
      base_currency: "US Dollars",
    });

    expect(res.status).toBe(400);
    expect(res.body.invalid_fields.length).toBeGreaterThan(0);

    const count = db.prepare("SELECT COUNT(*) c FROM companies").get() as { c: number };
    expect(count.c).toBe(0);
  });

  it("returns a 500 without leaking internals when the database save fails (failure path)", async () => {
    const app = createApp(db);
    db.close(); // force the insert to throw

    const res = await request(app).post("/companies").send({
      name: "Acme Corp",
      legal_entity_type: "LLC",
      fiscal_year_start: "2026-01-01",
      base_currency: "USD",
    });

    expect(res.status).toBe(500);
    expect(res.body.error).toBeTruthy();
    expect(JSON.stringify(res.body)).not.toMatch(/SqliteError|node_modules|at Object/);
  });
});
