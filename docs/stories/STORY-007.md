# STORY-007 — Manage customer and vendor profiles

As a business manager, I want to manage customer and vendor profiles so that I can track business relationships.

**Release:** r1 · Operational Accounting (weeks 5–8)
**Owner:** Product Owner
**Blocked by:** STORY-006

## The requirement this satisfies

- **REQ-013** (Functional, should) — The system must support customer and vendor management.

## How to build it

Design customer and vendor profile interfaces and implement CRUD operations.

## Failure paths you must handle

- Invalid profile details
- Duplicate profile
- Database save error

## Acceptance — your stop condition

Tick each box as it genuinely passes. This file is yours — the platform reads
the same criteria out of `.colaberry/progress.json`, which Claude Code keeps in
step (see the managed block in CLAUDE.md). Ticking something you have not
actually met only misleads you.

- [ ] Given a new customer profile request, when I enter valid details, then the system saves the profile.
- [ ] Given an invalid customer profile request, when I try to save, then the system rejects the request.
- [ ] Trust: All changes to customer and vendor profiles are logged in the audit trail.

When every box above is ticked, stop and show the demo.
