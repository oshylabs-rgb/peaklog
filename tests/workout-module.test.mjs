/* Workout-module engine tests — run with: node tests/workout-module.test.mjs
   Evaluates the inline <script> from index.html in a vm sandbox with DOM
   stubs, then exercises the pure engine logic against the PRD acceptance
   criteria (prescriptions, double progression, fast-day locks, the Phase 2
   boundary, rower pace targeting, the 45-min cap flagging, persistence). */
import { readFileSync } from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const m = html.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(m, "inline script found in index.html");

/* ---------- minimal DOM stubs ---------- */
function makeEl() {
  const e = {
    style: {}, children: [], attrs: {}, className: "", textContent: "", innerHTML: "",
    classList: { add() {}, remove() {}, toggle() {} },
    setAttribute(k, v) { e.attrs[k] = v; },
    appendChild(c) { e.children.push(c); return c; },
    append(...cs) { cs.forEach(c => e.children.push(c)); },
    after() {}, click() {},
    querySelector() { return null; },
  };
  return e;
}
const store = {};
const sandbox = {
  localStorage: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
  },
  document: {
    querySelector: () => makeEl(),
    createElement: () => makeEl(),
    createElementNS: () => makeEl(),
  },
  window: { scrollTo() {}, addEventListener() {} },
  navigator: {},
  console,
  setTimeout, clearTimeout,
  setInterval: () => 0, clearInterval() {},
  confirm: () => true, prompt: () => null, alert() {},
};

const shim = `
;globalThis.__wm={
  getS:()=>S, save:()=>save(), migrate,
  WM_EXERCISES,WM_DAYS,WM_WEEK,WM_CAP_SEC,
  wmEx,wmLBM,wmRound,wmEstimateKg,wmPrescription,wmSessionsFor,
  wmIsFastDay,wmPhase2,wmCanStart,wmSets,wmSetQueue,
  wmCreateSession,wmFlagRemaining,wmLoggedSet,wmSessionVolume,
  wmRowerTargetSec,wmNextRowerTarget,wmPaceStr,wmParseTime,
  dow
};`;
vm.runInNewContext(m[1] + shim, sandbox, { filename: "peaklog-inline.js" });
const W = sandbox.__wm;
const S = W.getS();

let passed = 0;
function test(name, fn) { fn(); passed++; console.log("ok - " + name); }

/* helper: fabricate an ended session with performed set logs */
function fakeSession(exId, reps, weightKg, date) {
  const id = "t-" + exId + "-" + date + "-" + Math.random().toString(36).slice(2);
  S.wm.sessions[id] = { id, date, programmeDayId: "upperA", startedAt: date + "T10:00:00.000Z", endedAt: date + "T10:40:00.000Z", isFastDay: false };
  reps.forEach((r, i) => S.wm.setLogs.push({ sessionId: id, exerciseId: exId, setIndex: i, weightKg, reps: r, timestamp: date + "T10:10:00.000Z" }));
  return id;
}

/* ---------- InBody-derived starting estimates ---------- */
test("LBM from seed baseline 78.1kg / 13.9%", () => {
  assert.equal(Math.round(W.wmLBM(S.wm.inbody) * 100) / 100, 67.24);
});
test("starting loads: 70% of LBM-multiple 1RM, rounded to 2.5", () => {
  const ib = S.wm.inbody;
  assert.equal(W.wmEstimateKg(W.wmEx("benchBB"), ib), 42.5);  // 0.9x
  assert.equal(W.wmEstimateKg(W.wmEx("squatBB"), ib), 57.5);  // 1.2x
  assert.equal(W.wmEstimateKg(W.wmEx("rdl"), ib), 52.5);      // 1.1x
  assert.equal(W.wmEstimateKg(W.wmEx("ohpDB"), ib), 12.5);    // 0.55x, per hand
  assert.equal(W.wmEstimateKg(W.wmEx("rowBB"), ib), 40);      // 0.85x
  assert.equal(W.wmEstimateKg(W.wmEx("cableFly"), ib), 15);   // fixed accessory default
  assert.equal(W.wmEstimateKg(W.wmEx("pullUp"), ib), 0);      // bodyweight
});
test("no history -> calibration prescription from estimate", () => {
  const p = W.wmPrescription("benchBB");
  assert.equal(p.kg, 42.5);
  assert.equal(p.why, "calibration");
});

/* ---------- acceptance 2: double progression + deload ---------- */
test("one session re-anchors to logged weight (calibration adjust)", () => {
  fakeSession("benchBB", [8, 8, 8], 40, "2026-07-20");
  const p = W.wmPrescription("benchBB");
  assert.equal(p.kg, 40);
  assert.equal(p.why, "hold");
});
test("top of range on all sets two sessions running -> +incrementKg", () => {
  fakeSession("benchBB", [10, 10, 10], 40, "2026-07-22");
  fakeSession("benchBB", [10, 10, 10], 40, "2026-07-24");
  const p = W.wmPrescription("benchBB");
  assert.equal(p.kg, 42.5);
  assert.equal(p.why, "progress");
});
test("reps below range bottom two sessions running -> deload 10%", () => {
  fakeSession("squatBB", [6, 6, 6], 60, "2026-07-20");
  fakeSession("squatBB", [5, 6, 6], 60, "2026-07-22");
  fakeSession("squatBB", [5, 6, 6], 60, "2026-07-24");
  const p = W.wmPrescription("squatBB");
  assert.equal(p.kg, 55); // round(60*0.9)=54 -> 55 on the 2.5 grid
  assert.equal(p.why, "deload");
});
test("mixed sessions -> hold at the logged anchor", () => {
  fakeSession("rdl", [10, 10, 10], 50, "2026-07-20");
  fakeSession("rdl", [8, 8, 8], 50, "2026-07-22");
  const p = W.wmPrescription("rdl");
  assert.equal(p.kg, 50);
  assert.equal(p.why, "hold");
});

/* ---------- acceptance 3: Sunday fast-day locks (phase config read) ---------- */
test("Sunday inside Phase 1 and Phase 2 is a fast day; weekdays are not", () => {
  assert.equal(W.wmIsFastDay("2026-08-02"), true);  // Sun, Phase 1
  assert.equal(W.wmIsFastDay("2026-08-09"), true);  // Sun, Phase 2
  assert.equal(W.wmIsFastDay("2026-08-03"), false); // Mon
});
test("fast day blocks lift and HIIT; rest / flat Z2 allowed", () => {
  assert.equal(W.wmCanStart(W.WM_DAYS.upperA, "2026-08-02"), false);
  assert.equal(W.wmCanStart(W.WM_DAYS.tmHiit, "2026-08-09"), false); // even in Phase 2
  assert.equal(W.wmCanStart(W.WM_DAYS.sunRest, "2026-08-02"), true);
  assert.equal(W.wmCanStart(W.WM_DAYS.optZ2, "2026-08-09"), true);   // flat Z2
});

/* ---------- acceptance 4: Phase 2 boundary 2026-08-08 ---------- */
test("phase flag flips at 2026-08-08 (read from existing phase config)", () => {
  assert.equal(W.wmPhase2("2026-08-07"), false);
  assert.equal(W.wmPhase2("2026-08-08"), true);
});
test("Phase 2 adds +1 set per exercise without user action", () => {
  assert.equal(W.wmSets(W.WM_DAYS.upperA.exercises[0], "2026-08-07"), 3);
  assert.equal(W.wmSets(W.WM_DAYS.upperA.exercises[0], "2026-08-08"), 4);
  assert.equal(W.wmSetQueue(W.WM_DAYS.upperA, "2026-08-07").length, 21); // 7 exercises x 3
  assert.equal(W.wmSetQueue(W.WM_DAYS.upperA, "2026-08-08").length, 28); // 7 x 4
});
test("HIIT locked in Phase 1, unlocked in Phase 2 (weekday)", () => {
  assert.equal(W.wmCanStart(W.WM_DAYS.tmHiit, "2026-08-06"), false); // Thu, Phase 1
  assert.equal(W.wmCanStart(W.WM_DAYS.tmHiit, "2026-08-13"), true);  // Thu, Phase 2
});

/* ---------- acceptance 1: supersets alternate; cap flags skipped ---------- */
test("set queue interleaves superset pairs (A1,B1,A2,B2...)", () => {
  const q = W.wmSetQueue(W.WM_DAYS.upperA, "2026-08-03");
  assert.equal(q.slice(0, 3).map(x => x.pe.exerciseId).join(","), "benchBB,benchBB,benchBB");
  assert.equal(q.slice(9, 13).map(x => x.pe.exerciseId).join(","), "cableFly,latRaise,cableFly,latRaise");
});
test("ending a lift session flags all unlogged sets skipped", () => {
  const id = W.wmCreateSession("upperA", "2026-08-03"); // Phase 1 -> 21 sets
  const sess = S.wm.sessions[id];
  const q = W.wmSetQueue(W.WM_DAYS.upperA, sess.date);
  q.slice(0, 3).forEach(x => S.wm.setLogs.push({
    sessionId: id, exerciseId: x.pe.exerciseId, setIndex: x.setIndex,
    weightKg: 40, reps: 8, timestamp: new Date().toISOString(),
  }));
  W.wmFlagRemaining(sess);
  const logs = S.wm.setLogs.filter(l => l.sessionId === id);
  assert.equal(logs.length, 21);
  assert.equal(logs.filter(l => l.skipped).length, 18);
  assert.ok(sess.endedAt, "session ended");
  assert.equal(W.wmSessionVolume(sess), 3 * 40 * 8); // skipped sets carry no volume
  S.wm.activeSessionId = null;
});
test("skipped sets never feed the progression engine", () => {
  const hist = W.wmSessionsFor("benchBB");
  assert.ok(hist.every(h => h.logs.every(l => !l.skipped)));
});

/* ---------- rower pace targeting ---------- */
test("pace parsing and formatting", () => {
  assert.equal(W.wmParseTime("2:04"), 124);
  assert.equal(W.wmParseTime("125"), 125);
  assert.equal(W.wmParseTime(""), null);
  assert.equal(W.wmPaceStr(124), "2:04");
});
test("all 8 intervals within 5s of target -> next = avg - 1s", () => {
  const times = [124, 124, 124, 124, 124, 124, 124, 124];
  assert.equal(W.wmNextRowerTarget(times, 125, 8), 123);
});
test("any interval outside 5s, or a short session -> no re-target", () => {
  const off = [124, 124, 124, 124, 124, 124, 124, 135];
  assert.equal(W.wmNextRowerTarget(off, 125, 8), null);
  assert.equal(W.wmNextRowerTarget([124, 124], 125, 8), null);
});
test("pace floor at 1:50", () => {
  const times = [110, 110, 110, 110, 110, 110, 110, 110];
  assert.equal(W.wmNextRowerTarget(times, 112, 8), 110);
});

/* ---------- acceptance 5: InBody re-baseline ---------- */
test("re-baseline moves unlogged estimates, never logged progression", () => {
  const before = W.wmPrescription("benchBB").kg;   // logged -> 42.5 (progressed)
  const histLen = S.wm.setLogs.length;
  assert.equal(W.wmPrescription("legPress").kg, 70); // unlogged, old baseline
  S.wm.inbody.weightKg = 95;                          // new scan
  assert.equal(W.wmPrescription("legPress").kg, 85);  // estimate re-baselined
  assert.equal(W.wmPrescription("benchBB").kg, before); // logged progression untouched
  assert.equal(S.wm.setLogs.length, histLen);           // history unchanged
  S.wm.inbody.weightKg = 78.1;
});

/* ---------- acceptance 6: persistence + migration ---------- */
test("wm state serialises to localStorage and survives reload", () => {
  W.save();
  const raw = JSON.parse(store["peaklog.v1"]);
  assert.ok(raw.wm, "wm slice persisted");
  assert.equal(raw.wm.setLogs.length, S.wm.setLogs.length);
  assert.equal(raw.wm.inbody.weightKg, 78.1);
});
test("migrate() adds the wm slice with the PRD seed to older data", () => {
  const old = W.migrate({ version: 1, planRev: 7 });
  assert.ok(old.wm);
  assert.equal(old.wm.inbody.weightKg, 78.1);
  assert.equal(old.wm.inbody.bodyFatPct, 13.9);
  assert.equal(old.wm.setLogs.length, 0);
  assert.equal(old.wm.rowerPaceSec, null);
});

console.log(`\n${passed} tests passed`);
