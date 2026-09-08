import { Router } from "express";
import type Database from "better-sqlite3";
import { applyStockUpdate, validateStockUpdateInput, DuplicateStockUpdateError } from "../inventoryManagement";
import { getUserId } from "../actor";

export function inventoryManagementRouter(db: Database.Database): Router {
  const router = Router();

  router.post("/stock-updates", (req, res) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const { valid, missing, invalid } = validateStockUpdateInput(db, body);

    if (!valid) {
      res.status(400).json({ error: "Stock update is incomplete or invalid.", missing_fields: missing, invalid_fields: invalid });
      return;
    }

    try {
      const update = applyStockUpdate(
        db,
        {
          reference: body.reference,
          inventory_item_id: body.inventory_item_id,
          quantity_change: body.quantity_change,
          reason: body.reason,
        },
        getUserId(req)
      );
      res.status(201).json(update);
    } catch (err) {
      if (err instanceof DuplicateStockUpdateError) {
        res.status(409).json({ error: err.message });
        return;
      }
      console.error(JSON.stringify({
        level: "error",
        event: "stock_update_save_failed",
        error_class: err instanceof Error ? err.constructor.name : "UnknownError",
        outcome: "failure",
      }));
      res.status(500).json({ error: "Could not save the stock update. Please try again." });
    }
  });

  return router;
}
