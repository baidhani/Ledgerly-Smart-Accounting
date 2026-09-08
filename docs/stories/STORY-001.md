# STORY-001 — Create and configure a company profile

As an accountant, I want to set up a company profile so that I can begin managing its financial data.

**Release:** r0 · Minimum Viable Accounting Core (weeks 1–4)
**Owner:** Product Owner
**Blocked by:** nothing — you can start this now

## The requirement this satisfies

- **REQ-001** (Functional, must) — The system must allow users to create and configure a company profile.

## How to build it

Implement company setup form and save functionality in the database.

## Failure paths you must handle

- Incomplete company details
- Invalid data format
- Database save error

## Acceptance — your stop condition

Tick each box as it genuinely passes. This file is yours — the platform reads
the same criteria out of `.colaberry/progress.json`, which Claude Code keeps in
step (see the managed block in CLAUDE.md). Ticking something you have not
actually met only misleads you.

- [ ] Given a new company setup request, when I enter company details, then the system creates a company profile.
- [ ] Given an incomplete company setup request, when I try to save, then the system prompts for missing information.
- [ ] Trust: All company setup actions are logged in the audit trail.

When every box above is ticked, stop and show the demo.
