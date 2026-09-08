import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { recordAuditEvent } from "./auditLog";

export interface CompanyProfileInput {
  name: string;
  legal_entity_type: string;
  fiscal_year_start: string;
  base_currency: string;
}

export interface CompanyProfile extends CompanyProfileInput {
  id: string;
  created_at: string;
  updated_at: string;
}

const REQUIRED_FIELDS: (keyof CompanyProfileInput)[] = [
  "name",
  "legal_entity_type",
  "fiscal_year_start",
  "base_currency",
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY_CODE = /^[A-Z]{3}$/;

export interface ValidationResult {
  valid: boolean;
  missing: string[];
  invalid: string[];
}

export function validateCompanyProfileInput(input: Record<string, unknown>): ValidationResult {
  const missing: string[] = [];
  const invalid: string[] = [];

  for (const field of REQUIRED_FIELDS) {
    const value = input[field];
    if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) {
      missing.push(field);
    }
  }

  if (!missing.includes("fiscal_year_start")) {
    const v = input.fiscal_year_start;
    if (typeof v !== "string" || !ISO_DATE.test(v)) {
      invalid.push("fiscal_year_start (expected YYYY-MM-DD)");
    }
  }

  if (!missing.includes("base_currency")) {
    const v = input.base_currency;
    if (typeof v !== "string" || !CURRENCY_CODE.test(v)) {
      invalid.push("base_currency (expected a 3-letter ISO code, e.g. USD)");
    }
  }

  for (const field of ["name", "legal_entity_type"] as const) {
    if (!missing.includes(field) && typeof input[field] !== "string") {
      invalid.push(field);
    }
  }

  return { valid: missing.length === 0 && invalid.length === 0, missing, invalid };
}

export function createCompanyProfile(db: Database.Database, input: CompanyProfileInput, userId: string): CompanyProfile {
  const now = new Date().toISOString();
  const company: CompanyProfile = {
    id: randomUUID(),
    ...input,
    created_at: now,
    updated_at: now,
  };

  const insertCompany = db.prepare(`
    INSERT INTO companies (id, name, legal_entity_type, fiscal_year_start, base_currency, created_at, updated_at)
    VALUES (@id, @name, @legal_entity_type, @fiscal_year_start, @base_currency, @created_at, @updated_at)
  `);

  const tx = db.transaction(() => {
    insertCompany.run(company);
    recordAuditEvent(db, {
      entityType: "company",
      entityId: company.id,
      action: "company_profile_created",
      userId,
      occurredAt: now,
      details: { name: company.name },
    });
  });
  tx();

  return company;
}
