# STORY-010 — Manage cash and bank transactions

As a financial manager, I want to manage cash and bank transactions so that I can maintain accurate cash flow records.

**Release:** r1 · Operational Accounting (weeks 5–8)
**Owner:** Product Owner
**Blocked by:** STORY-006

## The requirement this satisfies

- **REQ-016** (Functional, should) — The system must manage cash and bank transactions.

## How to build it

Implement cash and bank transaction reconciliation logic.

## Failure paths you must handle

- Reconciliation error
- Duplicate transaction
- Database update error

## Acceptance — your stop condition

Tick each box as it genuinely passes. This file is yours — the platform reads
the same criteria out of `.colaberry/progress.json`, which Claude Code keeps in
step (see the managed block in CLAUDE.md). Ticking something you have not
actually met only misleads you.

- [ ] Given a bank transaction, when I reconcile it, then the system updates cash records.
- [ ] Given a reconciliation error, when I try to process, then the system alerts me to the issue.
- [ ] Trust: All cash and bank transactions are logged in the audit trail.

When every box above is ticked, stop and show the demo.
