// Story:       As an analyst, I want interactive states on one page scripted.
// Criterion 2: Given a state cap, when exceeded, then the extra states are
//              skipped with a warning.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { runStateScript } = require("../../stateScriptRunner");
const config = require("../../stateScript.config");
const { launchBrowser, makeTmpDir, removeDir } = require("../fixture");
const { startFixtureServer, FAST } = require("../scriptFixtures");

let browser;
let site;
let tmpDir;

test.before(async () => {
    browser = await launchBrowser();
    site = await startFixtureServer();
    tmpDir = makeTmpDir();
});

test.after(async () => {
    if (browser) await browser.close();
    if (site) await site.close();
    removeDir(tmpDir);
});

// 5 states, with a click before each one
const FIVE_STATES = {
    steps: [
        { action: "capture", name: "one" },
        { action: "click", selector: "#open-modal" },
        { action: "capture", name: "two" },
        { action: "click", selector: "#close-modal" },
        { action: "capture", name: "three" },
        { action: "click", selector: "#toggle" },
        { action: "capture", name: "four" },
        { action: "click", selector: "#expand" },
        { action: "capture", name: "five" },
    ],
};

async function runScript(script, options = {}) {
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const page = await context.newPage();
    await page.goto(site.url);

    const logs = [];
    const prefix = `cap-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const result = await runStateScript(page, script, {
        config: FAST,
        outDir: tmpDir,
        filePrefix: prefix,
        log: (m) => logs.push(m),
        ...options,
    });
    await context.close();
    return { result, logs, prefix };
}

test("Test: states over the cap are skipped with a warning", { timeout: 60000 }, async () => {
    const { result, logs, prefix } = await runScript(FIVE_STATES, { maxStates: 3 });

    // only the first 3 states were captured
    assert.deepEqual(result.states.map((s) => s.name), ["one", "two", "three"]);
    assert.equal(result.capped, true);
    assert.equal(result.stateCap, 3);

    // the other 2 are listed as skipped, each with its own warning
    assert.deepEqual(result.skippedStates, ["four", "five"]);
    assert.ok(result.warnings.some((w) => w.includes('State "four" skipped: state cap of 3 reached')));
    assert.ok(result.warnings.some((w) => w.includes('State "five" skipped: state cap of 3 reached')));
    assert.ok(logs.some((l) => l.startsWith("Warning:") && l.includes('"four"')), "the warning is also in the log");

    // no screenshot files for the skipped states
    const files = fs.readdirSync(tmpDir).filter((f) => f.startsWith(prefix));
    assert.equal(files.length, 3);

    // the run did not fail: skipping is not an error
    assert.equal(result.counts.failed, 0);
    assert.equal(result.counts.statesCaptured, 3);
    assert.equal(result.counts.statesSkipped, 2);
});

test("steps after the cap are skipped too, they are not run", { timeout: 60000 }, async () => {
    const { result } = await runScript(FIVE_STATES, { maxStates: 3 });

    // steps 1-5 ran (capture one, click, capture two, click, capture three)
    assert.deepEqual(result.steps.slice(0, 5).map((s) => s.status), ["ok", "ok", "ok", "ok", "ok"]);
    // steps 6-9 (click toggle, capture four, click expand, capture five) were skipped
    assert.deepEqual(result.steps.slice(5).map((s) => s.status), ["skipped", "skipped", "skipped", "skipped"]);
    assert.ok(result.steps[5].reason.includes("state cap of 3 reached"));
});

test("a script with exactly as many states as the cap gives no warning", { timeout: 60000 }, async () => {
    const { result } = await runScript(FIVE_STATES, { maxStates: 5 });

    assert.equal(result.states.length, 5);
    assert.equal(result.capped, false);
    assert.deepEqual(result.warnings, []);
    assert.equal(result.counts.statesSkipped, 0);
});

test("the cap can be set in the script itself", { timeout: 60000 }, async () => {
    const { result } = await runScript({ ...FIVE_STATES, maxStates: 2 });

    assert.equal(result.stateCap, 2);
    assert.equal(result.states.length, 2);
    assert.equal(result.skippedStates.length, 3);
});

test("without a cap in the script, the default cap comes from the config file", { timeout: 60000 }, async () => {
    const { result } = await runScript(FIVE_STATES);

    assert.equal(result.stateCap, config.maxStates);
    assert.equal(result.states.length, 5);
});

test("a cap above the hard limit is lowered, with a warning", { timeout: 60000 }, async () => {
    const { result } = await runScript(FIVE_STATES, { maxStates: config.hardMaxStates + 1 });

    assert.equal(result.stateCap, config.hardMaxStates);
    assert.ok(result.warnings.some((w) => w.includes("above the limit")));
});

test("a cap that is not a whole number is ignored, with a warning", { timeout: 60000 }, async () => {
    for (const bad of [0, -2, 2.5, "many"]) {
        const { result } = await runScript(
            { steps: [{ action: "capture", name: "only" }] },
            { maxStates: bad }
        );
        assert.equal(result.stateCap, config.maxStates, `cap ${bad} falls back to the default`);
        assert.ok(result.warnings.some((w) => w.includes("not a whole number")), `warning for ${bad}`);
    }
});
