import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import type Database from "better-sqlite3";
import { createApp } from "../src/app";
import { openDb } from "../src/db";

describe("Branch operations", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openDb(":memory:");
  });

  afterEach(() => {
    if (db.open) db.close();
  });

  describe("POST /branches", () => {
    it("creates a branch (happy path)", async () => {
      const app = createApp(db);

      const res = await request(app).post("/branches").send({ code: "NYC", name: "New York Branch", manager_name: "Carol" });

      expect(res.status).toBe(201);
      expect(res.body.code).toBe("NYC");
      expect(res.body.is_active).toBe(true);

      const row = db.prepare("SELECT * FROM branches WHERE code = 'NYC'").get();
      expect(row).toBeDefined();
    });

    it("rejects a duplicate branch code without creating a second row (failure path)", async () => {
      const app = createApp(db);
      await request(app).post("/branches").send({ code: "NYC", name: "New York Branch" });

      const res = await request(app).post("/branches").send({ code: "NYC", name: "Duplicate" });

      expect(res.status).toBe(409);
      const count = db.prepare("SELECT COUNT(*) c FROM branches").get() as { c: number };
      expect(count.c).toBe(1);
    });

    it("rejects an incomplete branch (boundary case)", async () => {
      const app = createApp(db);

      const res = await request(app).post("/branches").send({});

      expect(res.status).toBe(400);
      expect(res.body.missing_fields).toEqual(expect.arrayContaining(["code", "name"]));
    });
  });

  describe("PATCH /branches/:id", () => {
    async function createBranch(app: ReturnType<typeof createApp>, code = "NYC") {
      const res = await request(app).post("/branches").send({ code, name: "New York Branch", manager_name: "Carol" });
      return res.body.id as string;
    }

    it("updates a branch with valid details (happy path)", async () => {
      const app = createApp(db);
      const id = await createBranch(app);

      const res = await request(app).patch(`/branches/${id}`).send({ name: "NYC Flagship", is_active: false });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe("NYC Flagship");
      expect(res.body.is_active).toBe(false);
      expect(res.body.manager_name).toBe("Carol");

      const row = db.prepare("SELECT name, is_active FROM branches WHERE id = ?").get(id) as {
        name: string;
        is_active: number;
      };
      expect(row.name).toBe("NYC Flagship");
      expect(row.is_active).toBe(0);
    });

    it("rejects an update with no fields supplied, leaving the branch unchanged (failure path)", async () => {
      const app = createApp(db);
      const id = await createBranch(app);

      const res = await request(app).patch(`/branches/${id}`).send({});

      expect(res.status).toBe(400);
      expect(res.body.missing_fields.join(" ")).toMatch(/at least one of/);

      const row = db.prepare("SELECT name FROM branches WHERE id = ?").get(id) as { name: string };
      expect(row.name).toBe("New York Branch");
    });

    it("rejects an update with a wrongly-typed field (boundary case)", async () => {
      const app = createApp(db);
      const id = await createBranch(app);

      const res = await request(app).patch(`/branches/${id}`).send({ is_active: "yes" });

      expect(res.status).toBe(400);
      expect(res.body.invalid_fields).toContain("is_active");
    });

    it("rejects updating a branch that does not exist (failure path)", async () => {
      const app = createApp(db);

      const res = await request(app).patch("/branches/does-not-exist").send({ name: "X" });

      expect(res.status).toBe(404);
    });

    it("logs branch creation and updates to the audit trail (Trust criterion)", async () => {
      const app = createApp(db);
      const id = await request(app)
        .post("/branches")
        .set("X-User-Id", "alice")
        .send({ code: "NYC", name: "New York Branch" })
        .then((r) => r.body.id as string);
      await request(app).patch(`/branches/${id}`).set("X-User-Id", "alice").send({ name: "NYC Flagship" });

      const events = db
        .prepare("SELECT action, user_id FROM audit_log WHERE entity_type = 'branch' AND entity_id = ?")
        .all(id) as { action: string; user_id: string }[];

      const actions = events.map((e) => e.action);
      expect(actions).toContain("branch_created");
      expect(actions).toContain("branch_updated");
      expect(events.every((e) => e.user_id === "alice")).toBe(true);
    });
  });
});
