# STORY-012 — Support budgeting and cost centers

As a financial planner, I want to manage budgets and cost centers so that I can control spending and allocate resources.

**Release:** r2 · Business Management (weeks 9–12)
**Owner:** Product Owner
**Blocked by:** STORY-010

## The requirement this satisfies

- **REQ-018** (Functional, should) — The system must support budgeting and cost centers.

## How to build it

Implement budgeting and cost center management logic.

## Failure paths you must handle

- Invalid budget allocation
- Duplicate entry
- Database save error

## Acceptance — your stop condition

Tick each box as it genuinely passes. This file is yours — the platform reads
the same criteria out of `.colaberry/progress.json`, which Claude Code keeps in
step (see the managed block in CLAUDE.md). Ticking something you have not
actually met only misleads you.

- [ ] Given a budget allocation, when I enter valid details, then the system saves the budget.
- [ ] Given an invalid budget allocation, when I try to save, then the system rejects the allocation.
- [ ] Trust: All budget and cost center changes are logged in the audit trail.

When every box above is ticked, stop and show the demo.
