---
name: plan-progress-audit
description: Use this whenever the user asks to audit all stories at once — "audit all my stories," "check if progress.json still matches the real criteria," "find drift across the whole plan" — a periodic sweep across every story already marked done, not the single-story pre-build check already done before writing any code for the story currently in progress.
allowed-tools: Read, Grep
---

# Plan / progress integrity audit

Check `.colaberry/plan.json` and `.colaberry/progress.json` for drift across
every story, not just the one being built right now. This exists because a
story's `plan.json` acceptance criteria can be a stale placeholder even after
its `progress.json` entry claims every line is `true` — that exact mistake
happened on STORY-001 and is why `directives/story-completion-checklist.md`
exists for single-story, pre-build checking. This skill is the periodic,
whole-repo version of the same concern.

## Steps

1. **Read the JSON files first.** Read `.colaberry/plan.json`,
   `.colaberry/progress.json`, and `.colaberry/manifest.json`. If any file's
   content can't be reasoned about as valid JSON, report that as its own
   finding rather than guessing at its structure — this skill has no `Bash`
   access, so it checks by reading, not by shelling out to a parser.

2. **For every story, compare `plan.json`'s `acceptance_criteria` array
   against `progress.json`'s `criteria` array for the same story id** —
   text must match exactly, since the portal matches criteria by exact text.
   Flag: a criterion present in one file but not the other, reworded text,
   or a different number of lines between the two.

3. **For every criterion marked `"passed": true`, sanity-check it still has
   real backing** — grep the codebase for what the criterion claims (a
   route, a validation, a test file) rather than trusting the tick at face
   value. A tick with no corresponding code or test is a stale claim, not
   proof.

4. **Report findings as a table**: story id, the specific mismatch or stale
   tick, and a one-line recommendation. Group stories with no issues under a
   single "clean" line rather than listing them individually — the report
   should be scannable, not exhaustive noise.

5. **Do not fix anything.** This skill reports; a human or a follow-up
   editing step decides what to change and when. Findings are the deliverable.

## What this skill must never do

- Never write to `.colaberry/plan.json`, `.colaberry/progress.json`,
  `.colaberry/manifest.json`, or any other file — this is a read-only
  report, exactly like the STORY-001 finding was surfaced by a question,
  not by an automatic rewrite.
- Never mark a criterion `true` or `false` on the user's behalf.
- Never treat "no issues found" as license to skip showing the report —
  say so explicitly rather than staying silent.
