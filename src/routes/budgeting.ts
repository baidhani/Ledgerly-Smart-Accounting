import { Router } from "express";
import type Database from "better-sqlite3";
import {
  createCostCenter,
  validateCostCenterInput,
  DuplicateCostCenterError,
  createBudget,
  validateBudgetInput,
  DuplicateBudgetError,
} from "../budgeting";
import { getUserId } from "../actor";

export function budgetingRouter(db: Database.Database): Router {
  const router = Router();

  router.post("/cost-centers", (req, res) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const { valid, missing, invalid } = validateCostCenterInput(body);

    if (!valid) {
      res.status(400).json({ error: "Cost center is incomplete or invalid.", missing_fields: missing, invalid_fields: invalid });
      return;
    }

    try {
      const costCenter = createCostCenter(db, { code: body.code, name: body.name }, getUserId(req));
      res.status(201).json(costCenter);
    } catch (err) {
      if (err instanceof DuplicateCostCenterError) {
        res.status(409).json({ error: err.message });
        return;
      }
      console.error(JSON.stringify({
        level: "error",
        event: "cost_center_save_failed",
        error_class: err instanceof Error ? err.constructor.name : "UnknownError",
        outcome: "failure",
      }));
      res.status(500).json({ error: "Could not save the cost center. Please try again." });
    }
  });

  router.post("/budgets", (req, res) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const { valid, missing, invalid } = validateBudgetInput(db, body);

    if (!valid) {
      res.status(400).json({ error: "Budget allocation is incomplete or invalid.", missing_fields: missing, invalid_fields: invalid });
      return;
    }

    try {
      const budget = createBudget(
        db,
        {
          cost_center_id: body.cost_center_id,
          account_id: body.account_id,
          period: body.period,
          amount_cents: body.amount_cents,
        },
        getUserId(req)
      );
      res.status(201).json(budget);
    } catch (err) {
      if (err instanceof DuplicateBudgetError) {
        res.status(409).json({ error: err.message });
        return;
      }
      console.error(JSON.stringify({
        level: "error",
        event: "budget_save_failed",
        error_class: err instanceof Error ? err.constructor.name : "UnknownError",
        outcome: "failure",
      }));
      res.status(500).json({ error: "Could not save the budget allocation. Please try again." });
    }
  });

  return router;
}
