import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import type Database from "better-sqlite3";
import { createApp } from "../src/app";
import { openDb } from "../src/db";

describe("User roles and permissions", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openDb(":memory:");
  });

  afterEach(() => {
    if (db.open) db.close();
  });

  it("assigns permissions to a role so the user only accesses allowed features (happy path)", async () => {
    const app = createApp(db);

    // Before any role is assigned, alice is denied a protected feature.
    const before = await request(app)
      .post("/accounts")
      .set("X-User-Id", "alice")
      .send({ code: "1000", name: "Cash", type: "asset" });
    expect(before.status).toBe(403);

    const role = await request(app).post("/roles").send({ name: "accountant" });
    const permission = await request(app).post("/permissions").send({ key: "accounts:create" });
    await request(app).post(`/roles/${role.body.id}/permissions`).send({ permission_id: permission.body.id });
    await request(app).post("/users/alice/role").send({ role_id: role.body.id });

    // After the role carries the permission, alice can now use the feature.
    const after = await request(app)
      .post("/accounts")
      .set("X-User-Id", "alice")
      .send({ code: "1000", name: "Cash", type: "asset" });
    expect(after.status).toBe(201);
  });

  it("denies access to a user with no permissions (failure path)", async () => {
    const app = createApp(db);

    const res = await request(app)
      .post("/journal-entries/some-id/post")
      .set("X-User-Id", "bob");

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Access denied/);
  });

  it("does not grant a role's permission to an unrelated user (failure path stays scoped)", async () => {
    const app = createApp(db);
    const role = await request(app).post("/roles").send({ name: "accountant" });
    const permission = await request(app).post("/permissions").send({ key: "accounts:create" });
    await request(app).post(`/roles/${role.body.id}/permissions`).send({ permission_id: permission.body.id });
    await request(app).post("/users/alice/role").send({ role_id: role.body.id });

    // carol was never assigned any role — still denied even though alice's role exists.
    const res = await request(app)
      .post("/accounts")
      .set("X-User-Id", "carol")
      .send({ code: "3000", name: "Other", type: "asset" });

    expect(res.status).toBe(403);
  });

  it("rejects an incorrect permission assignment referencing a nonexistent role or permission (failure path)", async () => {
    const app = createApp(db);
    const permission = await request(app).post("/permissions").send({ key: "accounts:create" });

    const res = await request(app).post("/roles/does-not-exist/permissions").send({ permission_id: permission.body.id });

    expect(res.status).toBe(400);
    expect(res.body.reasons.join(" ")).toMatch(/No role/);
  });

  it("logs every role/permission change with the admin's user ID (Trust criterion)", async () => {
    const app = createApp(db);

    // Bootstrap a real, named admin — only "system" can grant roles:manage,
    // since nobody else can be authorized without one already holding it.
    const adminRole = await request(app).post("/roles").send({ name: "admin" });
    const managePermission = await request(app).post("/permissions").send({ key: "roles:manage" });
    await request(app)
      .post(`/roles/${adminRole.body.id}/permissions`)
      .send({ permission_id: managePermission.body.id });
    await request(app).post("/users/admin1/role").send({ role_id: adminRole.body.id });

    // Clear the bootstrap-phase log entries so only admin1's own actions remain.
    db.prepare("DELETE FROM user_activity_log").run();

    const role = await request(app).post("/roles").set("X-User-Id", "admin1").send({ name: "accountant" });
    expect(role.status).toBe(201);
    const permission = await request(app).post("/permissions").set("X-User-Id", "admin1").send({ key: "accounts:create" });
    expect(permission.status).toBe(201);
    const grant = await request(app)
      .post(`/roles/${role.body.id}/permissions`)
      .set("X-User-Id", "admin1")
      .send({ permission_id: permission.body.id });
    expect(grant.status).toBe(201);
    const assign = await request(app).post("/users/alice/role").set("X-User-Id", "admin1").send({ role_id: role.body.id });
    expect(assign.status).toBe(200);

    const entries = db.prepare("SELECT admin_user_id, action FROM user_activity_log").all() as {
      admin_user_id: string;
      action: string;
    }[];

    expect(entries).toHaveLength(4);
    expect(entries.every((e) => e.admin_user_id === "admin1")).toBe(true);
    expect(entries.map((e) => e.action)).toEqual(
      expect.arrayContaining(["role_created", "permission_created", "permission_assigned_to_role", "role_assigned_to_user"])
    );
  });

  it("re-assigning a user's role replaces their access rather than adding to it", async () => {
    const app = createApp(db);
    const roleA = await request(app).post("/roles").send({ name: "accountant" });
    const permA = await request(app).post("/permissions").send({ key: "accounts:create" });
    await request(app).post(`/roles/${roleA.body.id}/permissions`).send({ permission_id: permA.body.id });
    await request(app).post("/users/alice/role").send({ role_id: roleA.body.id });

    const roleB = await request(app).post("/roles").send({ name: "auditor" });
    await request(app).post("/users/alice/role").send({ role_id: roleB.body.id });

    // alice's role changed to one without accounts:create — access is revoked.
    const res = await request(app)
      .post("/accounts")
      .set("X-User-Id", "alice")
      .send({ code: "1000", name: "Cash", type: "asset" });

    expect(res.status).toBe(403);
  });
});
