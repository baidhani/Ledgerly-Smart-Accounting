import { Router } from "express";
import type Database from "better-sqlite3";
import {
  createInventoryItem,
  validateInventoryItemInput,
  DuplicateInventoryItemError,
  createSalesOrder,
  processSalesOrder,
  validateSalesOrderInput,
  DuplicateSalesOrderError,
  SalesOrderNotFoundError,
  createPurchaseOrder,
  processPurchaseOrder,
  validatePurchaseOrderInput,
  DuplicatePurchaseOrderError,
  PurchaseOrderNotFoundError,
  InventoryError,
} from "../salesPurchasing";
import { getUserId } from "../actor";

export function salesPurchasingRouter(db: Database.Database): Router {
  const router = Router();

  router.post("/inventory-items", (req, res) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const { valid, missing, invalid } = validateInventoryItemInput(body);

    if (!valid) {
      res.status(400).json({ error: "Inventory item is incomplete or invalid.", missing_fields: missing, invalid_fields: invalid });
      return;
    }

    try {
      const item = createInventoryItem(db, { sku: body.sku, name: body.name, quantity_on_hand: body.quantity_on_hand }, getUserId(req));
      res.status(201).json(item);
    } catch (err) {
      if (err instanceof DuplicateInventoryItemError) {
        res.status(409).json({ error: err.message });
        return;
      }
      console.error(JSON.stringify({
        level: "error",
        event: "inventory_item_save_failed",
        error_class: err instanceof Error ? err.constructor.name : "UnknownError",
        outcome: "failure",
      }));
      res.status(500).json({ error: "Could not save the inventory item. Please try again." });
    }
  });

  router.post("/sales-orders", (req, res) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const { valid, missing, invalid } = validateSalesOrderInput(db, body);

    if (!valid) {
      res.status(400).json({ error: "Sales order is incomplete or invalid.", missing_fields: missing, invalid_fields: invalid });
      return;
    }

    try {
      const order = createSalesOrder(db, { order_number: body.order_number, customer_id: body.customer_id, lines: body.lines }, getUserId(req));
      res.status(201).json(order);
    } catch (err) {
      if (err instanceof DuplicateSalesOrderError) {
        res.status(409).json({ error: err.message });
        return;
      }
      console.error(JSON.stringify({
        level: "error",
        event: "sales_order_save_failed",
        error_class: err instanceof Error ? err.constructor.name : "UnknownError",
        outcome: "failure",
      }));
      res.status(500).json({ error: "Could not save the sales order. Please try again." });
    }
  });

  router.post("/sales-orders/:id/process", (req, res) => {
    try {
      const order = processSalesOrder(db, req.params.id, getUserId(req));
      res.status(200).json(order);
    } catch (err) {
      if (err instanceof SalesOrderNotFoundError) {
        res.status(404).json({ error: err.message });
        return;
      }
      if (err instanceof InventoryError) {
        res.status(400).json({ error: err.message, reasons: err.reasons });
        return;
      }
      console.error(JSON.stringify({
        level: "error",
        event: "sales_order_process_failed",
        error_class: err instanceof Error ? err.constructor.name : "UnknownError",
        outcome: "failure",
      }));
      res.status(500).json({ error: "Could not process the sales order. Please try again." });
    }
  });

  router.post("/purchase-orders", (req, res) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const { valid, missing, invalid } = validatePurchaseOrderInput(db, body);

    if (!valid) {
      res.status(400).json({ error: "Purchase order is incomplete or invalid.", missing_fields: missing, invalid_fields: invalid });
      return;
    }

    try {
      const order = createPurchaseOrder(db, { order_number: body.order_number, vendor_id: body.vendor_id, lines: body.lines }, getUserId(req));
      res.status(201).json(order);
    } catch (err) {
      if (err instanceof DuplicatePurchaseOrderError) {
        res.status(409).json({ error: err.message });
        return;
      }
      console.error(JSON.stringify({
        level: "error",
        event: "purchase_order_save_failed",
        error_class: err instanceof Error ? err.constructor.name : "UnknownError",
        outcome: "failure",
      }));
      res.status(500).json({ error: "Could not save the purchase order. Please try again." });
    }
  });

  router.post("/purchase-orders/:id/process", (req, res) => {
    try {
      const order = processPurchaseOrder(db, req.params.id, getUserId(req));
      res.status(200).json(order);
    } catch (err) {
      if (err instanceof PurchaseOrderNotFoundError) {
        res.status(404).json({ error: err.message });
        return;
      }
      console.error(JSON.stringify({
        level: "error",
        event: "purchase_order_process_failed",
        error_class: err instanceof Error ? err.constructor.name : "UnknownError",
        outcome: "failure",
      }));
      res.status(500).json({ error: "Could not process the purchase order. Please try again." });
    }
  });

  return router;
}
