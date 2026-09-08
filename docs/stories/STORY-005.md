# STORY-005 — Generate a trial balance

As an accountant, I want to generate a trial balance so that I can verify the accuracy of financial records.

**Release:** r0 · Minimum Viable Accounting Core (weeks 1–4)
**Owner:** Product Owner
**Blocked by:** nothing — you can start this now

## The requirement this satisfies

- **REQ-005** (Functional, must) — The system must generate a trial balance from posted transactions.

## How to build it

Implement trial balance calculation and display logic.

## Failure paths you must handle

- No transactions
- Calculation error
- Display error

## Acceptance — your stop condition

Tick each box as it genuinely passes. This file is yours — the platform reads
the same criteria out of `.colaberry/progress.json`, which Claude Code keeps in
step (see the managed block in CLAUDE.md). Ticking something you have not
actually met only misleads you.

- [ ] Given posted transactions, when I generate a trial balance, then the system displays the balance.
- [ ] Given no transactions, when I generate a trial balance, then the system shows a zero balance.
- [ ] Trust: Trial balance generation is logged in the audit trail.

When every box above is ticked, stop and show the demo.
