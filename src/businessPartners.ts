import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { recordAuditEvent } from "./auditLog";

export interface BusinessPartnerInput {
  type: string;
  name: string;
  email?: string | null;
  phone?: string | null;
}

export interface BusinessPartner extends BusinessPartnerInput {
  id: string;
  created_at: string;
  updated_at: string;
}

const REQUIRED_FIELDS: (keyof BusinessPartnerInput)[] = ["type", "name"];
const PARTNER_TYPES = ["customer", "vendor"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ValidationResult {
  valid: boolean;
  missing: string[];
  invalid: string[];
}

export function validateBusinessPartnerInput(input: Record<string, unknown>): ValidationResult {
  const missing: string[] = [];
  const invalid: string[] = [];

  for (const field of REQUIRED_FIELDS) {
    const value = input[field];
    if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) {
      missing.push(field);
    }
  }

  if (!missing.includes("type")) {
    if (typeof input.type !== "string" || !PARTNER_TYPES.includes(input.type)) {
      invalid.push(`type (expected one of: ${PARTNER_TYPES.join(", ")})`);
    }
  }

  if (!missing.includes("name") && typeof input.name !== "string") {
    invalid.push("name");
  }

  if (input.email !== undefined && input.email !== null) {
    if (typeof input.email !== "string" || !EMAIL.test(input.email)) {
      invalid.push("email (expected a valid email address)");
    }
  }

  if (input.phone !== undefined && input.phone !== null && typeof input.phone !== "string") {
    invalid.push("phone");
  }

  return { valid: missing.length === 0 && invalid.length === 0, missing, invalid };
}

export class DuplicateBusinessPartnerError extends Error {
  constructor(type: string, name: string) {
    super(`A ${type} profile named "${name}" already exists.`);
    this.name = "DuplicateBusinessPartnerError";
  }
}

export function createBusinessPartner(db: Database.Database, input: BusinessPartnerInput, userId: string): BusinessPartner {
  const now = new Date().toISOString();
  const partner: BusinessPartner = {
    id: randomUUID(),
    type: input.type,
    name: input.name,
    email: input.email ?? null,
    phone: input.phone ?? null,
    created_at: now,
    updated_at: now,
  };

  const insertPartner = db.prepare(`
    INSERT INTO business_partners (id, type, name, email, phone, created_at, updated_at)
    VALUES (@id, @type, @name, @email, @phone, @created_at, @updated_at)
  `);

  const tx = db.transaction(() => {
    insertPartner.run(partner);
    recordAuditEvent(db, {
      entityType: "business_partner",
      entityId: partner.id,
      action: "business_partner_created",
      userId,
      occurredAt: now,
      details: { type: partner.type, name: partner.name },
    });
  });

  try {
    tx();
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE") {
      throw new DuplicateBusinessPartnerError(partner.type, partner.name);
    }
    throw err;
  }

  return partner;
}
