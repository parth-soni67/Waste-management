# WasteWise AI — Workspace Rules

This is the `.agents/rules/` directory for workspace-level rules that
Antigravity auto-loads.

## Canonical sources (always re-read before making decisions)

- **What to build**: `program_spec.md`
- **How to build it**: `system_guide.md`
- **What it looks like**: `design_guide.md` (overrides all default styling instincts)
- **Security requirements**: `security_guide.md` (mandatory, not optional hardening)
- **Hard constraints**: `ai_rules.md`
- **Build loop**: `loops.md` (every task, no exceptions)
- **Task backlog**: `task.md` (source of truth for progress)

## Quick rules (full detail in `ai_rules.md`)

1. Never skip verification (Loop A step 4-5) — even for "small" changes.
2. Never use dark-purple-blue AI-app styling — re-read `design_guide.md`.
3. Never hardcode secrets — use `core/config.py` / env vars.
4. Every AI feature needs a non-AI fallback path.
5. Every schema change ships with its Alembic migration.
6. Server-side RBAC on every endpoint — never trust frontend role hiding.
7. File uploads: validate magic bytes, re-encode images, strip EXIF.
