import { Router } from "express";
import type Database from "better-sqlite3";
import { createAccount, validateAccountInput, DuplicateAccountError } from "../accounts";
import { getUserId } from "../actor";
import { requirePermission } from "./rolesPermissions";

export function accountsRouter(db: Database.Database): Router {
  const router = Router();

  router.post("/accounts", requirePermission(db, "accounts:create"), (req, res) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};

    try {
      const { valid, missing, invalid } = validateAccountInput(db, body);

      if (!valid) {
        res.status(400).json({
          error: "Account details are incomplete or invalid.",
          missing_fields: missing,
          invalid_fields: invalid,
        });
        return;
      }

      const account = createAccount(db, {
        code: body.code,
        name: body.name,
        type: body.type,
        parent_account_id: body.parent_account_id ?? null,
      }, getUserId(req));
      res.status(201).json(account);
    } catch (err) {
      if (err instanceof DuplicateAccountError) {
        res.status(409).json({ error: err.message });
        return;
      }
      console.error(JSON.stringify({
        level: "error",
        event: "account_save_failed",
        error_class: err instanceof Error ? err.constructor.name : "UnknownError",
        outcome: "failure",
      }));
      res.status(500).json({ error: "Could not save the account. Please try again." });
    }
  });

  return router;
}
