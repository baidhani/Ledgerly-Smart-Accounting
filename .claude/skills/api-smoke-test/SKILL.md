---
name: api-smoke-test
description: Use this whenever the user asks to see the Ledgerly API actually working — "show me a demo," "smoke-test the backend," "prove this all still works" — as a full pass across every route together, not the narrow curl check already done while building a single story.
allowed-tools: Bash, Read, Grep
---

# API smoke test

Run the whole backend end-to-end against a real, running server and report
pass/fail per route. This is a demo and a regression check, not a substitute
for the automated test suite (`npm test`) — run that too if the user wants
full confidence, this skill is for watching it actually work.

## Steps

1. **Find the current routes.** Read `src/app.ts` and grep for `app.post(` /
   `app.get(` lines so the list of routes checked here stays accurate as new
   stories add more — do not hardcode a route list that can go stale.

2. **Start a fresh server.** Delete any leftover `data/` directory first so
   the smoke test starts from a clean, empty database, not leftover state
   from a previous run. Boot the server in the background
   (`npx tsx src/index.ts`) and poll `/health` until it responds — do not
   fixed-`sleep`, poll.

3. **Exercise every route in dependency order**, using `curl`, printing the
   status code and body for each:
   - `GET /health`
   - `POST /companies` — one valid request
   - `POST /accounts` — at least two valid accounts (a journal entry needs
     two real account ids to reference)
   - `POST /journal-entries` — one balanced entry using the two account ids
     just created
   - `POST /journal-entries/:id/post` — post that entry
   - `POST /journal-entries/:id/post` **again** — confirm the response is
     identical and no error, since posting must be idempotent

4. **Report a summary table**: route, status code, pass/fail against the
   expected status for that call. A route that returns anything other than
   its expected 2xx is a failure — say so plainly, do not soften it.

5. **Clean up.** Stop the server process and delete the `data/` directory
   this run created, so nothing from the smoke test lingers in the repo or
   collides with the next run.

## What this skill must never do

- Never modify any file in `src/`, `tests/`, or `.colaberry/` — it only
  reads code to find routes and runs the compiled/dev server against it.
  If a route is broken, report it; do not attempt to fix it here.
- Never leave the server process running after this skill finishes.
- Never leave a `data/` directory behind after this skill finishes.
