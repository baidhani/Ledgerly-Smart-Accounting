# STORY-003 — Create manual journal entries

As an accountant, I want to create journal entries so that I can record financial transactions.

**Release:** r0 · Minimum Viable Accounting Core (weeks 1–4)
**Owner:** Product Owner
**Blocked by:** nothing — you can start this now

## The requirement this satisfies

- **REQ-003** (Functional, must) — The system must allow users to create manual journal entries following debit and credit rules.

## How to build it

Implement journal entry form with validation for balanced entries.

## Failure paths you must handle

- Unbalanced entry
- Invalid account
- Database save error

## Acceptance — your stop condition

Tick each box as it genuinely passes. This file is yours — the platform reads
the same criteria out of `.colaberry/progress.json`, which Claude Code keeps in
step (see the managed block in CLAUDE.md). Ticking something you have not
actually met only misleads you.

- [ ] Given a journal entry request, when I enter valid debit and credit amounts, then the system records the entry.
- [ ] Given an unbalanced journal entry request, when I try to save, then the system rejects the entry.
- [ ] Trust: All journal entries are logged in the audit trail.

When every box above is ticked, stop and show the demo.
