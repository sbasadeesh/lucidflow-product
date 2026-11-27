// Action journal - PROPOSED RECOVERY CONTRACT (PR #39), not a recovered E2-08 specification.
// See docs/state-fingerprint-and-action-journal.md.
const test = require("node:test");
const assert = require("node:assert/strict");
const { buildActionJournal } = require("../../../actionJournal/actionJournal");
const { runStateScript } = require("../../../stateScriptRunner");
const { launchBrowser, openHtml, makeTmpDir, removeDir } = require("../fixture");

let browser;
let tmpDir;
test.before(async () => {
    browser = await launchBrowser();
    tmpDir = makeTmpDir();
});
test.after(async () => {
    if (browser) await browser.close();
    removeDir(tmpDir);
});

const PAGE = `
<h1 id="h">Start</h1>
<button id="open" onclick="document.getElementById('h').textContent='Opened'">Open</button>
<label for="name">Your name</label><input id="name">
<label for="phone">Mobile number</label><input id="phone" type="tel">`;

const SCRIPT = {
    steps: [
        { action: "click", selector: "#open" },
        { action: "type", selector: "#name", text: "Test User" },
        { action: "type", selector: "#phone", text: "9999999999" },
        { action: "teleport", selector: "#secret-target" },
        { action: "click", selector: "#missing-button", timeout: 300 },
        { action: "capture", name: "after steps" },
    ],
};

async function runOnFreshPage(script, extra = {}) {
    const { page, context } = await openHtml(browser, PAGE);
    try {
        const result = await runStateScript(page, script, { outDir: tmpDir, filePrefix: `j${Date.now()}`, log: () => { }, ...extra });
        const heading = await page.textContent("#h");
        return { result, heading };
    } finally {
        await context.close();
    }
}

test("the journal is an ordered record of attempted steps with safe reason codes", { timeout: 90000 }, async () => {
    const { result, heading } = await runOnFreshPage(SCRIPT);
    assert.equal(heading, "Opened", "the click step really ran through the existing runner");

    const journal = buildActionJournal(result);
    assert.deepEqual(journal, [
        { index: 1, action: "click", outcome: "ok", reason: null },
        { index: 2, action: "type", outcome: "ok", reason: null },
        { index: 3, action: "type", outcome: "failed", reason: "SENSITIVE_FIELD_REFUSED" },
        { index: 4, action: null, outcome: "failed", reason: "UNKNOWN_ACTION" },
        { index: 5, action: "click", outcome: "failed", reason: "ELEMENT_NOT_FOUND" },
        { index: 6, action: "capture", outcome: "ok", reason: null },
    ]);
});

test("unknown actions keep the runner's failure behaviour", { timeout: 60000 }, async () => {
    const { result } = await runOnFreshPage({ steps: [{ action: "teleport" }, { action: "capture", name: "x" }] });
    assert.equal(result.status, "completed_with_failures");
    assert.equal(result.steps[0].status, "failed");
    assert.match(result.steps[0].reason, /Unknown action/);
    assert.deepEqual(buildActionJournal(result)[0], { index: 1, action: null, outcome: "failed", reason: "UNKNOWN_ACTION" });
});

test("the journal never contains typed values, selectors, unknown action names or raw error text", { timeout: 90000 }, async () => {
    const { result } = await runOnFreshPage(SCRIPT);
    const json = JSON.stringify(buildActionJournal(result));
    for (const leak of ["Test User", "9999999999", "teleport", "#secret-target", "#missing-button", "#phone", "Mobile", "within", "ms"]) {
        assert.ok(!json.includes(leak), `journal must not contain "${leak}"`);
    }
});

test("building the journal does not change the runner result or its public shape", { timeout: 90000 }, async () => {
    const { result } = await runOnFreshPage(SCRIPT);
    const before = JSON.parse(JSON.stringify(result));
    buildActionJournal(result);
    assert.deepEqual(JSON.parse(JSON.stringify(result)), before);
    assert.ok(!("actionJournal" in result), "no new field is added to the runner result");
});

test("a failed step is never journalled as a success", () => {
    const journal = buildActionJournal({
        steps: [
            { index: 1, action: "click", status: "failed", reason: "Click failed on #a: boom" },
            { index: 2, action: "click", status: undefined, reason: null },
            { index: 3, action: "hover", status: "weird", reason: "something" },
            { index: 4, action: "wait", status: "ok", reason: null },
        ],
    });
    assert.deepEqual(journal.map((e) => e.outcome), ["failed", "failed", "failed", "ok"]);
    assert.equal(journal[0].reason, "CLICK_FAILED");
    assert.equal(journal[1].reason, "STEP_FAILED");
    assert.equal(journal[2].reason, "STEP_FAILED");
});

test("every runner failure reason maps to a fixed code", () => {
    const reasons = {
        'The step has no "action"': "MISSING_ACTION",
        'Unknown action "x" (allowed: click, hover, type, wait, capture)': "UNKNOWN_ACTION",
        'The step has no "selector"': "MISSING_SELECTOR",
        'The step has an empty "selector"': "MISSING_SELECTOR",
        "Element not found or not visible within 3000ms: #a": "ELEMENT_NOT_FOUND",
        'Invalid selector "div[[[": bad': "INVALID_SELECTOR",
        "Click failed on #a: boom": "CLICK_FAILED",
        "Hover failed on #a: boom": "HOVER_FAILED",
        'The step has no "text"': "MISSING_TEXT",
        "Refused to type into #p: it looks like a sensitive field (phone, OTP, vehicle number, card, password...)": "SENSITIVE_FIELD_REFUSED",
        "Typing failed on #a: boom": "TYPE_FAILED",
        "Waited 500ms but #m did not become visible": "WAIT_TIMEOUT",
        'A wait step needs "ms" (a number) or a "selector"': "INVALID_WAIT",
        "Screenshot failed: boom": "SCREENSHOT_FAILED",
        "Unexpected error: boom": "UNEXPECTED_ERROR",
        "anything else": "STEP_FAILED",
    };
    const steps = Object.keys(reasons).map((reason, i) => ({ index: i + 1, action: "click", status: "failed", reason }));
    const journal = buildActionJournal({ steps });
    assert.deepEqual(journal.map((e) => e.reason), Object.values(reasons));
});

test("steps that were not attempted (skipped) are left out", { timeout: 60000 }, async () => {
    const { result } = await runOnFreshPage(
        { steps: [{ action: "click", selector: "#missing", timeout: 300 }, { action: "click", selector: "#open" }] },
        { stopOnFail: true }
    );
    assert.equal(result.steps[1].status, "skipped");
    assert.deepEqual(buildActionJournal(result), [{ index: 1, action: "click", outcome: "failed", reason: "ELEMENT_NOT_FOUND" }]);
});

test("repeated runs of the same script give the same journal", { timeout: 120000 }, async () => {
    const one = buildActionJournal((await runOnFreshPage(SCRIPT)).result);
    const two = buildActionJournal((await runOnFreshPage(SCRIPT)).result);
    assert.deepEqual(one, two);
});

test("invalid input is rejected instead of producing an empty journal", () => {
    assert.throws(() => buildActionJournal(null), TypeError);
    assert.throws(() => buildActionJournal({}), TypeError);
    assert.throws(() => buildActionJournal({ steps: "nope" }), TypeError);
});
