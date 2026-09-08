import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

export interface Role {
  id: string;
  name: string;
  created_at: string;
}

export interface Permission {
  id: string;
  key: string;
  created_at: string;
}

export class DuplicateRoleError extends Error {
  constructor(name: string) {
    super(`A role named "${name}" already exists.`);
    this.name = "DuplicateRoleError";
  }
}

export class DuplicatePermissionError extends Error {
  constructor(key: string) {
    super(`A permission with key "${key}" already exists.`);
    this.name = "DuplicatePermissionError";
  }
}

export class RoleNotFoundError extends Error {
  constructor(id: string) {
    super(`No role with id "${id}" exists.`);
    this.name = "RoleNotFoundError";
  }
}

export class PermissionNotFoundError extends Error {
  constructor(id: string) {
    super(`No permission with id "${id}" exists.`);
    this.name = "PermissionNotFoundError";
  }
}

function logActivity(db: Database.Database, adminUserId: string, action: string, details: unknown): void {
  db.prepare(
    `INSERT INTO user_activity_log (id, admin_user_id, action, occurred_at, details) VALUES (@id, @admin_user_id, @action, @occurred_at, @details)`
  ).run({
    id: randomUUID(),
    admin_user_id: adminUserId,
    action,
    occurred_at: new Date().toISOString(),
    details: JSON.stringify(details),
  });
}

export function createRole(db: Database.Database, name: string, adminUserId: string): Role {
  const now = new Date().toISOString();
  const role: Role = { id: randomUUID(), name, created_at: now };

  const tx = db.transaction(() => {
    db.prepare("INSERT INTO roles (id, name, created_at) VALUES (@id, @name, @created_at)").run(role);
    logActivity(db, adminUserId, "role_created", { role_id: role.id, name });
  });

  try {
    tx();
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE") {
      throw new DuplicateRoleError(name);
    }
    throw err;
  }

  return role;
}

export function createPermission(db: Database.Database, key: string, adminUserId: string): Permission {
  const now = new Date().toISOString();
  const permission: Permission = { id: randomUUID(), key, created_at: now };

  const tx = db.transaction(() => {
    db.prepare("INSERT INTO permissions (id, key, created_at) VALUES (@id, @key, @created_at)").run(permission);
    logActivity(db, adminUserId, "permission_created", { permission_id: permission.id, key });
  });

  try {
    tx();
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE") {
      throw new DuplicatePermissionError(key);
    }
    throw err;
  }

  return permission;
}

/**
 * Grants a permission to a role. Idempotent: granting the same permission
 * to the same role twice is a no-op, not an error — only a genuinely
 * incorrect assignment (a role or permission id that doesn't exist) fails.
 */
export function assignPermissionToRole(db: Database.Database, roleId: string, permissionId: string, adminUserId: string): void {
  const role = db.prepare("SELECT id FROM roles WHERE id = ?").get(roleId);
  if (!role) throw new RoleNotFoundError(roleId);

  const permission = db.prepare("SELECT id FROM permissions WHERE id = ?").get(permissionId);
  if (!permission) throw new PermissionNotFoundError(permissionId);

  const already = db
    .prepare("SELECT id FROM role_permissions WHERE role_id = ? AND permission_id = ?")
    .get(roleId, permissionId);
  if (already) return;

  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    db.prepare(
      "INSERT INTO role_permissions (id, role_id, permission_id, created_at) VALUES (@id, @role_id, @permission_id, @created_at)"
    ).run({ id: randomUUID(), role_id: roleId, permission_id: permissionId, created_at: now });
    logActivity(db, adminUserId, "permission_assigned_to_role", { role_id: roleId, permission_id: permissionId });
  });
  tx();
}

/**
 * Assigns a role to a user (one role per user; re-assigning replaces the
 * previous role rather than erroring, since changing someone's role is a
 * normal admin action, not a duplicate).
 */
export function assignRoleToUser(db: Database.Database, userId: string, roleId: string, adminUserId: string): void {
  const role = db.prepare("SELECT id FROM roles WHERE id = ?").get(roleId);
  if (!role) throw new RoleNotFoundError(roleId);

  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO user_roles (user_id, role_id, assigned_at) VALUES (@user_id, @role_id, @assigned_at)
       ON CONFLICT(user_id) DO UPDATE SET role_id = excluded.role_id, assigned_at = excluded.assigned_at`
    ).run({ user_id: userId, role_id: roleId, assigned_at: now });
    logActivity(db, adminUserId, "role_assigned_to_user", { user_id: userId, role_id: roleId });
  });
  tx();
}

/**
 * The lookup the enforcement middleware uses: does this user's assigned
 * role include this permission? A user with no role, or a role with no
 * matching permission, is denied — the same "no permissions" case
 * criterion 2 tests.
 */
export function hasPermission(db: Database.Database, userId: string, permissionKey: string): boolean {
  const row = db
    .prepare(
      `SELECT 1
       FROM user_roles ur
       JOIN role_permissions rp ON rp.role_id = ur.role_id
       JOIN permissions p ON p.id = rp.permission_id
       WHERE ur.user_id = ? AND p.key = ?`
    )
    .get(userId, permissionKey);
  return !!row;
}
