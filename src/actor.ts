import type { Request } from "express";

const DEFAULT_ACTOR = "system";

/**
 * Identifies who is making a request, for the audit trail. No authentication
 * exists yet in this codebase, so this is a compatibility-mode placeholder:
 * it reads an X-User-Id header when the caller sets one, and falls back to
 * "system" otherwise. When real authentication is added (user roles and
 * permissions), that story only needs to populate this header from the
 * authenticated session — audit_log's schema and every call site that
 * already threads a user id through stay unchanged.
 */
export function getUserId(req: Request): string {
  const header = req.header("X-User-Id");
  return header && header.trim() !== "" ? header : DEFAULT_ACTOR;
}
