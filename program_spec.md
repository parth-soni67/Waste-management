# WasteWise AI — Program Spec

Source of truth for **what** to build. `system_guide.md` covers **how**;
`design_guide.md` covers **what it looks like**; `task.md` covers **in what
order**.

## 1. Problem & positioning

Existing "smart waste management" systems (SIH PS 8's baseline expectation)
give you: citizen complaints, GPS truck tracking, a dashboard, basic route
planning. These are reactive and modular.

WasteWise AI must **not** be presented as a smart-waste website. It is an
**intelligence and optimization engine** with a web/mobile interface on top.
Do not lead the product story with GPS tracking or complaint forms — those
are table stakes, not differentiators.

The system answers, in order:
> Where will waste become a problem → how severe → which vehicle → what
> route → and was it actually resolved?

## 2. Differentiators (build these deliberately, don't let them get lost)

1. **Predictive, not reactive** — hotspot prediction before severity peaks.
2. **AI incident understanding** — a photo + GPS becomes a structured
   incident (type, severity, area, risk, priority) with no manual tagging.
3. **Duplicate incident intelligence** — cluster N citizen reports of the
   same real-world pile into 1 incident (GPS proximity + image similarity +
   timestamp + text similarity).
4. **Dynamic priority** — priority score recalculates as conditions change
   (age, reports, predicted accumulation, SLA deadline).
5. **Dynamic routing** — routes recompute live on new P0/P1 incidents,
   traffic, capacity, or vehicle unavailability.
6. **Collection verification** — arriving at a GPS point is not proof of
   collection; require before/after image evidence + AI comparison.
7. **LangGraph municipal agent** — officers ask natural-language questions
   and get answers grounded in live system data, not a generic chatbot.
8. **Sensor-optional** — works on reports + existing data now; IoT bins/
   sensors are a future input, not a dependency.

## 3. Users & their surfaces

- **Citizens**: register/login, report waste (photo + GPS + optional text),
  track status, get notified, confirm resolution (Yes/No/Partial).
- **Drivers**: see assigned tasks + optimized route, navigate, update status
  (`START_ROUTE`, `ARRIVED`, `COLLECTING`, `COMPLETED`, `UNABLE_TO_COLLECT`,
  `REPORT_ISSUE`, `VEHICLE_FULL`, `VEHICLE_BREAKDOWN`), submit before/after
  evidence.
- **Municipal officers**: monitor incidents/vehicles/hotspots, approve or
  override routes, manage SLA violations, view analytics, query the AI agent.
- **Administrators**: manage users, vehicles, zones, schedules, waste
  categories, config, ML models, RBAC.

## 4. Functional modules

Each module below maps to a task group in `task.md`.

1. **Citizen Reporting** — auth, report creation, multi-image upload, GPS
   capture, category (optional — AI infers it), description, history,
   tracking, notifications, resolution confirmation.
2. **AI Waste Image Analysis (CV)** — waste detection & classification
   (mixed/plastic/organic/construction/e-waste), overflow & illegal-dumping
   detection, confidence score, severity, estimated area, risk, recommended
   action.
3. **Incident Intelligence Engine** — every report becomes an incident;
   severity computed from volume, type, location, duration, reports count,
   environmental/health risk, proximity to sensitive sites (hospital,
   school, market, residential).
4. **Duplicate Report Detection** — cluster reports by GPS proximity + image
   embedding similarity + timestamp window + text similarity → one incident.
5. **AI Priority Engine** — P0 (Emergency) → P4 (Low), recomputed on a
   schedule/trigger from severity + type + location risk + incident age +
   report count + predicted accumulation + sensitive-area proximity + SLA.
6. **Waste Hotspot Prediction** — probability model over historical reports,
   collection data, complaint frequency, time/day/season, weather, location
   type, event calendar → risk map (Low/Medium/High/Critical) + expected
   peak window.
7. **Predictive Collection Planning** — proactively recommend
   vehicle + time before an incident is even reported, from hotspot output.
8. **Vehicle Intelligence** — location, status
   (`AVAILABLE/ASSIGNED/EN_ROUTE/COLLECTING/FULL/MAINTENANCE/OFFLINE`), route,
   capacity, assigned/completed incidents, idle time, ETA.
9. **Dynamic Route Optimization** — continuous re-optimization (not
   once-a-day) from vehicle location/capacity, incident priority, predicted
   hotspots, travel time, deadlines, accessibility, volume; re-route on
   trigger events.
10. **Vehicle Assignment Engine** — best vehicle, not nearest: weighs
    distance, capacity fit, vehicle type, current workload, priority, route
    compatibility, ETA.
11. **Driver Application** — dashboard (location, tasks, route, priority,
    nav, ETA, capacity) + status actions above.
12. **Collection Verification** — evidence trail (before/after image, GPS,
    timestamp, driver confirmation, optional citizen confirmation) → AI
    visual-clearance comparison → `VERIFIED` / needs-review.
13. **Citizen Resolution Verification** — post-collection Yes/No/Partial;
    multiple "No" responses can reopen the incident.
14. **Municipal Command Center** — live KPIs (active incidents, predicted
    hotspots, active vehicles, collections today, SLA violations, avg
    response time, waste collected, route efficiency) + live map layer
    (vehicles, incidents, hotspots, priority zones, routes).
15. **AI Municipal Decision Assistant (LangGraph)** — supervisor agent
    routing to Data / Prediction / Vehicle / Analytics / Hotspot / Route
    sub-agents → Decision agent → grounded, explainable answer. Must query
    real system data/tools, not just the LLM's own knowledge.
16. **Analytics & Reports** — trends (waste, zone, complaints), collection &
    vehicle & route efficiency, response time, SLA compliance, repeat
    incidents, hotspot accuracy, citizen satisfaction; daily/weekly/monthly/
    zone/vehicle/incident reports.
17. **Environmental Impact Dashboard** — estimated fuel saved, distance
    reduced, CO₂ avoided, waste diverted/recycled, efficiency gains (ties to
    SDG 11 & SDG 12).
18. **Smart Alerts** — citizen (status changes), officer (critical incident,
    predicted hotspot, breakdown, deviation, SLA violation, capacity
    exceeded), AI-generated proactive alerts.
19. **Role-Based Access Control** — citizen (own data + public), driver
    (own tasks), officer (operational data), admin (full access).

## 5. Core entities (data model seed — see `system_guide.md` for schema)

`User, Citizen, Driver, Vehicle, Incident, Report, WasteAnalysis, Prediction,
Hotspot, Route, Collection, Verification, Notification, Zone, Feedback`

## 6. AI/ML layer summary

- **Computer Vision**: waste classification, severity estimation, before/
  after verification.
- **NLP**: complaint understanding, text classification, duplicate text
  similarity.
- **Prediction**: hotspot probability, waste generation forecasting.
- **Optimization**: vehicle assignment, routing, dynamic re-routing.
- **Agentic AI (LangGraph)**: multi-step municipal decision support.

For hackathon timelines, it's acceptable — and expected — to start with
strong heuristics / classical ML (e.g. rule-based severity scoring,
XGBoost/LightGBM for hotspot probability, embedding-similarity clustering
for duplicates) and swap in heavier models opportunistically. Every AI
module must degrade gracefully to a heuristic if the model is unavailable —
never let an ML failure break the demo.

## 7. Phased scope

**Phase 1 — MVP**: citizen reporting, image upload, AI waste classification,
incident management, GPS/map, vehicle management, basic route optimization,
municipal dashboard, the 3D landing/sign-in experience.

**Phase 2 — Differentiation**: duplicate detection, priority engine, hotspot
prediction, dynamic route optimization, vehicle assignment, collection
verification.

**Phase 3 — Winning features**: LangGraph municipal agent, predictive
collection planning, before/after AI verification polish, what-if
simulation, advanced analytics, environmental impact estimation.

Full task breakdown with acceptance criteria: see `task.md`.

## 8. End-to-end reference scenario (also the demo script)

1. Citizen uploads a garbage-pile photo → CV returns `Mixed Waste, Severity:
   High`.
2. GPS locates it; system finds 6 similar reports within 100m → clustered
   into 1 incident.
3. Priority engine → `P1` (high area activity + hours unresolved).
4. Hotspot model → `89% accumulation probability`.
5. Vehicle engine evaluates candidates by capacity/distance/suitability →
   picks the best, not nearest, vehicle.
6. Route optimizer inserts the stop into the live route.
7. A new P0 incident appears mid-route → route recalculates automatically.
8. Driver completes collection, submits before/after evidence.
9. Verification AI → `93% clearance confidence → VERIFIED`.
10. Citizen notified: "Your reported waste issue has been resolved."
11. Event stored → feeds future hotspot predictions.

## 9. Success metrics

- **Operational**: response time ↓, route distance ↓, idle time ↓, vehicle
  utilization ↑, SLA compliance ↑.
- **AI**: classification accuracy, hotspot prediction accuracy, duplicate
  detection accuracy, verification accuracy.
- **Citizen**: resolution time, satisfaction, repeat-complaint rate.
- **Environmental**: fuel reduction, CO₂ reduction, collection efficiency.

## 10. USP (for pitch deck / demo narration)

> A predictive and autonomous waste-management intelligence platform that
> transforms citizen reports and municipal data into proactive waste
> predictions, intelligent prioritization, dynamic collection routes, and
> verified resolution.

Short version: *"We don't just track garbage trucks. We predict where waste
will appear, decide what needs attention first, dynamically optimize
collection, and verify that the problem was actually solved."*
