// Extra unit tests for the stabilizer pieces (not a story criterion).

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const {
    stabilizePage,
    installDeterministicEnvironment,
    compareImages,
    cleanSelectors,
} = require("../../screenshotStabilizer");
const config = require("../../stabilizer.config");
const { launchBrowser, makeTmpDir, removeDir, VIEWPORT } = require("../fixture");
const { animatedHtml, volatileHtml, openHtml } = require("../stabilizerFixtures");

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

// a white image with one black block painted at the top-left
async function image(width, height, blockPixels, shade = 0) {
    const data = Buffer.alloc(width * height * 3, 255);
    for (let p = 0; p < blockPixels; p++) {
        data[p * 3] = data[p * 3 + 1] = data[p * 3 + 2] = shade;
    }
    return sharp(data, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

// ---- compareImages ------------------------------------------------------

test("identical images: 0 pixels differ and the comparison passes", async () => {
    const a = await image(100, 100, 0);
    const result = await compareImages(a, a);
    assert.equal(result.differentPixels, 0);
    assert.equal(result.passed, true);
});

test("boundary: exactly at the threshold passes, one pixel more fails", async () => {
    const base = await image(100, 100, 0); // 10 000 pixels
    const atLimit = await image(100, 100, 100); // 100 px = 1.00%
    const overLimit = await image(100, 100, 101); // 101 px = 1.01%

    const at = await compareImages(base, atLimit, { threshold: 0.01 });
    const over = await compareImages(base, overLimit, { threshold: 0.01 });

    assert.equal(at.differentPixels, 100);
    assert.equal(at.passed, true);
    assert.equal(over.differentPixels, 101);
    assert.equal(over.passed, false);
});

test("the default threshold comes from the config file", async () => {
    const a = await image(50, 50, 0);
    const result = await compareImages(a, a);
    assert.equal(result.threshold, config.threshold);
    assert.equal(result.pixelTolerance, config.pixelTolerance);
});

test("tiny colour noise (inside the pixel tolerance) is ignored, a bigger shift is counted", async () => {
    const white = await image(100, 100, 0);
    const noise = await image(100, 100, 10000, 255 - config.pixelTolerance); // shift = tolerance -> ignored
    const shift = await image(100, 100, 10000, 255 - config.pixelTolerance - 1); // shift = tolerance + 1 -> counted

    assert.equal((await compareImages(white, noise)).differentPixels, 0);
    assert.equal((await compareImages(white, shift)).differentPixels, 10000);
});

test("images of different sizes never pass", async () => {
    const a = await image(100, 100, 0);
    const b = await image(100, 120, 0);
    const result = await compareImages(a, b);
    assert.equal(result.sizeMismatch, true);
    assert.equal(result.passed, false);
});

test("a diff image is written and marks the changed pixels in red", async () => {
    const a = await image(100, 100, 0);
    const b = await image(100, 100, 500); // first 500 pixels turn black
    const diffPath = path.join(tmpDir, "diff-check.png");

    const result = await compareImages(a, b, { diffPath });

    assert.equal(result.diffPath, diffPath);
    assert.ok(fs.existsSync(diffPath));
    const { data, info } = await sharp(diffPath).raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.width, 100);
    assert.deepEqual([data[0], data[1], data[2]], [255, 0, 0], "a changed pixel is red");
    const last = (99 * 100 + 99) * info.channels;
    assert.notDeepEqual([data[last], data[last + 1], data[last + 2]], [255, 0, 0], "an unchanged pixel is not red");
});

// ---- stabilizePage ------------------------------------------------------

test("animations are disabled: running animations before, none after", { timeout: 60000 }, async () => {
    const { page, context } = await openHtml(browser, animatedHtml());

    const running = () => page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length);
    assert.ok((await running()) > 0, "the fixture should have running animations");

    await stabilizePage(page);

    assert.equal(await running(), 0);
    await context.close();
});

test("calling stabilizePage twice does not stack stylesheets or masks", { timeout: 60000 }, async () => {
    const { page, context } = await openHtml(browser, volatileHtml(1));
    const options = { maskSelectors: ["#ad", "#clock"] };

    await stabilizePage(page, options);
    await stabilizePage(page, options);

    const counts = await page.evaluate(() => ({
        styles: document.querySelectorAll("#__stabilizer_style__").length,
        masks: document.querySelectorAll(".__stabilizer_mask__").length,
    }));
    assert.equal(counts.styles, 1);
    assert.equal(counts.masks, 2);
    await context.close();
});

test("unsafe or empty selectors are ignored", () => {
    assert.deepEqual(cleanSelectors(["#ok", "", "  ", "a{color:red}", "<b>", 42, "#ok", ".also-ok"]), ["#ok", ".also-ok"]);
    assert.deepEqual(cleanSelectors(undefined), []);
});

test("a selector that matches nothing masks nothing and does not throw", { timeout: 60000 }, async () => {
    const { page, context } = await openHtml(browser, volatileHtml(1));
    const info = await stabilizePage(page, { maskSelectors: ["#nothing-here"] });
    assert.equal(info.masked, 0);
    await context.close();
});

// ---- fixed time and random numbers --------------------------------------

test("deterministic mode: same date and same random numbers in every run", { timeout: 60000 }, async () => {
    async function sample() {
        const context = await browser.newContext({ viewport: VIEWPORT });
        await installDeterministicEnvironment(context);
        const page = await context.newPage();
        await page.setContent("<html><body>x</body></html>");
        const out = await page.evaluate(() => ({
            now: Date.now(),
            iso: new Date().toISOString(),
            random: [Math.random(), Math.random(), Math.random()],
        }));
        await context.close();
        return out;
    }

    const first = await sample();
    await new Promise((r) => setTimeout(r, 50));
    const second = await sample();

    assert.deepEqual(first, second);
    assert.equal(first.iso, new Date(config.fixedTime).toISOString());
});