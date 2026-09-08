# STORY-004 — Post transactions to the general ledger

As an accountant, I want to post transactions to the general ledger so that financial records are updated.

**Release:** r0 · Minimum Viable Accounting Core (weeks 1–4)
**Owner:** Product Owner
**Blocked by:** nothing — you can start this now

## The requirement this satisfies

- **REQ-004** (Functional, must) — The system must post transactions to the general ledger.

## How to build it

Implement posting logic and update general ledger tables.

## Failure paths you must handle

- Invalid transaction
- Unbalanced posting
- Database update error

## Acceptance — your stop condition

Tick each box as it genuinely passes. This file is yours — the platform reads
the same criteria out of `.colaberry/progress.json`, which Claude Code keeps in
step (see the managed block in CLAUDE.md). Ticking something you have not
actually met only misleads you.

- [ ] Given a valid transaction, when I post it, then the system updates the general ledger.
- [ ] Given an invalid transaction, when I try to post, then the system rejects the posting.
- [ ] Trust: All postings to the general ledger are logged in the audit trail.

When every box above is ticked, stop and show the demo.
