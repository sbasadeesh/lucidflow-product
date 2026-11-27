// Fingerprint + existing runner, local integration - PROPOSED RECOVERY CONTRACT (PR #39).
// The runner is main's stateScriptRunner.js; it is not changed to de-duplicate or drop screenshots.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { getStateFingerprint } = require("../../stateFingerprinter/stateFingerprinter");
const { runStateScript } = require("../../stateScriptRunner");
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
<h1 id="h">Before click</h1>
<button id="b" onclick="document.getElementById('h').textContent='After click'">Go</button>`;

test("a click step run by the existing runner changes the fingerprint", { timeout: 60000 }, async () => {
    const { page, context } = await openHtml(browser, PAGE);
    try {
        const before = await getStateFingerprint(page);
        const result = await runStateScript(page, { steps: [{ action: "click", selector: "#b" }] }, { outDir: tmpDir, filePrefix: "click", log: () => { } });
        const after = await getStateFingerprint(page);
        assert.equal(result.steps[0].status, "ok");
        assert.equal(await page.textContent("#h"), "After click");
        assert.notEqual(before.hash, after.hash);
    } finally {
        await context.close();
    }
});

test("identical consecutive captures are both kept (no de-duplication or screenshot suppression)", { timeout: 60000 }, async () => {
    const { page, context } = await openHtml(browser, PAGE);
    try {
        const first = await getStateFingerprint(page);
        const result = await runStateScript(
            page,
            { steps: [{ action: "capture", name: "one" }, { action: "capture", name: "two" }] },
            { outDir: tmpDir, filePrefix: "dup", log: () => { } }
        );
        const second = await getStateFingerprint(page);
        assert.equal(first.hash, second.hash, "the page state really is identical");
        assert.equal(result.states.length, 2);
        for (const s of result.states) {
            assert.ok(s.file, "every state keeps its screenshot file name");
            assert.ok(fs.existsSync(path.join(tmpDir, s.file)), `${s.file} exists`);
            assert.ok(!("deduplicated" in s));
        }
    } finally {
        await context.close();
    }
});
