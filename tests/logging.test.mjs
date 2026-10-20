/* Fast-logging engine tests: the taps on the session screen (log a set, log with a chosen
   rep count, log all remaining, undo) are plain data operations, tested here without a DOM.
   Run: node tests/logging.test.mjs */
import assert from "node:assert/strict";
import { loadApp, addLiftSession } from "./harness.mjs";

// objects built inside the vm sandbox have a different prototype, so compare by value through JSON
const eq = (a, b, m) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), m);

let passed = 0;
function test(name, fn) { fn(); passed++; console.log("ok - " + name); }

/* a fresh app on Monday 19 Oct 2026 with an active Push A session */
function session(A) {
  A.wmClearDrafts();
  const id = A.wmCreateSession("upperA", "2026-10-19");
  const sess = A.S.wm.sessions[id];
  return { id, sess, day: A.wmSessionDay(sess) };
}
const slot = (day, exId) => day.exercises.find(pe => pe.exerciseId === exId);

test("exercises group into supersets: Push A = bench+face pull, OHP+row, incline, lateral+pushdown", () => {
  const A = loadApp({ now: "2026-10-19T10:00:00" });
  const { day } = session(A);
  const g = A.wmGroups(day);
  assert.equal(g.length, 4);
  eq(g.map(x => x.list.length), [2, 2, 1, 2]);
  assert.equal(g[0].list[0].exerciseId, "benchBB");
  assert.equal(A.wmSetQueue(day, "2026-10-19").length, 21);   // grouping refactor didn't change the queue
});
test("rep buttons run from a step under the range to a step over it, and never below one step", () => {
  const A = loadApp({ now: "2026-10-19T10:00:00" });
  eq([...A.wmRepChips(A.wmEx("benchBB"), [6, 10])], [5, 6, 7, 8, 9, 10, 11]);
  eq([...A.wmRepChips(A.wmEx("facePull"), [10, 15])], [9, 10, 11, 12, 13, 14, 15, 16]);
  eq([...A.wmRepChips(A.wmEx("benchBB"), [3, 5])], [2, 3, 4, 5, 6]);
  eq([...A.wmRepChips(A.wmEx("farmerCarry"), [30, 45])], [25, 30, 35, 40, 45, 50]); // seconds, steps of 5
});
test("suggested reps: bottom of the range the first time, last session's set next time, then whatever you just did", () => {
  const A = loadApp({ now: "2026-10-19T10:00:00" });
  addLiftSession(A, "2026-10-12", "upperA", [["benchBB", 50, [9, 8, 7]]]);        // last time 9, 8, 7
  const { sess, day } = session(A);
  const bench = slot(day, "benchBB"), face = slot(day, "facePull");
  assert.equal(A.wmSuggestReps(sess, face, 0), 10);          // never done: range bottom
  assert.equal(A.wmSuggestReps(sess, bench, 0), 9);          // same set last session
  assert.equal(A.wmSuggestReps(sess, bench, 1), 8);
  A.wmLogSet(sess, bench, 0, 52.5, 10);
  assert.equal(A.wmSuggestReps(sess, bench, 1), 10);         // repeat what you just did
});
test("card weight: prescription, then a typed/stepped value, then the weight you actually used", () => {
  const A = loadApp({ now: "2026-10-19T10:00:00" });
  const { sess, day } = session(A);
  const bench = slot(day, "benchBB");
  assert.equal(A.wmWeightFor(sess, bench), 42.5);            // InBody estimate
  A.wmSetDraft("w:benchBB", 50);
  assert.equal(A.wmWeightFor(sess, bench), 50);
  A.wmLogSet(sess, bench, 0, A.wmWeightFor(sess, bench), 8);
  A.wmClearDrafts();
  assert.equal(A.wmWeightFor(sess, bench), 50);              // sticks with what set 1 used
});
test("logging a set records weight, reps and the rep range; logging the same set again replaces it", () => {
  const A = loadApp({ now: "2026-10-19T10:00:00" });
  const { id, sess, day } = session(A);
  const bench = slot(day, "benchBB");
  A.wmLogSet(sess, bench, 0, 52.5, 8);
  A.wmLogSet(sess, bench, 0, 52.5, 9);
  const logs = A.S.wm.setLogs.filter(l => l.sessionId === id && l.exerciseId === "benchBB");
  assert.equal(logs.length, 1);
  assert.equal(logs[0].reps, 9);
  assert.equal(logs[0].weightKg, 52.5);
  assert.equal(logs[0].range.join("-"), "6-10");
});
test("undo removes exactly one set, undo-last removes the newest, and it never touches skipped sets", () => {
  const A = loadApp({ now: "2026-10-19T10:00:00" });
  const { id, sess, day } = session(A);
  const bench = slot(day, "benchBB");
  [0, 1, 2].forEach(i => A.wmLogSet(sess, bench, i, 50, 8));
  A.wmUndoSet(sess, "benchBB", 1);
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
  const A = loadApp({ now: "2026-10-19T10:00:00" });
  const { id, sess, day } = session(A);
  const bench = slot(day, "benchBB");
  A.wmLogSet(sess, bench, 0, 55, 9);                         // one set done by hand
  const n = A.wmLogRemaining(sess, [bench]);
  assert.equal(n, 2);
  const logs = A.S.wm.setLogs.filter(l => l.sessionId === id && l.exerciseId === "benchBB");
  assert.equal(logs.length, 3);
  assert.ok(logs.every(l => l.weightKg === 55), "same weight as the first set");
  eq([...logs.map(l => l.reps)], [9, 9, 9]);   // repeats the rep count just done
  assert.equal(A.wmNextSet(sess, bench), -1);
  assert.equal(A.wmLogRemaining(sess, [bench]), 0);          // nothing left to log
});
test("'all remaining' with a chosen rep count uses it for every set", () => {
  const A = loadApp({ now: "2026-10-19T10:00:00" });
  const { id, sess, day } = session(A);
  A.wmLogRemaining(sess, [slot(day, "facePull")], 12);
  const reps = A.S.wm.setLogs.filter(l => l.sessionId === id).map(l => l.reps);
  eq([...reps], [12, 12, 12]);
});
test("a superset pair is finished only when both lifts have all their sets", () => {
  const A = loadApp({ now: "2026-10-19T10:00:00" });
  const { sess, day } = session(A);
  const g = A.wmGroups(day)[0];
  A.wmLogRemaining(sess, [g.list[0]]);
  assert.equal(A.wmGroupDone(sess, g), false);
  A.wmLogRemaining(sess, [g.list[1]]);
  assert.equal(A.wmGroupDone(sess, g), true);
});
test("log the whole session as prescribed: every set in the queue logged, nothing left to flag as skipped", () => {
  const A = loadApp({ now: "2026-10-19T10:00:00" });
  const { id, sess, day } = session(A);
  const n = A.wmLogRemaining(sess, day.exercises);
  assert.equal(n, 21);
  A.wmFlagRemaining(sess);
  const logs = A.S.wm.setLogs.filter(l => l.sessionId === id);
  assert.equal(logs.length, 21);
  assert.equal(logs.filter(l => l.skipped).length, 0);
  assert.ok(logs.every(l => l.range && l.weightKg >= 0 && l.reps > 0));
});
test("fast-logged sets feed progression exactly like typed ones: top of range twice running -> weight goes up", () => {
  const A = loadApp({ now: "2026-10-12T10:00:00" });
  for (const d of ["2026-10-12", "2026-10-19"]) {
    A.setNow(d + "T10:00:00");
    A.wmClearDrafts();
    const id = A.wmCreateSession("upperA", d);
    const sess = A.S.wm.sessions[id], day = A.wmSessionDay(sess);
    A.wmLogRemaining(sess, [slot(day, "benchBB")], 10);       // "All 3 sets x 10" — the top of 6-10
    A.wmFlagRemaining(sess);
    A.S.wm.activeSessionId = null;
  }
  const p = A.wmPrescription("benchBB");
  assert.equal(p.why, "progress");
  assert.equal(p.kg, 45);                                    // 42.5 + 2.5
});
test("Workout-tab quick fill reads the rep range from the target text", () => {
  const A = loadApp({ now: "2026-10-19T10:00:00" });
  const r = x => JSON.parse(JSON.stringify(A.legacyRange({ target: x })));
  eq(r("3x6-10"), { lo: 6, hi: 10, timed: false, step: 1 });
  eq(r("3x30-45s"), { lo: 30, hi: 45, timed: true, step: 5 });
  eq(r("3x10"), { lo: 10, hi: 10, timed: false, step: 1 });
  eq(r(""), { lo: 10, hi: 10, timed: false, step: 1 });
});

console.log(`\n${passed} tests passed`);
