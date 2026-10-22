// --------------------------------------------------
// Screenshot module
//  - full-page capture (scrolls first so lazy content is loaded)
//  - layout screenshot around a form / element
//  - element crop for a selector (evidence)
//  - per-scan metrics (states + interactions) and saved scan summaries
// --------------------------------------------------
const fs = require("fs");
const path = require("path");

// --------------------------------------------------
// Wait until the page is FULLY loaded (lazy content included):
//  1. wait for load + network idle
//  2. scroll slowly, half a screen at a time, letting each part load
//  3. force lazy images, wait for all images + fonts
//  4. wait until the page height stops changing
//  5. return to the top
// --------------------------------------------------
async function scrollToLoadContent(page) {
    await page.waitForLoadState("load", { timeout: 30000 }).catch(() => { });
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => { });

    const viewportH = (page.viewportSize() || { height: 900 }).height;
    const step = Math.floor(viewportH * 0.5);

    let lastHeight = 0;
    let stableRounds = 0;

    for (let i = 0; i < 150; i++) {
        const y = await page.evaluate(() => window.scrollY);
        await page.evaluate((s) => window.scrollBy(0, s), step);

        // let lazy sections / observers / API calls react to this scroll position
        await page.waitForTimeout(700);
        await page.waitForLoadState("networkidle", { timeout: 2500 }).catch(() => { });

        const { height, atBottom, newY } = await page.evaluate(() => ({
            height: document.documentElement.scrollHeight,
            newY: window.scrollY,
            atBottom: window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2,
        }));

        if (atBottom && height === lastHeight) {
            stableRounds++;
        } else {
            stableRounds = 0;
        }
        lastHeight = height;

        // finished when we are at the bottom and the page stopped growing
        if (stableRounds >= 2 || (newY === y && atBottom)) break;
    }

    // Pause at the very bottom (footer / late widgets)
    await page.waitForTimeout(1200);
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => { });

    // Force any remaining lazy images to load, then wait for all images + fonts
    await page.evaluate(() => {
        document.querySelectorAll("img").forEach((img) => {
            if (img.loading === "lazy") img.loading = "eager";
            const ds = img.getAttribute("data-src") || img.getAttribute("data-lazy-src");
            if (ds && (!img.src || img.src.startsWith("data:"))) img.src = ds;
            const dss = img.getAttribute("data-srcset");
            if (dss && !img.srcset) img.srcset = dss;
        });
    }).catch(() => { });

    await page.evaluate(async () => {
        const withTimeout = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(r, ms))]);
        const imgs = [...document.images].filter((i) => !i.complete);
        await withTimeout(
            Promise.all(
                imgs.map((i) => new Promise((r) => { i.onload = i.onerror = r; }))
            ),
            10000
        );
        if (document.fonts && document.fonts.ready) {
            await withTimeout(document.fonts.ready, 5000);
        }
    }).catch(() => { });

    // Back to the top, then wait until the page height stays the same for ~1.5s
    await page.evaluate(() => window.scrollTo(0, 0));
    let prev = -1;
    let same = 0;
    for (let i = 0; i < 20 && same < 3; i++) {
        await page.waitForTimeout(500);
        const h = await page.evaluate(() => document.documentElement.scrollHeight);
        same = h === prev ? same + 1 : 0;
        prev = h;
    }

    await page.waitForTimeout(500);
}

// --------------------------------------------------
// Full-page screenshot that works with lazy-loaded pages.
// Scrolls one screen at a time, captures each screen while its content is
// really visible, then stitches the pieces together (needs: npm i sharp).
// Falls back to a normal fullPage screenshot if sharp is not installed.
// --------------------------------------------------
async function takeFullPage(page, outPath, log = () => { }) {
    // Make sure content-visibility / reveal animations don't hide things
    await page
        .addStyleTag({
            content: `
                *, *::before, *::after { content-visibility: visible !important; }
                [data-aos] { opacity: 1 !important; transform: none !important; }
            `,
        })
        .catch(() => { });

    let sharp = null;
    try { sharp = require("sharp"); } catch { }

    if (!sharp) {
        log("sharp not installed - using normal full-page screenshot (run: npm i sharp)");
        await page.screenshot({ path: outPath, fullPage: true, animations: "disabled", timeout: 60000 });
        return;
    }

    const vp = page.viewportSize() || { width: 1366, height: 900 };
    const tiles = [];

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(800);

    let y = 0;
    let hidFixed = false;

    for (let i = 0; i < 80; i++) {
        await page.evaluate((yy) => window.scrollTo(0, yy), y);
        await page.waitForTimeout(1000); // let this section render
        await page.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => { });

        // after the first screen, hide sticky/fixed bars so they don't repeat on every tile
        if (i === 1 && !hidFixed) {
            await page.evaluate(() => {
                [...document.querySelectorAll("*")].forEach((el) => {
                    const pos = getComputedStyle(el).position;
                    if (pos === "fixed" || pos === "sticky") {
                        el.dataset.prevVis = el.style.visibility || "";
                        el.dataset.hiddenByShot = "1";
                        el.style.visibility = "hidden";
                    }
                });
            });
            hidFixed = true;
            await page.waitForTimeout(300);
        }

        const actualY = await page.evaluate(() => Math.round(window.scrollY));
        const total = await page.evaluate(() => document.documentElement.scrollHeight);
        const buf = await page.screenshot({ animations: "disabled", timeout: 30000 });
        tiles.push({ input: buf, top: actualY, left: 0 });

        if (actualY + vp.height >= total - 2) break;
        y = actualY + vp.height;
    }

    // restore hidden fixed elements + go back to top
    await page.evaluate(() => {
        document.querySelectorAll('[data-hidden-by-shot="1"]').forEach((el) => {
            el.style.visibility = el.dataset.prevVis || "";
            delete el.dataset.hiddenByShot;
        });
        window.scrollTo(0, 0);
    }).catch(() => { });

    const last = tiles[tiles.length - 1];
    const canvasHeight = last.top + vp.height;

    await sharp({
        create: {
            width: vp.width,
            height: canvasHeight,
            channels: 3,
            background: { r: 255, g: 255, b: 255 },
        },
    })
        .composite(tiles)
        .png()
        .toFile(outPath);

    log(`Full page captured in ${tiles.length} screens`);
}

// LAYOUT screenshot around a form/element (not the box alone):
//  - form inside a modal/overlay -> the visible screen, with the modal in it
//  - form near the top of the page -> top of the page down to just below the form
//  - form far down the page -> the screen scrolled so the form is centred
async function captureElementShot(page, container, outPath) {
    const vp = page.viewportSize() || { width: 1366, height: 900 };

    let isFixed = false;
    if (container) {
        isFixed = await container
            .evaluate((n) => {
                let e = n;
                while (e && e !== document.body) {
                    if (getComputedStyle(e).position === "fixed") return true;
                    e = e.parentElement;
                }
                return false;
            })
            .catch(() => false);
    }

    if (isFixed) {
        await page.waitForTimeout(400);
        await page.screenshot({ path: outPath, animations: "disabled", timeout: 30000 });
        return;
    }

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(600);

    const box = container ? await container.boundingBox().catch(() => null) : null;

    if (box && box.y + box.height + 40 <= 1400) {
        await page.screenshot({
            path: outPath,
            clip: { x: 0, y: 0, width: vp.width, height: Math.ceil(box.y + box.height + 40) },
            animations: "disabled",
            timeout: 30000,
        });
    } else if (container) {
        await container.evaluate((n) => n.scrollIntoView({ block: "center" })).catch(() => { });
        await page.waitForTimeout(600);
        await page.screenshot({ path: outPath, animations: "disabled", timeout: 30000 });
    } else {
        await page.screenshot({ path: outPath, animations: "disabled", timeout: 30000 });
    }
}

// Evidence crop: a screenshot of ONE element, found with a CSS selector.
// "body" / "html" are skipped because the full-page screenshot already covers them.
async function captureSelectorCrop(page, selector, outPath, log = () => { }) {
    const sel = String(selector || "").trim();
    if (!sel || /^(body|html)$/i.test(sel)) return false;

    try {
        const el = page.locator(sel).first();
        if (!(await el.isVisible().catch(() => false))) {
            log(`Selector "${sel}" not found or not visible - no element crop saved`);
            return false;
        }
        await el.scrollIntoViewIfNeeded().catch(() => { });
        await page.waitForTimeout(400);
        await el.screenshot({ path: outPath, animations: "disabled", timeout: 30000 });
        log(`Element crop saved for selector "${sel}"`);
        return true;
    } catch (err) {
        log(`Element crop failed for "${sel}": ${String(err.message).split("\n")[0]}`);
        return false;
    }
}

// --------------------------------------------------
// Scan metrics. Counted ONE way for every site, from the action log:
//   state       = a distinct page state reached: the page itself, each opened
//                 nav dropdown, each page reached through a nav link, each
//                 revealed form/popup, each wizard step (Continue / Get quote)
//   interaction = one action done in the browser: a click, a hover, a typed or
//                 filled field, a chosen option, a dismissed dialog
// --------------------------------------------------
function computeScanMetrics(actions, navReport = []) {
    const texts = actions.map((a) => a.action || "");
    const count = (re) => texts.filter((t) => re.test(t)).length;

    const clicks = count(
        / - clicking|, clicking|^Dropdown \d+: (clicking|ticking)|Continue\/Next clicked|^Clicked (OK|Get free quote|Continue)|^Opened Members|^Selected Self/
    );
    const hovers = count(/ - hovering|hovering ".*" again/);
    const fieldsFilled = count(/^Filled field|^Filled test email|^Entered age/);
    const selections = count(/^Selected ".*" in a dropdown|: choosing option/);
    const dialogsHandled = count(/^JavaScript dialog dismissed/);

    const states =
        1 +
        count(/dropdown opened with/) +
        navReport.filter((r) => r.result === "URL changed").length +
        count(/new field\(s\) appeared/) +
        count(/Continue\/Next clicked|^Clicked Continue|^Clicked Get free quote/);

    return {
        states,
        interactions: clicks + hovers + fieldsFilled + selections + dialogsHandled,
        breakdown: { clicks, hovers, fieldsFilled, selections, dialogsHandled },
    };
}

// --------------------------------------------------
// Scan history (one JSON file per scan in the scans folder)
// --------------------------------------------------
function saveScanSummary(dir, summary) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${summary.scanId}.json`), JSON.stringify(summary, null, 2));
}

function listScans(dir) {
    if (!fs.existsSync(dir)) return [];
    return fs
        .readdirSync(dir)
        .filter((f) => /^scan-\d+\.json$/.test(f))
        .map((f) => {
            try {
                const { actionLog, ...rest } = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
                return rest;
            } catch {
                return null;
            }
        })
        .filter(Boolean)
        .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
}

function readScan(dir, id) {
    if (!/^scan-\d+$/.test(id)) return null;
    const file = path.join(dir, `${id}.json`);
    if (!fs.existsSync(file)) return null;
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return null;
    }
}

module.exports = {
    scrollToLoadContent,
    takeFullPage,
    captureElementShot,
    captureSelectorCrop,
    computeScanMetrics,
    saveScanSummary,
    listScans,
    readScan,
};