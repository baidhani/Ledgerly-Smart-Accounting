import type Database from "better-sqlite3";

export interface AuditTrailEntry {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  status: "success" | "failure";
  occurred_at: string;
  user_id: string | null;
  details: unknown;
}

interface AuditLogRow {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  occurred_at: string;
  user_id: string | null;
  details: string | null;
}

export interface AuditTrailFilters {
  entity_type?: string;
  entity_id?: string;
}

function deriveStatus(action: string): "success" | "failure" {
  return action.includes("rejected") || action.includes("failed") ? "failure" : "success";
}

/**
 * Parses a stored details JSON blob defensively. A row with missing or
 * malformed details is a real possibility this endpoint must survive
 * (the "missing transaction details" failure path) — it returns null for
 * that row's details rather than crashing the whole request.
 */
function parseDetails(details: string | null): unknown {
  if (details === null) return null;
  try {
    return JSON.parse(details);
  } catch {
    return null;
  }
}

export function getAuditTrail(db: Database.Database, filters: AuditTrailFilters = {}): AuditTrailEntry[] {
  const conditions: string[] = [];
  const params: Record<string, string> = {};

  if (filters.entity_type) {
    conditions.push("entity_type = @entity_type");
    params.entity_type = filters.entity_type;
  }
  if (filters.entity_id) {
    conditions.push("entity_id = @entity_id");
    params.entity_id = filters.entity_id;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = db
    .prepare(`SELECT * FROM audit_log ${whereClause} ORDER BY occurred_at DESC`)
    .all(params) as AuditLogRow[];

  return rows.map((row) => ({
    id: row.id,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    action: row.action,
    status: deriveStatus(row.action),
    occurred_at: row.occurred_at,
    user_id: row.user_id,
    details: parseDetails(row.details),
  }));
}
