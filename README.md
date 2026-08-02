# PeakLog

Personal, local-first tracker for training, supplements and nutrition, with an automatic weekly review and trend charts. Built for Arnold's summer body-composition goal: visible abs / ~9-10% body fat by end of July 2026.

## What it does

- **Today** — goal countdown, today's planned session, nutrition progress bars, one-tap supplement checklist.
- **Workout** — preloaded 5-day hypertrophy split (push / hamstring-glute / pull / quad / arms-shoulders) plus Zone 2 and Friday VO2 max. Log sets, reps, weight and cardio; auto volume calculation.
- **Nutrition** — calories, protein, net carbs (keto ceiling), fat, water; 16:8 fasting window timer; saved "my foods" quick-pick.
- **Supplements** — full stack with timing (Rainbow Dust + creatine, Salte Electrolytes, collagen, D3+K2, omega-3, Aduna cacao, magnesium glycinate, ACV) and adherence streak.
- **Plan** — the weekly training template and editable keto targets.
- **Weekly Review** — every Monday-to-Sunday: sessions done vs planned, volume per muscle group, supplement adherence, macro averages vs target, body trajectory and a linear projection toward the end-July goal, plus plain-language flags.
- **Trends** — weight, body fat, weekly volume, protein adherence charts.
- **Data** — JSON export / import for backup and moving between devices, and a full reset.
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
- `wm` — workout module: `inbody` baseline (78.1 kg / 13.9% seed, editable on the Data tab), `sessions{}`, `setLogs[]`, `cardioLogs[]`, `rowerPaceSec`, `activeSessionId`

## Tests

The workout-module engine (prescriptions, progression, fast-day locks, phase boundary, rower pace targeting, 45-min cap flagging, persistence) has a node test harness:

```
node tests/workout-module.test.mjs
```

Export from the Data tab produces a versioned JSON file; import migrates forward.

## Privacy

All data is on your device only. Nothing is sent anywhere. Back up with Export.
