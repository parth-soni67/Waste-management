# WasteWise AI

**AI-Powered Predictive Waste Management & Municipal Intelligence Platform**
Built for Smart India Hackathon 2026 — Problem Statement 8 (LDRP-ITR)

> We don't just track garbage trucks. We predict where waste will appear,
> decide what needs attention first, dynamically optimize collection, and
> verify that the problem was actually solved.

Core philosophy: **Report → Understand → Predict → Prioritize → Optimize →
Collect → Verify → Learn**

---

## What this repo root contains

This root is set up for **Google Antigravity** to drive the build agentically.
Read files in this order before generating code:

| File | Purpose |
|---|---|
| `master_prompt.md` | The prompt that kicks off the whole build. Paste this in first. |
| `readme.md` | This file — orientation. |
| `program_spec.md` | Full product spec: modules, data model, architecture, phased scope, demo script. |
| `system_guide.md` | Tech stack, repo layout, environments, conventions, deployment. |
| `design_guide.md` | Visual identity, design system, the merged 3D landing/sign-in spec, and available design MCP tooling. |
| `security_guide.md` | Authentication, authorization, input validation, and verification requirements. |
| `ai_rules.md` | Hard constraints the agent must always follow. |
| `loops.md` | The plan → build → verify → fix loop used for every task. |
| `task.md` | Phased, checkable backlog with acceptance criteria. |
| `.agents/` | Antigravity-native rules & skills directory (created during scaffold). |

## Three interfaces, one platform

- **Citizen App** — report waste, upload photos, track resolution.
- **Driver App** — assigned tasks, optimized routes, collection evidence.
- **Municipal Command Center** — live map, predicted hotspots, dynamic
  routing, analytics, and a LangGraph AI agent for natural-language
  decision support.

## Quick start (once scaffolded)

```bash
docker compose up --build
# frontend: http://localhost:3000
# backend:  http://localhost:8000/docs
```

See `system_guide.md` for full environment setup, and `task.md` for what's
built vs. pending.

## Status

Tracked live in `task.md`. Do not update this README's status manually —
`task.md` is the source of truth for progress.
