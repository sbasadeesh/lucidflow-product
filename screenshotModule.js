// --------------------------------------------------
// Screenshot module
//  - full-page capture (scrolls first so lazy content is loaded)
//  - layout screenshot around a form / element
//  - element crop for a selector (evidence)
//  - per-scan metrics (states + interactions) and saved scan summaries
//  - [E2-04] raw observation manifest (kept separate from stabilized shots)
// --------------------------------------------------
const fs = require("fs");
const path = require("path");

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

        if (stableRounds >= 2 || (newY === y && atBottom)) break;
    }

    await page.waitForTimeout(1200);
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => { });

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

async function takeFullPage(page, outPath, log = () => { }, hooks = {}) {
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

    for (let i = 0; i < 80; i++) {
        await page.evaluate((yy) => window.scrollTo(0, yy), y);
        await page.waitForTimeout(1000);
        await page.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => { });

        if (hooks.beforeTile) await hooks.beforeTile().catch(() => { });

        if (i === 0) {
            await page.evaluate(() => {
                const vw = window.innerWidth;
                const vh = window.innerHeight;
                const snap = [];
                const walk = (root) => {
                    root.querySelectorAll("*").forEach((el) => {
                        if (el.shadowRoot) walk(el.shadowRoot);
                        const r = el.getBoundingClientRect();
                        if (r.width < 8 || r.height < 8) return;
                        if (r.width * r.height > vw * vh * 0.25) return;
                        if (r.bottom < 0 || r.top > vh) return;
                        snap.push({ el, top: r.top, left: r.left, w: r.width, h: r.height, y: window.scrollY });
                    });
                };
                walk(document);
                window.__shotSnap = snap.slice(0, 4000);
                window.__shotPinnedDone = false;
            }).catch(() => { });
        } else {
            await page.evaluate(() => {
                const hidden = window.__shotHidden || (window.__shotHidden = []);
                const hide = (el) => {
                    if (el.dataset && el.dataset.hiddenByShot === "1") return;
                    el.dataset.prevVis = el.style.visibility || "";
                    el.dataset.hiddenByShot = "1";
                    el.style.visibility = "hidden";
                    hidden.push(el);
                };
                const walk = (root) => {
                    root.querySelectorAll("*").forEach((el) => {
                        if (el.shadowRoot) walk(el.shadowRoot);
                        const pos = getComputedStyle(el).position;
                        if (pos === "fixed" || pos === "sticky") hide(el);
                    });
                };
                walk(document);

                if (window.__shotSnap && !window.__shotPinnedDone) {
                    const sy = window.scrollY;
                    window.__shotSnap.forEach((s) => {
                        if (Math.abs(sy - s.y) < 100 || !s.el.isConnected) return;
                        const r = s.el.getBoundingClientRect();
                        if (
                            Math.abs(r.top - s.top) < 2 && Math.abs(r.left - s.left) < 2 &&
                            Math.abs(r.width - s.w) < 2 && Math.abs(r.height - s.h) < 2
                        ) {
                            hide(s.el);
                        }
                    });
                    window.__shotPinnedDone = true;
                    window.__shotSnap = null;
                }
            }).catch(() => { });
            await page.waitForTimeout(300);
        }

        const actualY = await page.evaluate(() => Math.round(window.scrollY));
        const total = await page.evaluate(() => document.documentElement.scrollHeight);
        const buf = await page.screenshot({ animations: "disabled", timeout: 30000 });
        tiles.push({ input: buf, top: actualY, left: 0 });

        if (actualY + vp.height >= total - 2) break;
        y = actualY + vp.height;
    }

    await page.evaluate(() => {
        (window.__shotHidden || []).forEach((el) => {
            el.style.visibility = el.dataset.prevVis || "";
            delete el.dataset.hiddenByShot;
            delete el.dataset.prevVis;
        });
        window.__shotHidden = [];
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

// [E2-04] hooks.beforeShot lets the caller force a raw capture first.
async function captureElementShot(page, container, outPath, hooks = {}) {
    if (hooks.beforeShot) await hooks.beforeShot().catch(() => { });

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

// [E2-04] hooks.beforeShot lets the caller force a raw capture first.
async function captureSelectorCrop(page, selector, outPath, log = () => { }, hooks = {}) {
    const sel = String(selector || "").trim();
    if (!sel || /^(body|html)$/i.test(sel)) return false;

    if (hooks.beforeShot) await hooks.beforeShot().catch(() => { });

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

// --------------------------------------------------
// [E2-04] Raw observation manifest
//   Every scan keeps its raw (pre-stabilization) observations separate
//   from the optional stabilized evidence rendering.
// --------------------------------------------------
function buildRawObservationManifest(entries = []) {
    return entries.map((e, i) => ({
        index: i,
        label: e.label || `observation-${i + 1}`,
        rawPath: e.rawPath || null,
        rawUrl: e.rawUrl || null,
        stabilizedPath: e.stabilizedPath || null,
        stabilizedUrl: e.stabilizedUrl || null,
        observedAt: e.observedAt || new Date().toISOString(),
        signalsSeen: Array.isArray(e.signalsSeen) ? e.signalsSeen : [],
        rejectionCode: e.rejectionCode || null,
        rejectionReason: e.rejectionReason || null,
    }));
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
    buildRawObservationManifest,  // [E2-04]
};