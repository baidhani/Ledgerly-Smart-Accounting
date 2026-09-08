# STORY-006 — Produce financial statements

As an accountant, I want to produce financial statements so that I can report on the company's financial status.

**Release:** r0 · Minimum Viable Accounting Core (weeks 1–4)
**Owner:** Product Owner
**Blocked by:** nothing — you can start this now

## The requirement this satisfies

- **REQ-006** (Functional, must) — The system must produce basic financial statements, including an income statement and balance sheet.

## How to build it

Implement financial statement generation logic and templates.

## Failure paths you must handle

- Incomplete data
- Calculation error
- Template error

## Acceptance — your stop condition

Tick each box as it genuinely passes. This file is yours — the platform reads
the same criteria out of `.colaberry/progress.json`, which Claude Code keeps in
step (see the managed block in CLAUDE.md). Ticking something you have not
actually met only misleads you.

- [ ] Given a request for financial statements, when I generate them, then the system produces an income statement and balance sheet.
- [ ] Given incomplete data, when I try to generate financial statements, then the system alerts me to missing information.
- [ ] Trust: Financial statement generation is logged in the audit trail.

When every box above is ticked, stop and show the demo.
