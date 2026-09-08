# Intelligent Accounting and Business Management System — Stories

20 stories across 5 releases, walking-skeleton first:
the earliest release proves the thinnest end-to-end path including the trust
spine, and later releases stack features on top of something already working.

## Before the releases — start here

- **[STORY-000](stories/STORY-000.md)** — Build your Command Center

The first thing you build, on day one, before any part of the system itself. It is
the page you keep open for the rest of the programme and demo from. It belongs to no
release and fulfils none of your requirements, because it is the window onto your
system rather than a part of it.

## r0 · Minimum Viable Accounting Core — weeks 1–4

**Goal:** Establish a stable accounting foundation with core functionalities.
**Done when you can show:** Demonstrate end-to-end accounting workflow with audit trail and balanced entries.

- **[STORY-001](stories/STORY-001.md)** — Create and configure a company profile
- **[STORY-002](stories/STORY-002.md)** — Create and maintain a chart of accounts
- **[STORY-003](stories/STORY-003.md)** — Create manual journal entries
- **[STORY-004](stories/STORY-004.md)** — Post transactions to the general ledger
- **[STORY-005](stories/STORY-005.md)** — Generate a trial balance
- **[STORY-006](stories/STORY-006.md)** — Produce financial statements
- **[STORY-018](stories/STORY-018.md)** — Ensure transactions follow balanced debit and credit rules
- **[STORY-019](stories/STORY-019.md)** — Provide an audit trail for all financial transactions

## r1 · Operational Accounting — weeks 5–8

**Goal:** Expand to operational accounting capabilities.
**Done when you can show:** Show integration of customer and vendor management with accounting core.

- **[STORY-007](stories/STORY-007.md)** — Manage customer and vendor profiles _(waits on STORY-006)_
- **[STORY-008](stories/STORY-008.md)** — Handle accounts receivable and payable _(waits on STORY-006)_
- **[STORY-009](stories/STORY-009.md)** — Manage sales and purchasing workflows _(waits on STORY-006)_
- **[STORY-010](stories/STORY-010.md)** — Manage cash and bank transactions _(waits on STORY-006)_
- **[STORY-020](stories/STORY-020.md)** — Implement user roles and permissions management _(waits on STORY-010)_

## r2 · Business Management — weeks 9–12

**Goal:** Introduce business management features like sales and purchasing.
**Done when you can show:** Demonstrate sales and purchasing workflows integrated with accounting.

- **[STORY-011](stories/STORY-011.md)** — Manage inventory _(waits on STORY-010)_
- **[STORY-012](stories/STORY-012.md)** — Support budgeting and cost centers _(waits on STORY-010)_
- **[STORY-013](stories/STORY-013.md)** — Manage branch operations _(waits on STORY-010)_

## r3 · Advanced Reporting and AI — weeks 13–16

**Goal:** Enhance reporting capabilities and introduce AI insights.
**Done when you can show:** Show AI-generated financial insights and advanced dashboards.

- **[STORY-014](stories/STORY-014.md)** — Provide advanced dashboards and reporting _(waits on STORY-013)_
- **[STORY-015](stories/STORY-015.md)** — Integrate AI for financial insights _(waits on STORY-013)_

## r4 · Scalability and Integration — weeks 17–20

**Goal:** Prepare for multi-branch operations and external integrations.
**Done when you can show:** Demonstrate branch management and data import/export features.

- **[STORY-016](stories/STORY-016.md)** — Support multi-branch operations _(waits on STORY-015)_
- **[STORY-017](stories/STORY-017.md)** — Implement data import/export functionality _(waits on STORY-015)_
