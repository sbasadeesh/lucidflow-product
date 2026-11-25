// Proves the disabled legacy writers do not read a page or create files.
// Uses a synthetic page object and a temporary directory. No browser and no customer content.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { captureDom, captureState } = require("../../DOMcapture");

function throwingPage() {
    const fail = () => {
        throw new Error("page read");
    };
    return { url: fail, evaluate: fail, viewportSize: fail };
}

test("captureDom returns disabled and does not read the page or write a file", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "e2-02-disabled-"));
    const before = fs.readdirSync(dir);
    const dom = await captureDom(throwingPage(), { dir, baseName: "must-not-write" });
    assert.equal(dom.saved, false);
    assert.equal(dom.reason, "disabled");
    assert.equal(dom.file, null);
    assert.equal(dom.path, null);
    assert.equal(dom.pageUrl, null);
    assert.deepEqual(fs.readdirSync(dir), before);
    fs.rmSync(dir, { recursive: true, force: true });
});

test("captureState returns disabled and does not read the page or write a file", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "e2-02-disabled-"));
    const before = fs.readdirSync(dir);
    const state = await captureState(throwingPage(), {
        name: "must-not-write",
        index: 1,
        dir,
        filePrefix: "scan-test",
        selectors: ["#content"],
    });
    assert.equal(state.url, null);
    assert.equal(state.dom.saved, false);
    assert.equal(state.dom.reason, "disabled");
    assert.equal(state.styles.saved, false);
    assert.equal(state.styles.reason, "disabled");
    assert.equal(state.styles.file, null);
    assert.deepEqual(fs.readdirSync(dir), before);
    fs.rmSync(dir, { recursive: true, force: true });
});
