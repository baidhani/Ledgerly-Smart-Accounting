# STORY-014 — Provide advanced dashboards and reporting

As a business analyst, I want advanced dashboards and reporting so that I can gain insights into business performance.

**Release:** r3 · Advanced Reporting and AI (weeks 13–16)
**Owner:** Product Owner
**Blocked by:** STORY-013

## The requirement this satisfies

- **REQ-012** (Functional, should) — The system must provide dashboards for operational and financial reporting.

## How to build it

Implement dashboard and reporting logic with real-time data integration.

## Failure paths you must handle

- Reporting error
- Data integration error
- Display error

## Acceptance — your stop condition

Tick each box as it genuinely passes. This file is yours — the platform reads
the same criteria out of `.colaberry/progress.json`, which Claude Code keeps in
step (see the managed block in CLAUDE.md). Ticking something you have not
actually met only misleads you.

- [ ] Given a dashboard request, when I configure it, then the system displays the dashboard with real-time data.
- [ ] Given a reporting error, when I try to generate a report, then the system alerts me to the issue.
- [ ] Trust: All dashboard configurations and report generations are logged in the audit trail.

When every box above is ticked, stop and show the demo.
