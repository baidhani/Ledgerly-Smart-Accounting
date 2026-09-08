import { Router } from "express";
import type Database from "better-sqlite3";
import {
  createInvoice,
  payInvoice,
  validateInvoiceInput,
  DuplicateInvoiceError,
  InvoiceNotFoundError,
  createBill,
  payBill,
  validateBillInput,
  DuplicateBillError,
  BillNotFoundError,
  PaymentError,
} from "../receivablesPayables";
import { getUserId } from "../actor";

export function receivablesPayablesRouter(db: Database.Database): Router {
  const router = Router();

  router.post("/invoices", (req, res) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const { valid, missing, invalid } = validateInvoiceInput(db, body);

    if (!valid) {
      res.status(400).json({ error: "Invoice is incomplete or invalid.", missing_fields: missing, invalid_fields: invalid });
      return;
    }

    try {
      const invoice = createInvoice(db, {
        invoice_number: body.invoice_number,
        customer_id: body.customer_id,
        ar_account_id: body.ar_account_id,
        amount: body.amount,
        due_date: body.due_date,
      }, getUserId(req));
      res.status(201).json(invoice);
    } catch (err) {
      if (err instanceof DuplicateInvoiceError) {
        res.status(409).json({ error: err.message });
        return;
      }
      console.error(JSON.stringify({
        level: "error",
        event: "invoice_save_failed",
        error_class: err instanceof Error ? err.constructor.name : "UnknownError",
        outcome: "failure",
      }));
      res.status(500).json({ error: "Could not save the invoice. Please try again." });
    }
  });

  router.post("/invoices/:id/pay", (req, res) => {
    try {
      const invoice = payInvoice(db, req.params.id, req.body?.cash_account_id, getUserId(req));
      res.status(200).json(invoice);
    } catch (err) {
      if (err instanceof InvoiceNotFoundError) {
        res.status(404).json({ error: err.message });
        return;
      }
      if (err instanceof PaymentError) {
        res.status(400).json({ error: err.message, reasons: err.reasons });
        return;
      }
      console.error(JSON.stringify({
        level: "error",
        event: "invoice_payment_failed",
        error_class: err instanceof Error ? err.constructor.name : "UnknownError",
        outcome: "failure",
      }));
      res.status(500).json({ error: "Could not process the payment. Please try again." });
    }
  });

  router.post("/bills", (req, res) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const { valid, missing, invalid } = validateBillInput(db, body);

    if (!valid) {
      res.status(400).json({ error: "Bill is incomplete or invalid.", missing_fields: missing, invalid_fields: invalid });
      return;
    }

    try {
      const bill = createBill(db, {
        bill_number: body.bill_number,
        vendor_id: body.vendor_id,
        ap_account_id: body.ap_account_id,
        amount: body.amount,
        due_date: body.due_date,
      }, getUserId(req));
      res.status(201).json(bill);
    } catch (err) {
      if (err instanceof DuplicateBillError) {
        res.status(409).json({ error: err.message });
        return;
      }
      console.error(JSON.stringify({
        level: "error",
        event: "bill_save_failed",
        error_class: err instanceof Error ? err.constructor.name : "UnknownError",
        outcome: "failure",
      }));
      res.status(500).json({ error: "Could not save the bill. Please try again." });
    }
  });

  router.post("/bills/:id/pay", (req, res) => {
    try {
      const bill = payBill(db, req.params.id, req.body?.cash_account_id, getUserId(req));
      res.status(200).json(bill);
    } catch (err) {
      if (err instanceof BillNotFoundError) {
        res.status(404).json({ error: err.message });
        return;
      }
      if (err instanceof PaymentError) {
        res.status(400).json({ error: err.message, reasons: err.reasons });
        return;
      }
      console.error(JSON.stringify({
        level: "error",
        event: "bill_payment_failed",
        error_class: err instanceof Error ? err.constructor.name : "UnknownError",
        outcome: "failure",
      }));
      res.status(500).json({ error: "Could not process the payment. Please try again." });
    }
  });

  return router;
}
