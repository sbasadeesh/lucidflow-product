// Overlay recurrence observer - pure unit tests with a controlled clock (no browser).
// PROPOSED contract: docs/overlay-recurrence-observation.md
const test = require("node:test");
const assert = require("node:assert/strict");
const {
    createOverlayObserver, matchIdentity, overlayIdOf, formatDiagnostics, END_REASONS,
} = require("../../../backend/src/modules/overlayObservation/overlayObserver");
const { resolveConfig } = require("../../../backend/src/modules/overlayObservation/overlayObservation.config");

const RECORD_KEYS = ["dismissedAt", "method", "observationEndedAt", "observedForMs", "overlayId", "phase",
    "reason", "recurrenceObservedAt", "state", "windowMs"].sort();

function clockAt(start = 1_000_000) {
    let t = start;
    const clock = () => t;
    clock.set = (v) => { t = v; };
    clock.add = (d) => { t += d; };
    return clock;
}

const ID_A = { tag: "div", role: "", ariaModal: "", structureHash: "s1", textHash: "t1", textLength: 40, geometry: "200,120,400,200" };
const ID_B = { ...ID_A, textHash: "t2" };

function observer(clock, extra = {}) {
    return createOverlayObserver({ windowMs: 3000, clock, phase: "script_pre_wait", ...extra });
}

const iso = (ms) => new Date(ms).toISOString();

test("a dismissed overlay that stays absent for the whole window is not_observed", () => {
    const c = clockAt(1_000_000);
    const o = observer(c);
    o.noteDismissed(ID_A, { method: "close_control", context: "u1" });
    c.set(1_001_000); o.poll([], { context: "u1" });
    assert.equal(o.records()[0].state, "open");
    c.set(1_003_200); o.poll([], { context: "u1" });
    const [r] = o.records();
    assert.equal(r.state, "not_observed");
    assert.equal(r.reason, null);
    assert.equal(r.recurrenceObservedAt, null);
    assert.equal(r.observedForMs, 3200);
    assert.equal(r.observationEndedAt, iso(1_003_200));
});

test("the same overlay reappearing within the window is recurred, with separate timestamps", () => {
    const c = clockAt(2_000_000);
    const o = observer(c);
    o.noteDismissed(ID_A, { method: "close_control", context: "u1" });
    c.set(2_001_600); o.poll([{ ...ID_A }], { context: "u1" });
    const [r] = o.records();
    assert.equal(r.state, "recurred");
    assert.equal(r.dismissedAt, iso(2_000_000));
    assert.equal(r.recurrenceObservedAt, iso(2_001_600));
    assert.equal(r.observationEndedAt, iso(2_001_600));
    assert.equal(r.observedForMs, 1600);
    assert.notEqual(r.dismissedAt, r.recurrenceObservedAt);
});

test("a different overlay appearing is not a recurrence", () => {
    const c = clockAt();
    const o = observer(c);
    o.noteDismissed(ID_A, { method: "escape", context: "u1" });
    c.add(1000); o.poll([ID_B], { context: "u1" });
    c.add(2500); o.poll([ID_B], { context: "u1" });
    assert.equal(o.records().length, 1);
    assert.equal(o.records()[0].state, "not_observed");
});

test("a match seen only after the window has ended is not a recurrence", () => {
    const c = clockAt();
    const o = observer(c);
    o.noteDismissed(ID_A, { method: "close_control", context: "u1" });
    c.add(3100); o.poll([ID_A], { context: "u1" });
    assert.equal(o.records()[0].state, "not_observed");
});

test("early loop exit (quiet period) gives incomplete QUIET_EXIT, never not_observed", () => {
    const c = clockAt(3_000_000);
    const o = observer(c);
    o.noteDismissed(ID_A, { method: "close_control", context: "u1" });
    c.set(3_001_000); o.poll([], { context: "u1" });
    c.set(3_001_500); o.end("QUIET_EXIT");
    const [r] = o.records();
    assert.equal(r.state, "incomplete");
    assert.equal(r.reason, "QUIET_EXIT");
    assert.equal(r.observedForMs, 1500);
    assert.equal(r.recurrenceObservedAt, null);
});

test("reaching the loop limit before the window completes gives incomplete BUDGET_ENDED", () => {
    const c = clockAt();
    const o = observer(c);
    o.noteDismissed(ID_A, { method: "close_control", context: "u1" });
    c.add(2000); o.end("BUDGET_ENDED");
    assert.deepEqual([o.records()[0].state, o.records()[0].reason], ["incomplete", "BUDGET_ENDED"]);
});

test("navigation, page close and snapshot failure give incomplete with their reason", () => {
    const c = clockAt();
    const a = observer(c);
    a.noteDismissed(ID_A, { method: "close_control", context: "http://site/a" });
    c.add(500); a.poll([ID_A], { context: "http://site/b" });
    assert.deepEqual([a.records()[0].state, a.records()[0].reason], ["incomplete", "NAVIGATED"]);

    for (const reason of ["PAGE_CLOSED", "SNAPSHOT_FAILED"]) {
        const o = observer(c);
        o.noteDismissed(ID_A, { method: "close_control", context: "u" });
        c.add(100); o.end(reason);
        assert.deepEqual([o.records()[0].state, o.records()[0].reason], ["incomplete", reason]);
    }
    assert.deepEqual([...END_REASONS].sort(), ["BUDGET_ENDED", "NAVIGATED", "PAGE_CLOSED", "QUIET_EXIT", "SNAPSHOT_FAILED"]);
});

test("closed records are not changed by later polls or end()", () => {
    const c = clockAt();
    const o = observer(c);
    o.noteDismissed(ID_A, { method: "close_control", context: "u" });
    c.add(1000); o.poll([ID_A], { context: "u" });
    c.add(500); o.end("QUIET_EXIT");
    assert.equal(o.records()[0].state, "recurred");
    assert.equal(o.hasOpen(), false);
});

test("only confirmed close-control or Escape dismissals are tracked (hidden fallback excluded)", () => {
    const o = observer(clockAt());
    assert.equal(o.noteDismissed(ID_A, { method: "hidden", context: "u" }), null);
    assert.equal(o.noteDismissed(ID_A, { method: "something-else", context: "u" }), null);
    assert.equal(o.records().length, 0);
    assert.match(o.noteDismissed(ID_A, { method: "escape", context: "u" }), /^ov-[0-9a-f]{12}$/);
    assert.equal(o.records().length, 1);
});

test("tracking is bounded by maxTracked and untracked dismissals are counted", () => {
    const o = observer(clockAt(), { maxTracked: 2 });
    for (let i = 0; i < 4; i++) o.noteDismissed({ ...ID_A, textHash: `t${i}` }, { method: "close_control", context: "u" });
    assert.equal(o.records().length, 2);
    assert.equal(o.summary().untracked, 2);
});

test("matching requires every identity component; identical overlays are indistinguishable", () => {
    assert.equal(matchIdentity(ID_A, { ...ID_A }), true, "identical identities match (same element or identical replacement)");
    for (const k of ["tag", "role", "ariaModal", "structureHash", "textHash", "textLength", "geometry"]) {
        assert.equal(matchIdentity(ID_A, { ...ID_A, [k]: k === "textLength" ? 41 : "other" }), false, `${k} differs`);
    }
    assert.equal(overlayIdOf(ID_A), overlayIdOf({ ...ID_A }));
    assert.notEqual(overlayIdOf(ID_A), overlayIdOf(ID_B));
});

test("records and diagnostics contain only the allowed fields and no identity components", () => {
    const c = clockAt();
    const o = observer(c);
    o.noteDismissed({ ...ID_A, textHash: "SECRET-HASH-INPUT" }, { method: "close_control", context: "SECRET-URL" });
    c.add(3000); o.poll([], { context: "SECRET-URL" });
    for (const r of o.records()) assert.deepEqual(Object.keys(r).sort(), RECORD_KEYS);
    const lines = formatDiagnostics(o);
    assert.ok(lines.length >= 2);
    for (const l of lines) {
        assert.match(l, /^\[overlay-observation(-summary)?\] \{/);
        for (const leak of ["SECRET-HASH-INPUT", "SECRET-URL", "structureHash", "textHash", "geometry", "200,120"]) {
            assert.ok(!l.includes(leak), `diagnostic must not contain ${leak}`);
        }
    }
});

test("invalid input is rejected", () => {
    assert.throws(() => createOverlayObserver({ windowMs: 0, clock: clockAt() }), TypeError);
    assert.throws(() => createOverlayObserver({ windowMs: 2.5, clock: clockAt() }), TypeError);
    const o = observer(clockAt());
    assert.throws(() => o.noteDismissed({ tag: "div" }, { method: "close_control", context: "u" }), TypeError);
    assert.throws(() => o.poll("nope", { context: "u" }), TypeError);
    assert.throws(() => o.end("WHENEVER"), TypeError);
});

// ---- B1: visibility seen by the dismissal scan, between polls ----

test("noteVisible marks a matching open record recurred within the window", () => {
    const c = clockAt(5_000_000);
    const o = observer(c);
    o.noteDismissed(ID_A, { method: "close_control", context: "u" });
    c.set(5_001_200); o.noteVisible({ ...ID_A }, { context: "u" });
    const [r] = o.records();
    assert.equal(r.state, "recurred");
    assert.equal(r.recurrenceObservedAt, iso(5_001_200));
    assert.equal(r.observedForMs, 1200);
});

test("noteVisible never sets not_observed or any other end state", () => {
    const c = clockAt();
    const o = observer(c);
    o.noteDismissed(ID_A, { method: "close_control", context: "u" });
    c.add(3500); o.noteVisible(ID_A, { context: "u" });   // after the window: ignored
    o.noteVisible(ID_B, { context: "u" });                // different overlay: ignored
    o.noteVisible(ID_A, { context: "other" });            // different page: ignored (not NAVIGATED)
    assert.equal(o.records()[0].state, "open");
    assert.equal(o.records()[0].reason, null);
    o.end("QUIET_EXIT");
    assert.deepEqual([o.records()[0].state, o.records()[0].reason], ["incomplete", "QUIET_EXIT"]);
});

test("noteVisible and poll do not double-count a recurrence", () => {
    const c = clockAt(6_000_000);
    const o = observer(c);
    o.noteDismissed(ID_A, { method: "close_control", context: "u" });
    c.set(6_000_900); o.noteVisible(ID_A, { context: "u" });
    c.set(6_001_400); o.poll([ID_A], { context: "u" });
    o.noteVisible(ID_A, { context: "u" });
    const recs = o.records();
    assert.equal(recs.length, 1);
    assert.equal(recs[0].recurrenceObservedAt, iso(6_000_900), "first sighting kept");
    assert.equal(o.summary().recurred, 1);
});

test("gap sequence: recurrence seen only by the dismissal scan is attributed to the open record", () => {
    const c = clockAt(7_000_000);
    const o = observer(c);
    o.noteDismissed(ID_A, { method: "close_control", context: "u" });   // record A
    c.set(7_000_500); o.poll([], { context: "u" });                     // tick poll: hidden
    c.set(7_000_700); o.noteVisible(ID_A, { context: "u" });            // back before the scan acts
    c.set(7_001_300); o.noteDismissed(ID_A, { method: "close_control", context: "u" }); // record B
    c.set(7_002_000); o.poll([], { context: "u" });
    c.set(7_002_800); o.end("QUIET_EXIT");
    const [a, b] = o.records();
    assert.deepEqual([a.state, a.recurrenceObservedAt], ["recurred", iso(7_000_700)]);
    assert.deepEqual([b.state, b.reason], ["incomplete", "QUIET_EXIT"]);
});

test("noteVisible rejects an invalid signature", () => {
    const o = observer(clockAt());
    assert.equal(typeof o.noteVisible, "function");
    assert.throws(() => o.noteVisible({ tag: "div" }, { context: "u" }), { name: "TypeError", message: /is missing/ });
});

test("configuration: window values above the cap fall back to the default", () => {
    assert.equal(resolveConfig({ LF_OVERLAY_OBSERVATION_WINDOW_MS: "60000" }).windowMs, 60000);
    assert.equal(resolveConfig({ LF_OVERLAY_OBSERVATION_WINDOW_MS: "60001" }).windowMs, 3000);
    assert.equal(resolveConfig({ LF_OVERLAY_OBSERVATION_WINDOW_MS: "86400000" }).windowMs, 3000);
});

test("configuration: disabled by default, windowMs 3000, explicit overrides only", () => {
    assert.deepEqual(resolveConfig({}), { enabled: false, windowMs: 3000, maxTracked: 10 });
    assert.equal(resolveConfig({ LF_OVERLAY_OBSERVATION: "1" }).enabled, true);
    assert.equal(resolveConfig({ LF_OVERLAY_OBSERVATION: "true" }).enabled, false);
    assert.equal(resolveConfig({ LF_OVERLAY_OBSERVATION_WINDOW_MS: "500" }).windowMs, 500);
    for (const bad of ["0", "-5", "abc", "2.5", ""]) {
        assert.equal(resolveConfig({ LF_OVERLAY_OBSERVATION_WINDOW_MS: bad }).windowMs, 3000, `"${bad}" falls back`);
    }
});
