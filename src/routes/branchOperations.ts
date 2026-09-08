import { Router } from "express";
import type Database from "better-sqlite3";
import {
  createBranch,
  validateBranchCreateInput,
  DuplicateBranchError,
  updateBranch,
  validateBranchUpdateInput,
  BranchNotFoundError,
  validateBulkBranchInput,
  bulkConfigureBranches,
} from "../branchOperations";
import { getUserId } from "../actor";

export function branchOperationsRouter(db: Database.Database): Router {
  const router = Router();

  router.post("/branches", (req, res) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const { valid, missing, invalid } = validateBranchCreateInput(body);

    if (!valid) {
      res.status(400).json({ error: "Branch is incomplete or invalid.", missing_fields: missing, invalid_fields: invalid });
      return;
    }

    try {
      const branch = createBranch(db, { code: body.code, name: body.name, manager_name: body.manager_name }, getUserId(req));
      res.status(201).json(branch);
    } catch (err) {
      if (err instanceof DuplicateBranchError) {
        res.status(409).json({ error: err.message });
        return;
      }
      console.error(JSON.stringify({
        level: "error",
        event: "branch_save_failed",
        error_class: err instanceof Error ? err.constructor.name : "UnknownError",
        outcome: "failure",
      }));
      res.status(500).json({ error: "Could not save the branch. Please try again." });
    }
  });

  router.post("/branches/bulk-configure", (req, res) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const { valid, errors } = validateBulkBranchInput(db, body.branches);

    if (!valid) {
      res.status(400).json({ error: "Multi-branch setup request is incomplete or invalid.", errors });
      return;
    }

    try {
      const branches = bulkConfigureBranches(db, body.branches, getUserId(req));
      res.status(201).json({ branches });
    } catch (err) {
      if (err instanceof DuplicateBranchError) {
        res.status(409).json({ error: err.message });
        return;
      }
      console.error(JSON.stringify({
        level: "error",
        event: "bulk_branch_configure_failed",
        error_class: err instanceof Error ? err.constructor.name : "UnknownError",
        outcome: "failure",
      }));
      res.status(500).json({ error: "Could not save the multi-branch setup. No branches were created." });
    }
  });

  router.patch("/branches/:id", (req, res) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const { valid, missing, invalid } = validateBranchUpdateInput(db, req.params.id, body);

    if (!valid) {
      const status = invalid.some((f) => f.startsWith("id (")) ? 404 : 400;
      if (status === 404) {
        res.status(404).json({ error: "No branch with that id exists." });
        return;
      }
      res.status(400).json({ error: "Branch update is incomplete or invalid.", missing_fields: missing, invalid_fields: invalid });
      return;
    }

    try {
      const branch = updateBranch(
        db,
        req.params.id,
        { name: body.name, manager_name: body.manager_name, is_active: body.is_active },
        getUserId(req)
      );
      res.status(200).json(branch);
    } catch (err) {
      if (err instanceof BranchNotFoundError) {
        res.status(404).json({ error: err.message });
        return;
      }
      console.error(JSON.stringify({
        level: "error",
        event: "branch_update_failed",
        error_class: err instanceof Error ? err.constructor.name : "UnknownError",
        outcome: "failure",
      }));
      res.status(500).json({ error: "Could not update the branch. Please try again." });
    }
  });

  return router;
}
