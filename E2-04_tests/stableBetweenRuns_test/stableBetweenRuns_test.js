// Story:      As the engine, I want screenshots to be stable between runs.
// Criterion 1: Given two scans of the same fixture, when compared,
//              then differences are below [threshold].

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { stabilizePage, compareImages } = require("../../screenshotStabilizer");
const config = require("../../stabilizer.config");
const { launchBrowser, makeTmpDir, removeDir } = require("../fixture");
const { animatedHtml, openHtml } = require("../stabilizerFixtures");

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

// one "scan" = open the fixture in a fresh browser context, stabilize, screenshot
async function scan(html, delayMs = 0) {
    const { page, context } = await openHtml(browser, html);
    if (delayMs) await page.waitForTimeout(delayMs); // lands the animations in a different phase
    await stabilizePage(page);
    const png = await page.screenshot({ fullPage: true });
    await context.close();
    return png;
}

test("Test: two scans of the same fixture differ by less than the threshold", { timeout: 60000 }, async () => {
    const first = await scan(animatedHtml());
    const second = await scan(animatedHtml(), 537); // second scan starts at a different animation moment

    const result = await compareImages(first, second);

    assert.equal(result.sizeMismatch, false, "both scans should have the same size");
    assert.equal(result.threshold, config.threshold, "the threshold comes from the config file");
    assert.ok(
        result.ratio <= config.threshold,
        `${result.percent}% of pixels differ, the allowed threshold is ${config.threshold * 100}%`
    );
    assert.equal(result.passed, true);
});

test("a real change between two scans is above the threshold (the comparison is not trivially passing)", { timeout: 60000 }, async () => {
    const before = await scan(animatedHtml());
    const after = await scan(animatedHtml({ extraBlock: true })); // a 500x300 block appears

    const diffPath = path.join(tmpDir, "diff.png");
    const result = await compareImages(before, after, { diffPath });

    assert.equal(result.passed, false);
    assert.ok(
        result.sizeMismatch || result.ratio > config.threshold,
        "the added block should be reported as a difference"
    );
});