// --------------------------------------------------
// Screenshot stabilizer
//  - stabilizePage:   make a page hold still before a screenshot
//                     (disable animations, pause media, mask volatile regions,
//                     wait until two screenshots in a row are identical)
//  - compareImages:   compare two screenshots against a threshold and
//                     optionally write a diff image
//  - installDeterministicEnvironment: fixed clock + seeded Math.random (opt-in)
// All numbers come from stabilizer.config.js
// --------------------------------------------------

const defaults = require("./stabilizer.config");

const STYLE_ID = "__stabilizer_style__";
const MASK_CLASS = "__stabilizer_mask__";

// A selector is only used if it is a plain non-empty string with no braces
// (it ends up inside a stylesheet and in querySelectorAll).
function cleanSelectors(list) {
    const out = [];
    for (const s of list || []) {
        if (typeof s !== "string") continue;
        const t = s.trim();
        if (!t || /[{}<>]/.test(t)) continue;
        if (!out.includes(t)) out.push(t);
    }
    return out;
}

function buildCss(cfg, selectors) {
    const parts = [];

    if (cfg.disableAnimations) {
        // Finite animations jump to their last frame, infinite ones stop after one
        // very short run - the page ends in the same state every time.
        parts.push(`*, *::before, *::after {
            animation-duration: 0s !important;
            animation-delay: 0s !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0s !important;
            transition-delay: 0s !important;
            scroll-behavior: auto !important;
        }`);
    }
    if (cfg.hideCaret) {
        parts.push("* { caret-color: transparent !important; }");
    }
    if (cfg.maskMode === "hide") {
        selectors.forEach((sel) => parts.push(`${sel} { visibility: hidden !important; }`));
    }
    if (cfg.extraCss) parts.push(String(cfg.extraCss));

    return parts.join("\n");
}

// Wait until two screenshots taken one after the other are identical
async function waitForVisualStability(page, cfg = defaults) {
    const end = Date.now() + cfg.settleTimeoutMs;
    let previous = null;
    let attempts = 0;

    while (Date.now() < end) {
        const shot = await page.screenshot({ animations: "disabled", timeout: 10000 }).catch(() => null);
        attempts++;
        if (previous && shot && previous.equals(shot)) return { stable: true, attempts };
        previous = shot;
        await page.waitForTimeout(cfg.settleIntervalMs);
    }
    return { stable: false, attempts };
}

// Make the page hold still. Safe to call again after the page changes
// (it replaces its own stylesheet and masks instead of adding more).
async function stabilizePage(page, options = {}, log = () => { }) {
    const cfg = { ...defaults, ...options };
    const selectors = cleanSelectors([...(cfg.defaultMaskSelectors || []), ...(options.maskSelectors || [])]);

    // 1. custom stylesheet: animations off, caret hidden, "hide" mode selectors
    await page.evaluate(({ id, css }) => {
        let el = document.getElementById(id);
        if (!el) {
            el = document.createElement("style");
            el.id = id;
            (document.head || document.documentElement).appendChild(el);
        }
        el.textContent = css;
    }, { id: STYLE_ID, css: buildCss(cfg, selectors) });

    // 2. finish/cancel running animations, pause media, drop focus
    await page.evaluate(({ pauseMedia, pauseCarousels }) => {
        document.getAnimations().forEach((a) => {
            try { a.finish(); } catch { try { a.cancel(); } catch { } }
        });
        if (pauseCarousels) {
            document.querySelectorAll("marquee").forEach((m) => { try { m.stop(); } catch { } });
            // a slider's "Pause" button; once clicked it says "Play", so a second
            // call leaves it alone
            document.querySelectorAll('button, [role="button"]').forEach((b) => {
                const r = b.getBoundingClientRect();
                const cs = getComputedStyle(b);
                if (r.width < 4 || r.height < 4 || cs.visibility === "hidden" || cs.display === "none") return;
                const label = ((b.getAttribute("aria-label") || "") + " " + (b.getAttribute("title") || "") + " " + (b.innerText || "")).toLowerCase();
                if (/\b(play|resume|start)\b/.test(label)) return;
                if (/\bpause\b/.test(label)) { try { b.click(); } catch { } }
            });
        }
        if (pauseMedia) {
            document.querySelectorAll("video, audio").forEach((m) => {
                try { m.pause(); m.currentTime = 0; } catch { }
            });
        }
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    }, { pauseMedia: cfg.pauseMedia, pauseCarousels: cfg.pauseCarousels });

    // 3. "mask" mode: solid colour boxes over the volatile elements
    let masked = 0;
    await page.evaluate(({ cls }) => {
        document.querySelectorAll("." + cls).forEach((e) => e.remove());
    }, { cls: MASK_CLASS });

    if (cfg.maskMode === "mask" && selectors.length) {
        masked = await page.evaluate(({ sels, color, cls }) => {
            let count = 0;
            for (const sel of sels) {
                let nodes;
                try { nodes = document.querySelectorAll(sel); } catch { continue; }
                nodes.forEach((el) => {
                    const r = el.getBoundingClientRect();
                    const cs = getComputedStyle(el);
                    if (r.width < 1 || r.height < 1 || cs.visibility === "hidden" || cs.display === "none") return;

                    let fixed = false;
                    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
                        if (getComputedStyle(e).position === "fixed") { fixed = true; break; }
                    }

                    const box = document.createElement("div");
                    box.className = cls;
                    box.setAttribute("aria-hidden", "true");
                    box.style.cssText =
                        `position:${fixed ? "fixed" : "absolute"};` +
                        `left:${fixed ? r.left : r.left + window.scrollX}px;` +
                        `top:${fixed ? r.top : r.top + window.scrollY}px;` +
                        `width:${r.width}px;height:${r.height}px;background:${color};` +
                        "z-index:2147483647;pointer-events:none;margin:0;padding:0;border:0;";
                    document.documentElement.appendChild(box);
                    count++;
                });
            }
            return count;
        }, { sels: selectors, color: cfg.maskColor, cls: MASK_CLASS });
    }

    // 4. wait until the page stops changing
    const settle = await waitForVisualStability(page, cfg);

    log(`Stabilizer: ${masked} element(s) masked, page ${settle.stable ? "settled" : "did not fully settle"}`);
    return { masked, settled: settle.stable, maskSelectors: selectors, maskMode: cfg.maskMode };
}

// Fixed clock + seeded Math.random for every page of this context (opt-in).
// Call it BEFORE the page loads.
async function installDeterministicEnvironment(context, options = {}) {
    const cfg = { ...defaults, ...options };
    await context.addInitScript(({ fixed, seed }) => {
        const RealDate = Date;
        class FixedDate extends RealDate {
            constructor(...args) {
                if (args.length === 0) super(fixed);
                else super(...args);
            }
            static now() { return fixed; }
        }
        window.Date = FixedDate;

        let a = seed >>> 0;
        Math.random = function () {
            a = (a + 0x6d2b79f5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }, { fixed: new Date(cfg.fixedTime).getTime(), seed: cfg.randomSeed });
}

// --------------------------------------------------
// Compare two screenshots (file paths or Buffers)
//   passed = share of different pixels is at or below the threshold
// --------------------------------------------------
async function compareImages(a, b, options = {}) {
    const sharp = require("sharp");
    const cfg = { ...defaults, ...options };

    const load = (input) => sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const [A, B] = await Promise.all([load(a), load(b)]);

    const base = { threshold: cfg.threshold, pixelTolerance: cfg.pixelTolerance, diffPath: null };

    if (A.info.width !== B.info.width || A.info.height !== B.info.height) {
        return {
            ...base,
            passed: false,
            sizeMismatch: true,
            width: A.info.width,
            height: A.info.height,
            sizeB: { width: B.info.width, height: B.info.height },
            differentPixels: null,
            totalPixels: null,
            ratio: 1,
            percent: 100,
        };
    }

    const { width, height } = A.info;
    const total = width * height;
    const wantDiff = Boolean(cfg.diffPath);
    const diff = wantDiff ? Buffer.alloc(total * 4) : null;
    let different = 0;

    for (let p = 0; p < total; p++) {
        const i = p * 4;
        const isDifferent =
            Math.abs(A.data[i] - B.data[i]) > cfg.pixelTolerance ||
            Math.abs(A.data[i + 1] - B.data[i + 1]) > cfg.pixelTolerance ||
            Math.abs(A.data[i + 2] - B.data[i + 2]) > cfg.pixelTolerance;

        if (isDifferent) different++;

        if (wantDiff) {
            if (isDifferent) {
                diff[i] = cfg.diffColor.r;
                diff[i + 1] = cfg.diffColor.g;
                diff[i + 2] = cfg.diffColor.b;
            } else {
                // faded copy of the original so you can see where the changes are
                const grey = Math.round((A.data[i] + A.data[i + 1] + A.data[i + 2]) / 3 * 0.3 + 178);
                diff[i] = diff[i + 1] = diff[i + 2] = grey;
            }
            diff[i + 3] = 255;
        }
    }

    if (wantDiff) {
        await sharp(diff, { raw: { width, height, channels: 4 } }).png().toFile(cfg.diffPath);
    }

    const ratio = total ? different / total : 0;
    return {
        ...base,
        diffPath: wantDiff ? cfg.diffPath : null,
        passed: ratio <= cfg.threshold,
        sizeMismatch: false,
        width,
        height,
        differentPixels: different,
        totalPixels: total,
        ratio,
        percent: Number((ratio * 100).toFixed(4)),
    };
}

module.exports = {
    stabilizePage,
    waitForVisualStability,
    installDeterministicEnvironment,
    compareImages,
    cleanSelectors,
};