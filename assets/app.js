/* Command Center — reads .colaberry/*.json at runtime. No plan/progress content is hard-coded here. */

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "outcomes", label: "Outcomes" },
  { id: "users", label: "Users & use case" },
  { id: "guardrails", label: "Guardrails" },
  { id: "systems", label: "Systems" },
  { id: "pm", label: "Project management" },
  { id: "agents", label: "AI agents" },
  { id: "kb", label: "Knowledge base" },
  { id: "datamodel", label: "Data model" },
];

const state = {
  mode: localStorage.getItem("cc-mode") || "real", // "real" | "sample"
  plan: null,
  progress: null,
  manifest: null,
  loadError: null,
};

function setMode(mode) {
  state.mode = mode;
  localStorage.setItem("cc-mode", mode);
  render();
}

async function loadData() {
  try {
    const [plan, progress, manifest] = await Promise.all([
      fetchJson(".colaberry/plan.json"),
      fetchJson(".colaberry/progress.json"),
      fetchJson(".colaberry/manifest.json"),
    ]);
    state.plan = plan;
    state.progress = progress;
    state.manifest = manifest;
  } catch (err) {
    state.loadError = err.message || String(err);
  }
}

async function fetchJson(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Could not load ${path} (${res.status})`);
  return res.json();
}

/* ---- routing: "#tab" for a list view, "#tab/id" for a drill-down detail view ---- */
function parseHash() {
  const raw = (location.hash || "#overview").replace("#", "");
  const [tabId, ...rest] = raw.split("/");
  const detailId = rest.length ? decodeURIComponent(rest.join("/")) : null;
  return { tabId: TABS.some((t) => t.id === tabId) ? tabId : "overview", detailId };
}

function formatDataAsOf(generatedAt) {
  if (!generatedAt) {
    return { text: "Data as of: unknown — no manifest generated_at found.", warn: true };
  }
  const gen = new Date(generatedAt);
  if (isNaN(gen.getTime())) {
    return { text: "Data as of: unknown — manifest generated_at is not a valid date.", warn: true };
  }
  const now = new Date();
  const ms = now - gen;
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  const absolute = gen.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
  let relative;
  if (days <= 0) relative = "today";
  else if (days === 1) relative = "1 day ago";
  else relative = `${days} days ago`;
  const warn = days > 7;
  const text = `Data as of ${absolute} (${relative})${warn ? " — sync from the portal to refresh" : ""}`;
  return { text, warn };
}

function renderHeader() {
  const { tabId } = parseHash();
  const stamp = state.manifest
    ? formatDataAsOf(state.manifest.generated_at)
    : { text: state.loadError ? "Data as of: unknown — data files not found." : "Loading…", warn: !!state.loadError };

  const nav = TABS.map(
    (t) => `<a href="#${t.id}" class="${t.id === tabId ? "active" : ""}">${t.label}</a>`
  ).join("");

  return `
    <header class="cc-header">
      <div class="cc-header-top">
        <div class="cc-title">
          Ledgerly — Command Center
          <small>Intelligent Accounting and Business Management System</small>
        </div>
        <div class="cc-controls">
          <div class="cc-toggle" role="group" aria-label="Sample or real data">
            <button data-mode="sample" class="${state.mode === "sample" ? "active" : ""}">Sample</button>
            <button data-mode="real" class="${state.mode === "real" ? "active" : ""}">Real</button>
          </div>
          <div class="cc-data-stamp ${stamp.warn ? "warn" : ""}">${stamp.text}</div>
        </div>
      </div>
      <nav class="cc-nav">${nav}</nav>
    </header>
  `;
}

function sampleFlag() {
  return state.mode === "sample" ? '<span class="cc-sample-flag">Sample data</span>' : "";
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function numOr(v) {
  return typeof v === "number" ? v : "0";
}

function backLink(tabId) {
  return `<a href="#${tabId}">&larr; Back</a>`;
}

function loadErrorBody() {
  return `
    <div class="cc-empty">
      Could not read .colaberry/plan.json, progress.json or manifest.json (${escapeHtml(state.loadError)}).
      Every tab reads these files at runtime — nothing is hard-coded — so nothing renders until they exist and are reachable at this path.
    </div>
  `;
}

/* ---- helpers over plan/progress ---- */

function progressStoryById(id) {
  return (state.progress.stories || []).find((s) => s.id === id) || null;
}

function planStoryById(id) {
  return (state.plan.stories || []).find((s) => s.id === id) || null;
}

function storyState(id) {
  const p = progressStoryById(id);
  return p && p.verification ? p.verification.state : "not_started";
}

function stateLabel(s) {
  return { not_started: "Not started", in_progress: "In progress", submitted: "Submitted", verified: "Verified" }[s] || s;
}

/* ============ 1. OVERVIEW ============ */

function renderOverview() {
  const { plan, progress } = state;
  const sample = state.mode === "sample";

  const project = plan.project || {};
  const schedule = plan.schedule || {};
  const totals = sample
    ? { stories_total: 20, stories_verified: 6, criteria_total: 25, criteria_passed: 9, points_awarded: 34 }
    : progress.totals || {};

  return `
    <div class="cc-section-title">${escapeHtml(project.name || "Untitled project")} ${sampleFlag()}</div>
    <div class="cc-section-sub">${escapeHtml(project.descriptor || "No descriptor defined yet.")}</div>

    <div class="cc-grid">
      <a class="cc-card" href="#pm">
        <h3>Schedule</h3>
        <div class="cc-stat">${escapeHtml(schedule.demo_release_key || "—")}</div>
        <div class="cc-stat-sub">
          Build ${escapeHtml(schedule.build_start || "?")} &rarr; ${escapeHtml(schedule.build_end || "?")}<br/>
          Demo day ${escapeHtml(schedule.demo_day || "?")}
        </div>
      </a>
      <a class="cc-card" href="#pm">
        <h3>Stories verified</h3>
        <div class="cc-stat">${numOr(totals.stories_verified)} / ${numOr(totals.stories_total)}</div>
        <div class="cc-stat-sub">across all releases</div>
      </a>
      <a class="cc-card" href="#kb">
        <h3>Criteria passed</h3>
        <div class="cc-stat">${numOr(totals.criteria_passed)} / ${numOr(totals.criteria_total)}</div>
        <div class="cc-stat-sub">acceptance criteria, project-wide</div>
      </a>
      <a class="cc-card" href="#pm">
        <h3>Points awarded</h3>
        <div class="cc-stat">${numOr(totals.points_awarded)}</div>
        <div class="cc-stat-sub">from verified stories</div>
      </a>
    </div>
  `;
}

/* ============ 2. OUTCOMES ============ */

function renderOutcomes(detailId) {
  const measures = (state.plan.derived && state.plan.derived.measures) || [];
  const sample = state.mode === "sample";
  const sampleMeasures = [
    { id: "m1", statement: "Reduce month-end close time from 10 days to 3 days." },
    { id: "m2", statement: "Cut manual journal entry errors by 90%." },
  ];
  const list = sample ? sampleMeasures : measures;

  if (detailId) {
    const m = list.find((x) => x.id === detailId);
    if (!m) return `${backLink("outcomes")}<div class="cc-empty">Measure not found.</div>`;
    return `
      ${backLink("outcomes")}
      <div class="cc-section-title">${escapeHtml(m.id)} ${sampleFlag()}</div>
      <p>${escapeHtml(m.statement)}</p>
    `;
  }

  return `
    <div class="cc-section-title">Outcomes ${sampleFlag()}</div>
    <div class="cc-section-sub">The numbers this project is meant to move.</div>
    ${
      list.length === 0
        ? `<div class="cc-empty">No numeric targets defined yet in the plan. When measures are added to <code>plan.derived.measures</code>, one card will appear here per measure.</div>`
        : `<div class="cc-grid">${list
            .map(
              (m) => `
          <a class="cc-card" href="#outcomes/${encodeURIComponent(m.id)}">
            <h3>${escapeHtml(m.id)}</h3>
            <div class="cc-stat-sub">${escapeHtml(m.statement)}</div>
          </a>`
            )
            .join("")}</div>`
    }
  `;
}

/* ============ 3. USERS & USE CASE ============ */

function renderUsers(detailId) {
  const roles = (state.plan.derived && state.plan.derived.roles) || [];
  const stories = state.plan.stories || [];

  if (detailId) {
    const role = detailId;
    const roleStories = stories.filter((s) => (s.narrative || "").toLowerCase().startsWith(`as a ${role.toLowerCase()}`));
    return `
      ${backLink("users")}
      <div class="cc-section-title">${escapeHtml(role)}</div>
      ${
        roleStories.length === 0
          ? `<div class="cc-empty">No stories found for this role.</div>`
          : `<div class="cc-grid">${roleStories
              .map(
                (s) => `
          <div class="cc-card">
            <h3>${escapeHtml(s.id)}</h3>
            <div class="cc-stat-sub">${escapeHtml(s.narrative)}</div>
            <div class="cc-stat-sub"><span class="cc-dot"></span>${escapeHtml(stateLabel(storyState(s.id)))}</div>
          </div>`
              )
              .join("")}</div>`
      }
    `;
  }

  return `
    <div class="cc-section-title">Users & use case</div>
    <div class="cc-section-sub">Who this is for, taken from the roles named in your own stories.</div>
    ${
      roles.length === 0
        ? `<div class="cc-empty">No roles derived yet.</div>`
        : `<div class="cc-grid">${roles
            .map((r) => {
              const count = stories.filter((s) => (s.narrative || "").toLowerCase().startsWith(`as a ${r.toLowerCase()}`)).length;
              return `
          <a class="cc-card" href="#users/${encodeURIComponent(r)}">
            <h3>${escapeHtml(r)}</h3>
            <div class="cc-stat">${count}</div>
            <div class="cc-stat-sub">${count === 1 ? "story" : "stories"}</div>
          </a>`;
            })
            .join("")}</div>`
    }
  `;
}

/* ============ 4. GUARDRAILS ============ */

function guardrailEnforcement(g) {
  const req = (state.plan.requirements || []).find((r) => r.id === g.id);
  const storyIds = (req && req.fulfilled_by) || [];
  const states = storyIds.map((id) => storyState(id));
  const allVerified = storyIds.length > 0 && states.every((s) => s === "verified");
  return { storyIds, states, allVerified };
}

function renderGuardrails(detailId) {
  const guardrails = (state.plan.derived && state.plan.derived.guardrails) || [];

  if (detailId) {
    const g = guardrails.find((x) => x.id === detailId);
    if (!g) return `${backLink("guardrails")}<div class="cc-empty">Guardrail not found.</div>`;
    const { storyIds, allVerified } = guardrailEnforcement(g);
    return `
      ${backLink("guardrails")}
      <div class="cc-section-title">${escapeHtml(g.id)}</div>
      <p>${escapeHtml(g.statement)}</p>
      <div class="cc-section-sub">${allVerified ? "Enforced by verified stories:" : "Not yet enforced — a promise made and not yet kept."}</div>
      ${
        storyIds.length === 0
          ? `<div class="cc-empty">No story currently claims to fulfil this requirement.</div>`
          : `<div class="cc-grid">${storyIds
              .map((id) => {
                const s = planStoryById(id);
                return `<div class="cc-card"><h3>${escapeHtml(id)}</h3><div class="cc-stat-sub">${escapeHtml(
                  s ? s.title : ""
                )}</div><div class="cc-stat-sub"><span class="cc-dot"></span>${escapeHtml(stateLabel(storyState(id)))}</div></div>`;
              })
              .join("")}</div>`
      }
    `;
  }

  return `
    <div class="cc-section-title">Guardrails</div>
    <div class="cc-section-sub">What must never happen — and whether anything currently enforces it.</div>
    ${
      guardrails.length === 0
        ? `<div class="cc-empty">Your plan has no SAFE requirement yet — worth fixing before building further.</div>`
        : `<div class="cc-grid">${guardrails
            .map((g) => {
              const { allVerified } = guardrailEnforcement(g);
              return `
          <a class="cc-card" href="#guardrails/${encodeURIComponent(g.id)}">
            <h3>${escapeHtml(g.id)}</h3>
            <div class="cc-stat-sub">${escapeHtml(g.statement)}</div>
            <div class="cc-stat-sub"><span class="cc-dot"></span>${allVerified ? "Enforced" : "Not yet enforced"}</div>
          </a>`;
            })
            .join("")}</div>`
    }
  `;
}

/* ============ 5. SYSTEMS ============ */

function renderSystems() {
  const systems = (state.plan.derived && state.plan.derived.systems) || [];
  return `
    <div class="cc-section-title">Systems</div>
    <div class="cc-section-sub">What this project connects to.</div>
    ${
      systems.length === 0
        ? `<div class="cc-empty">Your plan names no external system yet.</div>`
        : `<div class="cc-grid">${systems
            .map(
              (name) => `
        <div class="cc-card">
          <h3>${escapeHtml(name)}</h3>
          <div class="cc-stat-sub"><span class="cc-dot"></span>Not checked from here</div>
        </div>`
            )
            .join("")}</div>`
    }
  `;
}

/* ============ 6. PROJECT MANAGEMENT ============ */

function renderPM(detailId) {
  const releases = state.plan.releases || [];
  const schedule = state.plan.schedule || {};

  if (detailId) {
    const story = planStoryById(detailId);
    if (!story) return `${backLink("pm")}<div class="cc-empty">Story not found.</div>`;
    const s = storyState(story.id);
    const pStory = progressStoryById(story.id);
    const slipped = story.due_on !== story.due_baseline_on;
    return `
      ${backLink("pm")}
      <div class="cc-section-title">${escapeHtml(story.id)} — ${escapeHtml(story.title)}</div>
      <p>${escapeHtml(story.narrative || "")}</p>
      <div class="cc-grid">
        <div class="cc-card"><h3>Status</h3><div class="cc-stat-sub"><span class="cc-dot"></span>${escapeHtml(stateLabel(s))}</div></div>
        <div class="cc-card"><h3>Due</h3><div class="cc-stat-sub">${escapeHtml(story.due_on)}</div></div>
        <div class="cc-card"><h3>Originally due</h3><div class="cc-stat-sub">${escapeHtml(story.due_baseline_on)}${slipped ? " — slipped" : " — on original schedule"}</div></div>
        <div class="cc-card"><h3>Commit</h3><div class="cc-stat-sub">${escapeHtml((pStory && pStory.verification && pStory.verification.commit) || "none recorded")}</div></div>
      </div>
    `;
  }

  const minDate = schedule.build_start;
  const maxDate = schedule.build_end;
  const totalDays = Math.max(1, (new Date(maxDate) - new Date(minDate)) / 86400000);

  const bars = releases
    .map((r) => {
      const startOffset = Math.max(0, (new Date(r.starts_on) - new Date(minDate)) / 86400000);
      const width = Math.max(1, (new Date(r.ends_on) - new Date(r.starts_on)) / 86400000 + 1);
      const leftPct = (startOffset / totalDays) * 100;
      const widthPct = (width / totalDays) * 100;
      return `
        <div style="margin:10px 0;">
          <div style="font-size:13px;margin-bottom:4px;">
            <strong>${escapeHtml(r.key)}</strong> ${escapeHtml(r.name)} ${r.is_demo_target ? '<span class="cc-sample-flag" style="background:var(--cc-primary);color:#fff;">Demo target</span>' : ""}
            <span style="color:var(--cc-text-muted);"> — ${escapeHtml(r.starts_on)} &rarr; ${escapeHtml(r.ends_on)}</span>
          </div>
          <div style="background:var(--cc-border);border-radius:6px;height:14px;position:relative;">
            <div style="position:absolute;left:${leftPct}%;width:${widthPct}%;height:14px;border-radius:6px;background:${
        r.is_demo_target ? "var(--cc-primary)" : "var(--cc-accent)"
      };"></div>
          </div>
        </div>
      `;
    })
    .join("");

  const taskRows = releases
    .flatMap((r) => r.story_ids.map((id) => ({ release: r, id })))
    .map(({ release, id }) => {
      const story = planStoryById(id);
      if (!story) return "";
      const s = storyState(id);
      const slipped = story.due_on !== story.due_baseline_on;
      return `
        <tr>
          <td><a href="#pm/${encodeURIComponent(id)}">${escapeHtml(id)}</a></td>
          <td>${escapeHtml(story.title)}</td>
          <td>${escapeHtml(release.key)}</td>
          <td>${escapeHtml(story.due_on)}${slipped ? " (slipped)" : ""}</td>
          <td><span class="cc-dot"></span>${escapeHtml(stateLabel(s))}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <div class="cc-section-title">Project management</div>
    <div class="cc-section-sub">
      Build ${escapeHtml(schedule.build_start || "?")} &rarr; ${escapeHtml(schedule.build_end || "?")} &middot; Demo day ${escapeHtml(
    schedule.demo_day || "?"
  )}. Releases after <strong>${escapeHtml(schedule.demo_release_key || "?")}</strong> are the roadmap, not this term's work.
    </div>
    ${bars}
    <div class="cc-section-title" style="font-size:16px;">Tasks</div>
    <div style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr style="text-align:left;border-bottom:1px solid var(--cc-border);">
            <th style="padding:6px;">Story</th><th style="padding:6px;">Title</th><th style="padding:6px;">Release</th><th style="padding:6px;">Due</th><th style="padding:6px;">Status</th>
          </tr>
        </thead>
        <tbody>${taskRows}</tbody>
      </table>
    </div>
  `;
}

/* ============ 7. AI AGENTS ============ */

const OWNERS = [
  { name: "Product Owner", stories: ["STORY-001","STORY-002","STORY-003","STORY-004","STORY-005","STORY-006","STORY-007","STORY-008","STORY-009","STORY-010","STORY-011","STORY-012","STORY-013","STORY-014","STORY-015","STORY-016","STORY-017"] },
  { name: "Accounting System", stories: ["STORY-018"] },
  { name: "Audit System", stories: ["STORY-019"] },
  { name: "User Management System", stories: ["STORY-020"] },
];

function renderAgents(detailId) {
  if (detailId) {
    const owner = OWNERS.find((o) => o.name === detailId);
    if (!owner) return `${backLink("agents")}<div class="cc-empty">Owner not found.</div>`;
    return `
      ${backLink("agents")}
      <div class="cc-section-title">${escapeHtml(owner.name)}</div>
      <div class="cc-section-sub">no skills registered yet</div>
      <div class="cc-grid">${owner.stories
        .map((id) => {
          const story = planStoryById(id);
          return `<div class="cc-card"><h3>${escapeHtml(id)}</h3><div class="cc-stat-sub">${escapeHtml(
            story ? story.title : ""
          )}</div><div class="cc-stat-sub"><span class="cc-dot"></span>${escapeHtml(stateLabel(storyState(id)))}</div></div>`;
        })
        .join("")}</div>
    `;
  }

  const agents = state.plan.agents || [];

  return `
    <div class="cc-section-title">AI agents</div>
    <div class="cc-section-sub">
      ${
        agents.length === 0
          ? "Your plan does not carry a scoped agent roster yet. Shown below are story owners, not scoped AI agents."
          : ""
      }
    </div>
    <div class="cc-grid">${OWNERS.map(
      (o) => `
      <a class="cc-card" href="#agents/${encodeURIComponent(o.name)}">
        <h3>${escapeHtml(o.name)}</h3>
        <div class="cc-stat">${o.stories.length}</div>
        <div class="cc-stat-sub">owned ${o.stories.length === 1 ? "story" : "stories"}</div>
        <div class="cc-stat-sub">no runs recorded</div>
      </a>`
    ).join("")}</div>
  `;
}

/* ============ 8. KNOWLEDGE BASE ============ */

function renderKB(detailId) {
  const requirements = state.plan.requirements || [];

  if (detailId) {
    const req = requirements.find((r) => r.id === detailId);
    if (!req) return `${backLink("kb")}<div class="cc-empty">Requirement not found.</div>`;
    return `
      ${backLink("kb")}
      <div class="cc-section-title">${escapeHtml(req.id)}</div>
      <p>${escapeHtml(req.statement)}</p>
      <div class="cc-stat-sub">${escapeHtml(req.kind)} &middot; ${escapeHtml(req.priority)} &middot; ${escapeHtml(req.cluster || "")}</div>
      <div class="cc-section-title" style="font-size:16px;">Fulfilled by</div>
      ${
        (req.fulfilled_by || []).length === 0
          ? `<div class="cc-empty">No story currently fulfils this requirement — a real gap.</div>`
          : `<div class="cc-grid">${req.fulfilled_by
              .map((id) => {
                const story = planStoryById(id);
                return `<div class="cc-card"><h3>${escapeHtml(id)}</h3><div class="cc-stat-sub">${escapeHtml(
                  story ? story.title : ""
                )}</div><div class="cc-stat-sub"><span class="cc-dot"></span>${escapeHtml(stateLabel(storyState(id)))}</div></div>`;
              })
              .join("")}</div>`
      }
    `;
  }

  const rows = requirements
    .map((r) => {
      const ids = r.fulfilled_by || [];
      const verified = ids.length > 0 && ids.every((id) => storyState(id) === "verified");
      const gap = r.priority === "must" && ids.length === 0;
      return `
        <tr style="${gap ? "background:var(--cc-warn-bg);" : ""}">
          <td style="padding:6px;"><a href="#kb/${encodeURIComponent(r.id)}">${escapeHtml(r.id)}</a></td>
          <td style="padding:6px;">${escapeHtml(r.statement)}</td>
          <td style="padding:6px;">${escapeHtml(r.priority)}</td>
          <td style="padding:6px;">${ids.map(escapeHtml).join(", ") || (gap ? "none — gap" : "none")}</td>
          <td style="padding:6px;"><span class="cc-dot"></span>${verified ? "Verified" : "Not yet"}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <div class="cc-section-title">Knowledge base</div>
    <div class="cc-section-sub">Every requirement, the stories that cover it, and whether those stories are verified.</div>
    <div style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead><tr style="text-align:left;border-bottom:1px solid var(--cc-border);">
          <th style="padding:6px;">Req</th><th style="padding:6px;">Statement</th><th style="padding:6px;">Priority</th><th style="padding:6px;">Fulfilled by</th><th style="padding:6px;">Status</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

    <div class="cc-section-title" style="font-size:16px;">Ask a question</div>
    <div class="cc-card" style="max-width:640px;">
      <input id="kb-q" type="text" placeholder="e.g. what covers REQ-011?" style="width:100%;padding:8px;border:1px solid var(--cc-border);border-radius:6px;font-family:inherit;" />
      <button id="kb-ask" style="margin-top:8px;padding:6px 14px;border-radius:6px;border:1px solid var(--cc-border);background:var(--cc-primary);color:#fff;cursor:pointer;">Ask</button>
      <div id="kb-answer" class="cc-stat-sub" style="margin-top:10px;"></div>
    </div>
  `;
}

function answerKbQuestion(q) {
  const query = q.trim().toLowerCase();
  if (!query) return { text: "Ask something about a requirement or story id, e.g. \"REQ-011\".", cite: null };

  const reqMatch = (state.plan.requirements || []).find((r) => query.includes(r.id.toLowerCase()));
  if (reqMatch) {
    const ids = reqMatch.fulfilled_by || [];
    const text =
      ids.length === 0
        ? `${reqMatch.id} (${escapeHtml(reqMatch.statement)}) has no story fulfilling it yet.`
        : `${reqMatch.id} is fulfilled by ${ids.join(", ")}.`;
    return { text, cite: "Knowledge base tab" };
  }

  const storyMatch = (state.plan.stories || []).find((s) => query.includes(s.id.toLowerCase()));
  if (storyMatch) {
    return { text: `${storyMatch.id} — ${storyMatch.title}. Status: ${stateLabel(storyState(storyMatch.id))}.`, cite: "Project management tab" };
  }

  const words = query.split(/\W+/).filter((w) => w.length > 3);
  const hit = (state.plan.requirements || []).find((r) => words.some((w) => r.statement.toLowerCase().includes(w)));
  if (hit) {
    return { text: `Closest match: ${hit.id} — ${hit.statement}`, cite: "Knowledge base tab" };
  }

  return { text: "I can't answer that from the data on this page.", cite: null };
}

/* ============ 9. DATA MODEL ============ */

const DATA_MODEL = [
  { table: "Company", fields: ["id", "name", "fiscal_year_start", "base_currency"], relates: "has many Accounts, Branches, Users" },
  { table: "Account", fields: ["id", "company_id", "code", "name", "type", "parent_account_id"], relates: "chart of accounts; belongs to Company; has many JournalLines" },
  { table: "JournalEntry", fields: ["id", "company_id", "entry_date", "memo", "posted_at", "created_by"], relates: "has many JournalLines" },
  { table: "JournalLine", fields: ["id", "journal_entry_id", "account_id", "debit", "credit"], relates: "belongs to JournalEntry and Account" },
  { table: "AuditLogEntry", fields: ["id", "entity_type", "entity_id", "action", "actor", "occurred_at", "before", "after"], relates: "polymorphic — references any financial record" },
  { table: "Customer", fields: ["id", "company_id", "name", "contact_info"], relates: "has many ARInvoices" },
  { table: "Vendor", fields: ["id", "company_id", "name", "contact_info"], relates: "has many APBills" },
  { table: "ARInvoice", fields: ["id", "customer_id", "issued_on", "due_on", "amount", "status"], relates: "belongs to Customer" },
  { table: "APBill", fields: ["id", "vendor_id", "issued_on", "due_on", "amount", "status"], relates: "belongs to Vendor" },
  { table: "SalesOrder", fields: ["id", "customer_id", "order_date", "status"], relates: "belongs to Customer; has many line items" },
  { table: "PurchaseOrder", fields: ["id", "vendor_id", "order_date", "status"], relates: "belongs to Vendor; has many line items" },
  { table: "BankAccount", fields: ["id", "company_id", "account_number", "bank_name"], relates: "has many CashTransactions" },
  { table: "CashTransaction", fields: ["id", "bank_account_id", "occurred_on", "amount", "reconciled"], relates: "belongs to BankAccount" },
  { table: "InventoryItem", fields: ["id", "company_id", "sku", "name", "quantity_on_hand"], relates: "has many StockMovements" },
  { table: "StockMovement", fields: ["id", "inventory_item_id", "quantity", "direction", "occurred_on"], relates: "belongs to InventoryItem" },
  { table: "Budget", fields: ["id", "cost_center_id", "period", "amount"], relates: "belongs to CostCenter" },
  { table: "CostCenter", fields: ["id", "company_id", "name"], relates: "has many Budgets" },
  { table: "Branch", fields: ["id", "company_id", "name", "location"], relates: "belongs to Company" },
  { table: "User", fields: ["id", "company_id", "name", "email", "role_id"], relates: "belongs to Role" },
  { table: "Role", fields: ["id", "name", "permissions"], relates: "has many Users" },
  { table: "AIAnalysisSuggestion", fields: ["id", "subject_type", "subject_id", "suggestion", "status", "approved_by"], relates: "requires user approval before it can alter any authoritative record (REQ-021)" },
];

function renderDataModel() {
  return `
    <div class="cc-section-title">Data model</div>
    <div class="cc-section-sub">
      A starting point derived from the requirements, not the final answer — subject to review before real tables are created.
    </div>
    <div class="cc-grid">
      ${DATA_MODEL.map(
        (t) => `
        <div class="cc-card">
          <h3>${escapeHtml(t.table)}</h3>
          <div class="cc-stat-sub"><strong>Fields:</strong> ${t.fields.map(escapeHtml).join(", ")}</div>
          <div class="cc-stat-sub" style="margin-top:6px;"><strong>Relations:</strong> ${escapeHtml(t.relates)}</div>
        </div>`
      ).join("")}
    </div>
  `;
}

/* ============ render dispatch ============ */

function render() {
  const app = document.getElementById("app");
  const { tabId, detailId } = parseHash();

  let body;
  if (state.loadError) {
    body = `<div class="cc-section-title">${TABS.find((t) => t.id === tabId).label}</div>${loadErrorBody()}`;
  } else {
    switch (tabId) {
      case "overview": body = renderOverview(); break;
      case "outcomes": body = renderOutcomes(detailId); break;
      case "users": body = renderUsers(detailId); break;
      case "guardrails": body = renderGuardrails(detailId); break;
      case "systems": body = renderSystems(); break;
      case "pm": body = renderPM(detailId); break;
      case "agents": body = renderAgents(detailId); break;
      case "kb": body = renderKB(detailId); break;
      case "datamodel": body = renderDataModel(); break;
      default: body = "";
    }
  }

  app.innerHTML = renderHeader() + `<main class="cc-main">${body}</main>`;

  app.querySelectorAll(".cc-toggle button").forEach((btn) => {
    btn.addEventListener("click", () => setMode(btn.dataset.mode));
  });

  const askBtn = document.getElementById("kb-ask");
  if (askBtn) {
    const run = () => {
      const q = document.getElementById("kb-q").value;
      const { text, cite } = answerKbQuestion(q);
      document.getElementById("kb-answer").innerHTML = `${escapeHtml(text)}${cite ? ` <em>(source: ${escapeHtml(cite)})</em>` : ""}`;
    };
    askBtn.addEventListener("click", run);
    document.getElementById("kb-q").addEventListener("keydown", (e) => {
      if (e.key === "Enter") run();
    });
  }
}

window.addEventListener("hashchange", render);

(async function init() {
  await loadData();
  render();
})();
