# PeakLog

Personal, local-first tracker for training, supplements and nutrition, with an automatic weekly review and trend charts. Currently running the 13-week upper/lower lean bulk (10 Nov 2026 to 9 Feb 2027).

## What it does

- **Today** — the bulk at a glance (weight, body fat, 2-week trend and calorie advice), today's session, nutrition progress bars, one-tap supplement checklist.
- **Workout** — the day's finished sessions, plus a manual log (same exercises, sets and weights as the session screen). Log sets, reps, weight and cardio.
- **Nutrition** — calories, protein, carbs, fat, water (3000 ml, +500 ml on sauna days with the "Sauna day" button), eating-window times, saved quick-add meals.
- **Supplements** — the four-slot stack (morning espresso + creatine, first meal D3/omega-3, training/sauna electrolytes and whey, evening magnesium) with an adherence streak.
- **Plan** — Rotation (the 13-week programme: phase, week strip, roadmap, this week day by day), This week, the 5-week cut, Cardio and Core references, editable nutrition targets and the rules (progression, calories, protein, alcohol, cold, sauna, sleep).
- **Weekly Review** — every Monday-to-Sunday: a Growing / Holding / Slipping snapshot, sessions done vs due, volume per muscle group, supplement adherence, macro averages vs target, body trajectory and flags.
- **Trends** — weight, body fat, weekly volume, protein adherence charts.
- **Data** — JSON export / import for backup and moving between devices, download of the pre-update safety copies, and a full reset.
- **The programme** — "13-week upper/lower lean bulk", embedded as data (`PROG` in `index.html`). It starts **Tue 10 Nov 2026**; a programme week runs **Tuesday to Monday** (week 1 = 10-16 Nov, week 13 = 2-8 Feb 2027) and the start date is never snapped to a Monday. Final review and InBody scan: 9 Feb 2027. Weekdays: Tue Upper A, Wed Lower A, Thu rest from lifting (Zone 2 bike), Fri Upper B, Sat Lower B, Sun Upper C, Mon rest from lifting (VO2max 4x4). Phases: **Block 1a Intro** (weeks 1-3, set column A, RIR 3 then 2 to 1), **Block 1b Build** (weeks 4-6, column B, RIR 2 to 0), **Deload (Christmas)** (week 7, about 50% of column B sets, week-6 loads, RIR 4, only Tue/Wed sessions plus an optional Sat Upper B), **Block 2 Peak volume** (weeks 8-12, column C, RIR 2 to 0, lengthened partials on the last set of isolation lifts), **Taper + test** (week 13, about 60% of column C sets, RIR 3, one top set to RIR 0-1 on the first lift of each day at the week-12 load). Week 8 is the holiday week (Upper A, Lower A, rest, rest, Upper B, Lower B, no Upper C). InBody scan days: 10 Nov, 8 Dec, 5 Jan, 9 Feb (fasted, before training, no sauna or alcohol in the previous 24 h).
- **Progression** — double progression per lift. Every set at the top of the rep range (none skipped) → one step up (dumbbell +2 kg, machine/cable +2.5, barbell +2.5, added bodyweight +2.5, Hack Squat and Leg Press +10) and reps reset to the bottom. Otherwise the same weight and one more rep than the lowest set last time. Reps fell two sessions running at the same weight → 7.5% lighter, rounded to the lift's grid. No log under that name (session screen or Workout tab, old names and aliases included) → the programme's start load. Deload and taper weeks show the week-6 / week-12 weight and never change progression state.
- **No timers.** Rest times, RIR (reps in reserve) and form notes are text only. Nothing counts down, runs a clock, or ends a session by itself; End session, Undo, Discard, mark complete / incomplete and reset all work by hand.
- **Fast logging** — built to be used with one thumb between sets. The session screen shows one exercise at a time; the next one opens itself when you finish. Per exercise: a weight box with big ± buttons, set buttons (tap a set to log it at the suggested reps), rep buttons, **All sets × R**, **Undo last set** and **Log all remaining sets as prescribed**. The Workout tab has the same rep buttons and a "fill the other sets" button.
- **Weekly snapshot** — Today (last completed week) and top of Review (any week). Growing / Holding / Slipping / Deload / Baseline from each lift's best estimated 1RM against the median of its last three non-deload weeks, consistency (rest days and optional sessions are never "due"), volume, new bests and body weight for context. Deload and taper weeks are never read as going backward.
- **Calorie advice** — lean-gain band 0.10 to 0.25 kg/week from the last two weeks of weigh-ins. Under 0.10 → add 150 kcal, over 0.35 → take 150 kcal off, no suggestions before programme week 3. At 15% body fat: "Stop the surplus, eat at maintenance until 9 Feb".

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

`localStorage` key `peaklog.v1` (`planRev` 11):

- `profile`, `targets`
- `bodyLog[]` — `{date, weight, bodyFat, note}` (seeded with the 10 Jun 2026 InBody baseline)
- `inbody[]` — full InBody snapshots
- `workouts{date}`, `nutrition{date}`, `supplements{date}`
- `myFoods[]`
- `wm` — workout module: `inbody` baseline (editable on the Data tab, used for bodyweight in strength maths), `programme` (`{id,start,weeks}`), `sessions{}`, `setLogs[]`, `cardioLogs[]`, `rowerPaceSec`, `activeSessionId`. Sessions freeze their plan (`plan`, `blockId`, `week`, `deload`, `noProg`); set logs record the `range` they were done at. Old `rotation` / `restOverride` fields from earlier versions are left in place and never read.
- Update 11 (13-week programme): before changing anything it writes a one-time raw copy of your data to `peaklog.backup.pre-upper-lower-bulk` (and `peaklog.v1.bak-planRev<N>` for older versions; one download button each on the Data tab). It never removes a logged workout, set, weigh-in, meal or tick. Only untouched, unlogged Workout-tab days dated today or later are rebuilt. Old sessions keep their frozen plans. Retired lifts (Romanian deadlift, hip thrust, deadlifts and the rest of the old rotation) stay in the exercise library only so logged history resolves; no plan uses them. Importing an old JSON backup runs the same update.

## Tests

Node test suites (no dependencies):

```
node tests/programme.test.mjs        # calendar, sessions embedded exactly as briefed, deload/taper/holiday weeks, nutrition, supplements, rules, calorie advice
node tests/progression.test.mjs      # start loads, double progression per equipment, 7.5% rule, deload/taper loads, old-name history
node tests/migration.test.mjs        # old planRev-10 data (tests/fixtures) -> 11: backup, nothing lost, idempotent, import
node tests/timers.test.mjs           # no timers anywhere; service worker cache name, precache list, offline set-up
node tests/logging.test.mjs          # fast logging: grouping, rep buttons, suggestions, undo, all-sets, finish/reopen/reset
node tests/workout-module.test.mjs   # fast-day locks, set queue, skipped-set flagging, rower pace, persistence
```

Export from the Data tab produces a versioned JSON file; import migrates forward.

## Privacy

All data is on your device only. Nothing is sent anywhere. Back up with Export.
