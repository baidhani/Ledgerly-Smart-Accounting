# Story completion checklist

**Read this before pushing any commit meant to trigger the portal's story
verification.** It applies to any agent (or person) completing a story in
this repo, not just whoever wrote it.

## Why this exists

STORY-001 was fully implemented, tested, and working — but the portal did
not show it as complete after the first push. The cause: `.colaberry/plan.json`
carried a placeholder acceptance criterion from when the file was first
authored, not the actual criteria from STORY-001's real brief. The portal
matches criteria **by exact text**, so a correct implementation against
mismatched criteria text still shows as incomplete. This checklist exists so
that mistake doesn't repeat.

## Before you write any code

1. Read the story's requirement, acceptance criteria, and the guardrails
   that apply to the whole project. If a guardrail would have to bend to
   finish the story, stop and say so — do not work around it silently.
2. Read `.colaberry/plan.json`'s entry for this story's id, if one already
   exists. **Do not assume it is correct.** Compare its `acceptance_criteria`
   array line-by-line against the acceptance criteria in the story brief you
   were actually given for this task. If any line is missing, reworded,
   paraphrased, or looks like a placeholder, fix `plan.json` to the brief's
   **exact wording** now, before writing any implementation code. Also check
   the `narrative` field for role drift (it feeds role-derived tabs).

## While building

3. Build the happy path, then the failure paths named in the brief. Every
   acceptance criterion needs to actually be exercised, not assumed —
   verify live (curl, a real request, a running process) and with an
   automated test, not just by reading the code.
4. Do not touch a file outside this story's scope to make it pass. If you
   think you need to, stop and ask first.

## Before you tick anything in progress.json

5. Re-open `.colaberry/plan.json`'s entry for this story and confirm (again)
   that its `acceptance_criteria` array is word-for-word identical to the
   criteria you just implemented against. If you changed `plan.json` in step
   2, this is your check that the edit actually landed correctly.
6. In `.colaberry/progress.json`, tick a criterion `true` **only if you just
   verified it is genuinely true** — not because the story looks finished,
   not to make the count come out even. Leave anything unverified `false`
   and say which lines and why.
7. Fill in the story's `files_touched` and `tests_added` arrays and a short
   `notes` string. These are yours to maintain — the portal's own sync never
   fills them in (confirmed empty even on stories it has independently
   verified) — and the per-repo `CLAUDE.md` now asks for them explicitly.
8. Leave `verification` alone once the portal has provisioned this file (its
   `commit_sha`/`verified_at`/`points_awarded` are portal-computed from your
   `passed` flags plus your pushed commit — don't hand-fill them). Before the
   portal has ever synced `progress.json` to this repo, `verification.state`/
   `.commit` are yours to set as a stand-in (`submitted` + the commit hash),
   same as before.
9. **Do not hand-edit `.colaberry/manifest.json` once the portal has synced
   it to this repo.** Its schema changed to include `plan_sha256` and a
   per-file hash list the portal uses to detect drift — it fully owns this
   file on every sync and will refresh it after your push. Before the first
   sync (no `manifest.json` in the repo yet), bump `generated_at` yourself
   as a stand-in, same as before.
10. Validate all `.colaberry/*.json` files parse (e.g.
    `python -c "import json; json.load(open(path))"` for each) before
    committing. A file that fails to parse counts as no claims at all to the
    portal, not as a highlighted error.

## Commit and push

11. Commit message names the story: `STORY-XXX: <what you did>` (or a
    `Story: STORY-XXX` line in the body) — the platform reads this to track
    progress. Never batch multiple stories into one commit.
12. **Before pushing, `git fetch` and check whether `origin/main` has moved.**
    The portal pushes its own sync commits directly to this repo (a
    `Colaberry Build Bot` commit rewriting `progress.json`/`manifest.json`
    and provisioning `docs/`) — if one landed since your last pull, `git
    push` will be rejected. Resolve by taking the portal's version of
    `manifest.json` and `progress.json` as the base (`git checkout --theirs`
    on conflict) and reapplying just your story's criteria/files_touched/
    notes on top — never force-push over a sync commit.
13. Push. If the GitHub push webhook is registered (see the portal's
    workspace panel), the portal picks this up within seconds; otherwise the
    user presses "Sync from GitHub."
14. Update `PROGRESS.md` per this repo's `CLAUDE.md` hard gate — every code
    change needs an entry with verification evidence, tagged with the
    session id doing the work.

## Sanity check before you tell anyone it's done

- Does every criterion you ticked `true` correspond to an exact-text match
  in `plan.json`, and did you personally verify it (not just infer it from
  the code looking right)?
- Would a fresh read of `plan.json`'s entry for this story, by someone who
  has never seen the implementation, match what the story brief actually
  asked for?

If the answer to either is no, fix it before the push — not after the user
asks why the portal doesn't agree.
