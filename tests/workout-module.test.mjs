/* Workout-module engine tests: what is left of the original PRD build that the upper/lower programme still
   uses (fast-day locks, Phase 2 flag, set queue, skipped-set flagging, rower pace targeting) plus
   persistence and the library. Run: node tests/workout-module.test.mjs */
import assert from "node:assert/strict";
import { loadApp, addLiftSession } from "./harness.mjs";

let passed = 0;
function test(name, fn) { fn(); passed++; console.log("ok - " + name); }
const W = loadApp({ now: "2026-11-09T10:00:00" });
const S = W.S;

test("library: every id used by a plan or a logged set resolves; programme lifts all have a start load, step and grid", () => {
  const ids = new Set(W.WM_EXERCISES.map(e => e.id));
  assert.equal(ids.size, W.WM_EXERCISES.length, "ids are unique");
  Object.keys(W.PROG.days).forEach(d => W.PROG.days[d].forEach(r => assert.ok(ids.has(r[0]), r[0])));
  W.WM_EXERCISES.filter(e => !e.retired).forEach(e => {
    assert.ok(e.startKg != null && e.incrementKg > 0 && e.grid > 0 && e.repRange.length === 2, e.name);
    assert.ok(["db", "mc", "bb", "bw"].includes(e.eq), e.name);
  });
  const step = { db: 2, mc: 2.5, bb: 2.5, bw: 2.5 };
  W.WM_EXERCISES.filter(e => !e.retired).forEach(e => {
    const want = (e.id === "hackSquat" || e.id === "legPress") ? 10 : step[e.eq];
    assert.equal(e.incrementKg, want, e.name + " step");
  });
});
test("Sunday inside the old Phase 1 and Phase 2 is a fast day; weekdays are not (phase config is still read)", () => {
  assert.equal(W.wmIsFastDay("2026-08-02"), true);
  assert.equal(W.wmIsFastDay("2026-08-09"), true);
  assert.equal(W.wmIsFastDay("2026-08-03"), false);
  assert.equal(W.wmIsFastDay("2026-11-15"), false);          // Upper C on a Sunday in the programme: no phase, no fast day
});
test("fast day blocks lifting and HIIT; rest / flat Z2 allowed", () => {
  assert.equal(W.wmCanStart(W.WM_DAYS.uA, "2026-08-02"), false);
  assert.equal(W.wmCanStart(W.WM_DAYS.tmHiit, "2026-08-09"), false);
  assert.equal(W.wmCanStart(W.WM_DAYS.sunRest, "2026-08-02"), true);
  assert.equal(W.wmCanStart(W.WM_DAYS.optZ2, "2026-08-09"), true);
});
test("phase flag flips at 2026-08-08 and adds +1 set only inside that old phase", () => {
  assert.equal(W.wmPhase2("2026-08-07"), false);
  assert.equal(W.wmPhase2("2026-08-08"), true);
  assert.equal(W.wmPhase2("2026-11-10"), false);
  const pe = W.wmDay("uA", "2026-11-10").exercises[0];
  assert.equal(W.wmSets(pe, "2026-11-10"), 3);
});
test("set queue: Upper A week 1 = 19 sets in order; Lower A week 1 = 14", () => {
  const q = W.wmSetQueue(W.wmDay("uA", "2026-11-10"), "2026-11-10");
  assert.equal(q.length, 19);
  assert.equal(q.slice(0, 3).map(x => x.pe.exerciseId).join(","), "dbBench,dbBench,dbBench");
  assert.equal(W.wmSetQueue(W.wmDay("lA", "2026-11-11"), "2026-11-11").length, 14);
});
test("ending a lift session flags all unlogged sets skipped; skipped sets carry no volume", () => {
  const id = W.wmCreateSession("uA", "2026-11-10");
  const sess = S.wm.sessions[id];
  const q = W.wmSetQueue(W.wmSessionDay(sess), sess.date);
  q.slice(0, 3).forEach(x => S.wm.setLogs.push({ sessionId: id, exerciseId: x.pe.exerciseId, setIndex: x.setIndex, weightKg: 36, reps: 8, timestamp: new Date().toISOString() }));
  W.wmFlagRemaining(sess);
  const logs = S.wm.setLogs.filter(l => l.sessionId === id);
  assert.equal(logs.length, 19);
  assert.equal(logs.filter(l => l.skipped).length, 16);
  assert.ok(sess.endedAt, "session ended");
  S.wm.activeSessionId = null;
});
test("a session freezes the plan it started with (label, week, phase, sets, RIR, rest and notes)", () => {
  const id = W.wmCreateSession("lA", "2026-12-02");
  const sess = S.wm.sessions[id];
  assert.equal(sess.label, "Lower A: Quads + Hamstrings");
  assert.equal(sess.week, 4);
  assert.equal(sess.blockId, "1b");
  assert.equal(sess.noProg, false);
  assert.equal(sess.plan[0].exerciseId, "hackSquat");
  assert.equal(sess.plan[0].sets, 4);                         // column B
  assert.equal(sess.plan[0].rest, "3 min");
  assert.equal(sess.plan[0].rir, "2");
  assert.equal(sess.plan[0].note, "Plate load, deep range");
  S.wm.activeSessionId = null; delete S.wm.sessions[id];
});
test("rower pace targeting: parsing, avg - 1 s when all intervals land within 5 s, floor 1:50 (optional cardio keeps working)", () => {
  assert.equal(W.wmParseTime("2:04"), 124);
  assert.equal(W.wmParseTime("125"), 125);
  assert.equal(W.wmParseTime(""), null);
  assert.equal(W.wmPaceStr(124), "2:04");
  assert.equal(W.wmNextRowerTarget([124, 124, 124, 124, 124, 124, 124, 124], 125, 8), 123);
  assert.equal(W.wmNextRowerTarget([124, 124, 124, 124, 124, 124, 124, 135], 125, 8), null);
  assert.equal(W.wmNextRowerTarget([124, 124], 125, 8), null);
  assert.equal(W.wmNextRowerTarget([110, 110, 110, 110, 110, 110, 110, 110], 112, 8), 110);
});
test("volume of a finished session counts logged sets only", () => {
  const id = addLiftSession(W, "2026-11-10", "uA", [["dbBench", 36, [8, 8, 8]]]);
  assert.equal(W.wmSessionVolume(S.wm.sessions[id]), 3 * 36 * 8);
});
test("wm state serialises to localStorage and survives reload", () => {
  addLiftSession(W, "2026-11-10", "uA", [["dbBench", 36, [8, 8, 8]]]);
  W.save();
  const raw = JSON.parse(W.store["peaklog.v1"]);
  assert.ok(raw.wm, "wm slice persisted");
  assert.equal(raw.wm.setLogs.length, S.wm.setLogs.length);
  assert.equal(raw.wm.programme.start, "2026-11-10");
  const B = loadApp({ now: "2026-11-09T10:00:00", store: { "peaklog.v1": W.store["peaklog.v1"] } });
  assert.equal(B.S.wm.setLogs.length, S.wm.setLogs.length);
  assert.equal(B.wmPrescription("dbBench").why, "hold");
});
test("migrate() adds the wm slice to older data", () => {
  const old = W.migrate({ version: 1, planRev: 7 });
  assert.ok(old.wm);
  assert.equal(old.wm.inbody.weightKg, 78.1);
  assert.equal(old.wm.inbody.bodyFatPct, 13.9);
  assert.equal(old.wm.setLogs.length, 0);
  assert.equal(old.wm.rowerPaceSec, null);
  assert.equal(old.wm.programme.start, "2026-11-10");
});

console.log(`\n${passed} tests passed`);
