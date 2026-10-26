// Story:      As the engine, I want screenshots to be stable between runs.
// Criterion 2: Given animated or volatile elements, when masked,
//              then they do not trigger differences.

const test = require("node:test");
const assert = require("node:assert/strict");

const { stabilizePage, compareImages } = require("../../screenshotStabilizer");
const config = require("../../stabilizer.config");
const { launchBrowser } = require("../fixture");
const { volatileHtml, openHtml } = require("../stabilizerFixtures");

let browser;

test.before(async () => {
    browser = await launchBrowser();
});

test.after(async () => {
    if (browser) await browser.close();
});

// scan N of the volatile fixture (seed = which visit it is)
async function scan(seed, stabilizeOptions) {
    const { page, context } = await openHtml(browser, volatileHtml(seed));
    await page.waitForTimeout(seed * 90); // different moment for each scan
    const info = await stabilizePage(page, stabilizeOptions);
    const png = await page.screenshot({ fullPage: true });
    await context.close();
    return { png, info };
}

const NO_MASK = { maskSelectors: [] };
const MASKED = { maskSelectors: ["#ad", "#clock"] };

test("control: without masking, volatile elements DO trigger differences", { timeout: 60000 }, async () => {
    const a = await scan(1, NO_MASK);
    const b = await scan(2, NO_MASK);

    const result = await compareImages(a.png, b.png);

    assert.equal(result.passed, false);
    assert.ok(result.ratio > config.threshold, `expected a large difference, got ${result.percent}%`);
});

test("Test: masked volatile elements do not trigger differences", { timeout: 60000 }, async () => {
    const a = await scan(1, MASKED);
    const b = await scan(2, MASKED);

    assert.equal(a.info.masked, 2, "both volatile elements should be masked");

    const result = await compareImages(a.png, b.png);

    assert.ok(
        result.ratio <= config.threshold,
        `${result.percent}% of pixels differ, the allowed threshold is ${config.threshold * 100}%`
    );
    assert.equal(result.passed, true);
});

test("masking keeps the page layout: nothing moves", { timeout: 60000 }, async () => {
    const { page, context } = await openHtml(browser, volatileHtml(1));

    const boxes = () =>
        page.evaluate(() =>
            ["ad", "clock", "spin"].map((id) => {
                const r = document.getElementById(id).getBoundingClientRect();
                return [id, Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
            })
        );

    const before = await boxes();
    await stabilizePage(page, MASKED);
    const after = await boxes();

    assert.deepEqual(after, before);
    await context.close();
});

test("hide mode (custom stylesheet) also removes the differences", { timeout: 60000 }, async () => {
    const options = { maskMode: "hide", maskSelectors: ["#ad", "#clock"] };
    const a = await scan(1, options);
    const b = await scan(2, options);

    const result = await compareImages(a.png, b.png);
    assert.equal(result.passed, true, `${result.percent}% of pixels differ`);
});