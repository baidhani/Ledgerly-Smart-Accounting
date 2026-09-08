import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "ledgerly.db");

export function openDb(dbPath: string = DB_PATH): Database.Database {
  if (dbPath !== ":memory:") {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      legal_entity_type TEXT NOT NULL,
      fiscal_year_start TEXT NOT NULL,
      base_currency TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      user_id TEXT,
      details TEXT
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      parent_account_id TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (parent_account_id) REFERENCES accounts(id)
    );

    CREATE TABLE IF NOT EXISTS journal_entries (
      id TEXT PRIMARY KEY,
      entry_date TEXT NOT NULL,
      memo TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      posted_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS journal_lines (
      id TEXT PRIMARY KEY,
      journal_entry_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      debit_cents INTEGER NOT NULL DEFAULT 0,
      credit_cents INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id),
      FOREIGN KEY (account_id) REFERENCES accounts(id),
      CHECK (debit_cents >= 0 AND credit_cents >= 0),
      CHECK (NOT (debit_cents > 0 AND credit_cents > 0)),
      CHECK (debit_cents > 0 OR credit_cents > 0)
    );

    CREATE TABLE IF NOT EXISTS general_ledger (
      id TEXT PRIMARY KEY,
      journal_entry_id TEXT NOT NULL,
      journal_line_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      debit_cents INTEGER NOT NULL DEFAULT 0,
      credit_cents INTEGER NOT NULL DEFAULT 0,
      posted_at TEXT NOT NULL,
      FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id),
      FOREIGN KEY (journal_line_id) REFERENCES journal_lines(id),
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    );

    CREATE TABLE IF NOT EXISTS business_partners (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (type, name)
    );

    CREATE TABLE IF NOT EXISTS ar_invoices (
      id TEXT PRIMARY KEY,
      invoice_number TEXT NOT NULL UNIQUE,
      customer_id TEXT NOT NULL,
      ar_account_id TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      due_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'unpaid',
      journal_entry_id TEXT,
      created_at TEXT NOT NULL,
      paid_at TEXT,
      FOREIGN KEY (customer_id) REFERENCES business_partners(id),
      FOREIGN KEY (ar_account_id) REFERENCES accounts(id),
      FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id),
      CHECK (amount_cents > 0)
    );

    CREATE TABLE IF NOT EXISTS ap_bills (
      id TEXT PRIMARY KEY,
      bill_number TEXT NOT NULL UNIQUE,
      vendor_id TEXT NOT NULL,
      ap_account_id TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      due_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'unpaid',
      journal_entry_id TEXT,
      created_at TEXT NOT NULL,
      paid_at TEXT,
      FOREIGN KEY (vendor_id) REFERENCES business_partners(id),
      FOREIGN KEY (ap_account_id) REFERENCES accounts(id),
      FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id),
      CHECK (amount_cents > 0)
    );

    -- Minimal walking-skeleton inventory surface: only what a sales/purchase
    -- order needs to update. No dedicated inventory CRUD here — that's
    -- STORY-011's job, not this one's.
    CREATE TABLE IF NOT EXISTS inventory_items (
      id TEXT PRIMARY KEY,
      sku TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      quantity_on_hand INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK (quantity_on_hand >= 0)
    );

    CREATE TABLE IF NOT EXISTS sales_orders (
      id TEXT PRIMARY KEY,
      order_number TEXT NOT NULL UNIQUE,
      customer_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL,
      processed_at TEXT,
      FOREIGN KEY (customer_id) REFERENCES business_partners(id)
    );

    CREATE TABLE IF NOT EXISTS sales_order_lines (
      id TEXT PRIMARY KEY,
      sales_order_id TEXT NOT NULL,
      inventory_item_id TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price_cents INTEGER NOT NULL,
      FOREIGN KEY (sales_order_id) REFERENCES sales_orders(id),
      FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id),
      CHECK (quantity > 0),
      CHECK (unit_price_cents > 0)
    );

    CREATE TABLE IF NOT EXISTS purchase_orders (
      id TEXT PRIMARY KEY,
      order_number TEXT NOT NULL UNIQUE,
      vendor_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL,
      processed_at TEXT,
      FOREIGN KEY (vendor_id) REFERENCES business_partners(id)
    );

    CREATE TABLE IF NOT EXISTS purchase_order_lines (
      id TEXT PRIMARY KEY,
      purchase_order_id TEXT NOT NULL,
      inventory_item_id TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_cost_cents INTEGER NOT NULL,
      FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id),
      FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id),
      CHECK (quantity > 0),
      CHECK (unit_cost_cents > 0)
    );

    CREATE TABLE IF NOT EXISTS bank_transactions (
      id TEXT PRIMARY KEY,
      reference TEXT NOT NULL UNIQUE,
      cash_account_id TEXT NOT NULL,
      contra_account_id TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      direction TEXT NOT NULL,
      transaction_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'unreconciled',
      journal_entry_id TEXT,
      created_at TEXT NOT NULL,
      reconciled_at TEXT,
      FOREIGN KEY (cash_account_id) REFERENCES accounts(id),
      FOREIGN KEY (contra_account_id) REFERENCES accounts(id),
      FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id),
      CHECK (amount_cents > 0),
      CHECK (direction IN ('deposit', 'withdrawal'))
    );

    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS permissions (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS role_permissions (
      id TEXT PRIMARY KEY,
      role_id TEXT NOT NULL,
      permission_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (role_id) REFERENCES roles(id),
      FOREIGN KEY (permission_id) REFERENCES permissions(id),
      UNIQUE (role_id, permission_id)
    );

    -- One role per user_id. user_id is the same string getUserId() already
    -- extracts from X-User-Id — no separate "users" table, since no
    -- authentication exists yet (same compatibility-mode reasoning as
    -- audit_log.user_id from STORY-019).
    CREATE TABLE IF NOT EXISTS user_roles (
      user_id TEXT PRIMARY KEY,
      role_id TEXT NOT NULL,
      assigned_at TEXT NOT NULL,
      FOREIGN KEY (role_id) REFERENCES roles(id)
    );

    -- Separate from audit_log (financial transactions) — this is the
    -- brief's own named log for user/role/permission management activity.
    CREATE TABLE IF NOT EXISTS user_activity_log (
      id TEXT PRIMARY KEY,
      admin_user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      details TEXT
    );

    -- Direct inventory adjustments (count corrections, write-offs) — the
    -- real management surface STORY-009 deliberately deferred, distinct
    -- from quantity_on_hand changing as a side effect of order processing.
    CREATE TABLE IF NOT EXISTS stock_updates (
      id TEXT PRIMARY KEY,
      reference TEXT NOT NULL UNIQUE,
      inventory_item_id TEXT NOT NULL,
      quantity_change INTEGER NOT NULL,
      reason TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id),
      CHECK (quantity_change != 0)
    );

    CREATE TABLE IF NOT EXISTS cost_centers (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- A budget allocation: how much a cost center may spend against a given
    -- account in a given period. (cost_center_id, account_id, period) is
    -- the natural key — re-submitting the same allocation is a duplicate,
    -- not a silent second budget for the same thing.
    CREATE TABLE IF NOT EXISTS budgets (
      id TEXT PRIMARY KEY,
      cost_center_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      period TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (cost_center_id) REFERENCES cost_centers(id),
      FOREIGN KEY (account_id) REFERENCES accounts(id),
      CHECK (amount_cents > 0),
      UNIQUE (cost_center_id, account_id, period)
    );
  `);

  addColumnIfMissing(db, "journal_entries", "status", "TEXT NOT NULL DEFAULT 'draft'");
  addColumnIfMissing(db, "journal_entries", "posted_at", "TEXT");
  addColumnIfMissing(db, "audit_log", "user_id", "TEXT");
}

function addColumnIfMissing(db: Database.Database, table: string, column: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  const exists = columns.some((c) => c.name === column);
  if (!exists) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
