# PeakLog — project memory

Last updated: 19 Oct 2026. Single-file static PWA (`index.html`), localStorage key `peaklog.v1`, no backend. Deploys from GitHub to Vercel (see `DEPLOY.md`). Never store secrets here.

## Current objective
Rotating training blocks that suit Arnold's body, deadlifts and squats properly programmed, loaded posture work inside the lift days, and a weekly "growing or slipping?" snapshot — without losing any logged data.

## PRD — rotation + snapshot (19 Oct 2026)
- **Problem.** The programme was one static week. No conventional deadlift, RDL as the only hinge, squats thin on the legacy log, posture work not loaded, and no single answer to "am I going backward?".
- **User.** One lifter, 37, ~78 kg / ~14% body fat, desk job, 45-minute lift cap, Mon/Wed/Fri/Sat lifts + rower Tue + treadmill Z2 Thu + Sunday rest.
- **Success.** Blocks rotate by date with no manual step; every lift day fits 45 min; every block has squat + deadlift + posture; weights re-set correctly at block changes; all prior data survives; the snapshot gives a verdict and the numbers behind it.
- **Scope.** Rotation engine, 3 blocks x 4 lift days, exercise library additions, block-aware prescriptions, Workout tab follows the rotation, snapshot card (Today + Review), migration + backup. Out of scope: nutrition phase changes, cardio rotation, notifications.
- **Constraints.** Local-first, no build step, 45-minute hard cap, existing session screen/progression semantics unchanged for pre-rotation dates.
- **Risks.** Wrong starting weights on new lifts (mitigated: seeded from RDL / squat / deadlift history, else the InBody estimate flagged "calibration"); rep-range change misreading progress (mitigated: e1RM conversion and e1RM-based snapshot); false "Slipping" from deloads or pre-logging weeks (mitigated and tested).

## Decisions
- **Rotation = Build (6–10) → Strength (3–6) → Volume (8–15), 6 weeks each (5 loading + deload), repeating.** Anchors are an append-only list so "start next block now" never relabels past weeks.
- **Squat and deadlift anchors stay in every block**; variations rotate (hack/front/Bulgarian, conventional/trap-bar). Stiff-legged deadlift replaces RDL on Lower A. RDL stays in the library as `retired` so history resolves, and SLDL seeds from logged RDL weights x 0.9.
- **"Posture workouts" interpretation.** The app contained no posture day or home routine (only a "mobility / rest" label and a cardio form cue). Read as: make posture work weight-based and keep it inside the existing gym days. Built as compound+posture supersets (face pull, CS row, rows, rear delt fly, Y-raise, hip thrust, deadlifts, farmer's carry), 29–31 sets/week per block. If a separate home routine was meant, say so and it can be added as an optional list.
- **One plan, two logging screens.** `TEMPLATE` (old static PPL) was removed; `tplFor(date)` builds the Workout-tab day from the rotation, so the Today session card and the Workout tab can't disagree. Days already logged are stored in full and untouched.
- **Snapshot judged on strength first (best e1RM vs median of last 3 non-deload weeks: up >= +1%, down <= -2%), consistency second.** Body weight/fat shown for context, not scored; the existing weight-trend card (`projection()`, gain mode) already owns bulk judgement.
- **The bulk is intentional and off-limits (confirmed by Arnold, 19 Oct 2026).** He is bulking from October 2026 for at least 5 months. The August goal (12 Aug 2026) and the Phase 1/2 nutrition config (ended 3 Sep) are out of date on purpose. Do NOT refresh them, change targets or macros, add a phase, reset `appliedPhase`, or raise them as stale/blocked. With no active phase the app runs in its gain / lean-bulk mode. The rotation and snapshot never write to `targets`, `profile.goalDate` or the phase config (the planRev-8 migration is tested to leave them alone).
- **Frozen pre-rotation week.** `WM_DAYS` lift days are kept only for dates before the rotation began, so old sessions render as they were done.

## Validation (19 Oct 2026)
- `node tests/workout-module.test.mjs` 22 pass; `node tests/rotation.test.mjs` 39 pass.
- Playwright (Chromium) on a fresh install and on a seeded planRev-7 database with 11 weeks of history incl. 33 RDL sets: all 8 tabs render with no console errors; a real session logs with rep ranges; Strength switch converts weights; legacy July day and backup intact.
- Every lift day, every block, week 1 and deload: estimated <= 43 min (36–41 typical) by the model in `wmEstimateMin`.

## Known limitations / next actions
- Session time is modelled (35 s a set, prescribed rests); real sessions may run longer. The cap still auto-flags unlogged sets as skipped.
- Starting loads for brand-new lifts are estimates until the first session is logged.
- Trap-bar deadlift assumes a trap bar (or sumo as the substitute).
