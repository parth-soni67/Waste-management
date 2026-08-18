# WasteWise AI — System Guide

Technical source of truth. If `program_spec.md` conflicts with this file on
*how* to implement something, this file wins; if it conflicts on *what* to
build, `program_spec.md` wins.

## 1. Technology stack

**Frontend**: React + Next.js (App Router), TypeScript, Tailwind CSS,
Framer Motion (2D motion), React Three Fiber + drei (3D — landing/sign-in
only, see `design_guide.md`), Recharts or visx (analytics charts),
MapLibre GL JS (map rendering).

**Backend**: Python, FastAPI, Pydantic v2, SQLAlchemy 2.0 (async) +
Alembic migrations. WebSockets (FastAPI native) for live map/route updates.

**AI/ML**: PyTorch (or ONNX Runtime for inference), OpenCV, scikit-learn,
XGBoost/LightGBM for tabular prediction (hotspot probability), sentence
embeddings (e.g. a small open-source embedding model) for duplicate/text
similarity, LangGraph + an LLM provider (configurable, do not hardcode a
single vendor) for the municipal agent.

**Database**: PostgreSQL 16 + PostGIS (all geospatial queries — proximity,
zone containment, clustering — go through PostGIS, not app-level haversine
math). Redis for caching, pub/sub of live updates, and rate limiting.

**Maps/Routing**: OpenStreetMap tiles + an open routing engine (OSRM or
GraphHopper self-hosted, or a routing API if self-hosting is impractical for
the hackathon timeline — flag this as a config choice in `task.md`, don't
silently pick one).

**Real-time**: WebSockets for vehicle position, route changes, and incident
updates pushed to the Municipal Command Center and Driver App.

**Deployment**: Docker Compose for local/dev; each service in its own
container (`frontend`, `backend`, `postgres`, `redis`, optionally
`routing-engine`). Keep production deployment notes in this file once a
target (e.g. a specific cloud) is chosen — do not assume one.

## 2. Repository layout

```
/
├── master_prompt.md
├── readme.md
├── program_spec.md
├── system_guide.md
├── design_guide.md
├── ai_rules.md
├── loops.md
├── task.md
├── .agents/
│   ├── rules/              # workspace rules Antigravity auto-loads
│   └── skills/              # reusable how-to procedures, one .md per skill
├── docker-compose.yml
├── apps/
│   ├── web/                 # Next.js app: citizen + officer + driver surfaces
│   │   ├── app/
│   │   │   ├── (public)/    # landing, sign-in, sign-up — the 3D experience
│   │   │   ├── citizen/
│   │   │   ├── driver/
│   │   │   └── officer/     # municipal command center
│   │   ├── components/
│   │   ├── lib/
│   │   └── styles/
│   └── api/                 # FastAPI backend
│       ├── app/
│       │   ├── main.py
│       │   ├── core/        # config, security, db session
│       │   ├── models/      # SQLAlchemy models (one file per entity group)
│       │   ├── schemas/     # Pydantic schemas
│       │   ├── routers/     # one router per module (reports, incidents, ...)
│       │   ├── services/    # business logic, one per module in program_spec
│       │   ├── ai/          # CV, NLP, prediction, optimization, agent code
│       │   └── ws/          # websocket handlers
│       ├── alembic/
│       └── tests/
├── packages/
│   └── shared-types/        # generated/shared TS types from the OpenAPI schema
└── infra/
    └── docker/
```

Every module in `program_spec.md` §4 should map to a `service` in
`apps/api/app/services/` and, where it needs its own API surface, a
`router` in `apps/api/app/routers/`. Keep this 1:1 mapping — it's what
lets `task.md` track progress module-by-module.

## 3. Conventions

- **Python**: black + ruff, type hints everywhere, async endpoints, one
  Pydantic schema per direction (`XCreate`, `XRead`, `XUpdate` — don't
  reuse ORM models as API schemas).
- **TypeScript**: strict mode on, no `any` without a comment explaining why,
  components colocated with their styles/tests.
- **API design**: REST for CRUD-shaped resources, WebSocket channels for
  live position/route/incident-status streams, a dedicated
  `/agent/query` endpoint for the LangGraph assistant.
- **Migrations**: every schema change ships an Alembic migration in the
  same task/commit as the model change. Never hand-edit the DB.
- **Geospatial**: store coordinates as PostGIS `geography(Point, 4326)`;
  do proximity/clustering in SQL (`ST_DWithin`, `ST_ClusterDBSCAN`), not in
  Python, once data volume matters.
- **Config & secrets**: all via environment variables, loaded through a
  single `core/config.py` (Pydantic `BaseSettings`). Never hardcode a key,
  a model name, or an API URL inline in a service file.
- **Auth, validation, and file-upload handling**: implement exactly as
  specified in `security_guide.md` — that file is the authoritative spec
  for `core/security.py`, auth routers, and upload handling, not a
  suggestion layered on afterward.
- **AI module fallback**: every AI-dependent service must define an
  explicit fallback path (heuristic or cached result) so the demo never
  hard-fails if a model call errors out.

## 4. Environments

- `local` — Docker Compose, seeded demo data (see `task.md` Phase 0/1 for
  the seed script requirement — this is what the SIH demo runs on).
- `.env.example` must be kept current with every new required variable.

## 5. Testing

- Backend: pytest, one test module per service; AI modules get both a unit
  test (heuristic path) and a smoke test (model path, skipped if model
  unavailable in CI).
- Frontend: component tests for anything stateful; a scripted
  Playwright/Cypress run of the end-to-end demo scenario in
  `program_spec.md` §8 is required before Phase 3 is considered done.

## 6. Observability (minimum viable)

- Structured logging (JSON) from the backend.
- A `/health` endpoint per service.
- Basic request timing so the analytics module (`program_spec.md` §4.16)
  has real data to show, not mocked numbers, by the time of the demo.
