// Full-page screenshots of pages with floating widgets, late popups and sliders.
// (Found on a real site: an accessibility button repeated on every screen of the
//  full-page image, and a popup that stayed open in it.)

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const sharp = require("sharp");

const { takeFullPage } = require("../../screenshotModule");
const { stabilizePage } = require("../../screenshotStabilizer");
const { launchBrowser, makeTmpDir, removeDir } = require("../fixture");
const { openHtml } = require("../stabilizerFixtures");

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

// number of pixels of one exact colour in a PNG
async function countColour(file, [r, g, b]) {
    const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
    let n = 0;
    for (let i = 0; i < data.length; i += info.channels) {
        if (data[i] === r && data[i + 1] === g && data[i + 2] === b) n++;
    }
    return n;
}

const FLOATING_HTML = `<!doctype html>
<html><head><style>
  body { margin: 0; height: 3200px; background: #fff; font-family: Arial; }
  #fixed   { position: fixed;    left: 10px;  top: 100px; width: 50px; height: 50px; background: rgb(255, 140, 0); }
  #tracker { position: absolute; left: 100px; top: 300px; width: 50px; height: 50px; background: rgb(0, 170, 0); }
</style></head>
<body>
  <div id="fixed"></div>
  <div id="tracker"></div>
  <script>
    // a widget that is NOT position:fixed but a script keeps it at the same screen position
    window.addEventListener("scroll", () => {
      document.getElementById("tracker").style.top = (window.scrollY + 300) + "px";
    });
  </script>
</body></html>`;

test("a fixed widget and a scroll-following widget appear once in the full-page image", { timeout: 120000 }, async () => {
    const { page, context } = await openHtml(browser, FLOATING_HTML);
    const out = path.join(tmpDir, "floating.png");

    await takeFullPage(page, out);

    const orange = await countColour(out, [255, 140, 0]);
    const green = await countColour(out, [0, 170, 0]);

    // each widget is 50 x 50 = 2500 pixels. Four screens would give ~10 000.
    assert.ok(orange >= 2400 && orange <= 2600, `fixed widget should appear once, found ${orange} pixels`);
    assert.ok(green >= 2400 && green <= 2600, `scroll-following widget should appear once, found ${green} pixels`);

    // and the widgets are visible again afterwards
    const visible = await page.evaluate(() => getComputedStyle(document.getElementById("fixed")).visibility);
    assert.equal(visible, "visible");

    await context.close();
});

const POPUP_HTML = `<!doctype html>
<html><head><style>
  body { margin: 0; height: 3200px; background: #fff; }
  #popup { position: fixed; inset: 0; background: rgb(255, 0, 0); z-index: 1000; }
</style></head>
<body>
  <script>
    // a popup that only shows up once the visitor has scrolled a little
    window.addEventListener("scroll", () => {
      if (window.scrollY > 100 && !document.getElementById("popup") && !window.__closed) {
        const p = document.createElement("div");
        p.id = "popup";
        document.body.appendChild(p);
      }
    });
  </script>
</body></html>`;

test("a popup that appears while scrolling is closed before each screen is captured", { timeout: 120000 }, async () => {
    const { page, context } = await openHtml(browser, POPUP_HTML);
    const out = path.join(tmpDir, "popup.png");
    let calls = 0;

    await takeFullPage(page, out, () => { }, {
        beforeTile: async () => {
            calls++;
            await page.evaluate(() => {
                window.__closed = true;
                const p = document.getElementById("popup");
                if (p) p.remove();
            });
        },
    });

    assert.ok(calls >= 2, "the hook runs before every screen");
    assert.equal(await countColour(out, [255, 0, 0]), 0, "no popup pixels in the image");

    await context.close();
});

const SLIDER_HTML = `<!doctype html>
<html><body>
  <div id="slide">slide 1</div>
  <button id="pause" aria-label="Pause">||</button>
  <script>
    window.paused = false;
    document.getElementById("pause").addEventListener("click", () => {
      window.paused = !window.paused;
      document.getElementById("pause").setAttribute("aria-label", window.paused ? "Play" : "Pause");
    });
  </script>
</body></html>`;

test("a slider's Pause button is clicked once, and not toggled back on a second call", { timeout: 60000 }, async () => {
    const { page, context } = await openHtml(browser, SLIDER_HTML);

    await stabilizePage(page);
    assert.equal(await page.evaluate(() => window.paused), true, "slider is paused");

    await stabilizePage(page);
    assert.equal(await page.evaluate(() => window.paused), true, "still paused after a second call");

    await context.close();
});