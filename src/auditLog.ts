import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

export interface AuditEventInput {
  entityType: string;
  entityId: string;
  action: string;
  userId: string;
  details?: unknown;
  occurredAt?: string;
}

/**
 * The single place that writes to audit_log. Every service module that
 * needs to record an event calls this instead of inlining its own INSERT —
 * consolidated after the release-boundary retro found the same insert
 * duplicated across 6 files, a pattern that would only have grown with
 * every future story's own "logged in the audit trail" criterion.
 */
export function recordAuditEvent(db: Database.Database, event: AuditEventInput): void {
  db.prepare(
    `
    INSERT INTO audit_log (id, entity_type, entity_id, action, occurred_at, user_id, details)
    VALUES (@id, @entity_type, @entity_id, @action, @occurred_at, @user_id, @details)
  `
  ).run({
    id: randomUUID(),
    entity_type: event.entityType,
    entity_id: event.entityId,
    action: event.action,
    occurred_at: event.occurredAt ?? new Date().toISOString(),
    user_id: event.userId,
    details: event.details !== undefined ? JSON.stringify(event.details) : null,
  });
}
