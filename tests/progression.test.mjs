/* Progression tests: start loads, double progression per equipment type, the 7.5% rule, deload and taper
   weeks (week-6 / week-12 / week-16 loads, no change to progression state), manual weight control, and history that
   follows a lift across old names ("last time" keeps working).
   Run: node tests/progression.test.mjs */
import assert from "node:assert/strict";
import { loadApp, addLiftSession } from "./harness.mjs";

const eq = (a, b, m) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), m);
let passed = 0;
function test(name, fn) { fn(); passed++; console.log("ok - " + name); }
const fresh = () => loadApp({ now: "2026-12-02T10:00:00" });          // programme week 4

test("no log: every programme lift starts at its start load and aims for the bottom of its rep range", () => {
  const A = fresh();
  const lifts = A.WM_EXERCISES.filter(e => e.eq);
  assert.equal(lifts.length, 29);
  lifts.forEach(e => {
    const p = A.wmPrescription(e.id);
    assert.equal(p.kg, e.startKg, e.name);
    assert.equal(p.why, "start", e.name);
    assert.equal(p.reps, e.repRange[0], e.name);
  });
});
test("steps: db +2, machine/cable +2.5, barbell +2.5, added bodyweight +2.5, Hack Squat and Leg Press +10; reps reset to the bottom", () => {
  [["dbBench", 36, 38, 10], ["inclineCurl", 12, 14, 15], ["latPulldown", 60, 62.5, 12], ["skull", 25, 27.5, 12],
    ["wPullUp", 5, 7.5, 10], ["backExt", 10, 12.5, 15], ["hackSquat", 80, 90, 10], ["legPress", 150, 160, 12]].forEach(([id, from, to, hi]) => {
    const A = fresh();
    addLiftSession(A, "2026-11-20", "uA", [[id, from, [hi, hi, hi]]]);
    const p = A.wmPrescription(id);
    assert.equal(p.kg, to, id);
    assert.equal(p.why, "progress", id);
    assert.equal(p.reps, A.wmEx(id).repRange[0], id);
    assert.equal(A.wmEx(id).incrementKg, to - from, id + " step (also the +/- button size)");
  });
});
test("all sets at the top of the range after ONE session is enough; one set short of it keeps the weight", () => {
  const A = fresh();
  addLiftSession(A, "2026-11-20", "uA", [["dbBench", 36, [10, 10, 9]]]);
  const p = A.wmPrescription("dbBench");
  assert.equal(p.kg, 36);
  assert.equal(p.why, "hold");
});
test("otherwise: same weight, target = lowest set last time + 1, capped at the top of the range", () => {
  let A = fresh();
  addLiftSession(A, "2026-11-20", "uA", [["dbBench", 36, [8, 7, 8]]]);
  eq([A.wmPrescription("dbBench").kg, A.wmPrescription("dbBench").reps], [36, 8]);
  A = fresh();
  addLiftSession(A, "2026-11-20", "uA", [["dbBench", 36, [10, 10, 9]]]);
  eq([A.wmPrescription("dbBench").kg, A.wmPrescription("dbBench").reps], [36, 10]);
  A = fresh();
  addLiftSession(A, "2026-11-20", "lA", [["seatedLegCurl", 50, [12, 13, 11, 12]]]);
  eq([A.wmPrescription("seatedLegCurl").kg, A.wmPrescription("seatedLegCurl").reps], [50, 12]);
});
test("reps fell two sessions in a row at the same weight -> 7.5% lighter, rounded to the lift's grid", () => {
  [["dbBench", 40, [9, 9, 9], [8, 8, 8], [7, 7, 7]], ["latPulldown", 60, [10, 10, 10], [9, 9, 9], [8, 8, 8]],
    ["hackSquat", 100, [9, 9, 9], [8, 8, 8], [7, 7, 7]]].forEach(([id, kg, a, b, c]) => {
    const A = fresh();
    addLiftSession(A, "2026-11-13", "uA", [[id, kg, a]]);
    addLiftSession(A, "2026-11-20", "uA", [[id, kg, b]]);
    assert.equal(A.wmPrescription(id).why, "hold");                  // fell once: not yet
    addLiftSession(A, "2026-11-27", "uA", [[id, kg, c]]);
    const p = A.wmPrescription(id);
    assert.equal(p.why, "deload", id);
    assert.equal(p.kg, A.wmRound(kg * 0.925, A.wmEx(id).grid), id);
  });
  const A = fresh();
  A.WM_EXERCISES.filter(e => e.eq).forEach(e => assert.ok(e.grid > 0, e.name + " has a grid"));
  eq([A.wmEx("dbBench").grid, A.wmEx("latPulldown").grid, A.wmEx("hackSquat").grid, A.wmEx("legPress").grid], [2, 2.5, 5, 5]);
});
test("the 7.5% rule needs a fall twice in a row at one weight; flat, up-and-down or changed-weight sessions never trigger it", () => {
  let A = fresh();     // flat
  [["2026-11-13", [8, 8, 8]], ["2026-11-20", [8, 8, 8]], ["2026-11-27", [8, 8, 8]]].forEach(([d, r]) => addLiftSession(A, d, "uA", [["dbBench", 40, r]]));
  assert.equal(A.wmPrescription("dbBench").why, "hold");
  A = fresh();         // down, then up
  [["2026-11-13", [9, 9, 9]], ["2026-11-20", [7, 7, 7]], ["2026-11-27", [8, 8, 8]]].forEach(([d, r]) => addLiftSession(A, d, "uA", [["dbBench", 40, r]]));
  assert.equal(A.wmPrescription("dbBench").why, "hold");
  A = fresh();         // reps fall because the weight went up
  [["2026-11-13", 36, [10, 10, 10]], ["2026-11-20", 38, [9, 9, 9]], ["2026-11-27", 38, [8, 8, 8]]].forEach(([d, kg, r]) => addLiftSession(A, d, "uA", [["dbBench", kg, r]]));
  assert.equal(A.wmPrescription("dbBench").why, "hold");
  A = fresh();         // after the cut the pattern starts over at the lighter weight
  [["2026-11-13", 40, [9, 9, 9]], ["2026-11-20", 40, [8, 8, 8]], ["2026-11-27", 40, [7, 7, 7]], ["2026-12-01", 38, [7, 7, 7]]]
    .forEach(([d, kg, r]) => addLiftSession(A, d, "uA", [["dbBench", kg, r]]));
  eq([A.wmPrescription("dbBench").kg, A.wmPrescription("dbBench").why], [38, "hold"]);
});
test("deload and taper weeks show the weight last used (week 6 / week 12), not the next step up", () => {
  const A = fresh();
  addLiftSession(A, "2026-12-01", "lA", [["hackSquat", 80, [10, 10, 10, 10]]]);          // week 4: would progress to 90
  assert.equal(A.wmPrescription("hackSquat").kg, 90);
  assert.equal(A.tplFor("2026-12-09").exercises[0].wt, 90);                              // week 5 Wed: normal week, the step up
  const frozen = A.wmPrescription("hackSquat", [6, 10], { noProg: true });
  eq([frozen.kg, frozen.why], [80, "frozen"]);
  assert.equal(A.tplFor("2026-12-23").exercises[0].wt, 80);                              // week 7 Wed (deload): week-6 load
  assert.equal(A.tplFor("2027-02-03").exercises[0].wt, 80);                              // week 13 Wed (deload): last regular load
  assert.equal(A.tplFor("2027-03-03").exercises[0].wt, 80);                              // week 17 Wed (taper): last regular load
  assert.equal(A.wmDay("lA", "2026-12-23").noProg, true);
  assert.equal(A.wmDay("lA", "2027-02-03").noProg, true);
  assert.equal(A.wmDay("lA", "2027-03-03").noProg, true);
  assert.equal(A.wmDay("lA", "2027-02-10").noProg, false);                               // block 2b: progression back on
  assert.equal(A.wmDay("lA", "2026-12-09").noProg, false);
});
test("deload and taper sessions never change progression state", () => {
  const A = fresh();
  addLiftSession(A, "2026-12-01", "uA", [["dbBench", 36, [10, 10, 10]]]);
  const before = JSON.stringify(A.wmPrescription("dbBench"));
  [["2026-12-22", "wk 7 deload"], ["2027-02-02", "wk 13 deload"], ["2027-03-02", "wk 17 taper"]].forEach(([d]) => {
    A.setNow(d + "T10:00:00");
    const id = A.wmCreateSession("uA", d);
    const sess = A.S.wm.sessions[id], day = A.wmSessionDay(sess);
    assert.equal(sess.noProg, true);
    assert.equal(day.noProg, true);
    A.wmLogRemaining(sess, [day.exercises[0]], 5);                                       // a sloppy light session
    A.wmFlagRemaining(sess); A.S.wm.activeSessionId = null;
    assert.equal(JSON.stringify(A.wmPrescription("dbBench")), before, d);
    assert.ok(A.wmSessionsFor("dbBench").every(h => !h.sess.noProg));
  });
  // deload session: the weight shown for that lift is the week-6 weight (36), not the progressed one (38)
  A.setNow("2026-12-22T10:00:00");
  const id = A.wmCreateSession("uA", "2026-12-22"), sess = A.S.wm.sessions[id];
  assert.equal(A.wmWeightFor(sess, A.wmSessionDay(sess).exercises[0]), 36);
});
test("manual weight control still works: a typed/stepped weight beats the prescription and is what gets logged", () => {
  const A = fresh();
  const id = A.wmCreateSession("uA", "2026-12-01"), sess = A.S.wm.sessions[id], day = A.wmSessionDay(sess), pe = day.exercises[0];
  assert.equal(A.wmWeightFor(sess, pe), 36);
  A.wmSetDraft("w:dbBench", 40);
  assert.equal(A.wmWeightFor(sess, pe), 40);
  A.wmLogSet(sess, pe, 0, A.wmWeightFor(sess, pe), 8);
  assert.equal(A.S.wm.setLogs.find(l => l.sessionId === id).weightKg, 40);
  A.wmClearDrafts();
  assert.equal(A.wmWeightFor(sess, pe), 40);                                             // keeps what set 1 used
});
test("old logs count as 'last time' under matching names: Workout-tab entries and renamed lifts", () => {
  const A = fresh();
  A.S.workouts["2026-10-06"] = { type: "x", planned: false, completed: true, cardio: null, rpe: "", notes: "", exercises: [
    { name: "Hack Squat / Leg Press", mg: "Quads", target: "3x6-10", wt: 120, sets: [{ reps: "8", weight: "120" }, { reps: "8", weight: "120" }, { reps: "7", weight: "120" }] },
    { name: "Face Pull", mg: "Rear Delts", target: "3x10-15", wt: 20, sets: [{ reps: "12", weight: "20" }, { reps: "12", weight: "20" }, { reps: "11", weight: "20" }] },
    { name: "Lateral Raise", mg: "Shoulders", target: "3x10-15", wt: 8, sets: [{ reps: "14", weight: "8" }, { reps: "13", weight: "8" }, { reps: "12", weight: "8" }] },
    { name: "Overhead Triceps Extension", mg: "Triceps", target: "3x10-15", wt: 25, sets: [{ reps: "10", weight: "25" }] }] };
  const lp = A.wmPrescription("legPress");
  eq([lp.kg, lp.why, lp.reps], [120, "hold", 8]);                                        // "Hack Squat / Leg Press" = Leg Press
  assert.equal(A.wmPrescription("hackSquat").why, "start");                              // ...and is NOT Hack Squat
  assert.equal(A.wmPrescription("hackSquat").kg, 80);
  eq([A.wmPrescription("facePull").kg, A.wmPrescription("facePull").reps], [20, 12]);
  eq([A.wmPrescription("latRaise").kg, A.wmPrescription("latRaise").reps], [8, 13]);     // Lateral Raises, the dumbbell lift
  assert.equal(A.wmPrescription("cableLat").why, "start");                               // Cable Lateral Raise is a different lift
  eq([A.wmPrescription("ohTriCable").kg, A.wmPrescription("ohTriCable").reps], [25, 11]);
  // session-screen logs under the old ids
  addLiftSession(A, "2026-10-13", "upperB", [["pullUp", 7.5, [8, 8, 7]], ["rearFly", 30, [12, 12, 12]]]);
  eq([A.wmPrescription("wPullUp").kg, A.wmPrescription("wPullUp").reps], [7.5, 8]);
  eq([A.wmPrescription("revPec").kg, A.wmPrescription("revPec").reps], [30, 13]);
  assert.equal(A.wmSessionsFor("wPullUp").length, 1);
  // snapshot keys follow the same names
  assert.equal(A.snapKey("Hack Squat / Leg Press"), A.snapKey("Leg Press"));
  assert.equal(A.snapKey("Face Pull"), A.snapKey("Face Pulls"));
  assert.equal(A.snapKey("Lateral Raise"), A.snapKey("Lateral Raises"));
  assert.notEqual(A.snapKey("Hack Squat"), A.snapKey("Leg Press"));
  assert.notEqual(A.snapKey("Lateral Raises"), A.snapKey("Cable Lateral Raise"));
});
test("skipped sets never feed progression, and an unfinished session is not history", () => {
  const A = fresh();
  const id = A.wmCreateSession("uA", "2026-12-01"), sess = A.S.wm.sessions[id], day = A.wmSessionDay(sess);
  A.wmLogSet(sess, day.exercises[0], 0, 36, 10);
  assert.equal(A.wmSessionsFor("dbBench").length, 0);                                    // still open
  A.wmFlagRemaining(sess);
  const hist = A.wmSessionsFor("dbBench");
  assert.equal(hist.length, 1);
  assert.equal(hist[0].logs.length, 1);
  assert.ok(hist[0].logs.every(l => !l.skipped));
  // one set at the top of the range, the rest skipped: not ALL sets reached the top, so no step up
  eq([A.wmPrescription("dbBench").kg, A.wmPrescription("dbBench").why], [36, "hold"]);
  addLiftSession(A, "2026-12-02", "uA", [["dbBench", 36, [10, 10, 10]]]);                // a full session at the top does step up
  eq([A.wmPrescription("dbBench").kg, A.wmPrescription("dbBench").why], [38, "progress"]);
});
test("weekly snapshot still builds on the programme: deload week is not 'slipping', consistency ignores rest and optional days", () => {
  const A = loadApp({ now: "2026-12-27T20:00:00" });
  addLiftSession(A, "2026-11-24", "uA", [["dbBench", 36, [10, 10, 10]]]);
  addLiftSession(A, "2026-12-22", "uA", [["dbBench", 36, [8, 8, 8]]], { noProg: true });
  const dl = A.weekSnapshot("2026-12-21");
  assert.equal(dl.verdict, "deload");
  assert.equal(dl.block.phase.name, "Deload (Christmas)");
  assert.equal(dl.train.liftPlanned, 2);                       // Tue + Wed; the optional Saturday is not counted
  const n = A.weekSnapshot("2026-11-23");
  assert.ok(["growing", "holding", "baseline", "slipping"].includes(n.verdict));
  assert.equal(A.weekSnapshot("2026-11-16").train.liftPlanned, 5);   // Mon 16 to Sun 22 Nov: Tue, Wed, Fri, Sat, Sun lift days
});

console.log(`\n${passed} tests passed`);
