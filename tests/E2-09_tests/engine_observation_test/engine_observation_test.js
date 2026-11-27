// Engine-level overlay observation tests: this repository's server.js is started on free
// ports and calls the real /api/script and /api/screenshot endpoints on a local
// 127.0.0.1 site. Engines: observation off, on, on with a 500 ms window, and on with a
// test-only throwing observer (preloaded; production code is unchanged by it).
// Observations are read from the engine's standard output only (no public field).
// PROPOSED contract: docs/overlay-recurrence-observation.md
const test = require("node:test");
const assert = require("node:assert/strict");
const {
    startSite, startEngines, runScript, scanPage, observations, stubCalls, normalizedLog, THROWING_OBSERVER_PRELOAD,
} = require("../fixture");

let site, off, on, short, stub;
let engines = [];

test.before(async () => {
    site = await startSite();
    engines = await startEngines([
        {},
        { LF_OVERLAY_OBSERVATION: "1" },
        { LF_OVERLAY_OBSERVATION: "1", LF_OVERLAY_OBSERVATION_WINDOW_MS: "500" },
        { LF_OVERLAY_OBSERVATION: "1", NODE_OPTIONS: `--require ${JSON.stringify(THROWING_OBSERVER_PRELOAD)}` },
    ]);
    [off, on, short, stub] = engines;
});

test.after(async () => {
    await Promise.all(engines.map((e) => e.stop()));
    if (site) await site.close();
});

async function scriptRun(engine, path) {
    engine.sinceLast();
    const result = await runScript(engine, site.url + path);
    const out = engine.sinceLast();
    return { result, obs: observations(out), out };
}

// results of the observation-off engine, reused by the comparison tests
const offScripts = new Map();
async function offScript(path) {
    if (!offScripts.has(path)) offScripts.set(path, (await scriptRun(off, path)).result);
    return offScripts.get(path);
}
let offScan = null;
async function offScreenshot() {
    if (!offScan) offScan = await scanPage(off, site.url + "/recurs");
    return offScan;
}

// the outcome and the metrics a caller sees
function outcome(r) {
    return {
        httpStatus: r.httpStatus, status: r.status, result: r.result, states: r.states, interactions: r.interactions,
        counts: r.counts, warnings: r.warnings, steps: (r.steps || []).map((s) => [s.index, s.action, s.status]),
        keys: Object.keys(r).sort(),
    };
}
const scanOutcome = (r) => ({
    httpStatus: r.httpStatus, status: r.status, result: r.result, states: r.states, interactions: r.interactions,
    interactionBreakdown: r.interactionBreakdown, popupsHandled: r.popupsHandled, fieldsFilled: r.fieldsFilled,
    keys: Object.keys(r).sort(),
});

test("observation disabled (default) writes no observation output", { timeout: 120000 }, async () => {
    const { obs } = await scriptRun(off, "/recurs");
    assert.deepEqual(obs, []);
    assert.ok(!/\[overlay-observation/.test(off.logs()));
});

test("recurrence of a closed overlay is observed (script endpoint)", { timeout: 120000 }, async () => {
    const { obs } = await scriptRun(on, "/recurs");
    const rec = obs.filter((o) => o.state === "recurred");
    assert.equal(rec.length, 1, `observations: ${JSON.stringify(obs)}`);
    assert.equal(rec[0].method, "close_control");
    assert.equal(rec[0].phase, "script_pre_wait");
    assert.equal(rec[0].windowMs, 3000);
    assert.ok(Date.parse(rec[0].recurrenceObservedAt) > Date.parse(rec[0].dismissedAt));
    assert.ok(rec[0].observedForMs > 0 && rec[0].observedForMs < 3000);
});

test("B1: a recurrence visible only between the poll and the dismissal scan is attributed", { timeout: 120000 }, async () => {
    const { result, obs } = await scriptRun(on, "/b1-gap");
    const log = normalizedLog(result);
    assert.equal(log.filter((l) => /^Popup cancelled with its Close button/.test(l)).length, 2, "the promo was closed twice");
    assert.equal(obs.length, 2, JSON.stringify(obs));
    assert.equal(obs[0].state, "recurred", JSON.stringify(obs));
    assert.ok(Date.parse(obs[0].recurrenceObservedAt) <= Date.parse(obs[1].dismissedAt), "seen before the second dismissal");
    assert.notEqual(obs[1].state, "recurred");
});

test("an early quiet-period exit gives incomplete QUIET_EXIT, never not_observed", { timeout: 120000 }, async () => {
    const { obs } = await scriptRun(on, "/stays-closed");
    assert.equal(obs.length, 1, JSON.stringify(obs));
    assert.equal(obs[0].state, "incomplete");
    assert.equal(obs[0].reason, "QUIET_EXIT");
    assert.ok(obs[0].observedForMs < 3000);
});

test("with a window that fits inside the loop, a closed overlay is not_observed", { timeout: 120000 }, async () => {
    const { obs } = await scriptRun(short, "/stays-closed");
    assert.equal(obs.length, 1, JSON.stringify(obs));
    assert.equal(obs[0].state, "not_observed");
    assert.equal(obs[0].windowMs, 500);
    assert.ok(obs[0].observedForMs >= 500);
});

test("a different overlay appearing is not reported as a recurrence", { timeout: 120000 }, async () => {
    const { obs } = await scriptRun(on, "/different");
    assert.ok(obs.length >= 1, JSON.stringify(obs));
    assert.equal(obs[0].state === "recurred", false, JSON.stringify(obs));
});

test("an Escape dismissal is observed with method escape", { timeout: 120000 }, async () => {
    const { obs } = await scriptRun(on, "/escape");
    assert.equal(obs.length, 1, JSON.stringify(obs));
    assert.equal(obs[0].method, "escape");
});

test("the engine's hidden fallback is not observed", { timeout: 120000 }, async () => {
    const { result, obs } = await scriptRun(on, "/hidden-fallback");
    assert.ok(normalizedLog(result).some((l) => /could not be closed with a click, so it was hidden/.test(l)), "fallback really happened");
    assert.deepEqual(obs, []);
});

test("observation output never contains overlay text", { timeout: 120000 }, async () => {
    const { obs } = await scriptRun(on, "/recurs");
    const text = on.logs().split(/\r?\n/).filter((l) => l.startsWith("[overlay-observation")).join("\n");
    assert.ok(obs.length >= 1);
    for (const leak of ["PRIVATE-OVERLAY-TEXT-7731", "jane.doe@example.com", "9876543210", "Summer offer", "Got it"]) {
        assert.ok(!text.includes(leak), `observation output must not contain ${leak}`);
    }
});

test("script endpoint: outcome, metrics, response keys and action log are identical with observation on and off", { timeout: 300000 }, async () => {
    for (const path of ["/recurs", "/b1-gap", "/stays-closed", "/escape", "/hidden-fallback", "/plain"]) {
        const a = await offScript(path);
        const b = (await scriptRun(on, path)).result;
        assert.deepEqual(outcome(b), outcome(a), `outcome differs for ${path}`);
        assert.deepEqual(normalizedLog(b), normalizedLog(a), `action log differs for ${path}`);
    }
});

test("screenshot endpoint: outcome, metrics and response keys are identical with observation on and off", { timeout: 300000 }, async () => {
    const a = await offScreenshot();
    on.sinceLast();
    const b = await scanPage(on, site.url + "/recurs");
    assert.deepEqual(scanOutcome(b), scanOutcome(a));
    assert.deepEqual(normalizedLog(b), normalizedLog(a));
    const obs = observations(on.sinceLast());
    assert.ok(obs.some((o) => o.phase === "screenshot_initial_wait"), JSON.stringify(obs));
    assert.ok(obs.every((o) => ["screenshot_initial_wait", "screenshot_post_scroll_wait"].includes(o.phase)));
});

test("B2: a throwing observer (note, visibility note, poll, output) changes no script scan", { timeout: 300000 }, async () => {
    const seen = new Set();
    for (const path of ["/recurs", "/b1-gap", "/stays-closed", "/escape"]) {
        const a = await offScript(path);
        const { result: b, out } = await scriptRun(stub, path);
        stubCalls(out).forEach((c) => seen.add(c));
        assert.deepEqual(outcome(b), outcome(a), `outcome differs for ${path}`);
        assert.deepEqual(normalizedLog(b), normalizedLog(a), `action log / dismissal behaviour differs for ${path}`);
        assert.ok(!/\[overlay-observation/.test(out), "no observation output from a failed observer");
        assert.ok(!/stub \w+ failure/.test(JSON.stringify(b)), "observer errors do not reach the response");
    }
    for (const point of ["noteVisible", "noteDismissed", "poll", "end", "formatDiagnostics"]) {
        assert.ok(seen.has(point), `call point ${point} was exercised (seen: ${[...seen].join(", ")})`);
    }
});

test("B2: a throwing observer changes no screenshot scan", { timeout: 300000 }, async () => {
    const a = await offScreenshot();
    stub.sinceLast();
    const b = await scanPage(stub, site.url + "/recurs");
    const calls = stubCalls(stub.sinceLast());
    assert.deepEqual(scanOutcome(b), scanOutcome(a));
    assert.deepEqual(normalizedLog(b), normalizedLog(a));
    assert.ok(calls.includes("poll") && calls.includes("noteDismissed"), calls.join(", "));
});
