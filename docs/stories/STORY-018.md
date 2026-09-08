# STORY-018 — Ensure transactions follow balanced debit and credit rules

As an accountant, I want the system to ensure all transactions follow balanced debit and credit rules, so that financial integrity is maintained.

**Release:** r0 · Minimum Viable Accounting Core (weeks 1–4)
**Owner:** Accounting System
**Blocked by:** nothing — you can start this now

## The requirement this satisfies

- **REQ-007** (Safety, must) — The system must ensure all posted transactions follow balanced debit and credit rules.
- **REQ-009** (Safety, must) — The system must validate transactions for balanced entries, valid accounts, and accounting periods before posting.

## How to build it

Implement validation logic in the transaction posting service to check for balanced entries and log all attempts in the audit trail.

## Failure paths you must handle

- Unbalanced debit and credit entries
- Invalid account numbers
- Closed accounting periods

## Acceptance — your stop condition

Tick each box as it genuinely passes. This file is yours — the platform reads
the same criteria out of `.colaberry/progress.json`, which Claude Code keeps in
step (see the managed block in CLAUDE.md). Ticking something you have not
actually met only misleads you.

- [ ] Given a transaction with balanced debit and credit entries, when I post the transaction, then it should be accepted.
- [ ] Given a transaction with unbalanced debit and credit entries, when I attempt to post the transaction, then it should be rejected with an error message.
- [ ] Trust: All transaction attempts must be logged with their success or failure status.

When every box above is ticked, stop and show the demo.
