# WasteWise AI — Agent Loops

Defines *how* every task in `task.md` gets executed. This is the loop
Antigravity should run per task, and the larger loop it should run per
phase.

## Loop A — Per-task loop (run this for every checkbox in `task.md`)

```
1. READ
   - Re-read the relevant section(s) of program_spec.md, system_guide.md,
     and (if UI) design_guide.md for this specific task.
   - Check .agents/skills/ for an existing skill covering this kind of
     task (e.g. "adding a router", "adding a migration"). Use it if present.

2. PLAN
   - Produce a short implementation plan artifact: files to touch/create,
     approach, and the acceptance criteria you'll self-verify against
     (copy them from task.md — don't invent new ones silently).
   - If the task touches the data model, auth, or visual identity in a
     way not already specified: pause here for user review (per ai_rules.md #14).

3. IMPLEMENT
   - Write the code. Follow the conventions in system_guide.md §3.
   - If you find yourself repeating a procedure for the third time,
     stop and write it as a skill in .agents/skills/ before continuing.

4. VERIFY
   - Run it. For backend: run the relevant tests + hit the endpoint.
     For frontend: render the component/page and check it against
     design_guide.md. For AI modules: run both the heuristic fallback
     path and the model path.
   - Check off each acceptance criterion from task.md individually —
     don't bulk-approve.

5. SELF-REVIEW
   - Re-read your own diff once, specifically hunting for: hardcoded
     secrets, dropped differentiators, default-dark-purple styling,
     missing migration, missing fallback path (ai_rules.md).
   - Fix anything you find before moving on.

6. RECORD
   - Check off the task in task.md. Add any newly-discovered sub-tasks.
   - If you descoped anything, log it explicitly (ai_rules.md #6).
```

Don't skip steps 4–6 even for changes that feel small. Small unverified
changes are exactly where regressions hide.

## Loop B — Per-phase loop (run this at the start/end of each phase in `task.md`)

```
1. KICKOFF
   - Restate the phase's goal and its module list from program_spec.md.
   - Produce a phase-level plan (task ordering, any cross-task dependencies).
   - Confirm environment/config prerequisites are met (system_guide.md §4).

2. EXECUTE
   - Run Loop A for each task in the phase, in dependency order.

3. INTEGRATION CHECK
   - Once all tasks in the phase are individually done, run the phase's
     integration scenario if one exists (e.g. Phase 1: can a citizen
     report → see it on the officer map, end to end?).
   - Fix integration gaps even if each individual task "passed" — module
     boundaries are where the interesting bugs live.

4. DESIGN AUDIT (for any phase touching UI)
   - Screenshot or describe the resulting screens against design_guide.md
     §9's "what done looks like" bar. If it reads as a generic AI-app
     template, revise before proceeding.

5. PHASE SUMMARY
   - Report: built, descoped (with reasons), known issues, and what's
     needed from the user before the next phase starts.
```

## Loop C — Re-routing / re-plan trigger

Some tasks are inherently reactive to system state, not just code
(this loop describes the *product's* runtime behavior, so the agent
implements it as an actual system loop, not just a dev process):

```
ON new P0/P1 incident OR vehicle capacity/availability change OR
   hotspot severity upgrade OR significant travel-time change:
   1. Recompute affected route(s) via the optimization engine.
   2. Diff against the currently assigned route.
   3. If materially different, push the update over the live channel
      (WebSocket) to the driver app and the command center map.
   4. Log the re-route event (feeds analytics + "route efficiency" KPI).
```

Implement this as a real backend loop/event handler in Phase 3 — don't
simulate it only in the frontend.
