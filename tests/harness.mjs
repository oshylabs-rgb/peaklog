/* Shared test harness: evaluates the inline <script> from index.html in a vm
   sandbox with DOM stubs and a controllable clock, and exposes the engine. */
import { readFileSync } from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const m = html.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(m, "inline script found in index.html");

function makeEl() {
  const e = {
    style: {}, children: [], attrs: {}, className: "", textContent: "", innerHTML: "",
    classList: { add() {}, remove() {}, toggle() {} },
    setAttribute(k, v) { e.attrs[k] = v; },
    appendChild(c) { e.children.push(c); return c; },
    append(...cs) { cs.forEach(c => e.children.push(c)); },
    after() {}, click() {}, querySelector() { return null; },
  };
  return e;
}

const SHIM = `
;globalThis.__app={
  getS:()=>S, setS:(x)=>{S=x;}, save:()=>save(), load, migrate, KEY,
  WM_EXERCISES,WM_DAYS,WM_WEEK,WM_LAYOUTS,WM_HALF_WEEKS,wmDayIdFor,wmLayoutFor,wmRestKind,wmDefaultRest,wmSetRest,wmRegionSets,WM_BLOCKS,WM_BLOCK_ORDER,WM_BLOCK_WEEKS,WM_WEEK_CUES,
  wmEx,wmBlockAt,wmDay,wmSessionDay,wmSessionsFor,wmPrescription,wmSets,wmSetQueue,wmEstimateMin,
  wmCreateSession,wmFlagRemaining,wmRange,wmE1RM,wmEffKg,wmPhase2,wmRound,
  tplFor,getWorkout,weekSnapshot,snapSets,snapFirstDate,snapKey,isPristine,
  wmGroups,wmNextSet,wmGroupDone,wmWeightFor,wmSuggestReps,wmRepChips,wmLogSet,wmUndoSet,wmUndoLast,wmLogRemaining,wmLoggedSet,legacyRange,
  wmSetDraft:(k,v)=>{wmDrafts[k]=v;},wmClearDrafts:()=>{wmDrafts={};},
  mondayOf,addDays,dow,todayISO,daysBetween
};`;

/* loadApp({now:"2026-10-19T10:00:00", store:{…}}) → fresh app instance.
   The clock can be moved with app.setNow("YYYY-MM-DDTHH:MM:SS"). */
export function loadApp(opts = {}) {
  const store = Object.assign({}, opts.store || {});
  const clock = { now: new Date(opts.now || "2026-10-19T10:00:00").getTime() };
  class FakeDate extends Date {
    constructor(...a) { if (a.length === 0) super(clock.now); else super(...a); }
    static now() { return clock.now; }
  }
  const sandbox = {
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; },
      key: i => Object.keys(store)[i] || null,
      get length() { return Object.keys(store).length; },
    },
    document: { querySelector: () => makeEl(), createElement: () => makeEl(), createElementNS: () => makeEl() },
    window: { scrollTo() {}, addEventListener() {} },
    navigator: {}, console, Date: FakeDate,
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {},
    confirm: () => true, prompt: () => null, alert() {},
  };
  vm.runInNewContext(m[1] + SHIM, sandbox, { filename: "peaklog-inline.js" });
  const A = sandbox.__app;
  A.store = store;
  A.setNow = s => { clock.now = new Date(s).getTime(); };
  Object.defineProperty(A, "S", { get: () => A.getS() });
  return A;
}

/* ---- data builders ---- */
let n = 0;
// an ended wm lift session with performed sets: sets = [[exerciseId, kg, [reps…], range?]]
export function addLiftSession(A, date, dayId, sets, extra = {}) {
  const S = A.S;
  const id = "t" + (++n) + "-" + date;
  S.wm.sessions[id] = Object.assign({ id, date, programmeDayId: dayId, startedAt: date + "T10:00:00.000Z",
    endedAt: date + "T10:40:00.000Z", isFastDay: false }, extra);
  sets.forEach(([ex, kg, reps, range]) => reps.forEach((r, i) => {
    const l = { sessionId: id, exerciseId: ex, setIndex: i, weightKg: kg, reps: r, timestamp: date + "T10:10:00.000Z" };
    if (range) l.range = range;
    S.wm.setLogs.push(l);
  }));
  return id;
}
export function addCardioSession(A, date, dayId) {
  const S = A.S;
  const id = "c" + (++n) + "-" + date;
  S.wm.sessions[id] = { id, date, programmeDayId: dayId, startedAt: date + "T18:00:00.000Z", endedAt: date + "T18:30:00.000Z", isFastDay: false };
  S.wm.cardioLogs.push({ sessionId: id, machine: dayId === "rowInt" ? "rower" : "treadmill", durationMin: 30, timestamp: date + "T18:30:00.000Z" });
  return id;
}
