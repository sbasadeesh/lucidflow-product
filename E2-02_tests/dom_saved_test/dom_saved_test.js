// E2-02 criterion 1
// Given a rendered page, when capture runs, then the DOM is saved with a timestamp.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const capture = require("../../capture");            // E2-01: renders the page
const { captureDom } = require("../../DOMcapture");
const { startFixtureServer, expected } = require("../fixture");

let site;
let rendered;
let dir;

test.before(async () => {
    site = await startFixtureServer();
    rendered = await capture.render(site.url);
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "e2-02-"));
});

test.after(async () => {
    if (rendered) await rendered.close();
    if (site) await site.close();
});

test("Given a rendered page, when capture runs, then the DOM is saved with a timestamp", { timeout: 60000 }, async () => {
    // a wrong fixture file is the most likely reason for a failure here, so check it first
    assert.ok(expected.textAfterJavaScript && expected.lateSelector, "E2-02_tests/fixture.js is not the E2-02 fixture (it has no textAfterJavaScript or lateSelector)");
    assert.ok(site.url.endsWith(expected.file), `the fixture url should end with ${expected.file}, it is ${site.url}`);

    const before = Date.now();
    const dom = await captureDom(rendered.page, { dir, baseName: "dom-test" });
    const after = Date.now();

    // the DOM is saved
    assert.equal(dom.saved, true, dom.reason);
    assert.ok(fs.existsSync(dom.path), "the file exists");
    const saved = fs.readFileSync(dom.path, "utf8");
    assert.ok(
        saved.includes(`>${expected.textAfterJavaScript}<`),
        `it is the page after JavaScript ran. Page url: ${dom.pageUrl}. The first 300 characters of the saved DOM: ${saved.slice(0, 300)}`
    );

    // with a timestamp: a real date, taken during the capture, in the result and on the first line of the file
    assert.ok(!Number.isNaN(Date.parse(dom.timestamp)), "the timestamp is a date");
    assert.ok(dom.capturedAtMs >= before && dom.capturedAtMs <= after, "the timestamp is the time of the capture");
    assert.ok(saved.startsWith(`<!-- DOM snapshot | captured at ${dom.timestamp}`), "the timestamp is saved in the file");
});