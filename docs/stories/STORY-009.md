# STORY-009 — Manage sales and purchasing workflows

As a sales manager, I want to manage sales and purchasing workflows so that I can streamline operations.

**Release:** r1 · Operational Accounting (weeks 5–8)
**Owner:** Product Owner
**Blocked by:** STORY-006

## The requirement this satisfies

- **REQ-015** (Functional, should) — The system must manage sales, purchasing, and expenses.

## How to build it

Design sales and purchasing interfaces and implement processing logic.

## Failure paths you must handle

- Invalid sales order
- Inventory error
- Database update error

## Acceptance — your stop condition

Tick each box as it genuinely passes. This file is yours — the platform reads
the same criteria out of `.colaberry/progress.json`, which Claude Code keeps in
step (see the managed block in CLAUDE.md). Ticking something you have not
actually met only misleads you.

- [ ] Given a sales order, when I process it, then the system updates inventory and sales records.
- [ ] Given an invalid sales order, when I try to process, then the system rejects the order.
- [ ] Trust: All sales and purchasing transactions are logged in the audit trail.

When every box above is ticked, stop and show the demo.
