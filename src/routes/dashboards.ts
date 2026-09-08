import { Router } from "express";
import type Database from "better-sqlite3";
import { createDashboard, validateDashboardInput, DuplicateDashboardError, renderDashboard, DashboardNotFoundError } from "../dashboards";
import { getUserId } from "../actor";

export function dashboardsRouter(db: Database.Database): Router {
  const router = Router();

  router.post("/dashboards", (req, res) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const { valid, missing, invalid } = validateDashboardInput(body);

    if (!valid) {
      res.status(400).json({ error: "Dashboard configuration is incomplete or invalid.", missing_fields: missing, invalid_fields: invalid });
      return;
    }

    try {
      const dashboard = createDashboard(db, { name: body.name, widgets: body.widgets }, getUserId(req));
      res.status(201).json(dashboard);
    } catch (err) {
      if (err instanceof DuplicateDashboardError) {
        res.status(409).json({ error: err.message });
        return;
      }
      console.error(JSON.stringify({
        level: "error",
        event: "dashboard_save_failed",
        error_class: err instanceof Error ? err.constructor.name : "UnknownError",
        outcome: "failure",
      }));
      res.status(500).json({ error: "Could not save the dashboard configuration. Please try again." });
    }
  });

  router.get("/dashboards/:id/render", (req, res) => {
    try {
      const result = renderDashboard(db, req.params.id, getUserId(req));
      res.status(200).json(result);
    } catch (err) {
      if (err instanceof DashboardNotFoundError) {
        res.status(404).json({ error: err.message });
        return;
      }
      console.error(JSON.stringify({
        level: "error",
        event: "dashboard_render_failed",
        error_class: err instanceof Error ? err.constructor.name : "UnknownError",
        outcome: "failure",
      }));
      res.status(500).json({ error: "Could not generate the dashboard report. Please try again." });
    }
  });

  return router;
}
