---
name: release-boundary-retro
description: Use this whenever the user asks for an architecture or boundary retrospective at the end of a release — "do the architecture retro," "r0 just wrapped, what boundary do we need now" — a design reflection across everything built in that release, not a bug hunt, not a test run, and not the per-story checks done while a release is still in progress.
allowed-tools: Read, Grep
---

# Release boundary retrospective

Step back from "did each story pass its acceptance criteria" and ask a
different question: across everything built in the release that just
finished, did different owners, risks, or change rates get collapsed into
the same module? This is the same question the user and the assistant
worked through by hand after STORY-003 — inline audit-log writes duplicated
across `companies.ts`, `accounts.ts`, and `journalEntries.ts`, even though
`plan.json` names a separate owner ("Audit System") for audit logging. This
skill operationalizes doing that on purpose, at release boundaries, instead
of relying on it coming up in conversation.

## Steps

1. **Identify the release that just finished.** Read `.colaberry/plan.json`'s
   `releases` array for its `story_ids`, and confirm with the user which
   release this retro is for if it isn't obvious.

2. **Read every module those stories touched** — not just the newest one,
   the whole set, since drift is about what accumulated across the release.

3. **For each module, note who plausibly owns it** (per `plan.json`'s
   requirement-to-story mapping and any named owners/agents), what it
   changes for, and roughly how often it's likely to change relative to the
   others. Look specifically for a pattern repeated across 3+ modules — one
   repetition can be coincidence, three is a signal.

4. **Ask the two questions from the retro exercise, in this order:**
   - Where in this release have different owners, risks, or change rates
     been collapsed into one module?
   - What is one boundary worth drawing before the next release builds on
     top of it — what goes on each side, who owns each side, and what
     failure it would contain?

5. **Present findings as a proposal, not a mandate.** State the pattern
   found, the boundary you'd draw, and let the user decide whether to act on
   it now, defer it, or reject it. This is a conversation output.

## What this skill must never do

- Never restructure or extract any code itself — it produces a finding and
  a proposed boundary, in words, the same way the audit-log discussion did
  by hand. Acting on the proposal is a separate, deliberate step.
- Never run this mid-release as a substitute for a story's own tests — it
  is a release-boundary activity, not a per-story one.
- Never treat "nothing collapsed" as a failure to find something — say so
  plainly if the release's modules already have clean boundaries.
