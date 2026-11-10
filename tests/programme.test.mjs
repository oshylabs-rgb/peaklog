/* Programme tests: the 17-week upper/lower lean bulk, embedded as data. The SPEC table below is typed
   in from the brief on purpose (not read from PROG), so these tests check the data was embedded exactly.
   Run: node tests/programme.test.mjs */
import assert from "node:assert/strict";
import { loadApp } from "./harness.mjs";

const eq = (a, b, m) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), m);
let passed = 0;
function test(name, fn) { fn(); passed++; console.log("ok - " + name); }

const A = loadApp({ now: "2026-11-09T10:00:00" });
const dayOf = d => A.wmDay(A.wmDayIdFor(d), d);
const label = d => dayOf(d).label;
const week = d => { const b = A.progAt(d); return b ? b.week : null; };
const dates = (from, to) => { const out = []; for (let d = from; d <= to; d = A.addDays(d, 1)) out.push(d); return out; };

/* name | muscle group | sets A/B/C | rep range | start load | equipment | rest | RIR | note | estimate? */
const SPEC = {
  uA: [
    ["DB Bench Press", "Chest", [3, 4, 4], [6, 10], 36, "db", "2.5-3 min", "2", "3 s lowering, 1 s pause at chest", false],
    ["Chest-Supported DB Row", "Back", [3, 4, 4], [8, 12], 30, "db", "2 min", "2", "", true],
    ["Incline DB Press", "Upper chest", [3, 3, 3], [8, 12], 28, "db", "2 min", "1-2", "30 degree bench", true],
    ["Lat Pulldown", "Back", [3, 3, 4], [8, 12], 60, "mc", "2 min", "1-2", "1 s stretch at top", true],
    ["Cable Lateral Raise", "Side delts", [3, 3, 4], [12, 20], 7.5, "mc", "60-90 s", "1", "Cable behind body", true],
    ["Overhead Cable Triceps Extension", "Triceps", [2, 3, 3], [10, 15], 20, "mc", "90 s", "1", "", true],
    ["Incline DB Curl", "Biceps", [2, 3, 3], [10, 15], 12, "db", "90 s", "1", "45-60 degree bench", true]],
  lA: [
    ["Hack Squat", "Quads + glutes", [3, 4, 4], [6, 10], 80, "mc", "3 min", "2", "Plate load, deep range", true],
    ["Seated Leg Curl", "Hamstrings", [3, 3, 4], [10, 15], 50, "mc", "90 s", "1", "Lean torso forward", true],
    ["Leg Extension", "Quads", [3, 3, 4], [12, 15], 55, "mc", "90 s", "1", "", true],
    ["45 Degree Back Extension", "Hamstrings + glutes", [2, 3, 3], [10, 15], 10, "bw", "90 s", "1-2", "Round upper back slightly, drive with hamstrings", true],
    ["Standing Calf Raise", "Calves", [3, 3, 4], [10, 15], 75, "mc", "60 s", "1", "2 s pause at bottom", true]],
  uB: [
    ["Weighted Pull-up", "Back", [3, 4, 4], [6, 10], 5, "bw", "2.5 min", "2", "Bodyweight if under 6 reps", true],
    ["Machine Chest Press", "Chest", [3, 3, 4], [8, 12], 60, "mc", "2 min", "1-2", "", true],
    ["Seated Cable Row", "Back", [3, 3, 4], [10, 12], 55, "mc", "2 min", "1-2", "", true],
    ["Cable Fly", "Chest", [2, 3, 3], [10, 15], 12.5, "mc", "90 s", "1", "Per side, stretch focus", true],
    ["Seated DB Shoulder Press", "Shoulders", [3, 3, 3], [8, 12], 20, "db", "2 min", "2", "", true],
    ["Reverse Pec Deck", "Rear delts", [2, 2, 3], [12, 20], 35, "mc", "60 s", "1", "", true],
    ["Cable External Rotation", "Rotator cuff", [2, 2, 2], [12, 15], 5, "mc", "60 s", "3", "", true]],
  lB: [
    ["Leg Press", "Quads + glutes", [3, 4, 4], [8, 12], 150, "mc", "2.5 min", "1-2", "Deep range", true],
    ["Bulgarian Split Squat", "Quads + glutes", [2, 2, 3], [8, 12], 18, "db", "2 min", "2", "Reps per leg", true],
    ["Seated Leg Curl", "Hamstrings", [3, 3, 4], [10, 15], 50, "mc", "90 s", "1", "", true],
    ["Leg Extension", "Quads", [2, 3, 3], [12, 15], 55, "mc", "90 s", "1", "", true],
    ["Seated Calf Raise", "Calves", [3, 3, 4], [12, 20], 40, "mc", "60 s", "1", "", true]],
  uC: [
    ["Lateral Raises", "Side delts", [4, 4, 5], [12, 20], 8, "db", "60-90 s", "1", "Seated", true],
    ["EZ-Bar Skull Crusher", "Triceps", [3, 3, 4], [8, 12], 25, "bb", "90 s", "1-2", "Swap to overhead cable if elbows hurt", true],
    ["Bayesian Cable Curl", "Biceps", [3, 4, 4], [10, 15], 10, "mc", "90 s", "1", "", true],
    ["Pec Deck", "Chest", [2, 3, 3], [12, 15], 50, "mc", "90 s", "1", "", true],
    ["Straight-Arm Cable Pulldown", "Lats", [2, 3, 3], [12, 15], 25, "mc", "60 s", "1", "", true],
    ["Hammer Curl", "Biceps", [2, 2, 2], [10, 12], 16, "db", "60 s", "1", "", true],
    ["Face Pulls", "Rear delts", [2, 2, 2], [15, 20], 20, "mc", "60 s", "2", "", true]]
};
const LABELS = { uA: "Upper A: Chest + Back (heavy)", lA: "Lower A: Quads + Hamstrings", uB: "Upper B: Back + Chest (volume)",
  lB: "Lower B: Quads + Hamstrings + Calves", uC: "Upper C: Arms + Delts" };
const PARTIALS = "last set: add lengthened partials after reaching the RIR target";

/* ---------- calendar ---------- */
test("programme starts Tue 10 Nov 2026 and is not snapped to a Monday; weeks run Tuesday to Monday", () => {
  assert.equal(A.PROG.start, "2026-11-10");
  assert.equal(A.dow("2026-11-10"), 1);                      // Tuesday
  assert.equal(A.progStart(), "2026-11-10");
  assert.equal(A.S.wm.programme.start, "2026-11-10");
  assert.equal(A.progAt("2026-11-09"), null);                // the Monday before is outside
  const b = A.progAt("2026-11-10");
  assert.equal(b.weekStart, "2026-11-10");
  assert.equal(b.weekEnd, "2026-11-16");
  eq(A.wmWeekDays("2026-11-12"), dates("2026-11-10", "2026-11-16"));
  eq(A.wmWeekDays("2026-11-09"), dates("2026-11-10", "2026-11-16"));   // before the start: week 1
  for (let w = 1; w <= 17; w++) {
    const d = A.addDays("2026-11-10", (w - 1) * 7);
    assert.equal(A.dow(A.progAt(d).weekStart), 1, "week " + w + " starts on a Tuesday");
    assert.equal(A.dow(A.progAt(d).weekEnd), 0, "week " + w + " ends on a Monday");
  }
});
test("week numbers: week 1 = 10-16 Nov, week 7 = 22-28 Dec, week 8 = 29 Dec-4 Jan, week 13 = 2-8 Feb, week 17 = 2-8 Mar; 17 weeks exactly", () => {
  eq([week("2026-11-10"), week("2026-11-16"), week("2026-11-17"), week("2026-12-22"), week("2026-12-28"),
    week("2026-12-29"), week("2027-01-04"), week("2027-02-02"), week("2027-02-08"), week("2027-02-09"), week("2027-03-02"),
    week("2027-03-08"), week("2027-03-09"), week("2026-11-09")],
  [1, 1, 2, 7, 7, 8, 8, 13, 13, 14, 17, 17, null, null]);
  assert.equal(A.PROG.weeks, 17);
  assert.equal(A.PROG.final, "2027-03-09");
});
test("phases: 1a weeks 1-3, 1b weeks 4-6, deload week 7, block 2 weeks 8-12, deload week 13, block 2b weeks 14-16, taper week 17", () => {
  const ph = d => A.progAt(d).phase.name;
  eq([ph("2026-11-10"), ph("2026-11-24"), ph("2026-12-01"), ph("2026-12-15"), ph("2026-12-22"), ph("2026-12-29"),
    ph("2027-01-26"), ph("2027-02-02"), ph("2027-02-09"), ph("2027-02-23"), ph("2027-03-02")],
  ["Block 1a Intro", "Block 1a Intro", "Block 1b Build", "Block 1b Build", "Deload (Christmas)", "Block 2 Peak volume",
    "Block 2 Peak volume", "Deload", "Block 2b Peak volume", "Block 2b Peak volume", "Taper + test"]);
});
test("acceptance dates: 10 Nov Upper A wk1, 11 Nov Lower A, 12 Nov Zone 2 rest, 14 Nov Lower B, 15 Nov Upper C, 24 Dec rest (deload), 2 Feb deload Upper A, 2 Mar taper Upper A", () => {
  assert.equal(label("2026-11-10"), "Upper A: Chest + Back (heavy)");
  assert.equal(week("2026-11-10"), 1);
  assert.equal(A.wmDayIdFor("2026-11-11"), "lA");
  assert.equal(label("2026-11-11"), "Lower A: Quads + Hamstrings");
  assert.equal(A.wmDayIdFor("2026-11-12"), "restZ2");
  assert.equal(dayOf("2026-11-12").note, "No lifting. Zone 2 bike 30-40 min, talk-test pace.");
  assert.equal(A.wmDayIdFor("2026-11-14"), "lB");
  assert.equal(A.wmDayIdFor("2026-11-15"), "uC");
  assert.equal(dayOf("2026-12-24").type, "rest");
  assert.equal(week("2026-12-24"), 7);
  assert.equal(A.progAt("2026-12-24").phase.kind, "deload");
  assert.equal(A.wmDayIdFor("2027-02-02"), "uA");
  assert.equal(week("2027-02-02"), 13);
  assert.equal(A.progAt("2027-02-02").phase.kind, "deload");
  assert.equal(A.wmDayIdFor("2027-03-02"), "uA");
  assert.equal(week("2027-03-02"), 17);
  assert.equal(A.progAt("2027-03-02").phase.kind, "taper");
  // first exercise of 10 Nov
  const first = dayOf("2026-11-10").exercises[0];
  assert.equal(A.wmEx(first.exerciseId).name, "DB Bench Press");
  assert.equal(first.sets, 3);
  eq(A.wmRange(first, A.wmEx(first.exerciseId)), [6, 10]);
  assert.equal(A.wmPrescription(first.exerciseId).kg, 36);
  assert.equal(A.wmEx(first.exerciseId).perHand, true);
  assert.equal(A.wmEx("hackSquat").name, "Hack Squat");
  assert.equal(dayOf("2026-11-11").exercises[0].exerciseId, "hackSquat");
});
test("weekday pattern holds in every normal week: Tue Upper A, Wed Lower A, Thu Zone 2, Fri Upper B, Sat Lower B, Sun Upper C, Mon VO2max", () => {
  const want = { 1: "uA", 2: "lA", 3: "restZ2", 4: "uB", 5: "lB", 6: "uC", 0: "restVO2" };
  const special = d => { const w = week(d); return w === 7 || w === 8; };   // week 13 deload keeps the normal pattern
  let n = 0;
  dates("2026-11-10", "2027-03-08").forEach(d => { if (special(d)) return; n++; assert.equal(A.wmDayIdFor(d), want[A.dow(d)], d); });
  assert.ok(n >= 105);
  assert.equal(dayOf("2026-11-16").note, "No lifting. VO2max 4x4 on bike: 4 x 4 min at 85-95% HRmax, 3 min easy between, about 35 min total.");
});
test("week 7 deload (22-28 Dec): Tue Upper A, Wed Lower A, optional Sat 26 Dec Upper B, every other day rest", () => {
  const ids = dates("2026-12-22", "2026-12-28").map(d => A.wmDayIdFor(d));
  eq(ids, ["uA", "lA", "restDay", "restDay", "uB", "restDay", "restDay"]);
  assert.equal(dayOf("2026-12-26").optional, true);
  assert.equal(dayOf("2026-12-22").optional, false);
  assert.equal(A.progOptional("2026-12-26"), true);
});
test("week 8 holiday override: Tue 29 Dec Upper A, Wed 30 Dec Lower A, Thu 31 Dec rest, Fri 1 Jan rest, Sat 2 Jan Upper B, Sun 3 Jan Lower B, no Upper C", () => {
  eq(dates("2026-12-29", "2027-01-04").map(d => A.wmDayIdFor(d)), ["uA", "lA", "restDay", "restDay", "uB", "lB", "restVO2"]);
  assert.ok(!dates("2026-12-29", "2027-01-04").some(d => A.wmDayIdFor(d) === "uC"));
  eq(["2027-01-08", "2027-01-09", "2027-01-10"].map(d => A.wmDayIdFor(d)), ["uB", "lB", "uC"]);   // week 9 is back to the normal pattern
});
test("InBody scan days: 10 Nov, 8 Dec, 5 Jan, 9 Feb, 9 Mar carry the scan note; other days do not", () => {
  const scan = "InBody scan today. Fasted, before training, no sauna or alcohol in the previous 24 h.";
  ["2026-11-10", "2026-12-08", "2027-01-05", "2027-02-09", "2027-03-09"].forEach(d => {
    assert.equal(dayOf(d).scan, true, d);
    assert.ok(A.tplFor(d).note.includes("Fasted, before training, no sauna or alcohol in the previous 24 h"), d);
  });
  assert.equal(A.PROG.scanNote, scan);
  ["2026-11-11", "2026-12-09", "2027-01-06", "2027-02-08", "2027-03-08"].forEach(d => assert.equal(dayOf(d).scan, false, d));
  eq([...A.PROG.scanDays], ["2026-11-10", "2026-12-08", "2027-01-05", "2027-02-09", "2027-03-09"]);
  assert.equal(A.wmDayIdFor("2027-02-09"), "uA");                     // 9 Feb is now a normal Upper A day with a scan before training
});
test("final review day 9 Mar 2027 is a rest/InBody day; the days after are plain rest", () => {
  assert.equal(A.wmDayIdFor("2027-03-09"), "restFinal");
  assert.equal(dayOf("2027-03-09").type, "rest");
  assert.equal(A.wmDayIdFor("2027-03-10"), "restDay");
  assert.equal(A.wmDayIdFor("2026-11-09"), "restDay");
});

/* ---------- the sessions, exactly as briefed ---------- */
test("every session embeds the brief exactly: names, groups, sets A/B/C, rep ranges, start loads, equipment, rest, RIR, notes", () => {
  Object.keys(SPEC).forEach(id => {
    assert.equal(A.WM_DAYS[id].label, LABELS[id]);
    const rows = A.PROG.days[id];
    assert.equal(rows.length, SPEC[id].length, id);
    rows.forEach((row, i) => {
      const [name, mg, sets, range, start, eqp, rest, rir, note, est] = SPEC[id][i];
      const ex = A.wmEx(row[0]);
      assert.equal(ex.name, name, id + " #" + i);
      assert.equal(ex.mg, mg, name);
      eq([row[1], row[2], row[3]], sets, name + " sets");
      eq(ex.repRange, range, name + " range");
      assert.equal(ex.startKg, start, name + " start");
      assert.equal(ex.eq, eqp, name + " equipment");
      assert.equal(row[4], rest, name + " rest");
      assert.equal(row[5], rir, name + " RIR");
      assert.equal(row[6], note, name + " note");
      assert.equal(!!row[7], est, name + " estimate");
    });
  });
  // the "per dumbbell" flag follows the equipment type; bodyweight lifts add load to bodyweight
  A.WM_EXERCISES.filter(e => e.eq).forEach(e => { assert.equal(!!e.perHand, e.eq === "db", e.name); assert.equal(!!e.bwBased, e.eq === "bw", e.name); });
});
test("sets per week come from the right column: wk1 A, wk4 B, wk9 C (every exercise of every session)", () => {
  [["2026-11-10", 0], ["2026-12-01", 1], ["2027-01-05", 2]].forEach(([monthDate, col]) => {
    const wkStart = A.progAt(monthDate).weekStart;
    Object.keys(SPEC).forEach(id => {
      // find that programme week's date for this session id
      const d = dates(wkStart, A.addDays(wkStart, 6)).find(x => A.wmDayIdFor(x) === id);
      assert.ok(d, id + " exists in week of " + wkStart);
      dayOf(d).exercises.forEach((pe, i) => assert.equal(pe.sets, SPEC[id][i][2][col], `${id} #${i} week ${week(d)}`));
    });
  });
});
test("deload week sets are about 50% of column B, rounded down, minimum 1", () => {
  ["uA", "lA", "uB"].forEach(id => {
    const d = dates("2026-12-22", "2026-12-28").find(x => A.wmDayIdFor(x) === id);
    dayOf(d).exercises.forEach((pe, i) => {
      const B = SPEC[id][i][2][1];
      assert.equal(pe.sets, Math.max(1, Math.floor(B * 0.5)), `${id} #${i}`);
      assert.ok(pe.sets >= 1);
    });
  });
  eq([...dayOf("2026-12-22").exercises.map(e => e.sets)], [2, 2, 1, 1, 1, 1, 1]);   // B = 4,4,3,3,3,3,3
});
test("taper week sets are about 60% of column C, rounded, minimum 1; RIR 3, first exercise has one top set to RIR 0-1 at the week-16 load", () => {
  dates("2027-03-02", "2027-03-08").forEach(d => {
    const id = A.wmDayIdFor(d);
    if (!SPEC[id]) return;
    const day = dayOf(d);
    day.exercises.forEach((pe, i) => {
      const C = SPEC[id][i][2][2];
      assert.equal(pe.sets, Math.max(1, Math.round(C * 0.6)), `${id} #${i}`);
      assert.equal(pe.rir, i === 0 ? "3 (top set 0 to 1)" : "3", `${id} #${i} RIR`);
      assert.equal(/top set to 0 to 1 reps in reserve at the week-16 load/.test(pe.note), i === 0, `${id} #${i} note`);
    });
  });
  eq([...dayOf("2027-03-02").exercises.map(e => e.sets)], [2, 2, 2, 2, 2, 2, 2]);   // C = 4,4,3,4,4,3,3 -> 2.4,2.4,1.8,2.4,2.4,1.8,1.8
});
test("week 13 deload (2-8 Feb): the normal five sessions at about 50% of column C (round down, min 1), RIR 4, week-12 loads", () => {
  eq(dates("2027-02-02", "2027-02-08").map(d => A.wmDayIdFor(d)), ["uA", "lA", "restZ2", "uB", "lB", "uC", "restVO2"]);
  dates("2027-02-02", "2027-02-08").forEach(d => {
    const id = A.wmDayIdFor(d);
    if (!SPEC[id]) return;
    const day = dayOf(d);
    assert.equal(day.noProg, true, d);
    day.exercises.forEach((pe, i) => {
      assert.equal(pe.sets, Math.max(1, Math.floor(SPEC[id][i][2][2] * 0.5)), `${id} #${i}`);
      assert.equal(pe.rir, "4");
      assert.ok(!pe.note.includes(PARTIALS));
    });
  });
  eq([...dayOf("2027-02-02").exercises.map(e => e.sets)], [2, 2, 1, 2, 2, 1, 1]);   // C = 4,4,3,4,4,3,3
  assert.ok(A.tplFor("2027-02-02").note.includes("Deload week"));
});
test("block 2b (weeks 14-16) is column C again with RIR 2 to 0 and progression back on", () => {
  ["2027-02-09", "2027-02-16", "2027-02-23"].forEach(d => {
    const day = dayOf(d), b = A.progAt(d);
    assert.equal(b.phase.name, "Block 2b Peak volume");
    assert.equal(day.noProg, false);
    day.exercises.forEach((pe, i) => assert.equal(pe.sets, SPEC.uA[i][2][2], d + " #" + i));
  });
});
test("RIR targets: wk1 = 3, wk2-3 = 2 to 1, build/peak = the lift's own target, deload = 4, taper = 3", () => {
  const bench = d => dayOf(d).exercises[0];
  assert.equal(bench("2026-11-10").rir, "3");
  assert.equal(bench("2026-11-17").rir, "2 to 1");
  assert.equal(bench("2026-11-24").rir, "2 to 1");
  assert.equal(bench("2026-12-01").rir, "2");                                    // DB bench RIR 2 in the build block
  assert.equal(dayOf("2026-12-01").exercises[2].rir, "1 to 2");                  // incline press 1-2
  assert.equal(dayOf("2026-12-01").exercises[4].rir, "1");                       // lateral raise 1
  assert.equal(bench("2026-12-22").rir, "4");
  assert.equal(bench("2027-01-05").rir, "2");
  // a lift that asks for more reps in reserve than the week (external rotation, RIR 3) keeps its own
  const ext = d => dayOf(d).exercises.find(e => e.exerciseId === "extRot");
  assert.equal(ext("2026-11-20").rir, "3");
  assert.equal(ext("2026-11-27").rir, "3");
  eq([...A.PROG.phases.map(p => p.rir)], [["3", "2 to 1", "2 to 1"], ["2 to 0"], ["4"], ["2 to 0"], ["4"], ["2 to 0"], ["3"]]);
  assert.equal(bench("2027-02-02").rir, "4");                                    // week 13 deload
  assert.equal(bench("2027-02-09").rir, "2");                                    // block 2b
});
test("block 2 isolation lifts carry the lengthened-partials note; no other block does", () => {
  const iso = id => A.wmEx(id).iso;
  [["2026-12-29", true], ["2027-01-26", true], ["2027-02-16", true], ["2026-12-01", false], ["2026-11-10", false], ["2026-12-22", false], ["2027-02-02", false], ["2027-03-02", false]].forEach(([d, want]) => {
    dayOf(d).exercises.forEach(pe => assert.equal(pe.note.includes(PARTIALS), !!(want && iso(pe.exerciseId)), `${d} ${pe.exerciseId}`));
  });
  assert.ok(iso("cableLat") && iso("legExt") && iso("hammerCurl"));
  assert.ok(!iso("dbBench") && !iso("hackSquat") && !iso("wPullUp"));
});
test("rest guidance and notes are plain text on every planned lift (no numbers that count down)", () => {
  dates("2026-11-10", "2027-03-08").forEach(d => dayOf(d).exercises && dayOf(d).exercises.forEach(pe => {
    assert.equal(typeof pe.rest, "string"); assert.equal(typeof pe.note, "string"); assert.equal(typeof pe.rir, "string");
  }));
});
test("no Romanian deadlift, hip thrust or deadlift in any planned session on any date", () => {
  const bad = /deadlift|romanian|hip thrust|\brdl\b/i;
  dates("2026-11-01", "2027-03-20").forEach(d => {
    const t = A.tplFor(d);
    t.exercises.forEach(e => assert.ok(!bad.test(e.name), d + " " + e.name));
    (dayOf(d).exercises || []).forEach(pe => assert.ok(!bad.test(pe.exerciseId + " " + A.wmEx(pe.exerciseId).name), d));
  });
  Object.keys(A.PROG.days).forEach(id => A.PROG.days[id].forEach(row => assert.ok(!bad.test(A.wmEx(row[0]).name))));
  // retired lifts stay in the library only so logged history resolves
  ["rdl", "hipThrust", "deadlift", "sldl", "trapDL"].forEach(id => assert.equal(A.wmEx(id).retired, true, id));
  assert.ok(!A.WM_EXERCISES.some(e => !e.retired && bad.test(e.name)));
});
test("exercise names are unique among planned lifts, and a lift on two days keeps one rep range and one start load", () => {
  const seen = {};
  Object.keys(A.PROG.days).forEach(id => A.PROG.days[id].forEach(row => { (seen[row[0]] = seen[row[0]] || []).push(id); }));
  eq(Object.keys(seen).filter(k => seen[k].length > 1).sort(), ["legExt", "seatedLegCurl"]);
  eq(Object.keys(seen).map(k => A.wmEx(k).name).filter((n, i, a) => a.indexOf(n) !== i), []);
});
test("tplFor builds the Workout-tab day from the programme: sets x range @ start load; rest days are text with the bike session as the minutes box", () => {
  const t = A.tplFor("2026-11-10");
  assert.equal(t.type, "Upper A: Chest + Back (heavy)");
  eq([t.exercises[0].sets, t.exercises[0].reps, t.exercises[0].wt, t.exercises[0].perHand], [3, "6-10", 36, true]);
  assert.ok(t.note.startsWith("Block 1a Intro · week 1 of 17. RIR 3."));
  const z2 = A.tplFor("2026-11-12");
  assert.equal(z2.rest, true);
  assert.equal(z2.cardio.type, "Zone 2 bike");
  assert.equal(A.tplFor("2026-11-16").cardio.type, "VO2max 4x4 bike");
  assert.equal(A.tplFor("2026-12-24").cardio.type, "Optional easy walk");
  const w = A.getWorkout("2026-11-11");
  assert.equal(w.exercises[0].name, "Hack Squat");
  assert.equal(w.exercises[0].target, "3x6-10");
  assert.equal(w.exercises[0].sets[0].weight, "80");
});
test("session estimate and set queue still work on programme days", () => {
  const day = dayOf("2026-11-10");
  assert.equal(A.wmSetQueue(day, "2026-11-10").length, 19);
  assert.ok(A.wmEstimateMin(day, "2026-11-10") > 40);
});

/* ---------- nutrition, supplements, recovery text ---------- */
test("nutrition targets: 2900 kcal, 165 g protein, 80 g fat, 380 g carbs, water 3000 ml (+500 on sauna days)", () => {
  eq([A.S.targets.kcal, A.S.targets.protein, A.S.targets.fat, A.S.targets.netCarbs, A.S.targets.water],
    [2900, 165, 80, 380, 3000]);
  assert.equal(A.TARGETS.kcal, 2900);
  const d = "2026-11-10";
  assert.equal(A.waterTarget(d), 3000);
  A.getNutrition(d).sauna = true;
  assert.equal(A.waterTarget(d), 3500);
  A.getNutrition(d).sauna = false;
  assert.equal(A.waterTarget("2026-11-11"), 3000);
});
test("supplements: Space Goods coffee + creatine, D3/omega-3, Salte Electrolytes; no magnesium, cacao tea, MCT, ACV or keto items", () => {
  eq(A.SUPPS.map(s => [s.when, s.name]), [
    ["Morning / pre-workout", "Space Goods coffee (about 230 mg caffeine, before 13:00) + creatine 5 g"],
    ["First meal", "Vitamin D3 1000-2000 IU (Oct-Apr), Omega-3 1-2 g EPA+DHA (optional)"],
    ["Training / sauna", "Salte Electrolytes on sauna or heavy-sweat days; whey 25-40 g if needed for protein"]]);
  assert.ok(!/magnesium|cacao|cocoa/i.test(JSON.stringify(A.SUPPS)));
  const text = JSON.stringify(A.SUPPS) + JSON.stringify(A.PLAN_RULES) + JSON.stringify(A.SEED_FOODS);
  assert.ok(!/MCT|apple cider|\bACV\b|keto/i.test(text));
});
test("quick-add meals: the five new foods with the briefed macros", () => {
  eq(A.SEED_FOODS.map(f => [f.name, f.kcal, f.protein, f.netCarbs, f.fat]), [
    ["Chicken, rice + veg bowl", 760, 60, 95, 18],
    ["Oats, milk, whey, banana", 740, 50, 100, 12],
    ["Salmon, potatoes, veg + knackebrod", 790, 38, 95, 30],
    ["Proteinkvarg, berries, granola, honey", 540, 38, 70, 12],
    ["Lean beef wholewheat pasta", 670, 52, 76, 15]]);
  eq(A.S.myFoods.map(f => f.name), A.SEED_FOODS.map(f => f.name));
});
test("guide text: protein feedings, eating window, alcohol, cold rule, sauna, sleep", () => {
  const r = A.PLAN_RULES.rules.join("\n");
  assert.ok(r.includes("4 feedings of 35-45 g"));
  assert.ok(r.includes("12:00-20:00") && r.includes("10:30-11:45") && r.includes("25-30 g whey") && r.includes("eat at 12:00"));
  assert.ok(r.includes("2 drinks at most, none on lifting days and none within 4 h of bed"));
  assert.ok(r.includes("No cold-water immersion or cold shower within 6 h after lifting. Cold only on rest days or before training."));
  assert.ok(r.includes("2-4 times a week, 15-20 min at 80-90 C after lifting or on rest days, 0.5-1 L water with electrolytes"));
  assert.ok(r.includes("In bed by 23:15, 7+ h sleep"));
  assert.ok(r.includes("Stop the surplus, eat at maintenance until 9 Mar"));
  assert.equal(A.PLAN_RULES.increments, "DB +2 kg · machines/cables +2.5 kg (Leg Press and Hack Squat +10 kg) · barbell +2.5 kg · added-bodyweight +2.5 kg");
});
test("calorie advice: band 0.10-0.25, +150 under 0.10 and -150 over 0.35, nothing before week 3, body-fat ceiling 15%", () => {
  const B = loadApp({ now: "2026-12-02T10:00:00" });               // programme week 4
  B.S.bodyLog = [{ date: "2026-11-18", weight: 80, bodyFat: 12, note: "" }, { date: "2026-12-02", weight: 80.0, bodyFat: 12, note: "" }];
  assert.ok(B.calAdvice(B.trend2w()).msg.includes("Add 150 kcal"));                 // flat -> under 0.10
  B.S.bodyLog[1].weight = 80.4;                                                      // +0.2 kg/wk
  assert.ok(B.calAdvice(B.trend2w()).msg.includes("inside the 0.10 to 0.25"));
  B.S.bodyLog[1].weight = 81.0;                                                      // +0.5 kg/wk
  assert.ok(B.calAdvice(B.trend2w()).msg.includes("Take 150 kcal a day off"));
  B.S.bodyLog[1].weight = 80.6;                                                      // +0.3 kg/wk: above the band, under 0.35
  assert.ok(!/150/.test(B.calAdvice(B.trend2w()).msg));
  B.S.bodyLog[1].bodyFat = 15;                                                       // ceiling
  assert.ok(B.calAdvice(B.trend2w()).msg.includes("Stop the surplus, eat at maintenance until 9 Mar"));
  // before week 3 there is no suggestion, even for a flat trend
  const E = loadApp({ now: "2026-11-18T10:00:00" });               // programme week 2
  E.S.bodyLog = [{ date: "2026-11-04", weight: 80, bodyFat: 12, note: "" }, { date: "2026-11-18", weight: 80, bodyFat: 12, note: "" }];
  const adv = E.calAdvice(E.trend2w());
  assert.ok(!/150/.test(adv.msg) && adv.msg.includes("before week 3"));
  assert.equal(E.calAdvice(null), null);                                           // no trend, no advice
});

console.log(`\n${passed} tests passed`);
