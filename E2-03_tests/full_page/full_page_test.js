// Excel row 9:  "Test: full-page PNG saved and not empty"
// Acceptance:   Given a page, when capture runs, then a full-page PNG is saved.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const { scrollToLoadContent, takeFullPage } = require("../../screenshotModule");
const { VIEWPORT, launchBrowser, openFixture, makeTmpDir, removeDir } = require("../fixture");

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

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

test("Test: full-page PNG saved and not empty", { timeout: 120000 }, async () => {
    const { page, context } = await openFixture(browser);
    const out = path.join(tmpDir, "full.png");

    await scrollToLoadContent(page);
    await takeFullPage(page, out);

    // saved
    assert.ok(fs.existsSync(out), "the PNG file should exist");

    // not empty, and really a PNG
    const buf = fs.readFileSync(out);
    assert.ok(buf.length > 1000, "the PNG file should not be empty");
    assert.deepEqual(buf.subarray(0, 8), PNG_SIGNATURE, "the file should start with the PNG signature");

    // full page: full width and as tall as the whole scrollable page
    const meta = await sharp(out).metadata();
    const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    assert.equal(meta.width, VIEWPORT.width);
    assert.ok(
        meta.height >= pageHeight,
        `image height ${meta.height} should cover the whole page height ${pageHeight}`
    );

    await context.close();
});