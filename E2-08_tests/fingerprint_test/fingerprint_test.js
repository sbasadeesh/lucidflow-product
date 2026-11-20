const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");
const { getStateFingerprint, checkForCollision } = require("../../stateFingerprinter/stateFingerprinter");
const { runStateScript } = require("../../script_runner/stateScriptRunner");

let browser, server, baseUrl, tmpDir;

test.before(async () => {
    // 1. Create a temporary directory for screenshots (e.g., C:\Users\...\AppData\Local\Temp\e2-08-xyz)
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "e2-08-tests-"));

    browser = await chromium.launch({ headless: true });
    server = http.createServer((req, res) => {
        res.setHeader("Content-Type", "text/html");
        if (req.url === "/static") {
            res.end("<html><body><h1>Static Page</h1><div id='target'>Does not change</div></body></html>");
        } else if (req.url === "/timer") {
            res.end("<html><body><h1>Ends in 05:00</h1><div id='target'>Countdown</div></body></html>");
        } else {
            res.end("OK");
        }
    });
    await new Promise(r => server.listen(0, "127.0.0.1", r));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
    if (browser) await browser.close();
    if (server) server.close();
    // 2. Delete the temporary directory and all screenshots inside it
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
});

// AC1: Duplicate states merge
test("AC1: duplicate DOM states merge without losing action order", { timeout: 60000 }, async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${baseUrl}/static`);

    const script = {
        maxStates: 5,
        steps: [
            { action: "capture", name: "first" },
            { action: "capture", name: "second-duplicate" },
            { action: "capture", name: "third-duplicate" }
        ]
    };

    // Save screenshots to the temp directory instead of the test folder
    const mockOptions = { outDir: tmpDir, filePrefix: "test", fileUrl: (f) => f, log: () => {} };
    const result = await runStateScript(page, script, mockOptions);

    assert.equal(result.states.length, 3);
    assert.equal(result.states[1].deduplicated, true, "Second capture should be deduplicated");
    assert.equal(result.states[2].deduplicated, true, "Third capture should be deduplicated");
    
    // Check action journal retains order
    assert.equal(result.actionJournal.length, 3);
    assert.equal(result.actionJournal[1].result, "deduplicated");

    await context.close();
});

// AC1 Exception: Timers are not deduplicated
test("AC1: time-sensitive evidence (timer) is NOT deduplicated", { timeout: 60000 }, async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${baseUrl}/timer`);

    const script = {
        maxStates: 5,
        steps: [
            { action: "capture", name: "first" },
            { action: "capture", name: "second-timer" }
        ]
    };

    const mockOptions = { outDir: tmpDir, filePrefix: "test", fileUrl: (f) => f, log: () => {} };
    const result = await runStateScript(page, script, mockOptions);

    assert.equal(result.states.length, 2);
    assert.equal(result.states[1].deduplicated, undefined, "Should not deduplicate if timer is present");

    await context.close();
});

// AC2: Hash Collisions
test("AC2: detects hash collisions when text changes", () => {
    const prev = { hash: "abc123", hasOverlay: false, rawText: "Hello World" };
    const curr = { hash: "abc123", hasOverlay: false, rawText: "Hello World Modified" }; 
    
    const reason = checkForCollision(prev, curr);
    assert.equal(reason, "STATE_FINGERPRINT_COLLISION");
});

test("AC2: detects overlay family changes", () => {
    const prev = { hash: "abc123", hasOverlay: false, rawText: "Same text" };
    const curr = { hash: "abc123", hasOverlay: true, rawText: "Same text" };
    
    const reason = checkForCollision(prev, curr);
    assert.equal(reason, "STATE_OVERLAY_CHANGED");
});

// AC3: Repeatability
test("AC3: repeated execution produces the same action journal", { timeout: 60000 }, async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${baseUrl}/static`);

    const script = {
        steps: [{ action: "capture", name: "test" }]
    };

    const mockOptions = { outDir: tmpDir, filePrefix: "test", fileUrl: (f) => f, log: () => {} };
    
    const run1 = await runStateScript(page, script, mockOptions);
    const run2 = await runStateScript(page, script, mockOptions);

    const cleanJournal = (j) => j.map(e => ({ ...e, timestamp: undefined }));
    assert.deepEqual(cleanJournal(run1.actionJournal), cleanJournal(run2.actionJournal));

    await context.close();
});