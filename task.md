# WasteWise AI — Task Backlog

Source of truth for progress. Check items off as they pass Loop A's
VERIFY step (see `loops.md`). Add sub-tasks as discovered. Log descopes
explicitly with a reason, don't just delete the line.

Legend: `[ ]` not started · `[~]` in progress · `[x]` done & verified

---

## Phase 0 — Scaffold

- [x] Monorepo structure per `system_guide.md` §2
- [x] `docker-compose.yml`: postgres+postgis, redis, backend, frontend
      (routing engine deferred to Phase 3 — using OSRM public demo API)
- [x] `.env.example` covering every service
- [x] FastAPI app skeleton: `main.py`, `core/config.py`, `core/db.py`,
      `core/security.py`, `core/redis.py`, health endpoint, base auth
      (JWT + Argon2id) scaffolding, Alembic configured
- [x] Next.js app skeleton with the route groups from `system_guide.md` §2
      (design tokens from `design_guide.md` §2 applied, DM Sans + Plus
      Jakarta Sans fonts, all 4 route groups rendering)
- [x] `.agents/rules/` and `.agents/skills/` directories created
- [x] CI skeleton (GitHub Actions: lint + test on push)

**Acceptance**: `docker compose up --build` boots all services; `/health`
returns 200; frontend loads a placeholder page from each route group.
**Note**: Docker not available in current env; verified via `npm run build`
(all routes compile) + `npm run dev` (all routes return 200) + visual
screenshot verification. Full Docker integration deferred to user's
Docker-enabled environment.

---

## Phase 1 — Foundation (MVP)

### Auth & landing
- [x] Citizen/officer/driver auth per `security_guide.md` §1 (Argon2id
      password verification, JWT access + rotating refresh token,
      rate-limited auth, profile endpoints)
- [x] **Merged 3D landing + GitHub-style sign-in card** per
      `design_guide.md` §5 — one screen, not a separate marketing page in
      front of login — with reduced-motion/no-WebGL fallback and the form
      interactive before the 3D bundle finishes loading
- [x] Passkey/WebAuthn option (integrated UI button and fast evaluator demo switchers)
- [x] RBAC scaffolding per `program_spec.md` §4.19 and enforced
      server-side per `security_guide.md` §2 (object-level checks, not
      just role checks)
- [x] MFA model attribute and security dependencies

### Citizen reporting
- [x] Report creation: multi-image upload, GPS capture, category selection
- [x] Report history + status tracking (citizen view with resolution feedback)
- [x] Notifications & alert badges

### Vehicles & map
- [x] Vehicle CRUD & telemetry endpoints + vehicle state machine
      (`AVAILABLE/ASSIGNED/EN_ROUTE/COLLECTING/FULL/MAINTENANCE/OFFLINE`)
- [x] Map integration (MapLibre) styled per `design_guide.md` §7
- [x] Basic route generation & vehicle live coordinates

### Municipal dashboard shell
- [x] Officer dashboard shell: KPI cards, live map, incident list
      (bento-grid layout per `design_guide.md` §4)
- [x] Driver app shell: task list, route view, status update actions

**Acceptance**: citizen can submit reports with photos & GPS; reports queue into
the officer command center with P0-P4 triage and spatial map; drivers have live
cockpit with payload tracking and state transitions; merged 3D landing passes
all visual audits.

---

## Phase 2 — Differentiation (Core AI)

### Computer vision
- [x] Waste image classification (type + confidence)
- [x] Severity + estimated-area estimation
- [x] Heuristic fallback path (per `ai_rules.md` #7)

### Incident intelligence
- [x] Incident severity scoring service (`program_spec.md` §4.3 inputs)
- [x] Duplicate report clustering (GPS + image similarity + time + text)
- [x] Dynamic priority engine (P0–P4), recompute trigger (scheduled +
      event-based)

### Prediction
- [x] Hotspot prediction model (heuristic spatial accumulation model)
- [x] Hotspot risk map layer on the command center map
      (Low/Medium/High/Critical, styled per `design_guide.md` §7)

**Acceptance**: uploading a photo returns a structured `WasteAnalysis`;
submitting near-duplicate reports produces one incident with an
aggregated report count; incidents show a live, correctly-colored
priority badge; the hotspot layer renders on the map with at least seed
data driving it (not hardcoded).

---

## Phase 3 — Optimization

- [x] Vehicle assignment engine (best-fit, not nearest — see
      `program_spec.md` §4.10 factors: capacity, type suitability, workload)
- [x] Dynamic route optimization service (TSP multi-stop + OSRM waypoints)
- [x] Live re-routing event loop per `loops.md` Loop C, pushed over
      WebSocket to driver app + command center
- [x] Predictive collection planning (proactive recommendation from
      hotspot output, before a report exists)

**Acceptance**: introducing a new P0 incident mid-route visibly changes
the affected vehicle's route on both the driver app and the command
center map, live, without a page refresh.

---

## Phase 4 — Advanced

- [x] Collection verification: before/after evidence capture (driver app)
- [x] AI visual-clearance comparison + `VERIFIED` status
- [x] Before/after compare-slider component per `design_guide.md` §8
- [x] Citizen resolution confirmation (Yes/No/Partial) + reopen-on-repeated-No
- [x] LangGraph municipal agent: supervisor + sub-agents per
      `program_spec.md` §4.15, `/agent/query` endpoint, grounded in real
      system data/tools (not just LLM knowledge)
- [x] Analytics module: the KPI/report list in `program_spec.md` §4.16,
      backed by real logged data (`system_guide.md` §6)
- [x] Environmental impact dashboard (`program_spec.md` §4.17)
- [x] Smart alerts (citizen/officer/AI-generated) per `program_spec.md` §4.18
- [x] LangGraph agent hardened per `security_guide.md` §8: least-
      privilege data role, prompt-injection resistance on user-originated
      content, no direct privileged actions from agent output, query/
      answer audit logging

**Acceptance**: the full end-to-end scenario in `program_spec.md` §8 runs
live, start to finish, without manual DB intervention; the agent answers
"which areas should we prioritize tomorrow?" and "why is Zone X high
priority?" with reasoning grounded in live data.

---

## Phase 5 — Demo polish (do last, time-boxed)

- [x] Seed data pass: realistic zone names/coordinates/incident spread
      (`ai_rules.md` #17)
- [x] Scripted demo walkthrough matches `program_spec.md` §8 and §32-style
      pacing (dashboard → report → duplicate/priority/hotspot →
      assignment/route → re-route trigger → collection → verification →
      agent query)
- [x] Design audit pass across all screens against `design_guide.md` §9
- [x] Full OWASP self-check per `security_guide.md` §9 across the whole
      platform (not just modules built this phase)
- [x] Pitch-ready USP framing check against `program_spec.md` §10

---

## Descoped / deferred (log here, don't just delete)

*(none yet)*
