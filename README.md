# PeakLog

Personal, local-first tracker for training, supplements and nutrition, with an automatic weekly review and trend charts. Built for Arnold's summer body-composition goal: visible abs / ~9-10% body fat by end of July 2026.

## What it does

- **Today** — goal countdown, today's planned session, nutrition progress bars, one-tap supplement checklist.
- **Workout** — the day's planned session, built from the current rotation block (same exercises, sets and weights as the session screen). Log sets, reps, weight and cardio; auto volume calculation.
- **Nutrition** — calories, protein, net carbs (keto ceiling), fat, water; 16:8 fasting window timer; saved "my foods" quick-pick.
- **Supplements** — full stack with timing (Rainbow Dust + creatine, Salte Electrolytes, collagen, D3+K2, omega-3, Aduna cacao, magnesium glycinate, ACV) and adherence streak.
- **Plan** — Rotation (the 18-week cycle, this week's prescriptions, block controls), This week, the 5-week cut, Cardio and Core references, phase plan and editable nutrition targets.
- **Weekly Review** — every Monday-to-Sunday: a Growing / Holding / Slipping snapshot on top, then sessions done vs due, volume per muscle group, supplement adherence, macro averages vs target, body trajectory and plain-language flags. Reads both the session screen and the Workout tab.
- **Trends** — weight, body fat, weekly volume, protein adherence charts.
- **Data** — JSON export / import for backup and moving between devices, and a full reset.
- **Rotation** — three 6-week blocks that repeat: **Build** (6–10 reps, hypertrophy base) → **Strength** (3–6 reps, heavy) → **Volume** (8–15 reps, new angles, joint-friendlier variations). Each block is five loading weeks plus a deload (about 10% lighter, one set fewer). The week has six lifting days and one rest day. **Legs are trained three times a week** (Legs 1 squat, Legs 2 deadlift, Legs 3 glutes and single-leg) because the InBody shows the lower body behind the upper body; the upper body gets three sessions (Push, Pull, and an Upper day for shoulders and arms). **The rest day is only ever Friday or Sunday** and alternates week by week (Friday weeks move the Upper day to Sunday); each week can be switched to Friday, Sunday or both off (a five-day week) on Plan → Rotation. **The weekly layout changes after three weeks of every block**: weeks 1–3 run layout A (Mon Push, Tue Legs 1, Wed Pull, Thu Legs 2, Fri Upper, Sat Legs 3), weeks 4–6 run layout B (Mon Pull, Tue Legs 2, Wed Push, Thu Legs 3, Fri Upper, Sat Legs 1). Every day lists its exercises with sets × reps @ weight, and every lift day stays under the 45-minute cap (checked in the tests). Cardio is optional on a bulk: the rower intervals and incline Zone 2 sessions stay one tap away on the Today card (Tue / Thu) and can be logged on the Workout tab, but never replace the lifting. Squat, deadlift, press and pull are in every block; the variations rotate. Squats: back squat on Lower A every block plus a second pattern (hack / front / Bulgarian) on Lower B. Deadlifts: stiff-legged deadlift on Lower A (replaces the Romanian deadlift) and a conventional deadlift on Lower B (trap-bar or sumo in the Volume block). Posture is trained under load inside the lift days as compound+posture supersets (face pulls, rows, rear delts, Y-raises, hip thrusts, hinges, farmer's carry), about 30 sets a week — no separate posture day. Every weight is built from your InBody lean body mass (heavier compounds a larger share, accessories a smaller one) until you have logged that lift; a new scan on the Data tab rescales the whole plan. A new block re-sets every weight from the last session's estimated 1RM so 12-rep weights are not used for 5s; the stiff-legged deadlift starts from the logged Romanian-deadlift numbers. "Start next block now" and "Restart this block" live on Plan → Rotation.
- **Fast logging** — built to be used with one thumb between sets. The session screen shows one exercise (or superset pair) at a time; the rest fold to a line and the next one opens itself when you finish. Per exercise: a weight box with big ± buttons (type it or step it, it applies to every set), set buttons (tap a set to log it at the suggested reps), rep buttons (tap the reps you actually got and that set logs), and **All sets × R** to log the rest in one tap. **Undo last set**, tap-to-skip on the rest timer, and **Log all remaining sets as prescribed** for a session done exactly as planned. Suggested reps are what you just did, else the same set last session, else the bottom of the range. The page keeps its scroll position on every tap. The Workout tab has the same rep buttons and a "fill the other sets" button instead of typing every box.
- **Weekly snapshot** — Today (last completed week) and top of Review (any week). Verdict is Growing / Holding / Slipping / Deload / Baseline from each lift's best estimated 1RM against the median of its last three non-deload weeks (so a block change or a planned deload never reads as going backward), consistency (sessions done vs due), volume vs last week, new bests, body weight/fat for context, a four-week trail and next-week guidance.
- **Workout module** (PRD build) — Upper/Lower lift week plus rower intervals and treadmill Zone 2, with InBody-anchored starting weights, double progression (top of range twice → +increment; below range twice → deload 10%), a 45-minute lift cap that auto-flags remaining sets skipped, rower pace targeting (2:00–2:10 seed, −1 s when all intervals land within 5 s, floor 1:50), and Sunday fast-day locks (rest or flat Z2 only). Phase 2 (8 Aug, read from the phase config) adds +1 set per exercise, unlocks treadmill HIIT and an optional third cardio session, and flags pre/post-lift carbs on the Nutrition tab. Start sessions from the Today card; the week view lives under Plan → Programme; the editable InBody baseline lives on the Data tab.

## Tech

Single static page. Vanilla JS, no framework, no build step, no backend. Data lives in `localStorage` on the device. PWA (installable, offline via service worker).

## Run locally

Open `index.html` in a browser, or serve the folder:

```
npx serve .
```

## Deploy (Vercel)

No build needed — it is a static site.

```
npm i -g vercel
vercel --prod
```

When prompted: framework preset **Other**, build command **none**, output directory **./**. `vercel.json` sets the manifest content type and a no-cache header on the service worker.

## Data model

`localStorage` key `peaklog.v1`:

- `profile`, `targets`
- `bodyLog[]` — `{date, weight, bodyFat, note}` (seeded with the 10 Jun 2026 InBody baseline)
- `inbody[]` — full InBody snapshots
- `workouts{date}`, `nutrition{date}`, `supplements{date}`
- `myFoods[]`
- `wm` — workout module: `inbody` baseline (78.1 kg / 13.9% seed, editable on the Data tab), `sessions{}`, `setLogs[]`, `cardioLogs[]`, `rowerPaceSec`, `activeSessionId`, `rotation.anchors[]` (`{startDate, startBlock}` — the Monday a block's week 1 began; appended to, never rewritten, so past weeks keep their labels). Sessions freeze their plan (`plan`, `blockId`, `week`, `deload`); set logs record the `range` they were done at.
- `planRev` 10 (rotation, six-day week, legs three times with a Friday/Sunday rest day; `wm.restOverride{mondayISO:'sun'|'fri'|'both'}` holds the per-week choices): each update writes a one-time raw copy of your data to `peaklog.v1.bak-planRev<N>` before migrating (one download button per copy on the Data tab) and never removes a logged workout, set, weigh-in or meal; only untouched, unlogged future Workout-tab days are rebuilt. Retired exercises (Romanian deadlift) stay in the library so history resolves.

## Tests

Two node test suites (no dependencies):

```
node tests/workout-module.test.mjs   # engine: prescriptions, progression, fast-day locks, phase boundary, rower pace, 45-min cap, persistence
node tests/logging.test.mjs          # fast logging: grouping, rep buttons, suggestions, undo, all-sets, progression
node tests/rotation.test.mjs         # rotation maths, deadlift/squat/posture programming, 45-min fit of every day, block-change weight conversion, data survival across the update, weekly snapshot verdicts
```

Export from the Data tab produces a versioned JSON file; import migrates forward.

## Privacy

All data is on your device only. Nothing is sent anywhere. Back up with Export.
