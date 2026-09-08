# STORY-008 — Handle accounts receivable and payable

As an accountant, I want to manage accounts receivable and payable so that I can track incoming and outgoing payments.

**Release:** r1 · Operational Accounting (weeks 5–8)
**Owner:** Product Owner
**Blocked by:** STORY-006

## The requirement this satisfies

- **REQ-014** (Functional, should) — The system must handle accounts receivable and payable.

## How to build it

Implement accounts receivable and payable processing logic.

## Failure paths you must handle

- Payment error
- Duplicate invoice
- Database update error

## Acceptance — your stop condition

Tick each box as it genuinely passes. This file is yours — the platform reads
the same criteria out of `.colaberry/progress.json`, which Claude Code keeps in
step (see the managed block in CLAUDE.md). Ticking something you have not
actually met only misleads you.

- [ ] Given an invoice, when I mark it as paid, then the system updates accounts receivable.
- [ ] Given a payment error, when I try to process, then the system alerts me to the issue.
- [ ] Trust: All accounts receivable and payable transactions are logged in the audit trail.

When every box above is ticked, stop and show the demo.
