import express, { Express } from "express";
import type Database from "better-sqlite3";
import { companiesRouter } from "./routes/companies";
import { accountsRouter } from "./routes/accounts";
import { ledgerRouter } from "./routes/ledger";
import { reportingRouter } from "./routes/reporting";
import { auditRouter } from "./routes/audit";

export function createApp(db: Database.Database): Express {
  const app = express();
  app.use(express.json());
  app.locals.db = db;

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.use(companiesRouter(db));
  app.use(accountsRouter(db));
  app.use(ledgerRouter(db));
  app.use(reportingRouter(db));
  app.use(auditRouter(db));

  return app;
}
