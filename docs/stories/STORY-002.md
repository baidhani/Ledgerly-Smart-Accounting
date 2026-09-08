# STORY-002 — Create and maintain a chart of accounts

As an accountant, I want to manage the chart of accounts so that I can organize financial transactions.

**Release:** r0 · Minimum Viable Accounting Core (weeks 1–4)
**Owner:** Product Owner
**Blocked by:** nothing — you can start this now

## The requirement this satisfies

- **REQ-002** (Functional, must) — The system must support the creation and maintenance of a chart of accounts.

## How to build it

Design the chart of accounts interface and implement CRUD operations.

## Failure paths you must handle

- Invalid account details
- Duplicate account
- Database update error

## Acceptance — your stop condition

Tick each box as it genuinely passes. This file is yours — the platform reads
the same criteria out of `.colaberry/progress.json`, which Claude Code keeps in
step (see the managed block in CLAUDE.md). Ticking something you have not
actually met only misleads you.

- [ ] Given a request to add an account, when I provide valid account details, then the system adds it to the chart of accounts.
- [ ] Given a request to add an account with invalid details, when I try to save, then the system rejects the request.
- [ ] Trust: All changes to the chart of accounts are logged in the audit trail.

When every box above is ticked, stop and show the demo.
