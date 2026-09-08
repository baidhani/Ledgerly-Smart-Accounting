import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import type Database from "better-sqlite3";
import { createApp } from "../src/app";
import { openDb } from "../src/db";

describe("Accounts receivable and payable", () => {
  let db: Database.Database;
  let customerId: string;
  let vendorId: string;
  let arAccountId: string;
  let apAccountId: string;
  let cashAccountId: string;

  beforeEach(() => {
    db = openDb(":memory:");
    const now = new Date().toISOString();
    db.prepare(
      "INSERT INTO business_partners (id, type, name, created_at, updated_at) VALUES ('cust1','customer','Acme',@now,@now)"
    ).run({ now });
    db.prepare(
      "INSERT INTO business_partners (id, type, name, created_at, updated_at) VALUES ('vend1','vendor','Supplier Co',@now,@now)"
    ).run({ now });
    db.prepare(
      "INSERT INTO accounts (id, code, name, type, created_at, updated_at) VALUES ('ar1','1200','Accounts Receivable','asset',@now,@now)"
    ).run({ now });
    db.prepare(
      "INSERT INTO accounts (id, code, name, type, created_at, updated_at) VALUES ('ap1','2100','Accounts Payable','liability',@now,@now)"
    ).run({ now });
    db.prepare(
      "INSERT INTO accounts (id, code, name, type, created_at, updated_at) VALUES ('cash1','1000','Cash','asset',@now,@now)"
    ).run({ now });
    customerId = "cust1";
    vendorId = "vend1";
    arAccountId = "ar1";
    apAccountId = "ap1";
    cashAccountId = "cash1";
  });

  afterEach(() => {
    if (db.open) db.close();
  });

  describe("POST /invoices/:id/pay", () => {
    async function createInvoice(app: ReturnType<typeof createApp>, invoiceNumber = "INV-001") {
      const res = await request(app).post("/invoices").send({
        invoice_number: invoiceNumber,
        customer_id: customerId,
        ar_account_id: arAccountId,
        amount: 500,
        due_date: "2026-10-01",
      });
      return res.body.id as string;
    }

    it("updates accounts receivable via a real, balanced journal entry (happy path)", async () => {
      const app = createApp(db);
      const invoiceId = await createInvoice(app);

      const res = await request(app).post(`/invoices/${invoiceId}/pay`).send({ cash_account_id: cashAccountId });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("paid");
      expect(res.body.journal_entry_id).toBeTruthy();

      const glRows = db
        .prepare("SELECT account_id, debit_cents, credit_cents FROM general_ledger WHERE journal_entry_id = ?")
        .all(res.body.journal_entry_id) as { account_id: string; debit_cents: number; credit_cents: number }[];
      expect(glRows).toHaveLength(2);
      const totalDebit = glRows.reduce((s, r) => s + r.debit_cents, 0);
      const totalCredit = glRows.reduce((s, r) => s + r.credit_cents, 0);
      expect(totalDebit).toBe(50000);
      expect(totalCredit).toBe(50000);

      const cashLine = glRows.find((r) => r.account_id === cashAccountId);
      const arLine = glRows.find((r) => r.account_id === arAccountId);
      expect(cashLine?.debit_cents).toBe(50000);
      expect(arLine?.credit_cents).toBe(50000);
    });

    it("alerts on a payment error when the invoice does not exist (failure path)", async () => {
      const app = createApp(db);

      const res = await request(app).post("/invoices/does-not-exist/pay").send({ cash_account_id: cashAccountId });

      expect(res.status).toBe(404);
      expect(res.body.error).toBeTruthy();
    });

    it("alerts on a payment error when the cash account is invalid (failure path)", async () => {
      const app = createApp(db);
      const invoiceId = await createInvoice(app);

      const res = await request(app).post(`/invoices/${invoiceId}/pay`).send({ cash_account_id: "not-real" });

      expect(res.status).toBe(400);
      expect(res.body.reasons.join(" ")).toMatch(/does not reference an existing account/);

      const invoice = db.prepare("SELECT status FROM ar_invoices WHERE id = ?").get(invoiceId) as { status: string };
      expect(invoice.status).toBe("unpaid");
    });

    it("is idempotent: paying an already-paid invoice again does not create a second journal entry", async () => {
      const app = createApp(db);
      const invoiceId = await createInvoice(app);

      const first = await request(app).post(`/invoices/${invoiceId}/pay`).send({ cash_account_id: cashAccountId });
      const second = await request(app).post(`/invoices/${invoiceId}/pay`).send({ cash_account_id: cashAccountId });

      expect(second.status).toBe(200);
      expect(second.body).toEqual(first.body);

      const glCount = (db.prepare("SELECT COUNT(*) c FROM general_ledger").get() as { c: number }).c;
      expect(glCount).toBe(2);
    });

    it("rejects a duplicate invoice number without saving (failure path)", async () => {
      const app = createApp(db);
      await createInvoice(app, "INV-DUP");

      const res = await request(app).post("/invoices").send({
        invoice_number: "INV-DUP",
        customer_id: customerId,
        ar_account_id: arAccountId,
        amount: 100,
        due_date: "2026-10-01",
      });

      expect(res.status).toBe(409);
      const count = db.prepare("SELECT COUNT(*) c FROM ar_invoices").get() as { c: number };
      expect(count.c).toBe(1);
    });

    it("logs invoice creation and payment to the audit trail (Trust criterion)", async () => {
      const app = createApp(db);
      const invoiceId = await createInvoice(app);
      await request(app).post(`/invoices/${invoiceId}/pay`).send({ cash_account_id: cashAccountId });

      const events = db
        .prepare("SELECT action FROM audit_log WHERE entity_type = 'ar_invoice' AND entity_id = ?")
        .all(invoiceId) as { action: string }[];
      const actions = events.map((e) => e.action);
      expect(actions).toContain("ar_invoice_created");
      expect(actions).toContain("ar_invoice_paid");
    });
  });

  describe("POST /bills/:id/pay", () => {
    it("updates accounts payable via a real, balanced journal entry (happy path)", async () => {
      const app = createApp(db);
      const created = await request(app).post("/bills").send({
        bill_number: "BILL-001",
        vendor_id: vendorId,
        ap_account_id: apAccountId,
        amount: 300,
        due_date: "2026-10-01",
      });

      const res = await request(app).post(`/bills/${created.body.id}/pay`).send({ cash_account_id: cashAccountId });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("paid");

      const glRows = db
        .prepare("SELECT account_id, debit_cents, credit_cents FROM general_ledger WHERE journal_entry_id = ?")
        .all(res.body.journal_entry_id) as { account_id: string; debit_cents: number; credit_cents: number }[];
      const apLine = glRows.find((r) => r.account_id === apAccountId);
      const cashLine = glRows.find((r) => r.account_id === cashAccountId);
      expect(apLine?.debit_cents).toBe(30000);
      expect(cashLine?.credit_cents).toBe(30000);
    });
  });
});
