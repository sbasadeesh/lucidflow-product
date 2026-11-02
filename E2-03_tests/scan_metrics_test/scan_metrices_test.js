// Extra (not an Excel row): scan counts (states + interactions) and scan history.
// Acceptance: "Given a particular scan, we must be able to view the number of
//              states and interactions used by Playwright."

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const { computeScanMetrics, saveScanSummary, listScans, readScan } = require("../../screenshotModule");
const { makeTmpDir, removeDir } = require("../fixture");

const tmpDir = makeTmpDir();
test.after(() => removeDir(tmpDir));

// ---------------------------------------------------------------------------
// 5. Scan metrics (states + interactions)
// ---------------------------------------------------------------------------
test("computeScanMetrics counts states and interactions the same way for every flow", () => {
    const actions = [
        { action: 'Nav 1: "Products" - hovering' },
        { action: "Nav 1: dropdown opened with 3 link(s), URL unchanged so far" },
        { action: 'Nav 1.1: "Car" - clicking' },
        { action: "Nav 1.1: URL changed to https://example.com/car" },
        { action: 'Filled field "name" with "Test User"' },
        { action: 'Dropdown 1: clicking "Plan"' },
        { action: 'Dropdown 1: choosing option "Basic"' },
        { action: "Continue/Next clicked" },
        { action: 'JavaScript dialog dismissed: "hello"' },
    ];
    const navReport = [{ result: "URL changed" }, { result: "URL unchanged" }];

    const m = computeScanMetrics(actions, navReport);

    assert.deepEqual(m.breakdown, {
        clicks: 3,
        hovers: 1,
        fieldsFilled: 1,
        selections: 1,
        dialogsHandled: 1,
    });
    assert.equal(m.interactions, 7);
    // 1 (the page) + 1 (dropdown opened) + 1 (URL changed) + 1 (Continue)
    assert.equal(m.states, 4);
});

test("computeScanMetrics on an empty scan is one state and zero interactions", () => {
    const m = computeScanMetrics([], []);
    assert.equal(m.states, 1);
    assert.equal(m.interactions, 0);
});

test("computeScanMetrics counts the Aditya Birla style log lines too", () => {
    const actions = [
        { action: "Opened Members dropdown" },
        { action: "Selected Self (verified)" },
        { action: "Clicked OK" },
        { action: "Clicked Get free quote" },
        { action: "Entered age 30" },
        { action: "Clicked Continue" },
        { action: "Filled test email" },
    ];
    const m = computeScanMetrics(actions, []);

    assert.equal(m.interactions, 7);
    // page + Get free quote + Continue
    assert.equal(m.states, 3);
});

// ---------------------------------------------------------------------------
// 6. Scan history
// ---------------------------------------------------------------------------
test("scan summaries are saved, listed newest first, and read back by id", () => {
    const dir = path.join(tmpDir, "scans");

    saveScanSummary(dir, {
        scanId: "scan-1000",
        url: "https://a.example",
        startedAt: "2026-10-22T10:00:00.000Z",
        states: 2,
        interactions: 5,
        actionLog: [{ action: "x" }],
    });
    saveScanSummary(dir, {
        scanId: "scan-2000",
        url: "https://b.example",
        startedAt: "2026-10-22T11:00:00.000Z",
        states: 3,
        interactions: 9,
        actionLog: [{ action: "y" }],
    });

    const list = listScans(dir);
    assert.equal(list.length, 2);
    assert.equal(list[0].scanId, "scan-2000", "newest first");
    assert.equal(list[0].actionLog, undefined, "list does not include the long action log");

    const one = readScan(dir, "scan-1000");
    assert.equal(one.url, "https://a.example");
    assert.equal(one.interactions, 5);
    assert.deepEqual(one.actionLog, [{ action: "x" }]);
});

test("readScan rejects unsafe or unknown ids", () => {
    const dir = path.join(tmpDir, "scans");
    assert.equal(readScan(dir, "../secret"), null);
    assert.equal(readScan(dir, "scan-abc"), null);
    assert.equal(readScan(dir, "scan-999999"), null);
});

test("listScans on a folder that does not exist returns an empty list", () => {
    assert.deepEqual(listScans(path.join(tmpDir, "nope")), []);
});