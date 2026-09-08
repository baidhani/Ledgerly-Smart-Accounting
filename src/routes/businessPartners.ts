import { Router } from "express";
import type Database from "better-sqlite3";
import { createBusinessPartner, validateBusinessPartnerInput, DuplicateBusinessPartnerError } from "../businessPartners";
import { getUserId } from "../actor";

function makePartnerHandler(db: Database.Database, type: "customer" | "vendor") {
  return (req: import("express").Request, res: import("express").Response) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    // The route's own type wins — a client cannot mis-set type in the body
    // to create the wrong kind of profile via this endpoint.
    const candidate = { type, name: body.name, email: body.email, phone: body.phone };
    const { valid, missing, invalid } = validateBusinessPartnerInput(candidate);

    if (!valid) {
      res.status(400).json({
        error: `${type === "customer" ? "Customer" : "Vendor"} profile is incomplete or invalid.`,
        missing_fields: missing,
        invalid_fields: invalid,
      });
      return;
    }

    try {
      const partner = createBusinessPartner(db, candidate, getUserId(req));
      res.status(201).json(partner);
    } catch (err) {
      if (err instanceof DuplicateBusinessPartnerError) {
        res.status(409).json({ error: err.message });
        return;
      }
      console.error(JSON.stringify({
        level: "error",
        event: "business_partner_save_failed",
        error_class: err instanceof Error ? err.constructor.name : "UnknownError",
        outcome: "failure",
      }));
      res.status(500).json({ error: `Could not save the ${type} profile. Please try again.` });
    }
  };
}

export function businessPartnersRouter(db: Database.Database): Router {
  const router = Router();

  router.post("/customers", makePartnerHandler(db, "customer"));
  router.post("/vendors", makePartnerHandler(db, "vendor"));

  return router;
}
