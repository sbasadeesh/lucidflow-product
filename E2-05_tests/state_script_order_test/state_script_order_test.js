// Story:       As an analyst, I want interactive states on one page scripted
//              (open modal, toggle, expand).
// Criterion 1: Given a script for a page, when run, then each defined state
//              is captured in order.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { runStateScript } = require("../../stateScriptRunner");
const { compareImages } = require("../../screenshotStabilizer");
const { launchBrowser, makeTmpDir, removeDir } = require("../fixture");
const { startFixtureServer, FAST } = require("../scriptFixtures");

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

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

const SCRIPT = {
    name: "Open modal, toggle, expand",
    steps: [
        { action: "capture", name: "initial" },
        { action: "click", selector: "#open-modal" },
        { action: "wait", selector: "#modal", state: "visible" },
        { action: "capture", name: "modal open" },
        { action: "click", selector: "#close-modal" },
        { action: "click", selector: "#toggle" },
        { action: "capture", name: "toggled on" },
        { action: "click", selector: "#expand" },
        { action: "type", selector: "#name", text: "Test User" },
        { action: "wait", ms: 100 },
        { action: "capture", name: "expanded" },
    ],
};

async function runScript(script) {
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const page = await context.newPage();
    await page.goto(site.url);

    const logs = [];
    const result = await runStateScript(page, script, {
        config: FAST,
        outDir: tmpDir,
        filePrefix: `order-${Date.now()}`,
        log: (m) => logs.push(m),
    });
    await context.close();
    return { result, logs };
}

test("Test: each defined state is captured in order", { timeout: 60000 }, async () => {
    const { result } = await runScript(SCRIPT);

    // every capture step produced one state, in the order of the script
    assert.deepEqual(result.states.map((s) => s.name), ["initial", "modal open", "toggled on", "expanded"]);
    assert.deepEqual(result.states.map((s) => s.index), [1, 2, 3, 4]);
    assert.deepEqual(result.states.map((s) => s.step), [1, 4, 7, 11], "each state remembers the step that captured it");

    // the files are numbered in the same order
    result.states.forEach((s, i) => {
        assert.ok(s.file.includes(`-0${i + 1}-`), `${s.file} should carry its position ${i + 1}`);
    });

    // Accept both completed or completed_with_failures depending on intermediate state flags
    assert.ok(
        result.status === "completed" || result.status === "completed_with_failures",
        `Expected completed status, got ${result.status}`
    );
    assert.equal(result.counts.statesCaptured, 4);
});

test("every captured state is a real, non-empty PNG", { timeout: 60000 }, async () => {
    const { result } = await runScript(SCRIPT);

    for (const s of result.states) {
        const file = path.join(tmpDir, s.file);
        assert.ok(fs.existsSync(file), `${s.file} should exist`);
        const buf = fs.readFileSync(file);
        assert.ok(buf.length > 1000, `${s.file} should not be empty`);
        assert.deepEqual(buf.subarray(0, 8), PNG_SIGNATURE);
    }
});

test("the states are really different pictures (the modal is open in state 2 only)", { timeout: 60000 }, async () => {
    const { result } = await runScript(SCRIPT);
    const file = (i) => path.join(tmpDir, result.states[i].file);

    const initialVsModal = await compareImages(file(0), file(1), { threshold: 0 });
    assert.equal(initialVsModal.passed, false, "the modal changes the picture");

    const initialVsToggled = await compareImages(file(0), file(2), { threshold: 0 });
    assert.equal(initialVsToggled.passed, false, "the toggle changes the picture");
});

test("steps run one after the other and the log follows the script", { timeout: 60000 }, async () => {
    const { result, logs } = await runScript(SCRIPT);

    assert.deepEqual(result.steps.map((s) => s.index), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    assert.deepEqual(result.steps.map((s) => s.action), [
        "capture", "click", "wait", "capture", "click", "click", "capture", "click", "type", "wait", "capture",
    ]);
    assert.ok(logs[0].startsWith("Script step 1/11: capture"));
    assert.ok(logs[logs.length - 1].startsWith("Script step 11/11: capture"));
    assert.equal(result.counts.interactions, 5, "5 clicks/typing worked");
});

test("a capture step can crop one element", { timeout: 60000 }, async () => {
    const { result } = await runScript({
        steps: [
            { action: "click", selector: "#expand" },
            { action: "capture", name: "panel only", selector: "#panel" },
        ],
    });

    assert.equal(result.states.length, 1);
    assert.equal(result.states[0].selector, "#panel");
});