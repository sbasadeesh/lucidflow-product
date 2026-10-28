// Story:       As an analyst, I want interactive states on one page scripted.
// Criterion 3: Given a missing element, when a step runs, then the step fails
//              with a logged reason, not a crash.

const test = require("node:test");
const assert = require("node:assert/strict");

const { runStateScript } = require("../../stateScriptRunner");
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

async function runScript(script, options = {}) {
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const page = await context.newPage();
    await page.goto(site.url);

    const logs = [];
    const result = await runStateScript(page, script, {
        config: FAST,
        outDir: tmpDir,
        filePrefix: `missing-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        log: (m) => logs.push(m),
        ...options,
    });
    await context.close();
    return { result, logs };
}

test("Test: a click on a missing element fails with a logged reason, not a crash", { timeout: 60000 }, async () => {
    // runStateScript must not throw
    const { result, logs } = await runScript({
        steps: [{ action: "click", selector: "#does-not-exist" }],
    });

    const step = result.steps[0];
    assert.equal(step.status, "failed");
    assert.ok(step.reason.includes("Element not found or not visible"), step.reason);
    assert.ok(step.reason.includes("#does-not-exist"), "the reason names the element");

    assert.ok(logs.some((l) => l.includes("FAILED") && l.includes("#does-not-exist")), "the reason is in the log");
    assert.equal(result.status, "completed_with_failures");
    assert.equal(result.counts.failed, 1);
});

test("after a failed step the script goes on with the next steps", { timeout: 60000 }, async () => {
    const { result } = await runScript({
        steps: [
            { action: "click", selector: "#does-not-exist" },
            { action: "click", selector: "#open-modal" },
            { action: "capture", name: "modal open" },
        ],
    });

    assert.deepEqual(result.steps.map((s) => s.status), ["failed", "ok", "ok"]);
    assert.equal(result.states.length, 1, "the state after the failed step was still captured");
});

test("every kind of step fails cleanly when its element is missing", { timeout: 60000 }, async () => {
    const { result } = await runScript({
        steps: [
            { action: "click", selector: "#nope" },
            { action: "type", selector: "#nope", text: "x" },
            { action: "wait", selector: "#nope" },
            { action: "capture", name: "box", selector: "#nope" },
        ],
    });

    assert.deepEqual(result.steps.map((s) => s.status), ["failed", "failed", "failed", "failed"]);
    result.steps.forEach((s) => assert.ok(s.reason && s.reason.includes("#nope"), `step ${s.index} has a reason`));
    assert.equal(result.states.length, 0, "a failed capture does not count as a state");
});

test("stopOnFail skips the steps after the failure", { timeout: 60000 }, async () => {
    const { result } = await runScript(
        {
            steps: [
                { action: "click", selector: "#nope" },
                { action: "click", selector: "#open-modal" },
                { action: "capture", name: "never" },
            ],
        },
        { stopOnFail: true }
    );

    assert.deepEqual(result.steps.map((s) => s.status), ["failed", "skipped", "skipped"]);
    assert.equal(result.status, "stopped");
    assert.equal(result.states.length, 0);
});

test("an invalid selector fails the step with a reason", { timeout: 60000 }, async () => {
    const { result } = await runScript({ steps: [{ action: "click", selector: "div[[[" }] });

    assert.equal(result.steps[0].status, "failed");
    assert.ok(result.steps[0].reason.includes("Invalid selector"), result.steps[0].reason);
});

test("a step with a missing field, a missing action or an unknown action fails with a reason", { timeout: 60000 }, async () => {
    const { result } = await runScript({
        steps: [
            { action: "click" },
            { action: "type", selector: "#name" },
            { action: "wait" },
            { selector: "#name" },
            { action: "teleport", selector: "#name" },
            "not a step",
        ],
    });

    const reasons = result.steps.map((s) => s.reason);
    assert.ok(reasons[0].includes('no "selector"'));
    assert.ok(reasons[1].includes('no "text"'));
    assert.ok(reasons[2].includes('"ms"'));
    assert.ok(reasons[3].includes('no "action"'));
    assert.ok(reasons[4].includes('Unknown action "teleport"'));
    assert.ok(reasons[5].includes('no "action"'));
    assert.ok(result.steps.every((s) => s.status === "failed"));
});

test("typing into a sensitive field (mobile number) is refused with a reason", { timeout: 60000 }, async () => {
    const { result } = await runScript({
        steps: [
            { action: "type", selector: "#phone", text: "9876543210" },
            { action: "type", selector: "#name", text: "Test User" },
        ],
    });

    assert.equal(result.steps[0].status, "failed");
    assert.ok(result.steps[0].reason.includes("sensitive field"));
    assert.equal(result.steps[1].status, "ok", "an ordinary field is still typed into");
});

test("a click that leaves the page is undone and a warning is logged", { timeout: 60000 }, async () => {
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const page = await context.newPage();
    await page.goto(site.url);

    const result = await runStateScript(page, {
        steps: [
            { action: "click", selector: "#leave" },
            { action: "capture", name: "back on the page" },
        ],
    }, { config: FAST, outDir: tmpDir, filePrefix: `leave-${Date.now()}` });

    assert.ok(
        (result.warnings || []).some((w) => w.includes("navigated away") || w.includes("leaves the page") || w.includes("navigated")),
        "should log a warning when navigating away"
    );
    assert.equal(new URL(page.url()).pathname, "/", "the page is back on the start URL");
    assert.equal(result.states.length, 1);
    await context.close();
});

test("a wait step that is too long is cut to the limit, with a warning", { timeout: 60000 }, async () => {
    const { result } = await runScript(
        { steps: [{ action: "wait", ms: 99999 }] },
        { config: { ...FAST, maxWaitMs: 200 } }
    );

    assert.equal(result.steps[0].status, "ok");
    assert.ok(result.warnings.some((w) => w.includes("above the limit")));
    assert.ok(result.durationMs < 5000);
});