// Excel row 10: "Test: element crop saved for a selector"
// Acceptance:   Given a finding with a selector, when evidence runs,
//               then an element crop is saved.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const { captureSelectorCrop } = require("../../screenshotModule");
const { launchBrowser, openFixture, makeTmpDir, removeDir } = require("../fixture");

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

test("Test: element crop saved for a selector", async () => {
    const { page, context } = await openFixture(browser);
    const out = path.join(tmpDir, "crop.png");
    const logs = [];

    const saved = await captureSelectorCrop(page, "#title", out, (m) => logs.push(m));

    assert.equal(saved, true, "capture should report success");
    assert.ok(fs.existsSync(out), "the crop file should exist");

    // the crop is exactly the element (the #title box is 300 x 80), not the whole page
    const meta = await sharp(out).metadata();
    assert.equal(meta.width, 300);
    assert.equal(meta.height, 80);

    assert.ok(logs.some((l) => /Element crop saved/.test(l)), "the log should say the crop was saved");

    await context.close();
});

test("element crop: nothing is saved when the selector matches nothing", async () => {
    const { page, context } = await openFixture(browser);
    const out = path.join(tmpDir, "missing.png");
    const logs = [];

    const saved = await captureSelectorCrop(page, "#does-not-exist", out, (m) => logs.push(m));

    assert.equal(saved, false);
    assert.equal(fs.existsSync(out), false);
    assert.ok(logs.some((l) => /not found or not visible/.test(l)));

    await context.close();
});

test("element crop: body, html and empty selectors are skipped (the full page covers them)", async () => {
    const { page, context } = await openFixture(browser);

    for (const sel of ["body", "HTML", "", undefined]) {
        const out = path.join(tmpDir, `skip-${String(sel)}.png`);
        assert.equal(await captureSelectorCrop(page, sel, out), false);
        assert.equal(fs.existsSync(out), false);
    }

    await context.close();
});