/* Migration tests: old data (planRev 10, produced by the previous version of the app) is carried into the
   upper/lower programme without losing anything logged; the update is idempotent, backs the raw data up first,
   and an imported old JSON backup migrates the same way.
   Run: node tests/migration.test.mjs */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadApp } from "./harness.mjs";

const eq = (a, b, m) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), m);
let passed = 0;
function test(name, fn) { fn(); passed++; console.log("ok - " + name); }

const RAW = readFileSync(new URL("./fixtures/old-planRev10.json", import.meta.url), "utf8");
const OLD = JSON.parse(RAW);
const BACKUP = "peaklog.backup.pre-upper-lower-bulk";
const open = (now = "2026-11-06T09:00:00", extra = {}) => loadApp({ now, store: Object.assign({ "peaklog.v1": RAW }, extra) });

test("fixture is genuinely old: planRev 10, rotation state, deadlift/hip-thrust sessions, a hand-logged 'Hack Squat / Leg Press'", () => {
  assert.equal(OLD.planRev, 10);
  assert.ok(OLD.wm.rotation && OLD.wm.rotation.anchors.length);
  const lifts = new Set(OLD.wm.setLogs.map(l => l.exerciseId));
  ["deadlift", "hipThrust", "sldl", "squatBB"].forEach(x => assert.ok(lifts.has(x), x));
  assert.ok(OLD.workouts["2026-10-06"].exercises.some(e => e.name === "Hack Squat / Leg Press"));
  assert.ok(OLD.workouts["2026-11-12"], "a future auto-generated day exists");
});
test("backup: the raw stored value is copied to peaklog.backup.pre-upper-lower-bulk before anything changes", () => {
  const A = open();
  assert.equal(A.store[BACKUP], RAW);                       // byte-for-byte
  assert.equal(A.BACKUP_KEY, BACKUP);
  assert.equal(JSON.parse(A.store["peaklog.v1"]).planRev, 12);
});
test("backup is written once and never overwritten", () => {
  const A = open("2026-11-06T09:00:00", { [BACKUP]: "earlier backup" });
  assert.equal(A.store[BACKUP], "earlier backup");
});
test("plan version is 12 and the programme is stored as starting 2026-11-10, 17 weeks", () => {
  const A = open();
  assert.equal(A.S.planRev, 12);
  eq(A.S.wm.programme, { id: "ul-bulk-2026-11", start: "2026-11-10", weeks: 17 });
  assert.equal(A.progStart(), "2026-11-10");
});
test("everything logged survives: manual workouts, wm sessions and sets, nutrition, supplements, body log, InBody, settings", () => {
  const A = open();
  eq(A.S.workouts["2026-10-06"], OLD.workouts["2026-10-06"]);                    // a logged day, untouched
  eq(A.S.wm.sessions, OLD.wm.sessions);
  eq(A.S.wm.setLogs, OLD.wm.setLogs);
  // (the app adds an empty entry for "today" when it opens, so compare the days that were logged)
  Object.keys(OLD.nutrition).forEach(d => eq(A.S.nutrition[d], OLD.nutrition[d], "nutrition " + d));
  Object.keys(OLD.supplements).forEach(d => eq(A.S.supplements[d], OLD.supplements[d], "supplements " + d));
  eq(A.S.bodyLog, OLD.bodyLog);
  eq(A.S.inbody, OLD.inbody);
  eq(A.S.wm.inbody, OLD.wm.inbody);
  eq(A.S.profile, OLD.profile);
  eq(A.S.liftWeights, OLD.liftWeights);
  assert.equal(A.S.wm.cardioLogs.length, OLD.wm.cardioLogs.length);
});
test("only future, never-logged, auto-generated days are dropped (today and later); past days and logged days stay", () => {
  const A = open("2026-11-06T09:00:00");                    // 6 Nov is the migration day
  assert.ok(OLD.workouts["2026-11-04"] && OLD.workouts["2026-11-06"] && OLD.workouts["2026-11-12"]);
  assert.ok(A.S.workouts["2026-11-04"], "yesterday's untouched day stays");
  assert.ok(A.S.workouts["2026-10-06"], "the logged day stays");
  // dated on the migration day: dropped, and today's card is rebuilt from the new plan as the app opens
  assert.notDeepEqual(JSON.parse(JSON.stringify(A.S.workouts["2026-11-06"])), OLD.workouts["2026-11-06"]);
  assert.equal(A.S.workouts["2026-11-06"].type, "Rest day — recovery");
  assert.notEqual(OLD.workouts["2026-11-06"].type, "Rest day — recovery");
  assert.equal(A.S.workouts["2026-11-12"], undefined, "future: dropped");
  // and they regenerate from the new plan
  const w = A.getWorkout("2026-11-12");
  assert.equal(w.type, "Rest from lifting (Zone 2)");
  const u = A.getWorkout("2026-11-10");
  assert.equal(u.exercises[0].name, "DB Bench Press");
});
test("a future day that was logged into is never dropped", () => {
  const o = JSON.parse(RAW);
  o.workouts["2026-11-12"].notes = "I did this early";
  const A = loadApp({ now: "2026-11-06T09:00:00", store: { "peaklog.v1": JSON.stringify(o) } });
  assert.equal(A.S.workouts["2026-11-12"].notes, "I did this early");
});
test("old sessions still read as they were done: frozen plan, same exercises, same values, retired lifts still resolve", () => {
  const A = open();
  const ids = Object.keys(A.S.wm.sessions);
  assert.equal(ids.length, 2);
  const seen = new Set();
  ids.forEach(id => {
    const sess = A.S.wm.sessions[id], day = A.wmSessionDay(sess);
    assert.ok(sess.plan && sess.plan.length, "frozen plan kept");
    day.exercises.forEach(pe => { seen.add(pe.exerciseId); assert.ok(A.wmEx(pe.exerciseId), pe.exerciseId + " resolves"); });
  });
  ["deadlift", "hipThrust", "sldl", "squatBB", "hackSquat"].forEach(x => assert.ok(seen.has(x), x));
  A.S.wm.setLogs.forEach(l => assert.ok(A.wmEx(l.exerciseId)));
  eq(A.S.wm.sessions[ids[0]].plan, OLD.wm.sessions[ids[0]].plan);
});
test("sessions that never had a frozen plan get one from the lifts they were done with", () => {
  const o = JSON.parse(RAW);
  o.planRev = 7;
  const id = "ws-2026-08-03-x";
  o.wm.sessions[id] = { id, date: "2026-08-03", programmeDayId: "lowerA", startedAt: "2026-08-03T10:00:00.000Z", endedAt: "2026-08-03T10:40:00.000Z", isFastDay: false };
  o.wm.setLogs.push({ sessionId: id, exerciseId: "rdl", setIndex: 0, weightKg: 50, reps: 8, timestamp: "2026-08-03T10:10:00.000Z" });
  const A = loadApp({ now: "2026-11-06T09:00:00", store: { "peaklog.v1": JSON.stringify(o) } });
  const day = A.wmSessionDay(A.S.wm.sessions[id]);
  assert.ok(day.exercises.some(pe => pe.exerciseId === "rdl"), "RDL history still shows for that August session");
});
test("new targets and lists: 2900/165/80/380, water 3000 (+500 sauna); five new quick-add foods first, your own food kept, old defaults gone", () => {
  const A = open();
  eq([A.S.targets.kcal, A.S.targets.protein, A.S.targets.fat, A.S.targets.netCarbs, A.S.targets.water, A.S.targets.waterSauna], [2900, 165, 80, 380, 3000, 500]);
  assert.equal(OLD.targets.protein, 185);                    // the manual edit is in the backup copy, not lost
  assert.equal(JSON.parse(A.store[BACKUP]).targets.protein, 185);
  eq(A.S.myFoods.slice(0, 5).map(f => f.name), A.SEED_FOODS.map(f => f.name));
  assert.ok(A.S.myFoods.some(f => f.name === "My own porridge"));
  assert.ok(!A.S.myFoods.some(f => /Ribeye|4 eggs|Basmati|Whey shake \(1 scoop\)/.test(f.name)));
  // existing settings that are not plan values stay
  assert.equal(A.S.targets.windowStart, OLD.targets.windowStart);
});
test("idempotent: migrating again changes nothing, and reopening the stored result gives the identical object", () => {
  const A = open();
  const once = JSON.stringify(A.S);
  const twice = JSON.stringify(A.migrate(JSON.parse(once)));
  assert.equal(twice, once);
  const B = loadApp({ now: "2026-11-06T09:00:00", store: { "peaklog.v1": A.store["peaklog.v1"] } });
  assert.equal(JSON.stringify(B.S), once);
  assert.equal(B.store[BACKUP], undefined, "an already-updated store does not get a new backup");
  // the same on a different day: the update does not run twice and drop more days
  A.S.workouts["2026-11-20"] = { type: "x", planned: true, completed: false, exercises: [], cardio: null, rpe: "", notes: "", };
  const C = loadApp({ now: "2026-11-30T09:00:00", store: { "peaklog.v1": JSON.stringify(A.S) } });
  assert.ok(C.S.workouts["2026-11-20"]);
});
test("importing an old JSON backup migrates it (backs up what is on the device first)", () => {
  const A = loadApp({ now: "2026-11-06T09:00:00" });         // a fresh, current install
  assert.equal(A.store[BACKUP], undefined);
  const current = A.store["peaklog.v1"];
  A.keepBackup(A.store["peaklog.v1"]);
  assert.equal(A.store[BACKUP], current);
  const m = A.migrate(JSON.parse(RAW));
  assert.equal(m.planRev, 12);
  eq(m.wm.setLogs, OLD.wm.setLogs);
  Object.keys(OLD.nutrition).forEach(d => eq(m.nutrition[d], OLD.nutrition[d]));
  assert.equal(m.targets.kcal, 2900);
  assert.equal(JSON.stringify(m), JSON.stringify(A.migrate(JSON.parse(JSON.stringify(m)))), "and again, identical");
  // very old backups too
  const v = A.migrate({ version: 1, planRev: 3, workouts: {}, nutrition: { "2026-07-01": { meals: [], water: 500 } }, bodyLog: [{ date: "2026-07-01", weight: 80 }] });
  assert.equal(v.planRev, 12);
  assert.equal(v.nutrition["2026-07-01"].water, 500);
  assert.equal(v.wm.programme.start, "2026-11-10");
  assert.equal(v.bodyLog[0].weight, 80);
});
test("saved data with timer-era fields still loads: they are ignored", () => {
  const o = JSON.parse(RAW);
  o.wm.restUntil = 123; o.wm.timer = { start: 1 }; Object.values(o.wm.sessions).forEach(s => { s.timerEnd = 5; s.elapsed = 9; });
  const A = loadApp({ now: "2026-11-06T09:00:00", store: { "peaklog.v1": JSON.stringify(o) } });
  assert.equal(A.S.planRev, 12);
  assert.doesNotThrow(() => A.weekSnapshot("2026-11-02"));
});
test("an unfinished session started before the update keeps its plan and is NOT auto-ended after 45 minutes", () => {
  const o = JSON.parse(RAW);
  const id = Object.keys(o.wm.sessions)[0];
  o.wm.sessions[id].endedAt = null; o.wm.sessions[id].startedAt = "2026-11-06T06:00:00.000Z";
  o.wm.activeSessionId = id;
  const A = loadApp({ now: "2026-11-06T09:00:00", store: { "peaklog.v1": JSON.stringify(o) } });   // three hours later
  A.viewWmSession({ appendChild() {}, append() {} });
  assert.equal(A.S.wm.sessions[id].endedAt, null);
  assert.equal(A.S.wm.setLogs.filter(l => l.sessionId === id && l.skipped).length, 0);
});
test("a fresh install starts on planRev 12 with the programme and the new lists, and needs no backup", () => {
  const A = loadApp({ now: "2026-11-06T09:00:00" });
  assert.equal(A.S.planRev, 12);
  assert.equal(A.store[BACKUP], undefined);
  assert.equal(A.S.wm.programme.start, "2026-11-10");
  assert.equal(A.S.targets.kcal, 2900);
  eq(A.S.myFoods.map(f => f.name), A.SEED_FOODS.map(f => f.name));
});

test("data already on planRev 11 (13-week version) moves to 12: safety copy, 17-week record, only unlogged future days rebuilt", () => {
  const A = open("2026-11-06T09:00:00");                       // old data -> 12
  const v11 = JSON.parse(A.store["peaklog.v1"]);
  v11.planRev = 11; v11.wm.programme.weeks = 13;
  v11.workouts["2027-02-02"] = { type: "Upper A: Chest + Back (heavy)", planned: true, completed: false, exercises: [], cardio: null, rpe: "", notes: "" };
  v11.workouts["2027-02-03"] = { type: "Lower A", planned: true, completed: false, exercises: [], cardio: null, rpe: "", notes: "kept" };
  v11.supplements["2026-11-09"] = { taken: { rdust: true, d3k2: true, hdust: true, mag: true } };
  const raw11 = JSON.stringify(v11);
  const B = loadApp({ now: "2026-11-10T09:00:00", store: { "peaklog.v1": raw11, [BACKUP]: "first" } });
  assert.equal(B.S.planRev, 12);
  assert.equal(B.store["peaklog.v1.bak-planRev11"], raw11);
  assert.equal(B.store[BACKUP], "first");
  eq(B.S.wm.programme, { id: "ul-bulk-2026-11", start: "2026-11-10", weeks: 17 });
  assert.equal(B.S.workouts["2027-02-02"], undefined);
  assert.equal(B.S.workouts["2027-02-03"].notes, "kept");
  eq(B.S.supplements["2026-11-09"], v11.supplements["2026-11-09"]);   // the old magnesium tick stays in the data
  eq(B.S.wm.setLogs, v11.wm.setLogs);
  assert.equal(JSON.stringify(B.migrate(JSON.parse(JSON.stringify(B.S)))), JSON.stringify(B.S));
});

console.log(`\n${passed} tests passed`);
