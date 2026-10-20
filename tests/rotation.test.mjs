/* Rotation, deadlift/squat/posture programming, data safety and weekly-snapshot
   tests. Run: node tests/rotation.test.mjs
   Uses a fake clock (tests/harness.mjs) so "today" is deterministic. */
import assert from "node:assert/strict";
import { loadApp, addLiftSession, addCardioSession } from "./harness.mjs";

// objects built inside the vm sandbox have a different prototype, so compare by value through JSON
const eq = (a, b, m) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), m);

let passed = 0;
function test(name, fn) { fn(); passed++; console.log("ok - " + name); }

const LIFT_DAYS = ["upperA", "upperB", "pushB", "lowerA", "lowerB", "legsC"]; // push, pull, upper, legs 1-2-3

/* ============ rotation maths ============ */
const A0 = loadApp({ now: "2026-10-19T10:00:00" });

test("rotation starts the Monday the update first opens and cycles Build > Strength > Volume > Build", () => {
  eq(A0.S.wm.rotation.anchors, [{ startDate: "2026-10-19", startBlock: 0 }]);
  const at = d => { const b = A0.wmBlockAt(d); return b && `${b.block.id}:${b.week}`; };
  assert.equal(at("2026-10-19"), "build:1");
  assert.equal(at("2026-10-25"), "build:1");      // Sunday belongs to the same week
  assert.equal(at("2026-11-23"), "build:6");      // deload week
  assert.equal(at("2026-11-30"), "strength:1");
  assert.equal(at("2027-01-11"), "volume:1");
  assert.equal(at("2027-02-22"), "build:1");      // the cycle repeats
  assert.equal(A0.wmBlockAt("2026-10-18"), null); // before the rotation: pre-rotation
});
test("week 6 of every block is the deload", () => {
  assert.equal(A0.wmBlockAt("2026-11-23").deload, true);
  assert.equal(A0.wmBlockAt("2026-11-16").deload, false);
  assert.equal(A0.wmBlockAt("2027-01-04").deload, true); // strength wk 6
});

/* ============ what the user asked for ============ */
test("no live block programs Romanian deadlifts; the frozen pre-rotation week still does", () => {
  A0.WM_BLOCK_ORDER.forEach(id => LIFT_DAYS.forEach(d =>
    A0.WM_BLOCKS[id].days[d].ex.forEach(pe => assert.notEqual(pe.exerciseId, "rdl", `${id}/${d}`))));
  assert.ok(A0.WM_DAYS.lowerA.exercises.some(pe => pe.exerciseId === "rdl")); // history before 19 Oct renders as it was
  assert.equal(A0.wmDay("lowerA", "2026-10-14").exercises.some(pe => pe.exerciseId === "rdl"), true);
  assert.equal(A0.wmDay("lowerA", "2026-10-21").exercises.some(pe => pe.exerciseId === "rdl"), false);
});
test("stiff-legged deadlift replaces RDL on Lower A in every block", () => {
  A0.WM_BLOCK_ORDER.forEach(id =>
    assert.ok(A0.WM_BLOCKS[id].days.lowerA.ex.some(pe => pe.exerciseId === "sldl"), id));
});
test("a deadlift is on Lower B in every block (conventional, then trap-bar in the Volume block)", () => {
  const dl = id => A0.WM_BLOCKS[id].days.lowerB.ex[0].exerciseId;
  assert.equal(dl("build"), "deadlift");
  assert.equal(dl("strength"), "deadlift");
  assert.equal(dl("volume"), "trapDL");
});
test("squats: back squat anchors Lower A every block, and a second squat pattern sits on Lower B", () => {
  A0.WM_BLOCK_ORDER.forEach(id => {
    assert.equal(A0.WM_BLOCKS[id].days.lowerA.ex[0].exerciseId, "squatBB", id + " lowerA");
    const second = A0.WM_BLOCKS[id].days.lowerB.ex.map(pe => pe.exerciseId);
    assert.ok(second.some(e => ["hackSquat", "frontSquat", "bulgarian"].includes(e)), id + " lowerB");
  });
});
test("loaded posture work lives inside the lift days (face pull, rows, rear delts, carry) — no extra day", () => {
  A0.WM_BLOCK_ORDER.forEach(id => {
    let posture = 0;
    LIFT_DAYS.forEach(d => A0.WM_BLOCKS[id].days[d].ex.forEach(pe => { if (A0.wmEx(pe.exerciseId).posture) posture += pe.sets; }));
    assert.ok(posture >= 25, `${id} has ${posture} posture sets`);
    assert.ok(A0.WM_BLOCKS[id].days.upperA.ex.some(pe => pe.exerciseId === "facePull"), id + " face pull on Upper A");
    assert.ok(A0.WM_BLOCKS[id].days.lowerB.ex.some(pe => pe.exerciseId === "farmerCarry"), id + " carry on Lower B");
  });
  assert.equal(JSON.stringify(A0.WM_LAYOUTS).match(/posture/gi), null);     // no dedicated posture day in any layout
});

/* ============ every day is a valid 45-minute session ============ */
test("every lift day in every block and week fits the 45-minute cap with margin", () => {
  A0.WM_BLOCK_ORDER.forEach(id => LIFT_DAYS.forEach(d => {
    // week 1 of each block, and the deload week
    const start = { build: "2026-10-19", strength: "2026-11-30", volume: "2027-01-11" }[id];
    [start, A0.addDays(start, 35)].forEach(date => {
      const mins = A0.wmEstimateMin(A0.wmDay(d, date), date);
      assert.ok(mins <= 43, `${id}/${d} ${date}: ${mins} min`);
    });
  }));
});
test("every slot is a real exercise, unique within its day, and superset groups are contiguous", () => {
  A0.WM_BLOCK_ORDER.forEach(id => LIFT_DAYS.forEach(d => {
    const ex = A0.WM_BLOCKS[id].days[d].ex, seen = {}, closed = {};
    let prev = null;
    ex.forEach(pe => {
      assert.ok(A0.wmEx(pe.exerciseId), `${id}/${d} unknown ${pe.exerciseId}`);
      assert.ok(!seen[pe.exerciseId], `${id}/${d} duplicate ${pe.exerciseId}`);
      seen[pe.exerciseId] = 1;
      if (pe.supersetGroup) {
        assert.ok(!closed[pe.supersetGroup] || prev === pe.supersetGroup, `${id}/${d} group ${pe.supersetGroup} split`);
      }
      if (prev && prev !== pe.supersetGroup) closed[prev] = 1;
      prev = pe.supersetGroup || null;
    });
    // a superset group is a pair
    const counts = {};
    ex.forEach(pe => { if (pe.supersetGroup) counts[pe.supersetGroup] = (counts[pe.supersetGroup] || 0) + 1; });
    Object.keys(counts).forEach(g => assert.equal(counts[g], 2, `${id}/${d} group ${g}`));
  }));
});
test("deload week: one set fewer per exercise (never below 2) and the day still builds a set queue", () => {
  const base = A0.wmDay("upperA", "2026-10-19"), dl = A0.wmDay("upperA", "2026-11-23");
  assert.equal(dl.deload, true);
  dl.exercises.forEach((pe, i) => assert.equal(pe.sets, Math.max(2, base.exercises[i].sets - 1)));
  assert.ok(A0.wmSetQueue(dl, "2026-11-23").length < A0.wmSetQueue(base, "2026-10-19").length);
});

/* ============ prescriptions across blocks ============ */
test("stiff-legged deadlift starts from the user's logged Romanian deadlift numbers", () => {
  const A = loadApp({ now: "2026-10-19T10:00:00" });
  addLiftSession(A, "2026-09-14", "lowerA", [["rdl", 60, [10, 10, 10]]]);
  const p = A.wmPrescription("sldl");
  assert.equal(p.why, "carried");
  assert.equal(p.from, "Romanian Deadlift");
  assert.equal(p.kg, 57.5); // e1RM 80 x 0.9 -> 72, set to land at 6 reps + 2 in reserve
});
test("without RDL history the stiff-legged deadlift falls back to the InBody calibration", () => {
  const A = loadApp({ now: "2026-10-19T10:00:00" });
  const p = A.wmPrescription("sldl");
  assert.equal(p.why, "calibration");
  assert.equal(p.kg, 47.5);
});
test("front squat is seeded from the back squat; trap-bar from the conventional deadlift", () => {
  const A = loadApp({ now: "2026-10-19T10:00:00" });
  addLiftSession(A, "2026-09-14", "lowerA", [["squatBB", 60, [8, 8, 8]]]);
  addLiftSession(A, "2026-09-16", "lowerB", [["deadlift", 100, [6, 6, 6]]]);
  assert.equal(A.wmPrescription("frontSquat").why, "carried");
  assert.equal(A.wmPrescription("frontSquat").kg, 47.5);
  assert.equal(A.wmPrescription("trapDL").why, "carried");
  assert.equal(A.wmPrescription("trapDL").kg, 95);   // e1RM 120 -> 6 reps + 2 in reserve
});
test("a new block re-sets the load from estimated 1RM instead of reusing last block's rep weights", () => {
  const A = loadApp({ now: "2026-10-19T10:00:00" });
  addLiftSession(A, "2026-09-14", "upperA", [["benchBB", 40, [10, 10, 10]]]);   // Build range 6–10
  const p = A.wmPrescription("benchBB", [4, 6]);                                 // Strength range
  assert.equal(p.why, "converted");
  assert.equal(p.kg, 45);                                                        // e1RM 53.3 -> bottom of 4–6 with 2 in reserve
  // once a session is logged at the new range, normal double progression resumes
  addLiftSession(A, "2026-11-30", "upperA", [["benchBB", 45, [6, 6, 6, 6], [4, 6]]]);
  addLiftSession(A, "2026-12-02", "upperA", [["benchBB", 45, [6, 6, 6, 6], [4, 6]]]);
  const q = A.wmPrescription("benchBB", [4, 6]);
  assert.equal(q.why, "progress");
  assert.equal(q.kg, 47.5);
});
test("the most recent session governs: coming back to Build after Strength converts from Strength, not from old Build", () => {
  const A = loadApp({ now: "2026-10-19T10:00:00" });
  addLiftSession(A, "2026-09-14", "upperA", [["benchBB", 40, [10, 10, 10]]]);
  addLiftSession(A, "2026-12-14", "upperA", [["benchBB", 60, [5, 5, 5], [4, 6]]]);
  const p = A.wmPrescription("benchBB", [6, 10]);
  assert.equal(p.why, "converted");
  assert.ok(p.kg > 40 && p.kg < 60, "stays between old Build and Strength weights: " + p.kg);
});
test("deload sessions never feed progression, and the deload week prescribes about 90%", () => {
  const A = loadApp({ now: "2026-10-19T10:00:00" });
  addLiftSession(A, "2026-09-14", "upperA", [["benchBB", 60, [8, 8, 8]]]);
  addLiftSession(A, "2026-09-21", "upperA", [["benchBB", 40, [10, 10, 10]]], { deload: true });
  assert.equal(A.wmSessionsFor("benchBB").length, 1);
  assert.equal(A.wmPrescription("benchBB").kg, 60);
  assert.equal(A.wmPrescription("benchBB", null, { deload: true }).kg, 55); // 54 -> 55 on the 2.5 grid
  assert.equal(A.wmPrescription("benchBB", null, { deload: true }).why, "deloadweek");
});
test("bodyweight lifts convert through bodyweight + added load (pull-ups)", () => {
  const A = loadApp({ now: "2026-10-19T10:00:00" });
  addLiftSession(A, "2026-09-14", "upperB", [["pullUp", 10, [8, 8, 8]]]);        // 78.1 + 10 kg x 8
  const p = A.wmPrescription("pullUp", [4, 6]);
  assert.equal(p.why, "converted");
  assert.ok(p.kg >= 10 && p.kg <= 20, "heavier added load for fewer reps: " + p.kg);
});
test("timed carries and core never go through e1RM conversion", () => {
  const A = loadApp({ now: "2026-10-19T10:00:00" });
  addLiftSession(A, "2026-09-14", "lowerB", [["farmerCarry", 24, [40, 40, 40]], ["cableCrunch", 35, [12, 12, 12]]]);
  assert.equal(A.wmPrescription("farmerCarry").kg, 24);
  assert.equal(A.wmPrescription("cableCrunch", [8, 12]).kg, 35);
  assert.equal(A.wmPrescription("cableCrunch", [8, 12]).why, "hold");
});

/* ============ sessions keep the plan they started with ============ */
test("a started session is frozen: moving the rotation afterwards doesn't rewrite it", () => {
  const A = loadApp({ now: "2026-10-21T10:00:00" });
  const id = A.wmCreateSession("lowerA", "2026-10-21");
  const before = A.wmSessionDay(A.S.wm.sessions[id]).exercises.map(pe => pe.exerciseId).join();
  assert.ok(before.includes("sldl"));
  A.S.wm.rotation.anchors.push({ startDate: "2026-10-19", startBlock: 1 }); // jump to Strength
  assert.equal(A.wmSessionDay(A.S.wm.sessions[id]).exercises.map(pe => pe.exerciseId).join(), before);
});
test("start-next-block appends an anchor, so weeks already done keep their labels", () => {
  const A = loadApp({ now: "2026-10-19T10:00:00" });
  A.S.wm.rotation.anchors = [{ startDate: "2026-09-14", startBlock: 0 }];
  assert.equal(A.wmBlockAt("2026-10-12").week, 5);
  // jump to the next block this week (what the button does)
  const cur = A.wmBlockAt("2026-10-19");
  A.S.wm.rotation.anchors.push({ startDate: "2026-10-19", startBlock: cur.index + 1 });
  assert.equal(A.wmBlockAt("2026-10-19").block.id, "strength");
  assert.equal(A.wmBlockAt("2026-10-19").week, 1);
  assert.equal(A.wmBlockAt("2026-10-12").week, 5);       // last week is still week 5, not a retroactive deload
  assert.equal(A.wmBlockAt("2026-10-12").block.id, "build");
});

/* ============ the Workout tab follows the rotation ============ */
test("Workout tab days mirror the rotation: same exercises, sets and weights, no RDL anywhere for 18 weeks", () => {
  const A = loadApp({ now: "2026-10-19T10:00:00" });
  for (let d = 0; d < 126; d++) {
    const date = A.addDays("2026-10-19", d), t = A.tplFor(date), day = A.wmDay(A.wmDayIdFor(date), date);
    assert.ok(!/rdl|romanian/i.test(JSON.stringify(t)), date);
    if (day.type === "lift") {
      eq(t.exercises.map(e => e.name), day.exercises.map(pe => A.wmEx(pe.exerciseId).name), date);
      eq(t.exercises.map(e => e.sets), day.exercises.map(pe => A.wmSets(pe, date)), date);
    } else assert.equal(t.exercises.length, 0);
  }
});
test("getWorkout builds the logged day from the rotation and keeps weights as strings for the inputs", () => {
  const A = loadApp({ now: "2026-10-22T10:00:00" });          // Thursday of week 1: Legs 2, the deadlift day
  const w = A.getWorkout("2026-10-22");
  assert.equal(w.type, "Legs 2 — deadlift day");
  assert.equal(w.exercises[0].name, "Deadlift");
  assert.equal(w.exercises[0].sets.length, 3);
  assert.equal(w.exercises[0].sets[0].weight, "70");          // 1.5 x 67.2 LBM x 0.7, rounded
});

/* ============ current data survives the update ============ */
const OLD = {
  version: 1, planRev: 7,
  profile: { height: 176, age: 37, sex: "male", goalDate: "2026-08-12", goalBF: null },
  bodyLog: [{ date: "2026-06-10", weight: 79.4, bodyFat: 13.4, note: "InBody 580 baseline" },
            { date: "2026-07-16", weight: 80, bodyFat: null, note: "Phase 1 start" },
            { date: "2026-10-12", weight: 79.9, bodyFat: 13.1, note: "" }],
  inbody: [{ date: "2026-06-10", weight: 79.4 }],
  workouts: {
    "2026-07-20": { type: "Legs B + Core B", planned: true, completed: true, rpe: "8", notes: "felt strong", cardio: null,
      exercises: [{ name: "DB RDL", mg: "Hamstrings", target: "3x10-12", wt: 50, perHand: true, added: false, prog: "",
        sets: [{ reps: "12", weight: "50" }, { reps: "11", weight: "50" }, { reps: "10", weight: "50" }] }] },
    "2026-10-19": { type: "Push A — Chest focus", planned: true, completed: false, rpe: "", notes: "", cardio: null,
      exercises: [{ name: "DB Bench Press", mg: "Chest", target: "4x8-10", wt: 32.5, perHand: true, added: false, prog: "",
        sets: [{ reps: "", weight: "32.5" }, { reps: "", weight: "32.5" }] }] },
    "2026-10-20": { type: "Pull A — Width", planned: true, completed: false, rpe: "", notes: "", cardio: null,
      exercises: [{ name: "Lat Pulldown", mg: "Back", target: "4x8-10", wt: 75, perHand: false, added: false, prog: "",
        sets: [{ reps: "9", weight: "75" }, { reps: "", weight: "75" }] }] }
  },
  nutrition: { "2026-10-18": { meals: [{ name: "Rice", kcal: 325, protein: 7, netCarbs: 70, fat: 1 }], water: 2200, firstMeal: "12:00", lastMeal: "19:00" } },
  supplements: { "2026-10-18": { taken: { rdust: true } } },
  liftWeights: { "DB RDL": "50" }, myFoods: [{ name: "Rice", kcal: 325, protein: 7, netCarbs: 70, fat: 1 }],
  targets: { kcal: 2350, protein: 195, netCarbs: 145, netCarbCeiling: 170, fat: 110, water: 3000, windowStart: "12:00", windowEnd: "19:00", fastHours: 16 },
  appliedPhase: "p2",
  wm: { inbody: { scanDate: "2026-08-01", weightKg: 78.1, bodyFatPct: 13.9, skeletalMuscleKg: null, segmental: {} },
    sessions: { "ws-old": { id: "ws-old", date: "2026-09-14", programmeDayId: "lowerA", startedAt: "2026-09-14T10:00:00.000Z", endedAt: "2026-09-14T10:41:00.000Z", isFastDay: false } },
    setLogs: [0, 1, 2].map(i => ({ sessionId: "ws-old", exerciseId: "rdl", setIndex: i, weightKg: 60, reps: 10, timestamp: "2026-09-14T10:20:00.000Z" })),
    cardioLogs: [], activeSessionId: null, rowerPaceSec: 123 }
};
test("update keeps every logged workout, set, body weigh-in, meal and setting; only untouched future days rebuild", () => {
  const raw = JSON.stringify(OLD);
  const A = loadApp({ now: "2026-10-19T10:00:00", store: { "peaklog.v1": raw } });
  const S = A.S;
  assert.equal(S.planRev, 10);
  eq(S.workouts["2026-07-20"], OLD.workouts["2026-07-20"]);      // past day, full detail incl. DB RDL
  eq(S.workouts["2026-10-20"], OLD.workouts["2026-10-20"]);      // today/future but has a logged rep -> kept
  // pristine today: dropped by the migration, then rebuilt from the rotation as soon as Today renders
  assert.equal(S.workouts["2026-10-19"].exercises[0].name, "Barbell Bench Press");
  assert.ok(!JSON.stringify(S.workouts["2026-10-19"]).includes("DB Bench Press"));
  eq(S.bodyLog, OLD.bodyLog);
  eq(S.nutrition["2026-10-18"], OLD.nutrition["2026-10-18"]);                  // (today's empty record is created by rendering Today)
  eq(S.supplements["2026-10-18"], OLD.supplements["2026-10-18"]);
  eq(S.liftWeights, OLD.liftWeights);
  eq(S.wm.setLogs, OLD.wm.setLogs);
  eq(S.wm.sessions["ws-old"], OLD.wm.sessions["ws-old"]);
  assert.equal(S.wm.rowerPaceSec, 123);
  eq(S.wm.inbody, OLD.wm.inbody);
  eq(S.targets, OLD.targets);
  assert.equal(S.appliedPhase, "p2");
  eq(S.wm.rotation.anchors, [{ startDate: "2026-10-19", startBlock: 0 }]);
});
test("a raw safety copy of the pre-update data is written once, byte for byte", () => {
  const raw = JSON.stringify(OLD);
  const A = loadApp({ now: "2026-10-19T10:00:00", store: { "peaklog.v1": raw } });
  assert.equal(A.store["peaklog.v1.bak-planRev7"], raw);
  // reload (already migrated): the backup must not be overwritten by migrated data
  const A2 = loadApp({ now: "2026-10-20T10:00:00", store: A.store });
  assert.equal(A2.store["peaklog.v1.bak-planRev7"], raw);
});
test("old RDL history still resolves and still drives progression; retired exercise is kept in the library", () => {
  const A = loadApp({ now: "2026-10-19T10:00:00", store: { "peaklog.v1": JSON.stringify(OLD) } });
  assert.equal(A.wmEx("rdl").retired, true);
  assert.equal(A.wmSessionsFor("rdl").length, 1);
  assert.equal(A.wmPrescription("sldl").why, "carried");
  assert.equal(A.wmPrescription("sldl").kg, 57.5);
  assert.equal(A.wmSessionDay(A.S.wm.sessions["ws-old"]).exercises.some(pe => pe.exerciseId === "rdl"), true); // old session shows as done
});
test("the migrated state persists and reloads identically", () => {
  const A = loadApp({ now: "2026-10-19T10:00:00", store: { "peaklog.v1": JSON.stringify(OLD) } });
  const A2 = loadApp({ now: "2026-10-19T12:00:00", store: A.store });
  eq(A2.S, A.S);
});
test("a session that was already in progress when the update landed finishes the plan it started with", () => {
  const o = JSON.parse(JSON.stringify(OLD));
  o.wm.sessions["ws-live"] = { id: "ws-live", date: "2026-10-19", programmeDayId: "upperA", startedAt: "2026-10-19T08:00:00.000Z", endedAt: null, isFastDay: false };
  o.wm.setLogs.push({ sessionId: "ws-live", exerciseId: "cableFly", setIndex: 0, weightKg: 15, reps: 12, timestamp: "2026-10-19T08:10:00.000Z" });
  o.wm.activeSessionId = "ws-live";
  const A = loadApp({ now: "2026-10-19T10:00:00", store: { "peaklog.v1": JSON.stringify(o) } });
  const day = A.wmSessionDay(A.S.wm.sessions["ws-live"]);
  assert.ok(day.exercises.some(pe => pe.exerciseId === "cableFly"), "old plan kept");
  assert.ok(!day.exercises.some(pe => pe.exerciseId === "facePull"), "new plan not swapped in mid-session");
});
test("data that cannot be read is never silently replaced: the original is kept aside", () => {
  const A = loadApp({ now: "2026-10-19T10:00:00", store: { "peaklog.v1": "{ this is not json" } });
  assert.equal(A.store["peaklog.v1.bak-unreadable"], "{ this is not json");
  assert.equal(A.S.planRev, 10); // and the app still starts
});
test("fresh install starts the rotation this week at planRev 10", () => {
  const A = loadApp({ now: "2026-10-21T10:00:00" });
  assert.equal(A.S.planRev, 10);
  eq(A.S.wm.rotation.anchors, [{ startDate: "2026-10-19", startBlock: 0 }]);
});

/* ============ weekly snapshot ============ */
// a full training week: six lifting days (push, legs 1, pull, legs 2, upper, legs 3)
function fullWeek(A, mon, w) {
  addLiftSession(A, mon, "upperA", [["benchBB", w.bench, [8, 8, 8]]]);
  addLiftSession(A, A.addDays(mon, 1), "lowerA", [["squatBB", w.squat, [8, 8, 8]]]);
  addLiftSession(A, A.addDays(mon, 2), "upperB", [["rowBB", w.row, [8, 8, 8]]]);
  addLiftSession(A, A.addDays(mon, 3), "lowerB", [["deadlift", w.dl, [6, 6, 6]]]);
  addLiftSession(A, A.addDays(mon, 4), "pushB", [["ohpBB", 35, [6, 6, 6]]]);
  addLiftSession(A, A.addDays(mon, 5), "legsC", [["legPress", 100, [8, 8, 8]]]);
}
const WEEKS = ["2026-09-14", "2026-09-21", "2026-09-28", "2026-10-05", "2026-10-12"];
function scenario(weights, clock) {
  const A = loadApp({ now: clock || "2026-10-18T20:00:00" });   // Sunday evening of the last week
  A.S.wm.rotation.anchors = [{ startDate: "2026-09-14", startBlock: 0 }];
  WEEKS.forEach((mon, i) => { if (weights[i]) fullWeek(A, mon, weights[i]); });
  return A;
}
const W = (bench, squat, row, dl) => ({ bench, squat, row, dl });

test("snapshot: lifts climbing week on week with every session done = Growing", () => {
  const A = scenario([W(40, 60, 40, 80), W(40, 62.5, 42.5, 85), W(42.5, 65, 42.5, 85), W(42.5, 67.5, 45, 90), W(45, 70, 47.5, 95)]);
  const s = A.weekSnapshot("2026-10-12");
  assert.equal(s.verdict, "growing");
  assert.ok(s.up >= 3 && s.down === 0, `up ${s.up} down ${s.down}`);
  assert.ok(s.prs.length >= 3);
  assert.equal(s.sessions.done, 6);
  assert.equal(s.sessions.due, 6);
});
test("snapshot: unchanged weights, all sessions done = Holding (not Growing, not Slipping)", () => {
  const same = W(40, 60, 40, 80);
  const A = scenario([same, same, same, same, same]);
  const s = A.weekSnapshot("2026-10-12");
  assert.equal(s.verdict, "holding");
  assert.equal(s.up, 0);
});
test("snapshot: several lifts well below recent weeks = Slipping, and it names why", () => {
  const A = scenario([W(45, 70, 47.5, 95), W(45, 70, 47.5, 95), W(45, 70, 47.5, 95), W(45, 70, 47.5, 95), W(40, 62.5, 42.5, 85)]);
  const s = A.weekSnapshot("2026-10-12");
  assert.equal(s.verdict, "slipping");
  assert.ok(s.down >= 3);
  assert.match(s.headline, /lifts are down/);
});
test("snapshot: strong lifts but only 2 of 6 sessions = Slipping on consistency", () => {
  const A = scenario([W(40, 60, 40, 80), W(40, 60, 40, 80), W(40, 60, 40, 80), W(40, 60, 40, 80)]);
  addLiftSession(A, "2026-10-12", "upperA", [["benchBB", 45, [8, 8, 8]]]);
  addLiftSession(A, "2026-10-14", "lowerA", [["squatBB", 70, [8, 8, 8]]]);
  const s = A.weekSnapshot("2026-10-12");
  assert.equal(s.sessions.done, 2);
  assert.equal(s.verdict, "slipping");
  assert.match(s.headline, /2 of 6 sessions/);
});
test("snapshot: the deload week is never read as going backward", () => {
  const A = scenario([W(40, 60, 40, 80), W(42.5, 62.5, 42.5, 85), W(42.5, 65, 42.5, 85), W(45, 67.5, 45, 90), W(45, 70, 47.5, 95)], "2026-10-25T20:00:00");
  fullWeek(A, "2026-10-19", W(40, 62.5, 42.5, 85));          // ~10% lighter, week 6 of the block
  const s = A.weekSnapshot("2026-10-19");
  assert.equal(s.verdict, "deload");
});
test("snapshot: the first logged week is a baseline, and weeks before logging began are 'no data', not Slipping", () => {
  const A = loadApp({ now: "2026-10-18T20:00:00" });
  A.S.wm.rotation.anchors = [{ startDate: "2026-09-14", startBlock: 0 }];
  fullWeek(A, "2026-10-12", W(40, 60, 40, 80));
  const s = A.weekSnapshot("2026-10-12");
  assert.equal(s.verdict, "baseline");
  s.trail.forEach(t => assert.equal(t.verdict, "none"));
  assert.equal(A.weekSnapshot("2026-09-14").verdict, "none");
});
test("snapshot: the week after a deload compares against pre-deload weeks, so it isn't a fake gain", () => {
  const A = scenario([W(60, 60, 40, 80), W(60, 60, 40, 80), W(60, 60, 40, 80), W(60, 60, 40, 80), W(60, 60, 40, 80)], "2026-10-25T20:00:00");
  fullWeek(A, "2026-10-19", W(50, 50, 35, 70));                    // deload
  A.setNow("2026-11-01T20:00:00");
  fullWeek(A, "2026-10-26", W(60, 60, 40, 80));                    // back to normal
  const s = A.weekSnapshot("2026-10-26");
  assert.equal(s.up, 0, "back to the same weights is flat, not up");
  assert.notEqual(s.verdict, "slipping");
});
test("snapshot: a block change (12-rep weights -> heavy 5s) is compared by estimated 1RM, not raw weight", () => {
  const A = loadApp({ now: "2026-11-08T20:00:00" });
  A.S.wm.rotation.anchors = [{ startDate: "2026-10-05", startBlock: 0 }];
  ["2026-10-05", "2026-10-12", "2026-10-19"].forEach(m => addLiftSession(A, m, "upperA", [["benchBB", 60, [8, 8, 8]]]));
  addLiftSession(A, "2026-11-02", "upperA", [["benchBB", 67.5, [5, 5, 5], [4, 6]]]);  // heavier but fewer reps
  const s = A.weekSnapshot("2026-11-02");
  const bench = s.lifts.find(l => /bench/i.test(l.name));
  assert.equal(bench.state, "up");
  assert.ok(bench.pct > 0.03 && bench.pct < 0.05, "e1RM 76 -> 78.75: " + bench.pct);
});
test("snapshot reads the Workout-tab log as well as the session screen", () => {
  const A = loadApp({ now: "2026-10-18T20:00:00" });
  A.S.wm.rotation.anchors = [{ startDate: "2026-09-14", startBlock: 0 }];
  const mk = (kg) => ({ type: "Upper A", planned: true, completed: true, rpe: "", notes: "", cardio: null,
    exercises: [{ name: "DB Curl", mg: "Biceps", target: "3x10", wt: kg, perHand: true, added: false, prog: "",
      sets: [{ reps: "10", weight: String(kg) }, { reps: "10", weight: String(kg) }, { reps: "10", weight: String(kg) }] }] });
  A.S.workouts["2026-09-28"] = mk(14); A.S.workouts["2026-10-05"] = mk(14); A.S.workouts["2026-10-12"] = mk(16);
  const s = A.weekSnapshot("2026-10-12");
  const curl = s.lifts.find(l => /curl/i.test(l.name));
  assert.equal(curl.state, "up");
  assert.ok(s.volume > 0);
});
test("snapshot: a skipped (45-min cap) set never counts as performed", () => {
  const A = loadApp({ now: "2026-10-18T20:00:00" });
  const id = addLiftSession(A, "2026-10-12", "upperA", [["benchBB", 40, [8, 8]]]);
  A.S.wm.setLogs.push({ sessionId: id, exerciseId: "benchBB", setIndex: 2, weightKg: 0, reps: 0, skipped: true, timestamp: "x" });
  assert.equal(A.snapSets().length, 2);
});
test("snapshot: nothing logged at all = quiet 'no data' state, never a false Slipping", () => {
  const A = loadApp({ now: "2026-10-21T20:00:00" });
  const s = A.weekSnapshot("2026-10-19");
  assert.equal(s.verdict, "none");
  s.trail.forEach(t => assert.equal(t.verdict, "none"));
});
test("snapshot: next-week guidance flags a coming deload and a coming block change", () => {
  const A = loadApp({ now: "2026-11-22T20:00:00" });
  A.S.wm.rotation.anchors = [{ startDate: "2026-10-19", startBlock: 0 }];
  addLiftSession(A, "2026-11-16", "upperA", [["benchBB", 40, [8, 8, 8]]]);
  assert.match(A.weekSnapshot("2026-11-16").next, /Deload next week/);               // week 5 -> the 23 Nov deload is next
  assert.match(A.weekSnapshot("2026-11-23").next, /New block next week: Strength/);  // deload week -> Strength starts 30 Nov
});

/* ============ every training day shows exercises, weights and reps from InBody ============ */
test("every week of all three blocks has six lifting days with exercises, sets, reps and a weight, and one rest day that is only ever Friday or Sunday", () => {
  const A = loadApp({ now: "2026-10-19T10:00:00" });
  for (let w = 0; w < 18; w++) {
    const mon = A.addDays("2026-10-19", 7 * w), rests = [];
    for (let i = 0; i < 7; i++) {
      const date = A.addDays(mon, i), day = A.wmDay(A.wmDayIdFor(date), date);
      if (day.type === "rest") { rests.push(i); continue; }
      assert.equal(day.type, "lift", date + " should be a lifting day");
      assert.ok(day.exercises.length >= 5, `${date}: only ${day.exercises.length} exercises`);
      A.tplFor(date).exercises.forEach(e => {
        assert.ok(e.sets >= 2, `${date} ${e.name} sets`);
        assert.match(e.reps, /^\d+-\d+s?$/, `${date} ${e.name} reps`);
        assert.ok(e.added || e.wt > 0 || /Raise|Hanging|Pull-up|Dips/i.test(e.name), `${date} ${e.name} has no weight`);
      });
    }
    assert.equal(rests.length, 1, `week of ${mon}: ${rests.length} rest days`);
    assert.ok(rests[0] === 4 || rests[0] === 6, `week of ${mon}: rest on day ${rests[0]} (must be Fri=4 or Sun=6)`);
  }
});
test("every day's Today-card list resolves to a weight for every loaded exercise", () => {
  const A = loadApp({ now: "2026-10-19T10:00:00" });
  LIFT_DAYS.forEach(id => A.WM_BLOCK_ORDER.forEach(b => A.WM_BLOCKS[b].days[id].ex.forEach(pe => {
    const ex = A.wmEx(pe.exerciseId), p = A.wmPrescription(ex.id, A.wmRange(pe, ex));
    if (ex.equipment !== "bodyweight") assert.ok(p.kg > 0, `${b}/${id} ${ex.name}`);
  })));
});
test("any exercise that appears on two days in a block uses the same rep range on both (so double progression keeps working)", () => {
  const A = loadApp({ now: "2026-10-19T10:00:00" });
  A.WM_BLOCK_ORDER.forEach(b => {
    const seen = {};
    LIFT_DAYS.forEach(d => A.WM_BLOCKS[b].days[d].ex.forEach(pe => {
      const ex = A.wmEx(pe.exerciseId), r = A.wmRange(pe, ex).join("-");
      if (seen[pe.exerciseId]) assert.equal(r, seen[pe.exerciseId], `${b}: ${ex.name} range differs between days`);
      seen[pe.exerciseId] = r;
    }));
  });
});
test("every loaded lift is driven by InBody lean mass, and a new scan rescales the whole plan", () => {
  const A = loadApp({ now: "2026-10-19T10:00:00" });
  const loaded = A.WM_EXERCISES.filter(e => e.equipment !== "bodyweight" && !e.retired);
  loaded.forEach(e => assert.ok(e.lbmMult > 0, `${e.name} is not InBody-driven`));
  const before = {}; loaded.forEach(e => { before[e.id] = A.wmPrescription(e.id).kg; });
  A.S.wm.inbody.weightKg = 95; // a heavier, bulked-up scan
  let bigger = 0;
  loaded.forEach(e => {
    const after = A.wmPrescription(e.id).kg;
    assert.ok(after >= before[e.id], `${e.name} went down with more lean mass`);
    if (after > before[e.id]) bigger++;
  });
  assert.ok(bigger >= loaded.length - 2, `only ${bigger}/${loaded.length} lifts rescaled`);
  A.S.wm.inbody.weightKg = 78.1;
});
test("at today's InBody the accessory weights are unchanged from the fixed values they replaced", () => {
  const A = loadApp({ now: "2026-10-19T10:00:00" });
  const want = { cableFly: 15, latRaise: 8, triPush: 20, csRow: 30, cableRow: 45, latPulldown: 65, facePull: 20, rearFly: 15,
    yRaise: 4, dbCurl: 10, inclineCurl: 10, hammerCurl: 10, bulgarian: 12.5, lunge: 10, legExt: 45, legCurl: 40,
    calfStand: 60, calfSeat: 40, cableCrunch: 30, farmerCarry: 25 };
  Object.keys(want).forEach(id => assert.equal(A.wmPrescription(id).kg, want[id], id));
});
test("the calibration label tells the user the weight comes from their InBody", () => {
  const A = loadApp({ now: "2026-10-19T10:00:00" });
  assert.equal(A.wmPrescription("benchBB").why, "calibration");
});
test("rest days read as 'Rest day' in the rotation; dates before the rotation keep the old week untouched", () => {
  const A = loadApp({ now: "2026-10-19T10:00:00" });
  assert.match(A.wmDay("restDay", "2026-10-25").label, /^Rest day/);
  assert.match(A.wmDay("sunRest", "2026-10-25").label, /^Rest day/);
  assert.match(A.wmDay("sunRest", "2026-10-11").label, /Fast day/);                 // before the rotation: as it was
  assert.equal(A.wmDayIdFor("2026-10-13"), "rowInt");                               // old Tuesday
  assert.equal(A.wmDayIdFor("2026-10-20"), "lowerA");                               // new Tuesday: Legs 1
  assert.equal(A.wmDayIdFor("2026-10-22"), "lowerB");                               // new Thursday: Legs 2
  assert.equal(A.wmDayIdFor("2026-10-24"), "legsC");                                // new Saturday: Legs 3
  assert.equal(A.wmDayIdFor("2026-10-25"), "restDay");                              // week 1 rests on Sunday
});
test("cardio stays an optional log on the Pull and Upper days, never in place of the lifting", () => {
  const A = loadApp({ now: "2026-10-19T10:00:00" });
  const pull = A.tplFor("2026-10-21"), upper = A.tplFor("2026-10-23");               // Wed Pull, Fri Upper (week 1)
  assert.ok(pull.exercises.length >= 5 && /^Optional/.test(pull.cardio.type));
  assert.ok(upper.exercises.length >= 5 && /^Optional/.test(upper.cardio.type));
  assert.equal(A.tplFor("2026-10-19").cardio, null);                                  // Monday Push: none
  assert.equal(A.tplFor("2026-10-20").cardio, null);                                  // Tuesday Legs 1: none
});
test("the consistency target is six lifting sessions in the rotation and the old 4 lifts + 2 cardio before it", () => {
  const A = loadApp({ now: "2026-10-26T20:00:00" });
  A.S.wm.rotation.anchors = [{ startDate: "2026-10-19", startBlock: 0 }];          // rotation began 19 Oct
  addLiftSession(A, "2026-10-12", "upperA", [["benchBB", 40, [8, 8, 8]]]);        // pre-rotation week
  addLiftSession(A, "2026-10-20", "pullA", [["latPulldown", 65, [10, 10, 10]]]);  // rotation week
  const pre = A.weekSnapshot("2026-10-12", true).train, rot = A.weekSnapshot("2026-10-19", true).train;
  assert.equal(pre.liftPlanned, 4); assert.equal(pre.cardioPlanned, 2);
  assert.equal(rot.liftPlanned, 6); assert.equal(rot.cardioPlanned, 0);
});
test("update 8 -> 10: empty cached Tue/Thu/Sun days rebuild with exercises; anything logged stays; a fresh safety copy is taken", () => {
  const o = JSON.parse(JSON.stringify(OLD));
  o.planRev = 8;
  o.wm.rotation = { anchors: [{ startDate: "2026-10-19", startBlock: 0 }] };
  const empty = (type, cardio) => ({ type, planned: true, completed: false, rpe: "", notes: "", exercises: [], cardio });
  o.workouts["2026-10-21"] = empty("Rowing intervals — 8 × 500 m", { type: "Rower intervals", min: 30, actualMin: "" });   // Wed, cached empty
  o.workouts["2026-10-22"] = empty("Treadmill Zone 2 — incline", { type: "Zone 2", min: 40, actualMin: "" });            // Thu, cached empty
  o.workouts["2026-10-25"] = empty("Rest", { type: "Optional easy walk", min: 30, actualMin: "" });                       // Sun
  o.workouts["2026-10-23"] = empty("Rowing intervals — 8 × 500 m", { type: "Rower intervals", min: 30, actualMin: "28" }); // Fri, cardio logged
  const raw = JSON.stringify(o);
  const A = loadApp({ now: "2026-10-20T10:00:00", store: { "peaklog.v1": raw } });
  assert.equal(A.S.planRev, 10);
  assert.equal(A.S.workouts["2026-10-21"], undefined);                  // dropped; rebuilds when viewed
  assert.ok(A.getWorkout("2026-10-22").exercises.length >= 5);          // Thursday now has exercises
  assert.equal(A.getWorkout("2026-10-22").type, "Legs 2 — deadlift day");
  assert.ok(A.getWorkout("2026-10-25").type === "Rest");
  eq(A.S.workouts["2026-10-23"].cardio.actualMin, "28");                // logged cardio kept
  assert.equal(A.store["peaklog.v1.bak-planRev8"], raw);
});

/* ============ legs three times a week, a Friday/Sunday rest day, a layout that changes after three weeks ============ */
const LEG_PLANS = ["lowerA", "lowerB", "legsC"];
const withRest = (A, mon, kind) => { A.wmSetRest(mon, kind); };
test("legs are trained three times in EVERY week: all blocks, both layouts, every rest-day choice, never on back-to-back days", () => {
  ["sun", "fri", "both"].forEach(kind => {
    const A = loadApp({ now: "2026-10-19T10:00:00" });
    for (let w = 0; w < 18; w++) {
      const mon = A.addDays("2026-10-19", 7 * w);
      withRest(A, mon, kind);
      const ids = [0, 1, 2, 3, 4, 5, 6].map(i => A.wmDayIdFor(A.addDays(mon, i)));
      const legDays = ids.map((id, i) => LEG_PLANS.includes(id) ? i : -1).filter(i => i >= 0);
      assert.equal(legDays.length, 3, `${kind} week of ${mon}: legs ${legDays.length}x`);
      assert.deepEqual(JSON.parse(JSON.stringify(legDays.map(i => ids[i]).sort())), ["legsC", "lowerA", "lowerB"]); // three different leg sessions
      legDays.slice(1).forEach((d, k) => assert.ok(d - legDays[k] >= 2, `${kind} ${mon}: leg days ${legDays}`));
    }
  });
});
test("the lower body gets a real share of the work: three leg sessions of 40+ sets a week, over 40% of all weights work, every block", () => {
  const A = loadApp({ now: "2026-10-19T10:00:00" });
  A.WM_BLOCK_ORDER.forEach(b => {
    const r = A.wmRegionSets(b);
    assert.equal(r.legDays, 3, b);
    assert.ok(r.legs >= 40, `${b}: ${r.legs} leg sets`);
    assert.ok(r.legs / (r.legs + r.upper) >= 0.4, `${b}: legs are ${Math.round(100 * r.legs / (r.legs + r.upper))}% of sets`);
  });
});
test("rest days are only ever Friday or Sunday, and the default alternates week by week across blocks", () => {
  const A = loadApp({ now: "2026-10-19T10:00:00" });
  let prev = null;
  for (let w = 0; w < 18; w++) {
    const mon = A.addDays("2026-10-19", 7 * w), kind = A.wmRestKind(mon);
    assert.ok(kind === "sun" || kind === "fri", mon);
    if (prev) assert.notEqual(kind, prev, `week of ${mon} repeats ${kind}`);
    prev = kind;
    const rest = [0, 1, 2, 3, 4, 5, 6].filter(i => A.wmDay(A.wmDayIdFor(A.addDays(mon, i)), A.addDays(mon, i)).type === "rest");
    assert.deepEqual(rest, [kind === "fri" ? 4 : 6], mon);
  }
  assert.equal(A.wmRestKind("2026-10-19"), "sun");   // week 1 rests on Sunday (Monday's Push is already done)
  assert.equal(A.wmRestKind("2026-10-26"), "fri");
});
test("the lifter can pick a week's rest day (Friday, Sunday or both) without touching other weeks", () => {
  const A = loadApp({ now: "2026-10-19T10:00:00" });
  A.wmSetRest("2026-10-19", "fri");
  assert.equal(A.wmDayIdFor("2026-10-23"), "restDay");     // Friday now rests
  assert.equal(A.wmDayIdFor("2026-10-25"), "pushB");       // and the Upper day moved to Sunday
  assert.equal(A.wmRestKind("2026-10-26"), "fri");         // next week untouched
  A.wmSetRest("2026-10-19", "both");
  const lifts = [0, 1, 2, 3, 4, 5, 6].filter(i => A.wmDay(A.wmDayIdFor(A.addDays("2026-10-19", i)), A.addDays("2026-10-19", i)).type === "lift");
  assert.equal(lifts.length, 5);                           // five-day week, legs still three times
  A.wmSetRest("2026-10-19", "sun");                        // back to the default clears the override
  assert.equal(JSON.stringify(A.S.wm.restOverride), "{}");
  A.wmSetRest("2026-10-19", "fri"); A.S.wm.rotation && A.wmSetRest("2026-10-26", "sun");
  const B = loadApp({ now: "2026-10-20T10:00:00", store: A.store });   // survives a reload
  assert.equal(B.wmRestKind("2026-10-19"), "fri");
  assert.equal(B.wmRestKind("2026-10-26"), "sun");
});
test("the snapshot's session target follows the rest-day choice: six lifts, or five on a Fri + Sun week", () => {
  const A = loadApp({ now: "2026-11-01T20:00:00" });
  A.S.wm.rotation.anchors = [{ startDate: "2026-10-19", startBlock: 0 }];
  addLiftSession(A, "2026-10-19", "upperA", [["benchBB", 40, [8, 8, 8]]]);
  assert.equal(A.weekSnapshot("2026-10-19", true).train.liftPlanned, 6);
  A.wmSetRest("2026-10-19", "both");
  assert.equal(A.weekSnapshot("2026-10-19", true).train.liftPlanned, 5);
});
test("the weekly layout changes after three weeks of every block (A for weeks 1–3, B for weeks 4–6), then resets with the next block", () => {
  const A = loadApp({ now: "2026-10-19T10:00:00" });
  const day = (mon, i) => A.wmDayIdFor(A.addDays(mon, i));
  for (let blk = 0; blk < 3; blk++) {
    for (let wk = 0; wk < 6; wk++) {
      const mon = A.addDays("2026-10-19", 7 * (6 * blk + wk));
      assert.equal(A.wmLayoutFor(mon).half, wk < 3 ? "A" : "B", `block ${blk} week ${wk + 1}`);
      assert.equal(day(mon, 0), wk < 3 ? "upperA" : "upperB", "Monday: Push in A, Pull in B");
      assert.equal(day(mon, 1), wk < 3 ? "lowerA" : "lowerB", "Tuesday: squat day in A, deadlift day in B");
      assert.equal(day(mon, 5), wk < 3 ? "legsC" : "lowerA", "Saturday");
    }
  }
});
test("every day of every layout and rest choice is a real, valid programme day with exercises (nothing empty)", () => {
  const A = loadApp({ now: "2026-10-19T10:00:00" });
  ["A", "B"].forEach(h => ["sun", "fri", "both"].forEach(k => A.WM_LAYOUTS[h][k].forEach(id => {
    assert.ok(A.WM_DAYS[id], `${h}/${k} unknown day ${id}`);
    if (id !== "restDay") A.WM_BLOCK_ORDER.forEach(b => assert.ok(A.WM_BLOCKS[b].days[id].ex.length >= 5, `${b}/${id}`));
  })));
  eq(Object.keys(A.WM_LAYOUTS.A), ["sun", "fri", "both"]);
});
test("update 9 -> 10 keeps everything logged and rebuilds untouched days for the new layout", () => {
  const o = JSON.parse(JSON.stringify(OLD));
  o.planRev = 9;
  o.wm.rotation = { anchors: [{ startDate: "2026-10-19", startBlock: 0 }] };
  const day = (type, ex) => ({ type, planned: true, completed: false, rpe: "", notes: "", cardio: null, exercises: ex });
  o.workouts["2026-10-21"] = day("Pull A — back width + posture", []);                       // cached under the previous layout, untouched
  o.workouts["2026-10-22"] = day("Upper — old", [{ name: "X", mg: "Back", target: "3x10", wt: 20, sets: [{ reps: "10", weight: "20" }] }]); // has a logged rep
  const raw = JSON.stringify(o);
  const A = loadApp({ now: "2026-10-20T10:00:00", store: { "peaklog.v1": raw } });
  assert.equal(A.S.planRev, 10);
  assert.equal(A.S.wm.restOverride && Object.keys(A.S.wm.restOverride).length, 0);
  assert.equal(A.S.workouts["2026-10-21"], undefined);                                        // dropped, rebuilds from the new layout
  assert.equal(A.getWorkout("2026-10-21").type, "Pull — back + posture");                     // Wednesday of week 1 is the Pull day
  assert.equal(A.S.workouts["2026-10-22"].exercises[0].sets[0].reps, "10");                  // logged day untouched
  eq(A.S.wm.setLogs, OLD.wm.setLogs);
  assert.equal(A.store["peaklog.v1.bak-planRev9"], raw);
});

console.log(`\n${passed} tests passed`);
