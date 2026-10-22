// Excel row 11: "Test: lazy-loaded fixture content appears in the image"
// Acceptance:   Given lazy-loaded content, when scrolled first,
//               then it appears in the image.

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const sharp = require("sharp");

const { scrollToLoadContent, takeFullPage } = require("../../screenshotModule");
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

// colour of one pixel of a PNG
async function pixelAt(file, x, y) {
    const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
    const i = (y * info.width + x) * info.channels;
    return [data[i], data[i + 1], data[i + 2]];
}

test("Test: lazy-loaded fixture content appears in the image", { timeout: 120000 }, async () => {
    const { page, context } = await openFixture(browser);
    const out = path.join(tmpDir, "lazy.png");

    // before scrolling, the lazy block is still grey (not loaded yet)
    const before = await page.evaluate(() => getComputedStyle(document.getElementById("lazy")).backgroundColor);
    assert.equal(before, "rgb(200, 200, 200)", "the lazy block should start unloaded (grey)");

    // scroll first, then capture
    await scrollToLoadContent(page);
    await takeFullPage(page, out);

    // where the lazy block sits on the page
    const box = await page.evaluate(() => {
        const r = document.getElementById("lazy").getBoundingClientRect();
        return { x: r.x, y: r.y + window.scrollY, w: r.width, h: r.height };
    });

    // its centre in the saved image must be RED (loaded), not grey
    const [r, g, b] = await pixelAt(out, Math.round(box.x + box.w / 2), Math.round(box.y + box.h / 2));
    assert.ok(
        r > 200 && g < 60 && b < 60,
        `the lazy block should be red (loaded) in the image, got rgb(${r}, ${g}, ${b})`
    );

    await context.close();
});