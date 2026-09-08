import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { recordAuditEvent } from "./auditLog";
import { createJournalEntry } from "./journalEntries";
import { postJournalEntry } from "./generalLedger";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isValidAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export interface ValidationResult {
  valid: boolean;
  missing: string[];
  invalid: string[];
}

export class DuplicateInvoiceError extends Error {
  constructor(invoiceNumber: string) {
    super(`An invoice with number "${invoiceNumber}" already exists.`);
    this.name = "DuplicateInvoiceError";
  }
}

export class DuplicateBillError extends Error {
  constructor(billNumber: string) {
    super(`A bill with number "${billNumber}" already exists.`);
    this.name = "DuplicateBillError";
  }
}

export class InvoiceNotFoundError extends Error {
  constructor(id: string) {
    super(`No invoice with id "${id}" exists.`);
    this.name = "InvoiceNotFoundError";
  }
}

export class BillNotFoundError extends Error {
  constructor(id: string) {
    super(`No bill with id "${id}" exists.`);
    this.name = "BillNotFoundError";
  }
}

export class PaymentError extends Error {
  reasons: string[];
  constructor(reasons: string[]) {
    super(`Payment cannot be processed: ${reasons.join("; ")}`);
    this.name = "PaymentError";
    this.reasons = reasons;
  }
}

// ---- AR invoices ----

export interface InvoiceInput {
  invoice_number: string;
  customer_id: string;
  ar_account_id: string;
  amount: number;
  due_date: string;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  customer_id: string;
  ar_account_id: string;
  amount_cents: number;
  due_date: string;
  status: "unpaid" | "paid";
  journal_entry_id: string | null;
  created_at: string;
  paid_at: string | null;
}

export function validateInvoiceInput(db: Database.Database, input: Record<string, unknown>): ValidationResult {
  const missing: string[] = [];
  const invalid: string[] = [];

  for (const field of ["invoice_number", "customer_id", "ar_account_id", "amount", "due_date"] as const) {
    const value = input[field];
    if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) {
      missing.push(field);
    }
  }

  if (!missing.includes("customer_id")) {
    const customer = db
      .prepare("SELECT id FROM business_partners WHERE id = ? AND type = 'customer'")
      .get(input.customer_id);
    if (!customer) invalid.push("customer_id (no customer with that id exists)");
  }

  if (!missing.includes("ar_account_id")) {
    const account = db.prepare("SELECT id FROM accounts WHERE id = ?").get(input.ar_account_id);
    if (!account) invalid.push("ar_account_id (no account with that id exists)");
  }

  if (!missing.includes("amount") && !isValidAmount(input.amount)) {
    invalid.push("amount (expected a positive number)");
  }

  if (!missing.includes("due_date")) {
    if (typeof input.due_date !== "string" || !ISO_DATE.test(input.due_date)) {
      invalid.push("due_date (expected YYYY-MM-DD)");
    }
  }

  return { valid: missing.length === 0 && invalid.length === 0, missing, invalid };
}

export function createInvoice(db: Database.Database, input: InvoiceInput, userId: string): Invoice {
  const now = new Date().toISOString();
  const invoice: Invoice = {
    id: randomUUID(),
    invoice_number: input.invoice_number,
    customer_id: input.customer_id,
    ar_account_id: input.ar_account_id,
    amount_cents: Math.round(input.amount * 100),
    due_date: input.due_date,
    status: "unpaid",
    journal_entry_id: null,
    created_at: now,
    paid_at: null,
  };

  const insert = db.prepare(`
    INSERT INTO ar_invoices (id, invoice_number, customer_id, ar_account_id, amount_cents, due_date, status, created_at)
    VALUES (@id, @invoice_number, @customer_id, @ar_account_id, @amount_cents, @due_date, @status, @created_at)
  `);

  const tx = db.transaction(() => {
    insert.run(invoice);
    recordAuditEvent(db, {
      entityType: "ar_invoice",
      entityId: invoice.id,
      action: "ar_invoice_created",
      userId,
      occurredAt: now,
      details: { invoice_number: invoice.invoice_number, amount_cents: invoice.amount_cents },
    });
  });

  try {
    tx();
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE") {
      throw new DuplicateInvoiceError(invoice.invoice_number);
    }
    throw err;
  }

  return invoice;
}

/**
 * Marks an invoice paid by creating and posting a real, balanced journal
 * entry (debit the cash account, credit the invoice's AR account) through
 * the existing ledger pipeline — not a status flag disconnected from the
 * books. Idempotent: paying an already-paid invoice again returns the same
 * result instead of creating a second journal entry.
 */
export function payInvoice(db: Database.Database, invoiceId: string, cashAccountId: string, userId: string): Invoice {
  const invoice = db.prepare("SELECT * FROM ar_invoices WHERE id = ?").get(invoiceId) as Invoice | undefined;
  if (!invoice) {
    throw new InvoiceNotFoundError(invoiceId);
  }

  if (invoice.status === "paid") {
    return invoice;
  }

  if (!cashAccountId || typeof cashAccountId !== "string") {
    throw new PaymentError(["cash_account_id is required"]);
  }
  const cashAccount = db.prepare("SELECT id FROM accounts WHERE id = ?").get(cashAccountId);
  if (!cashAccount) {
    throw new PaymentError([`cash_account_id "${cashAccountId}" does not reference an existing account`]);
  }

  const amount = invoice.amount_cents / 100;
  const entry = createJournalEntry(
    db,
    {
      entry_date: new Date().toISOString().slice(0, 10),
      memo: `Payment received for invoice ${invoice.invoice_number}`,
      lines: [
        { account_id: cashAccountId, debit: amount },
        { account_id: invoice.ar_account_id, credit: amount },
      ],
    },
    userId
  );
  postJournalEntry(db, entry.id, userId);

  const now = new Date().toISOString();
  db.prepare("UPDATE ar_invoices SET status = 'paid', paid_at = @paid_at, journal_entry_id = @journal_entry_id WHERE id = @id").run({
    id: invoiceId,
    paid_at: now,
    journal_entry_id: entry.id,
  });
  recordAuditEvent(db, {
    entityType: "ar_invoice",
    entityId: invoiceId,
    action: "ar_invoice_paid",
    userId,
    occurredAt: now,
    details: { journal_entry_id: entry.id, amount_cents: invoice.amount_cents },
  });

  return { ...invoice, status: "paid", paid_at: now, journal_entry_id: entry.id };
}

// ---- AP bills ----

export interface BillInput {
  bill_number: string;
  vendor_id: string;
  ap_account_id: string;
  amount: number;
  due_date: string;
}

export interface Bill {
  id: string;
  bill_number: string;
  vendor_id: string;
  ap_account_id: string;
  amount_cents: number;
  due_date: string;
  status: "unpaid" | "paid";
  journal_entry_id: string | null;
  created_at: string;
  paid_at: string | null;
}

export function validateBillInput(db: Database.Database, input: Record<string, unknown>): ValidationResult {
  const missing: string[] = [];
  const invalid: string[] = [];

  for (const field of ["bill_number", "vendor_id", "ap_account_id", "amount", "due_date"] as const) {
    const value = input[field];
    if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) {
      missing.push(field);
    }
  }

  if (!missing.includes("vendor_id")) {
    const vendor = db.prepare("SELECT id FROM business_partners WHERE id = ? AND type = 'vendor'").get(input.vendor_id);
    if (!vendor) invalid.push("vendor_id (no vendor with that id exists)");
  }

  if (!missing.includes("ap_account_id")) {
    const account = db.prepare("SELECT id FROM accounts WHERE id = ?").get(input.ap_account_id);
    if (!account) invalid.push("ap_account_id (no account with that id exists)");
  }

  if (!missing.includes("amount") && !isValidAmount(input.amount)) {
    invalid.push("amount (expected a positive number)");
  }

  if (!missing.includes("due_date")) {
    if (typeof input.due_date !== "string" || !ISO_DATE.test(input.due_date)) {
      invalid.push("due_date (expected YYYY-MM-DD)");
    }
  }

  return { valid: missing.length === 0 && invalid.length === 0, missing, invalid };
}

export function createBill(db: Database.Database, input: BillInput, userId: string): Bill {
  const now = new Date().toISOString();
  const bill: Bill = {
    id: randomUUID(),
    bill_number: input.bill_number,
    vendor_id: input.vendor_id,
    ap_account_id: input.ap_account_id,
    amount_cents: Math.round(input.amount * 100),
    due_date: input.due_date,
    status: "unpaid",
    journal_entry_id: null,
    created_at: now,
    paid_at: null,
  };

  const insert = db.prepare(`
    INSERT INTO ap_bills (id, bill_number, vendor_id, ap_account_id, amount_cents, due_date, status, created_at)
    VALUES (@id, @bill_number, @vendor_id, @ap_account_id, @amount_cents, @due_date, @status, @created_at)
  `);

  const tx = db.transaction(() => {
    insert.run(bill);
    recordAuditEvent(db, {
      entityType: "ap_bill",
      entityId: bill.id,
      action: "ap_bill_created",
      userId,
      occurredAt: now,
      details: { bill_number: bill.bill_number, amount_cents: bill.amount_cents },
    });
  });

  try {
    tx();
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE") {
      throw new DuplicateBillError(bill.bill_number);
    }
    throw err;
  }

  return bill;
}

/**
 * Marks a bill paid by creating and posting a real, balanced journal entry
 * (debit the bill's AP account, reducing the liability; credit the cash
 * account) through the existing ledger pipeline. Idempotent, same as
 * payInvoice.
 */
export function payBill(db: Database.Database, billId: string, cashAccountId: string, userId: string): Bill {
  const bill = db.prepare("SELECT * FROM ap_bills WHERE id = ?").get(billId) as Bill | undefined;
  if (!bill) {
    throw new BillNotFoundError(billId);
  }

  if (bill.status === "paid") {
    return bill;
  }

  if (!cashAccountId || typeof cashAccountId !== "string") {
    throw new PaymentError(["cash_account_id is required"]);
  }
  const cashAccount = db.prepare("SELECT id FROM accounts WHERE id = ?").get(cashAccountId);
  if (!cashAccount) {
    throw new PaymentError([`cash_account_id "${cashAccountId}" does not reference an existing account`]);
  }

  const amount = bill.amount_cents / 100;
  const entry = createJournalEntry(
    db,
    {
      entry_date: new Date().toISOString().slice(0, 10),
      memo: `Payment sent for bill ${bill.bill_number}`,
      lines: [
        { account_id: bill.ap_account_id, debit: amount },
        { account_id: cashAccountId, credit: amount },
      ],
    },
    userId
  );
  postJournalEntry(db, entry.id, userId);

  const now = new Date().toISOString();
  db.prepare("UPDATE ap_bills SET status = 'paid', paid_at = @paid_at, journal_entry_id = @journal_entry_id WHERE id = @id").run({
    id: billId,
    paid_at: now,
    journal_entry_id: entry.id,
  });
  recordAuditEvent(db, {
    entityType: "ap_bill",
    entityId: billId,
    action: "ap_bill_paid",
    userId,
    occurredAt: now,
    details: { journal_entry_id: entry.id, amount_cents: bill.amount_cents },
  });

  return { ...bill, status: "paid", paid_at: now, journal_entry_id: entry.id };
}
