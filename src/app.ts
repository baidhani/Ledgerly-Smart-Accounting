import express, { Express } from "express";
import type Database from "better-sqlite3";

export function createApp(db: Database.Database): Express {
  const app = express();
  app.use(express.json());
  app.locals.db = db;

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  return app;
}
