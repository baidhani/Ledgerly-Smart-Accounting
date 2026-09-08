import express, { Express } from "express";
import type Database from "better-sqlite3";
import { companiesRouter } from "./routes/companies";
import { accountsRouter } from "./routes/accounts";
import { ledgerRouter } from "./routes/ledger";
import { reportingRouter } from "./routes/reporting";
import { auditRouter } from "./routes/audit";
import { businessPartnersRouter } from "./routes/businessPartners";
import { receivablesPayablesRouter } from "./routes/receivablesPayables";
import { salesPurchasingRouter } from "./routes/salesPurchasing";
import { bankTransactionsRouter } from "./routes/bankTransactions";
import { rolesPermissionsRouter } from "./routes/rolesPermissions";
import { inventoryManagementRouter } from "./routes/inventoryManagement";

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
  app.use(businessPartnersRouter(db));
  app.use(receivablesPayablesRouter(db));
  app.use(salesPurchasingRouter(db));
  app.use(bankTransactionsRouter(db));
  app.use(rolesPermissionsRouter(db));
  app.use(inventoryManagementRouter(db));

  return app;
}
