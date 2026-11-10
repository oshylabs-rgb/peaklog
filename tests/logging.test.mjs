/* Fast-logging engine tests: the taps on the session screen (log a set, log with a chosen
   rep count, log all remaining, undo) are plain data operations, tested here without a DOM.
   Run: node tests/logging.test.mjs */
import assert from "node:assert/strict";
import { loadApp, addLiftSession } from "./harness.mjs";

// objects built inside the vm sandbox have a different prototype, so compare by value through JSON
const eq = (a, b, m) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), m);

let passed = 0;
function test(name, fn) { fn(); passed++; console.log("ok - " + name); }

const NOW = "2026-11-10T10:00:00";
/* a fresh app on Tuesday 10 Nov 2026 (week 1) with an active Upper A session */
function session(A) {
  A.wmClearDrafts();
  const id = A.wmCreateSession("uA", "2026-11-10");
  const sess = A.S.wm.sessions[id];
  return { id, sess, day: A.wmSessionDay(sess) };
}
const slot = (day, exId) => day.exercises.find(pe => pe.exerciseId === exId);

test("every exercise is its own card (no supersets in this programme); the set queue is the sets in order", () => {
  const A = loadApp({ now: NOW });
  const { day } = session(A);
  const g = A.wmGroups(day);
  assert.equal(g.length, 7);
  eq(g.map(x => x.list.length), [1, 1, 1, 1, 1, 1, 1]);
  assert.equal(g[0].list[0].exerciseId, "dbBench");
  assert.equal(A.wmSetQueue(day, "2026-11-10").length, 19);   // 3+3+3+3+3+2+2
});
test("rep buttons run from a step under the range to a step over it, and never below one step", () => {
  const A = loadApp({ now: NOW });
  eq([...A.wmRepChips(A.wmEx("dbBench"), [6, 10])], [5, 6, 7, 8, 9, 10, 11]);
  eq([...A.wmRepChips(A.wmEx("facePull"), [15, 20])], [14, 15, 16, 17, 18, 19, 20, 21]);
  eq([...A.wmRepChips(A.wmEx("dbBench"), [3, 5])], [2, 3, 4, 5, 6]);
  eq([...A.wmRepChips(A.wmEx("farmerCarry"), [30, 45])], [25, 30, 35, 40, 45, 50]); // seconds, steps of 5 (old logs)
});
test("suggested reps: bottom of the range the first time, last session's set next time, then whatever you just did", () => {
  const A = loadApp({ now: NOW });
  addLiftSession(A, "2026-11-03", "uA", [["dbBench", 36, [9, 8, 7]]]);              // last time 9, 8, 7
  const { sess, day } = session(A);
  const bench = slot(day, "dbBench"), incline = slot(day, "inclineDB");
  assert.equal(A.wmSuggestReps(sess, incline, 0), 8);        // never done: range bottom (8-12)
  assert.equal(A.wmSuggestReps(sess, bench, 0), 9);          // same set last session
  assert.equal(A.wmSuggestReps(sess, bench, 1), 8);
  A.wmLogSet(sess, bench, 0, 38, 10);
  assert.equal(A.wmSuggestReps(sess, bench, 1), 10);         // repeat what you just did
});
test("card weight: start load, then a typed/stepped value, then the weight you actually used", () => {
  const A = loadApp({ now: NOW });
  const { sess, day } = session(A);
  const bench = slot(day, "dbBench");
  assert.equal(A.wmWeightFor(sess, bench), 36);              // programme start load
  A.wmSetDraft("w:dbBench", 40);
  assert.equal(A.wmWeightFor(sess, bench), 40);
  A.wmLogSet(sess, bench, 0, A.wmWeightFor(sess, bench), 8);
  A.wmClearDrafts();
  assert.equal(A.wmWeightFor(sess, bench), 40);              // sticks with what set 1 used
});
test("logging a set records weight, reps and the rep range; logging the same set again replaces it", () => {
  const A = loadApp({ now: NOW });
  const { id, sess, day } = session(A);
  const bench = slot(day, "dbBench");
  A.wmLogSet(sess, bench, 0, 36, 8);
  A.wmLogSet(sess, bench, 0, 36, 9);
  const logs = A.S.wm.setLogs.filter(l => l.sessionId === id && l.exerciseId === "dbBench");
  assert.equal(logs.length, 1);
  assert.equal(logs[0].reps, 9);
  assert.equal(logs[0].weightKg, 36);
  assert.equal(logs[0].range.join("-"), "6-10");
});
test("undo removes exactly one set, undo-last removes the newest, and it never touches skipped sets", () => {
  const A = loadApp({ now: NOW });
  const { id, sess, day } = session(A);
  const bench = slot(day, "dbBench");
  [0, 1, 2].forEach(i => A.wmLogSet(sess, bench, i, 36, 8));
  A.wmUndoSet(sess, "dbBench", 1);
  eq([...A.S.wm.setLogs.filter(l => l.sessionId === id).map(l => l.setIndex)], [0, 2]);
  assert.equal(A.wmNextSet(sess, bench), 1);                 // the gap is the next set to log
  const undone = A.wmUndoLast(sess);
  assert.equal(undone.setIndex, 2);
  A.S.wm.setLogs.push({ sessionId: id, exerciseId: "ohpDB", setIndex: 0, weightKg: 0, reps: 0, skipped: true, timestamp: "x" });
  A.wmUndoSet(sess, "ohpDB", 0);
  assert.equal(A.S.wm.setLogs.filter(l => l.skipped).length, 1);   // skipped flag survives
  A.wmUndoLast(sess);                                              // removes set 0
  assert.equal(A.wmUndoLast(sess), null);                          // nothing left but the skipped marker
});
test("'all remaining sets' logs only what's missing, at the card weight, and finishes the exercise", () => {
  const A = loadApp({ now: NOW });
  const { id, sess, day } = session(A);
  const bench = slot(day, "dbBench");
  A.wmLogSet(sess, bench, 0, 38, 9);                         // one set done by hand
  const n = A.wmLogRemaining(sess, [bench]);
  assert.equal(n, 2);
  const logs = A.S.wm.setLogs.filter(l => l.sessionId === id && l.exerciseId === "dbBench");
  assert.equal(logs.length, 3);
  assert.ok(logs.every(l => l.weightKg === 38), "same weight as the first set");
  eq([...logs.map(l => l.reps)], [9, 9, 9]);                 // repeats the rep count just done
  assert.equal(A.wmNextSet(sess, bench), -1);
  assert.equal(A.wmLogRemaining(sess, [bench]), 0);          // nothing left to log
});
test("'all remaining' with a chosen rep count uses it for every set", () => {
  const A = loadApp({ now: NOW });
  const { id, sess, day } = session(A);
  A.wmLogRemaining(sess, [slot(day, "inclineDB")], 10);
  const reps = A.S.wm.setLogs.filter(l => l.sessionId === id).map(l => l.reps);
  eq([...reps], [10, 10, 10]);
});
test("an exercise is finished only when all its sets are logged", () => {
  const A = loadApp({ now: NOW });
  const { sess, day } = session(A);
  const g = A.wmGroups(day)[0];
  A.wmLogSet(sess, g.list[0], 0, 36, 8);
  assert.equal(A.wmGroupDone(sess, g), false);
  A.wmLogRemaining(sess, [g.list[0]]);
  assert.equal(A.wmGroupDone(sess, g), true);
});
test("log the whole session as prescribed: every set in the queue logged, nothing left to flag as skipped", () => {
  const A = loadApp({ now: NOW });
  const { id, sess, day } = session(A);
  const n = A.wmLogRemaining(sess, day.exercises);
  assert.equal(n, 19);
  A.wmFlagRemaining(sess);
  const logs = A.S.wm.setLogs.filter(l => l.sessionId === id);
  assert.equal(logs.length, 19);
  assert.equal(logs.filter(l => l.skipped).length, 0);
  assert.ok(logs.every(l => l.range && l.weightKg >= 0 && l.reps > 0));
});
test("fast-logged sets feed progression exactly like typed ones: every set at the top of the range -> weight goes up", () => {
  const A = loadApp({ now: "2026-11-10T10:00:00" });
  const id = A.wmCreateSession("uA", "2026-11-10");
  const sess = A.S.wm.sessions[id], day = A.wmSessionDay(sess);
  A.wmLogRemaining(sess, [slot(day, "dbBench")], 10);        // "All 3 sets x 10": the top of 6-10
  A.wmFlagRemaining(sess);
  A.S.wm.activeSessionId = null;
  const p = A.wmPrescription("dbBench");
  assert.equal(p.why, "progress");
  assert.equal(p.kg, 38);                                    // 36 + 2 (dumbbells step 2 kg)
});
test("finish, then reopen the day: the session's sets are kept and the Workout-tab complete flag toggles back", () => {
  const A = loadApp({ now: NOW });
  const { id, sess, day } = session(A);
  A.wmLogRemaining(sess, [slot(day, "dbBench")], 8);
  A.wmFlagRemaining(sess);                                   // End session
  assert.ok(A.S.wm.sessions[id].endedAt);
  assert.equal(A.S.wm.setLogs.filter(l => l.sessionId === id && !l.skipped).length, 3);
  const w = A.getWorkout("2026-11-10");                      // Workout tab: Mark complete / Mark incomplete
  w.completed = true; A.save();
  assert.equal(A.S.workouts["2026-11-10"].completed, true);
  w.completed = false; A.save();
  assert.equal(A.S.workouts["2026-11-10"].completed, false);
  delete A.S.workouts["2026-11-10"];                         // Reset to planned session
  assert.equal(A.getWorkout("2026-11-10").exercises[0].name, "DB Bench Press");
  assert.equal(A.S.wm.setLogs.filter(l => l.sessionId === id && !l.skipped).length, 3);   // reset never touches the session
});
test("Workout-tab quick fill reads the rep range from the target text", () => {
  const A = loadApp({ now: NOW });
  const r = x => JSON.parse(JSON.stringify(A.legacyRange({ target: x })));
  eq(r("3x6-10"), { lo: 6, hi: 10, timed: false, step: 1 });
  eq(r("3x30-45s"), { lo: 30, hi: 45, timed: true, step: 5 });
  eq(r("3x10"), { lo: 10, hi: 10, timed: false, step: 1 });
  eq(r(""), { lo: 10, hi: 10, timed: false, step: 1 });
});

console.log(`\n${passed} tests passed`);
