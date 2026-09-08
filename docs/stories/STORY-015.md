# STORY-015 — Integrate AI for financial insights

As a financial analyst, I want AI-generated insights so that I can make informed financial decisions.

**Release:** r3 · Advanced Reporting and AI (weeks 13–16)
**Owner:** Product Owner
**Blocked by:** STORY-013

## The requirement this satisfies

- **REQ-020** (Functional, should) — The system must provide AI-assisted financial analysis and insights.
- **REQ-021** (Safety, must) — AI-generated analysis must not alter authoritative accounting records without user approval.

## How to build it

Implement AI integration for financial analysis and ensure compliance with advisory boundaries.

## Failure paths you must handle

- AI analysis error
- Data interpretation error
- Compliance breach

## Acceptance — your stop condition

Tick each box as it genuinely passes. This file is yours — the platform reads
the same criteria out of `.colaberry/progress.json`, which Claude Code keeps in
step (see the managed block in CLAUDE.md). Ticking something you have not
actually met only misleads you.

- [ ] Given a financial query, when I request AI analysis, then the system provides insights without altering records.
- [ ] Given an AI analysis error, when I try to generate insights, then the system alerts me to the issue.
- [ ] Trust: All AI analysis requests are logged in the audit trail.

When every box above is ticked, stop and show the demo.
