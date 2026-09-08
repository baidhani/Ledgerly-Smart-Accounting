# STORY-019 — Provide an audit trail for all financial transactions

As an auditor, I want the system to provide an audit trail for all financial transactions, so that I can verify transaction history and integrity.

**Release:** r0 · Minimum Viable Accounting Core (weeks 1–4)
**Owner:** Audit System
**Blocked by:** nothing — you can start this now

## The requirement this satisfies

- **REQ-008** (Safety, must) — The system must provide an audit trail for all financial transactions.

## How to build it

Design the audit trail feature to log all transaction details in the audit_log table, including timestamps and user IDs.

## Failure paths you must handle

- Missing transaction details in audit log
- Incorrect timestamps
- Unauthorized access to audit trail

## Acceptance — your stop condition

Tick each box as it genuinely passes. This file is yours — the platform reads
the same criteria out of `.colaberry/progress.json`, which Claude Code keeps in
step (see the managed block in CLAUDE.md). Ticking something you have not
actually met only misleads you.

- [ ] Given a posted transaction, when I view the audit trail, then it should display the transaction details and status.
- [ ] Given a failed transaction attempt, when I view the audit trail, then it should display the attempt details and failure reason.
- [ ] Trust: The audit trail must record every transaction attempt with a timestamp and user ID.

When every box above is ticked, stop and show the demo.
