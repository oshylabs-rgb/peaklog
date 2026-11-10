/* No timers: nothing in the workout flow counts down, counts up, or ends a session on its own, and the
   service worker/offline setup is intact. Static checks on the source plus a behaviour check.
   Run: node tests/timers.test.mjs */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { loadApp, addLiftSession } from "./harness.mjs";

let passed = 0;
function test(name, fn) { fn(); passed++; console.log("ok - " + name); }
const root = new URL("../", import.meta.url);
const html = readFileSync(new URL("index.html", root), "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const style = html.match(/<style>([\s\S]*?)<\/style>/)[1];
const sw = readFileSync(new URL("sw.js", root), "utf8");

test("no interval, animation-frame loop, clock, countdown, rest timer, 45-minute cap or auto-end anywhere in the code", () => {
  const banned = [/setInterval/, /requestAnimationFrame/, /wmRestUntil/, /wmTimer/, /wmEnsureTick/, /wmClockStr/, /wmElapsedSec/,
    /WM_CAP_SEC/, /wmClock/, /wmCap\b/, /wmRestChip/, /countdown/i, /autoEnd/i, /autoFinish/i, /\b2700\b/, /45\s*\*\s*60/, /45:00/,
    /45-min(ute)?( lift)? cap/i, /rest timer/i, /left of 45/i, /restUntil/i];
  banned.forEach(re => assert.ok(!re.test(script), "script still matches " + re));
});
test("no timer styles or elements left: .wsclock is gone and no clock/rest-chip ids exist", () => {
  assert.ok(!/wsclock/.test(style) && !/wsclock/.test(script));
  assert.ok(!/id:"wm(Clock|Cap|RestChip)"/.test(script));
});
test("the only setTimeout calls are the toast fade and the scroll-into-view of the open exercise", () => {
  const lines = script.split("\n").filter(l => /setTimeout\(/.test(l));
  assert.equal(lines.length, 2);
  lines.forEach(l => assert.ok(/toastT=setTimeout/.test(l) || /scrollIntoView/.test(l), l.trim().slice(0, 80)));
});
test("Date.now() is only used to make a session id; session length is never computed while a session is open", () => {
  const lines = script.split("\n").filter(l => /Date\.now\(\)/.test(l));
  assert.equal(lines.length, 1);
  assert.ok(/const id="ws-"/.test(lines[0]));
});
test("rest, RIR and notes are text fields on the exercise, nothing numeric drives a countdown", () => {
  const A = loadApp({ now: "2026-11-10T10:00:00" });
  const day = A.wmDay("uA", "2026-11-10");
  day.exercises.forEach(pe => { assert.equal(typeof pe.rest, "string"); assert.ok(pe.rest.length); });
});
test("a lift session left open for three hours is still open: nothing auto-ends it or flags sets skipped", () => {
  const A = loadApp({ now: "2026-11-10T10:00:00" });
  const id = A.wmCreateSession("uA", "2026-11-10"), sess = A.S.wm.sessions[id];
  A.wmLogSet(sess, A.wmSessionDay(sess).exercises[0], 0, 36, 8);
  A.setNow("2026-11-10T13:30:00");
  A.viewWmSession({ appendChild() {}, append() {} });
  assert.equal(A.S.wm.sessions[id].endedAt, null);
  assert.equal(A.S.wm.setLogs.filter(l => l.sessionId === id).length, 1);
  assert.equal(A.S.wm.activeSessionId, id);
  // ending it by hand still works exactly as before: unlogged sets are flagged skipped
  A.wmFlagRemaining(sess);
  assert.ok(A.S.wm.sessions[id].endedAt);
  assert.equal(A.S.wm.setLogs.filter(l => l.sessionId === id && l.skipped).length, 18);   // 19 sets in week-1 Upper A, 1 logged
});
test("service worker: new cache name, old caches deleted on activate, every app file precached", () => {
  const name = /const CACHE = "([^"]+)"/.exec(sw)[1];
  assert.equal(name, "peaklog-v14");
  assert.ok(!["peaklog-v12", "peaklog-v13"].includes(name));
  assert.ok(/keys\.filter\(k => k !== CACHE\)\.map\(k => caches\.delete\(k\)\)/.test(sw), "activate deletes other caches");
  assert.ok(/skipWaiting/.test(sw) && /clients\.claim/.test(sw));
  const assets = JSON.parse(/const ASSETS = (\[[^\]]*\])/.exec(sw)[1]);
  assets.forEach(a => { if (a !== "./") assert.ok(existsSync(new URL(a.replace(/^\.\//, ""), root)), a + " exists"); });
  ["./", "./index.html", "./manifest.webmanifest", "./icon.svg"].forEach(a => assert.ok(assets.includes(a), a + " precached"));
  // the page needs nothing from the network: no external scripts, styles, fonts or images
  assert.ok(!/(src|href)=["']https?:/i.test(html));
  assert.ok(!/@import|url\(["']?https?:/i.test(style));
  const man = JSON.parse(readFileSync(new URL("manifest.webmanifest", root), "utf8"));
  man.icons.forEach(i => assert.ok(assets.includes("./" + i.src), i.src + " is precached"));
});

console.log(`\n${passed} tests passed`);
