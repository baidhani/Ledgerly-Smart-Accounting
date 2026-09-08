# STORY-020 — Implement user roles and permissions management

As a system administrator, I want to manage user roles and permissions, so that access to system features is controlled.

**Release:** r1 · Operational Accounting (weeks 5–8)
**Owner:** User Management System
**Blocked by:** STORY-010

## The requirement this satisfies

- **REQ-011** (Functional, must) — The system must allow for user roles and permissions management.

## How to build it

Develop the user roles and permissions module to manage access rights, and ensure all changes are logged in the user_activity_log.

## Failure paths you must handle

- Unauthorized role creation
- Incorrect permission assignments
- Failure to log changes

## Acceptance — your stop condition

Tick each box as it genuinely passes. This file is yours — the platform reads
the same criteria out of `.colaberry/progress.json`, which Claude Code keeps in
step (see the managed block in CLAUDE.md). Ticking something you have not
actually met only misleads you.

- [ ] Given a new user role, when I assign permissions, then the user should only access allowed features.
- [ ] Given a user with no permissions, when they attempt to access a feature, then access should be denied.
- [ ] Trust: All changes to user roles and permissions must be logged with the admin's user ID.

When every box above is ticked, stop and show the demo.
