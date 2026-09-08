import { Router } from "express";
import type Database from "better-sqlite3";
import { createCompanyProfile, validateCompanyProfileInput } from "../companies";
import { getUserId } from "../actor";

export function companiesRouter(db: Database.Database): Router {
  const router = Router();

  router.post("/companies", (req, res) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const { valid, missing, invalid } = validateCompanyProfileInput(body);

    if (!valid) {
      res.status(400).json({
        error: "Company profile is incomplete or invalid.",
        missing_fields: missing,
        invalid_fields: invalid,
      });
      return;
    }

    try {
      const company = createCompanyProfile(db, {
        name: body.name,
        legal_entity_type: body.legal_entity_type,
        fiscal_year_start: body.fiscal_year_start,
        base_currency: body.base_currency,
      }, getUserId(req));
      res.status(201).json(company);
    } catch (err) {
      console.error(JSON.stringify({
        level: "error",
        event: "company_profile_save_failed",
        error_class: err instanceof Error ? err.constructor.name : "UnknownError",
        outcome: "failure",
      }));
      res.status(500).json({ error: "Could not save the company profile. Please try again." });
    }
  });

  return router;
}
