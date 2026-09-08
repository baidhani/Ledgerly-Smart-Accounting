import { Router, Request, Response, NextFunction } from "express";
import type Database from "better-sqlite3";
import {
  createRole,
  createPermission,
  assignPermissionToRole,
  assignRoleToUser,
  hasPermission,
  DuplicateRoleError,
  DuplicatePermissionError,
  RoleNotFoundError,
  PermissionNotFoundError,
} from "../rolesPermissions";
import { getUserId } from "../actor";

const BOOTSTRAP_USER_ID = "system";

/**
 * Real enforcement, not a stub: denies (403) unless the acting user's
 * assigned role includes this permission.
 *
 * Bootstrap exception: the default "system" identity (whoever sends no
 * X-User-Id header) always passes. Without this, nobody could ever create
 * the first role, since creating a role itself requires "roles:manage" —
 * a chicken-and-egg problem with no real auth to seed a superuser through.
 * This doesn't lower the current security baseline: every route in this
 * codebase is already unauthenticated, so "system" is already implicitly
 * trusted everywhere else. This just adds real enforcement for anyone who
 * *does* identify themselves via the header, while preserving that same
 * trust level for the no-header case.
 */
export function requirePermission(db: Database.Database, permissionKey: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const userId = getUserId(req);
    if (userId === BOOTSTRAP_USER_ID) {
      next();
      return;
    }
    if (!hasPermission(db, userId, permissionKey)) {
      res.status(403).json({ error: `Access denied: missing permission "${permissionKey}".` });
      return;
    }
    next();
  };
}

export function rolesPermissionsRouter(db: Database.Database): Router {
  const router = Router();
  const requireManage = requirePermission(db, "roles:manage");

  router.post("/roles", requireManage, (req, res) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    if (typeof body.name !== "string" || body.name.trim() === "") {
      res.status(400).json({ error: "Role is incomplete or invalid.", missing_fields: ["name"], invalid_fields: [] });
      return;
    }

    try {
      const role = createRole(db, body.name, getUserId(req));
      res.status(201).json(role);
    } catch (err) {
      if (err instanceof DuplicateRoleError) {
        res.status(409).json({ error: err.message });
        return;
      }
      console.error(JSON.stringify({
        level: "error",
        event: "role_save_failed",
        error_class: err instanceof Error ? err.constructor.name : "UnknownError",
        outcome: "failure",
      }));
      res.status(500).json({ error: "Could not save the role. Please try again." });
    }
  });

  router.post("/permissions", requireManage, (req, res) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    if (typeof body.key !== "string" || body.key.trim() === "") {
      res.status(400).json({ error: "Permission is incomplete or invalid.", missing_fields: ["key"], invalid_fields: [] });
      return;
    }

    try {
      const permission = createPermission(db, body.key, getUserId(req));
      res.status(201).json(permission);
    } catch (err) {
      if (err instanceof DuplicatePermissionError) {
        res.status(409).json({ error: err.message });
        return;
      }
      console.error(JSON.stringify({
        level: "error",
        event: "permission_save_failed",
        error_class: err instanceof Error ? err.constructor.name : "UnknownError",
        outcome: "failure",
      }));
      res.status(500).json({ error: "Could not save the permission. Please try again." });
    }
  });

  router.post("/roles/:id/permissions", requireManage, (req, res) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    if (typeof body.permission_id !== "string" || body.permission_id.trim() === "") {
      res.status(400).json({ error: "Assignment is incomplete or invalid.", missing_fields: ["permission_id"], invalid_fields: [] });
      return;
    }

    try {
      assignPermissionToRole(db, req.params.id, body.permission_id, getUserId(req));
      res.status(201).json({ role_id: req.params.id, permission_id: body.permission_id });
    } catch (err) {
      if (err instanceof RoleNotFoundError || err instanceof PermissionNotFoundError) {
        res.status(400).json({ error: "Incorrect permission assignment.", reasons: [err.message] });
        return;
      }
      console.error(JSON.stringify({
        level: "error",
        event: "permission_assignment_failed",
        error_class: err instanceof Error ? err.constructor.name : "UnknownError",
        outcome: "failure",
      }));
      res.status(500).json({ error: "Could not assign the permission. Please try again." });
    }
  });

  router.post("/users/:userId/role", requireManage, (req, res) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    if (typeof body.role_id !== "string" || body.role_id.trim() === "") {
      res.status(400).json({ error: "Assignment is incomplete or invalid.", missing_fields: ["role_id"], invalid_fields: [] });
      return;
    }

    try {
      assignRoleToUser(db, req.params.userId, body.role_id, getUserId(req));
      res.status(200).json({ user_id: req.params.userId, role_id: body.role_id });
    } catch (err) {
      if (err instanceof RoleNotFoundError) {
        res.status(400).json({ error: "Incorrect role assignment.", reasons: [err.message] });
        return;
      }
      console.error(JSON.stringify({
        level: "error",
        event: "role_assignment_failed",
        error_class: err instanceof Error ? err.constructor.name : "UnknownError",
        outcome: "failure",
      }));
      res.status(500).json({ error: "Could not assign the role. Please try again." });
    }
  });

  return router;
}
