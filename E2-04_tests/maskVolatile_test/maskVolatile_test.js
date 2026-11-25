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
const MASKED = { maskSelectors: ["#ad", "#promo-text"] };

test("control: without masking, volatile elements DO trigger differences", { timeout: 180000 }, async () => {
    const a = await scan(1, NO_MASK);
    const b = await scan(2, NO_MASK);

    const result = await compareImages(a.png, b.png);

    assert.equal(result.passed, false);
    assert.ok(result.ratio > config.threshold, `expected a large difference, got ${result.percent}%`);
});

test("Test: masked volatile elements do not trigger differences", { timeout: 180000 }, async () => {
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

test("masking keeps the page layout: nothing moves", { timeout: 180000 }, async () => {
    const { page, context } = await openHtml(browser, volatileHtml(1));

    // offsetLeft / offsetTop / offsetWidth / offsetHeight are the layout position:
    // unlike getBoundingClientRect they ignore a rotation (the "spin" box rotates)
    const boxes = () =>
        page.evaluate(() =>
            ["ad", "promo-text", "spin"].map((id) => {
                const el = document.getElementById(id);
                return [id, el.offsetLeft, el.offsetTop, el.offsetWidth, el.offsetHeight];
            })
        );

    const before = await boxes();
    await stabilizePage(page, MASKED);
    const after = await boxes();

    assert.deepEqual(after, before);
    await context.close();
});

test("hide mode (custom stylesheet) also removes the differences", { timeout: 180000 }, async () => {
    const options = { maskMode: "hide", maskSelectors: ["#ad", "#promo-text"] };
    const a = await scan(1, options);
    const b = await scan(2, options);

    const result = await compareImages(a.png, b.png);
    assert.equal(result.passed, true, `${result.percent}% of pixels differ`);
});