import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import type Database from "better-sqlite3";
import { createApp } from "../src/app";
import { openDb } from "../src/db";

describe("Dashboards and reporting", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openDb(":memory:");
  });

  afterEach(() => {
    if (db.open) db.close();
  });

  describe("POST /dashboards", () => {
    it("saves a dashboard configuration (happy path)", async () => {
      const app = createApp(db);

      const res = await request(app)
        .post("/dashboards")
        .send({ name: "Exec Overview", widgets: ["trial_balance", "branch_summary"] });

      expect(res.status).toBe(201);
      expect(res.body.widgets).toEqual(["trial_balance", "branch_summary"]);

      const row = db.prepare("SELECT * FROM dashboards WHERE id = ?").get(res.body.id);
      expect(row).toBeDefined();
    });

    it("rejects a duplicate dashboard name without creating a second row (failure path)", async () => {
      const app = createApp(db);
      await request(app).post("/dashboards").send({ name: "Exec Overview", widgets: ["branch_summary"] });

      const res = await request(app).post("/dashboards").send({ name: "Exec Overview", widgets: ["trial_balance"] });

      expect(res.status).toBe(409);
      const count = db.prepare("SELECT COUNT(*) c FROM dashboards").get() as { c: number };
      expect(count.c).toBe(1);
    });

    it("rejects a configuration with an unknown widget type (reporting error failure path)", async () => {
      const app = createApp(db);

      const res = await request(app).post("/dashboards").send({ name: "Bad", widgets: ["made_up_widget"] });

      expect(res.status).toBe(400);
      expect(res.body.invalid_fields.join(" ")).toMatch(/unknown widget type/);
    });

    it("rejects a configuration with an empty widget list (boundary case)", async () => {
      const app = createApp(db);

      const res = await request(app).post("/dashboards").send({ name: "Bad", widgets: [] });

      expect(res.status).toBe(400);
      expect(res.body.invalid_fields.join(" ")).toMatch(/non-empty array/);
    });

    it("rejects an incomplete configuration (boundary case)", async () => {
      const app = createApp(db);

      const res = await request(app).post("/dashboards").send({});

      expect(res.status).toBe(400);
      expect(res.body.missing_fields).toEqual(expect.arrayContaining(["name", "widgets"]));
    });
  });

  describe("GET /dashboards/:id/render", () => {
    it("displays the dashboard with real-time data (happy path)", async () => {
      const app = createApp(db);
      await request(app).post("/branches").send({ code: "NYC", name: "New York" });
      const created = await request(app)
        .post("/dashboards")
        .send({ name: "Exec Overview", widgets: ["branch_summary"] });

      const res = await request(app).get(`/dashboards/${created.body.id}/render`);

      expect(res.status).toBe(200);
      expect(res.body.widgets.branch_summary).toEqual({ total: 1, active: 1, inactive: 0 });

      await request(app).post("/branches").send({ code: "LA", name: "Los Angeles" });
      const res2 = await request(app).get(`/dashboards/${created.body.id}/render`);
      expect(res2.body.widgets.branch_summary).toEqual({ total: 2, active: 2, inactive: 0 });
    });

    it("alerts on a reporting error when the dashboard does not exist (failure path)", async () => {
      const app = createApp(db);

      const res = await request(app).get("/dashboards/does-not-exist/render");

      expect(res.status).toBe(404);
      expect(res.body.error).toBeDefined();
    });

    it("logs dashboard configuration and report generation to the audit trail (Trust criterion)", async () => {
      const app = createApp(db);
      const created = await request(app)
        .post("/dashboards")
        .set("X-User-Id", "alice")
        .send({ name: "Exec Overview", widgets: ["branch_summary"] });
      await request(app).get(`/dashboards/${created.body.id}/render`).set("X-User-Id", "bob");

      const events = db
        .prepare("SELECT action, user_id FROM audit_log WHERE entity_type = 'dashboard' AND entity_id = ?")
        .all(created.body.id) as { action: string; user_id: string }[];

      const actions = events.map((e) => e.action);
      expect(actions).toContain("dashboard_configured");
      expect(actions).toContain("dashboard_report_generated");
      expect(events.find((e) => e.action === "dashboard_configured")?.user_id).toBe("alice");
      expect(events.find((e) => e.action === "dashboard_report_generated")?.user_id).toBe("bob");
    });
  });
});
