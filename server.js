const express = require("express");
const cors = require("cors");
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");
const {
    scrollToLoadContent,
    takeFullPage,
    captureElementShot,
    captureSelectorCrop,
    computeScanMetrics,
    saveScanSummary,
    listScans,
    readScan,
} = require("./screenshotModule");
const {
    stabilizePage,
    installDeterministicEnvironment,
    compareImages,
} = require("./screenshotStabilizer");
const stabilizerConfig = require("./stabilizer.config");
const { runStateScript, parseScript, ScriptError } = require("./stateScriptRunner");
const stateScriptConfig = require("./stateScript.config");

const app = express();
const PORT = 5000;

// Set to false to leave the optional email empty in the screenshots
const FILL_EMAIL = true;

// Max dropdowns to open per page, and max Continue/Next steps to follow
// Errors that mean "the site closed the connection on us" (bot protection)
const CONNECTION_BLOCK_ERRORS =
    /ERR_HTTP2_PROTOCOL_ERROR|ERR_CONNECTION_RESET|ERR_CONNECTION_CLOSED|ERR_EMPTY_RESPONSE|ERR_ACCESS_DENIED/;

function errorCode(err) {
    const m = String((err && err.message) || "").match(/net::(ERR_[A-Z0-9_]+)/);
    return m ? m[1] : "unknown";
}

// Automatic popups (a banner that opens a few seconds after the page loads)
const POPUP_WAIT_MS = 8000;      // wait up to this long for a popup to show up
const POPUP_MIN_WAIT_MS = 3000;  // always wait at least this long
const POPUP_QUIET_MS = 1500;     // stop once no popup was seen for this long

const MAX_DROPDOWNS = 15;
const MAX_STEPS = 5;
const MAX_NAV = 20;        // top nav-bar items to click
const MAX_SUB = 12;        // links to click inside each opened nav menu
const MAX_NAV_LINKS = 60;  // overall cap on nav links clicked (keeps the run time sane)
const MAX_CTAS = 8;   // quote-style buttons to click

// Buttons worth clicking to reveal a hidden quote form, and ones to avoid
const CTA_REGEX = /(quote|premium|get started|calculate|call ?back|buy( now)?|enquire|enquiry|apply|renew|compare|check|explore plans|view plans)/i;
const AVOID_REGEX = /(\bpay\b|payment|submit|log ?out|sign ?out|delete|cancel|confirm|place order|download|subscribe)/i;

// Fields the engine must NEVER type into. When one is reached, it stops
// and takes the element screenshot.
const SENSITIVE_REGEX =
    /(mobile|phone|\btel\b|contact\s?(no|number)|\botp\b|one[\s-]?time|vehicle|registration|reg\.?\s?(no|number)|number\s?plate|licen[cs]e|\brc\b|\bpan\b|aadhaar|aadhar|card\s?number|\bcvv\b|\bcvc\b|expiry|password|passcode|account\s?(no|number)|\bifsc\b|\bssn\b|passport|chassis|engine\s?(no|number))/i;

const scansDir = path.join(__dirname, "scans");
const screenshotDir = path.join(__dirname, "screenshots");
fs.mkdirSync(screenshotDir, { recursive: true });

app.use(cors());
app.use(express.json());
app.use("/screenshots", express.static(screenshotDir));

app.get("/", (req, res) => {
    res.send("Screenshot Testing API is running");
});

// --------------------------------------------------
// Helpers
// Pick the first element from a locator whose centre point is really clickable
// (not covered by a sticky header / overlay)
async function pickClickable(locator, page) {
    const count = await locator.count().catch(() => 0);

    for (let i = 0; i < count; i++) {
        const el = locator.nth(i);
        if (!(await el.isVisible().catch(() => false))) continue;

        await el.evaluate((n) => n.scrollIntoView({ block: "center" })).catch(() => { });
        await page.waitForTimeout(300);

        const ok = await el
            .evaluate((n) => {
                const r = n.getBoundingClientRect();
                const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
                return !!top && (n === top || n.contains(top) || top.contains(n));
            })
            .catch(() => false);

        if (ok) return el;
    }
    return null;
}

// Click with fallbacks: real mouse click at element centre (hits whatever is
// on top, e.g. the real dropdown wrapper) -> normal -> force -> DOM click
async function smartClick(el) {
    try {
        const page = el.page();
        await el.evaluate((n) => n.scrollIntoView({ block: "center" }));
        await page.waitForTimeout(300);
        const box = await el.boundingBox();
        if (box) {
            await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
            return true;
        }
    } catch { }
    try { await el.click({ timeout: 3000 }); return true; } catch { }
    try { await el.click({ timeout: 3000, force: true }); return true; } catch { }
    try { await el.evaluate((n) => n.click()); return true; } catch { }
    return false;
}

// --------------------------------------------------

// Returns the first visible locator from a list of candidates (or null)
async function firstVisible(page, candidates, timeout = 8000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
        for (const loc of candidates) {
            const el = loc.first();
            if (await el.isVisible().catch(() => false)) return el;
        }
        await page.waitForTimeout(250);
    }
    return null;
}

// Accept common cookie banners
async function acceptCookies(page) {
    const labels = [
        "Accept all cookies",
        "Accept All",
        "Accept all",
        "Accept cookies",
        "Allow all",
        "I agree",
        "Agree and continue",
    ];

    for (const label of labels) {
        const button = page.getByRole("button", { name: label, exact: true }).first();
        if (await button.isVisible().catch(() => false)) {
            try {
                await button.click({ timeout: 1500 });
                await page.waitForTimeout(300);
                return true;
            } catch { }
        }
    }
    return false;
}

// Close common popups / dialogs. Returns number of things closed.
async function clearPopups(page) {
    let handled = 0;

    if (await acceptCookies(page)) handled++;

    const closeSelectors = [
        '[role="dialog"] button[aria-label="Close"]',
        '[role="dialog"] button[aria-label="close"]',
        'button[aria-label="Close"]',
        'button[title="Close"]',
        '[data-dismiss="modal"]',
        ".modal button.close",
        ".popup button.close",
    ];

    for (const selector of closeSelectors) {
        const elements = page.locator(selector);
        const count = await elements.count().catch(() => 0);

        for (let i = count - 1; i >= 0; i--) {
            const button = elements.nth(i);
            if (!(await button.isVisible().catch(() => false))) continue;
            try {
                await button.click({ timeout: 1000 });
                handled++;
                await page.waitForTimeout(200);
            } catch { }
        }
    }

    // Visible "Close" / "Dismiss" buttons that sit inside an overlay (modal or banner popup)
    const generic = page.getByRole("button", { name: /^(close|dismiss|no thanks|maybe later|not now|skip)$/i });
    const genericCount = Math.min(await generic.count().catch(() => 0), 6);
    for (let i = genericCount - 1; i >= 0; i--) {
        const button = generic.nth(i);
        if (!(await button.isVisible().catch(() => false))) continue;
        const inOverlay = await button
            .evaluate((el) => {
                for (let e = el; e && e !== document.body; e = e.parentElement) {
                    const cs = getComputedStyle(e);
                    if (e.getAttribute("role") === "dialog" || e.getAttribute("aria-modal") === "true") return true;
                    if ((cs.position === "fixed" || cs.position === "absolute") && parseInt(cs.zIndex || "0", 10) >= 100) return true;
                }
                return false;
            })
            .catch(() => false);
        if (!inOverlay) continue;
        try {
            await button.click({ timeout: 1000 });
            handled++;
            await page.waitForTimeout(300);
        } catch { }
    }

    const dialog = page.getByRole("dialog").last();
    if (await dialog.isVisible().catch(() => false)) {
        for (const label of ["Close", "Dismiss", "No thanks", "Maybe later"]) {
            const button = dialog.getByRole("button", { name: label, exact: true }).first();
            if (await button.isVisible().catch(() => false)) {
                try {
                    await button.click({ timeout: 1000 });
                    handled++;
                } catch { }
                break;
            }
        }
    }

    return handled;
}

// Fill eligible visible fields with dummy data (never phone/mobile fields)
// Text that describes a field (type, name, placeholder, labels) - used to
// decide whether it is a sensitive field (phone, OTP, vehicle number...)
async function getFieldInfo(field) {
    return field
        .evaluate((el) => {
            const parts = [
                el.type, el.name, el.id, el.placeholder,
                el.getAttribute("aria-label"), el.getAttribute("autocomplete"),
                el.getAttribute("inputmode"),
            ];
            if (el.labels) [...el.labels].forEach((l) => parts.push(l.innerText));
            const lb = el.getAttribute("aria-labelledby");
            if (lb) {
                lb.split(/\s+/).forEach((id) => {
                    const t = document.getElementById(id);
                    if (t) parts.push(t.innerText);
                });
            }
            const cl = el.closest("label");
            if (cl) parts.push(cl.innerText);
            if (el.previousElementSibling) parts.push((el.previousElementSibling.innerText || "").slice(0, 80));
            // nearest wrapper that contains ONLY this one field
            let p = el.parentElement;
            for (let i = 0; i < 3 && p; i++) {
                if (p.querySelectorAll("input,select,textarea").length === 1) {
                    parts.push((p.innerText || "").slice(0, 100));
                    break;
                }
                p = p.parentElement;
            }
            return {
                type: (el.type || "").toLowerCase(),
                inputmode: (el.getAttribute("inputmode") || "").toLowerCase(),
                text: parts.filter(Boolean).join(" | "),
                placeholder: el.placeholder || "",
                inChrome:
                    !!el.closest("footer") ||
                    (el.type || "").toLowerCase() === "search" ||
                    /search/i.test([el.name, el.id, el.placeholder, el.getAttribute("aria-label"), el.getAttribute("role")].join(" ")),
            };
        })
        .catch(() => null);
}

async function isSensitiveField(field) {
    const info = await getFieldInfo(field);
    if (!info) return false;
    if (info.type === "tel" || info.type === "password" || info.inputmode === "tel") return true;
    return SENSITIVE_REGEX.test(info.text);
}

// Returns the first visible sensitive field on the page (or null)
async function findSensitiveField(page) {
    const fields = page.locator(
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]), textarea'
    );
    const count = await fields.count().catch(() => 0);

    for (let i = 0; i < count; i++) {
        const f = fields.nth(i);
        if (!(await f.isVisible().catch(() => false))) continue;
        const info = await getFieldInfo(f);
        if (!info || info.inChrome) continue;
        if (
            info.type === "tel" || info.type === "password" || info.inputmode === "tel" ||
            SENSITIVE_REGEX.test(info.text)
        ) {
            const label = (info.placeholder || info.text.split("|").pop() || "sensitive field").trim().slice(0, 60);
            return { locator: f, label };
        }
    }
    return null;
}

// Fill eligible visible fields with dummy data. Never touches sensitive fields.
async function fillVisibleFields(page, log = () => { }) {
    let filled = 0;

    const fields = page.locator(
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="password"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="search"]), textarea, select'
    );

    const count = await fields.count();

    for (let i = 0; i < count; i++) {
        const field = fields.nth(i);

        try {
            if (!(await field.isVisible())) continue;
            if (!(await field.isEnabled())) continue;

            const info = await getFieldInfo(field);
            if (info && info.inChrome) continue; // skip header search boxes etc.

            if (await isSensitiveField(field)) {
                log(`Skipped sensitive field: "${String((info && (info.placeholder || info.text.split("|").pop())) || "").trim()}"`);
                continue;
            }

            const tag = await field.evaluate((el) => el.tagName.toLowerCase());
            const currentValue = await field.inputValue().catch(() => "");
            if (currentValue.trim()) continue;

            if (tag === "select") {
                const options = await field.locator("option").evaluateAll((items) =>
                    items
                        .filter((o) => o.value && !o.disabled && !o.selected)
                        .map((o) => ({ value: o.value, text: o.textContent.trim() }))
                );
                if (!options.length) continue;

                const state = options.find((o) => /^(tamil nadu|tamilnadu)$/i.test(o.text));
                const chosen = state || options[0];
                await field.selectOption(chosen.value);
                log(`Selected "${chosen.text}" in a dropdown`);
                filled++;
                continue;
            }

            const type = ((await field.getAttribute("type")) || "").toLowerCase();
            const name = (
                (await field.getAttribute("name")) ||
                (await field.getAttribute("id")) ||
                (await field.getAttribute("placeholder")) ||
                ""
            ).toLowerCase();

            let value = "Test";

            if (type === "email" || name.includes("email")) value = "test@example.com";
            else if (type === "number") value = "30";
            else if (type === "date") value = "2000-01-15";
            else if (name.includes("name")) value = "Test User";
            else if (name.includes("city")) value = "Chennai";
            else if (name.includes("pin") || name.includes("zip") || name.includes("postal")) value = "600001";
            else if (tag === "textarea") value = "Test response";

            await field.fill(value);
            log(`Filled field "${name || type || tag}" with "${value}"`);
            filled++;
        } catch {
            // Ignore unsupported or custom fields
        }
    }

    return filled;
}



// Clear popups / cookie banners a couple of times (they can appear late)
async function clearPopupsSettled(page) {
    let total = 0;
    for (let i = 0; i < 3; i++) {
        const n = await clearPopups(page).catch(() => 0);
        total += n || 0;
        await page.waitForTimeout(700);
    }
    return total;
}

// --------------------------------------------------
// Automatic popups
//   dismissOverlays:       finds popups that cover the page (modals, promo banners)
//                          and cancels them: its Close button -> Escape -> hide it
//   waitAndDismissPopups:  waits for popups to appear and cancels each one
// --------------------------------------------------
async function dismissOverlays(page, record = () => { }) {
    // 1. find overlays on screen and tag the outermost ones
    const found = await page
        .evaluate(() => {
            document.querySelectorAll("[data-popup-target]").forEach((e) => e.removeAttribute("data-popup-target"));
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const hits = [];

            document.querySelectorAll("body *").forEach((el) => {
                const cs = getComputedStyle(el);
                if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) === 0) return;
                if (cs.position !== "fixed" && cs.position !== "absolute") return;

                const r = el.getBoundingClientRect();
                if (r.width < 150 || r.height < 100) return;

                const hint = (el.id + " " + (typeof el.className === "string" ? el.className : "")).toLowerCase();
                const isDialog =
                    el.getAttribute("role") === "dialog" ||
                    el.getAttribute("aria-modal") === "true" ||
                    /modal|popup|pop-up|dialog|lightbox|overlay|interstitial/.test(hint);
                const z = parseInt(cs.zIndex, 10) || 0;
                const big = r.width * r.height >= vw * vh * 0.12;

                if (!(isDialog || (cs.position === "fixed" && z >= 100 && big))) return;
                // sticky header / footer bars are wide and short: not a popup
                if (cs.position === "fixed" && r.height < 120 && r.width > vw * 0.6 && !isDialog) return;
                // the page itself (or an app shell) is not a popup
                if (el.querySelector("header, nav, main, footer")) return;

                hits.push(el);
            });

            const outer = hits.filter((el) => !hits.some((o) => o !== el && o.contains(el)));
            outer.forEach((el, i) => el.setAttribute("data-popup-target", String(i)));
            return outer.map((el, i) => ({
                idx: i,
                text: (el.innerText || "").trim().replace(/\s+/g, " ").slice(0, 60),
                textLength: (el.innerText || "").length,
            }));
        })
        .catch(() => []);

    let dismissed = 0;

    for (const p of found) {
        const target = page.locator(`[data-popup-target="${p.idx}"]`).first();
        const stillOpen = async () => target.isVisible().catch(() => false);
        const label = p.text || "(no text)";

        // 2a. click the popup's own Close / X / "No thanks" control
        const hasCloser = await page
            .evaluate(({ idx }) => {
                const root = document.querySelector(`[data-popup-target="${idx}"]`);
                if (!root) return false;
                document.querySelectorAll("[data-popup-close]").forEach((e) => e.removeAttribute("data-popup-close"));

                const wordRe = /^(close|dismiss|no,? ?thanks|skip|not now|maybe later|cancel|got it|✕|✖|×|x)$/i;
                const labelRe = /(close|dismiss)/i;
                const classRe = /(^|[-_\s])(close|dismiss)([-_\s]|$)|btn-close|modal-close|popup-close|icon-close/i;

                let best = null;
                root.querySelectorAll("button, a, [role='button'], span, div, i, img, svg").forEach((el) => {
                    const r = el.getBoundingClientRect();
                    const cs = getComputedStyle(el);
                    if (r.width < 8 || r.height < 8 || r.width > 260 || r.height > 120) return;
                    if (cs.visibility === "hidden" || cs.display === "none") return;

                    const text = (el.innerText || "").trim();
                    const aria = (el.getAttribute("aria-label") || "") + " " + (el.getAttribute("title") || "") + " " + (el.getAttribute("alt") || "");
                    const cls = (typeof el.className === "string" ? el.className : el.getAttribute("class") || "") + " " + (el.id || "");
                    if (!(wordRe.test(text) || labelRe.test(aria) || classRe.test(cls))) return;

                    const clickable = /^(button|a)$/i.test(el.tagName) || el.getAttribute("role") === "button";
                    const score = (clickable ? 2 : 0) + (wordRe.test(text) ? 1 : 0);
                    if (!best || score > best.score) best = { el, score };
                });

                if (!best) return false;
                best.el.setAttribute("data-popup-close", "1");
                return true;
            }, { idx: p.idx })
            .catch(() => false);

        if (hasCloser) {
            await smartClick(page.locator('[data-popup-close="1"]').first());
            await page.waitForTimeout(600);
            if (!(await stillOpen())) {
                dismissed++;
                record(`Popup cancelled with its Close button: "${label}"`);
                continue;
            }
        }

        // 2b. Escape key
        await page.keyboard.press("Escape").catch(() => { });
        await page.waitForTimeout(500);
        if (!(await stillOpen())) {
            dismissed++;
            record(`Popup cancelled with the Escape key: "${label}"`);
            continue;
        }

        // 2c. last resort: hide it (only if it is a small block, never the whole page)
        if (p.textLength < 2500) {
            await page
                .evaluate(({ idx }) => {
                    const el = document.querySelector(`[data-popup-target="${idx}"]`);
                    if (el) el.style.setProperty("display", "none", "important");
                    document.querySelectorAll('.modal-backdrop, [class*="backdrop"]').forEach((b) => {
                        if (getComputedStyle(b).position === "fixed") b.style.setProperty("display", "none", "important");
                    });
                    document.body.classList.remove("modal-open");
                    document.body.style.removeProperty("overflow");
                    document.documentElement.style.removeProperty("overflow");
                }, { idx: p.idx })
                .catch(() => { });
            await page.waitForTimeout(300);
            dismissed++;
            record(`Popup could not be closed with a click, so it was hidden: "${label}"`);
        }
    }

    return dismissed;
}

// Waits for automatic popups to show up and cancels each one.
// Always waits `minWaitMs`; stops early once no popup was seen for POPUP_QUIET_MS.
async function waitAndDismissPopups(page, record = () => { }, options = {}) {
    const waitMs = options.waitMs || POPUP_WAIT_MS;
    const minWaitMs = options.minWaitMs || POPUP_MIN_WAIT_MS;

    const start = Date.now();
    let lastSeen = 0;
    let total = 0;

    record(`Waiting up to ${Math.round(waitMs / 1000)}s for automatic popups...`);

    while (Date.now() - start < waitMs) {
        const simple = await clearPopups(page).catch(() => 0); // cookie banners, plain Close buttons
        const overlays = await dismissOverlays(page, record).catch(() => 0);

        if (simple || overlays) {
            total += (simple || 0) + (overlays || 0);
            lastSeen = Date.now();
        }

        if (Date.now() - start >= minWaitMs && Date.now() - lastSeen >= POPUP_QUIET_MS) break;
        await page.waitForTimeout(500);
    }

    record(total ? `${total} popup(s) / banner(s) cancelled` : "No automatic popup appeared");
    return total;
}

// --------------------------------------------------
// Keep the browser on ONE url
// --------------------------------------------------
function normalizeUrl(u) {
    try {
        const x = new URL(u);
        return x.origin + x.pathname.replace(/\/$/, "") + x.search;
    } catch {
        return u;
    }
}

// Cancels navigations to other pages and closes extra tabs while guard.on
async function setupNavigationGuard(page, context, guard, log) {
    // Cancels page-initiated navigations from inside the page, so the values
    // already filled in are NOT lost. (The dialog handler dismisses the prompt.)
    await page.addInitScript(() => {
        window.addEventListener("beforeunload", (e) => {
            if (window.__navGuard) {
                e.preventDefault();
                e.returnValue = "";
            }
        });
    });

    await page.route("**/*", (route) => {
        try {
            const req = route.request();
            if (guard.on && !guard.allowNav && req.isNavigationRequest() && req.frame() === page.mainFrame()) {
                if (normalizeUrl(req.url()) !== guard.home) {
                    guard.attempts++;
                    log(`Blocked navigation to ${req.url()}`);
                    return route.abort();
                }
            }
        } catch { }
        return route.continue();
    });

    context.on("page", async (p) => {
        if (guard.on || guard.allowNav) {
            guard.tabs++;
            await p.waitForLoadState("domcontentloaded", { timeout: 8000 }).catch(() => { });
            guard.lastTab = p.url();
            log(`New tab opened by the site (${p.url()}) -> closing it`);
            await p.close().catch(() => { });
        }
    });
}

// --------------------------------------------------
// Dropdown pass: open every dropdown on the page one by one, pick an option,
// and make sure the URL never changes. Logs every movement.
// --------------------------------------------------
async function scanDropdowns(page) {
    return page.evaluate(() => {
        document.querySelectorAll("[data-dd]").forEach((e) => e.removeAttribute("data-dd"));

        const sels = [
            "select",
            '[role="combobox"]',
            '[aria-haspopup="listbox"]',
            '[class*="dropdown" i]',
            '[class*="select" i]',
        ].join(",");

        const out = [];
        for (const el of document.querySelectorAll(sels)) {
            if (el.closest("header, nav, footer, [role='navigation']")) continue;

            const isSelect = el.tagName === "SELECT";
            if (!isSelect && el.matches("input, textarea, button[type='submit']")) {
                if (el.getAttribute("role") !== "combobox") continue;
            }

            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            if (r.width < 40 || r.height < 16) continue;
            if (cs.visibility === "hidden" || cs.display === "none" || cs.pointerEvents === "none") continue;
            if (!isSelect && (r.width > 700 || r.height > 120)) continue;
            if (!isSelect && el.querySelector("a[href]")) continue; // menu of links
            if (out.some((o) => o.el.contains(el) || el.contains(o.el))) continue;

            const firstLine = ((el.innerText || "").split("\n").map((t) => t.trim()).filter(Boolean)[0]) || "";
            const label = (firstLine || el.getAttribute("aria-label") || el.getAttribute("name") || "")
                .replace(/\s+/g, " ").slice(0, 40);
            if (!isSelect && label.length > 60) continue;

            const idx = out.length;
            el.setAttribute("data-dd", String(idx));
            out.push({
                el,
                idx,
                kind: isSelect ? "select" : "custom",
                label,
                sig: `${isSelect ? "s" : "c"}|${Math.round(r.x / 25)}|${Math.round((r.y + window.scrollY) / 25)}`,
            });
        }
        return out.map(({ idx, kind, label, sig }) => ({ idx, kind, label, sig }));
    });
}

// Find a visible option near an opened dropdown
async function pickOption(page, ddBox, loc) {
    const groups = [
        loc.locator('[role="option"], li'),
        loc.locator("xpath=following-sibling::*[1]").locator('[role="option"], li'),
        page.getByRole("option"),
        page.locator('[role="listbox"] li'),
        page.locator(
            'ul[class*="dropdown" i] > li, ul[class*="option" i] > li, ul[class*="menu" i] > li, ul[class*="list" i] > li'
        ),
        page.locator('div[class*="option" i], li[class*="option" i]'),
    ];

    for (const g of groups) {
        const n = Math.min(await g.count().catch(() => 0), 25);
        for (let i = 0; i < n; i++) {
            const el = g.nth(i);
            if (!(await el.isVisible().catch(() => false))) continue;

            const info = await el
                .evaluate((node, box) => {
                    const r = node.getBoundingClientRect();
                    const near = !box ||
                        (r.top >= box.y - 5 && r.top <= box.y + box.height + 500 &&
                            r.left < box.x + box.width + 50 && r.right > box.x - 50);
                    return {
                        t: (node.innerText || "").trim().replace(/\s+/g, " ").slice(0, 60),
                        bad:
                            !!node.closest("header, nav, footer") ||
                            !!node.querySelector("a[href]") ||
                            node.tagName === "A" ||
                            node.getAttribute("aria-disabled") === "true" ||
                            node.hasAttribute("disabled"),
                        near,
                    };
                }, ddBox)
                .catch(() => null);

            if (!info || !info.t || info.bad || !info.near) continue;
            if (/^(select|choose|please|--|none)/i.test(info.t)) continue;
            return { el, text: info.t };
        }
    }
    return null;
}

async function dropdownPass(page, guard, log) {
    const done = new Set();
    let handled = 0;
    let skipped = 0;

    const goHomeIfMoved = async (n) => {
        if (normalizeUrl(page.url()) === guard.home) return false;
        log(`Dropdown ${n}: URL changed to ${page.url()} -> going back and skipping this dropdown`);
        skipped++;
        await page.goBack({ timeout: 15000 }).catch(() => { });
        if (normalizeUrl(page.url()) !== guard.home) {
            await page.goto(guard.homeFull, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => { });
        }
        await page.waitForTimeout(1500);
        log("Back on the original URL");
        return true;
    };

    for (let round = 0; round < MAX_DROPDOWNS; round++) {
        const found = await scanDropdowns(page).catch(() => []);
        const next = found.find((d) => !done.has(d.sig));
        if (!next) break;
        done.add(next.sig);

        const n = done.size;
        const name = next.label || "(no label)";
        const loc = page.locator(`[data-dd="${next.idx}"]`).first();

        log(`Dropdown ${n}: found "${name}" [${next.kind}]`);

        if (SENSITIVE_REGEX.test(next.label)) {
            log(`Dropdown ${n}: looks sensitive -> skipped`);
            skipped++;
            continue;
        }

        try {
            await loc.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => { });

            // ---------- native <select> ----------
            if (next.kind === "select") {
                const options = await loc.locator("option").evaluateAll((items) =>
                    items
                        .filter((o) => o.value && !o.disabled)
                        .map((o) => ({ value: o.value, text: o.textContent.trim() }))
                );
                const real = options.filter((o) => !/^(select|choose|please|--)/i.test(o.text));
                const pick = real[0] || options[0];

                if (!pick) {
                    log(`Dropdown ${n}: no options found`);
                    continue;
                }
                log(`Dropdown ${n}: choosing option "${pick.text}"`);
                await loc.selectOption(pick.value);
                await page.waitForTimeout(600);
                handled++;
                if (await goHomeIfMoved(n)) continue;
                log(`Dropdown ${n}: URL unchanged, field filled`);
                continue;
            }

            // ---------- custom dropdown ----------
            log(`Dropdown ${n}: clicking "${name}"`);
            const ddBox = await loc.boundingBox().catch(() => null);
            await smartClick(loc);
            await page.waitForTimeout(700);

            if (await goHomeIfMoved(n)) continue;
            log(`Dropdown ${n}: opened, URL unchanged`);

            const opt = await pickOption(page, ddBox, loc);

            if (opt) {
                log(`Dropdown ${n}: choosing option "${opt.text}"`);
                await smartClick(opt.el);
                await page.waitForTimeout(600);
                handled++;
            } else {
                // checkbox-style list (like the "Members" list)
                const boxes = page.locator('input[type="checkbox"]');
                const cnt = Math.min(await boxes.count().catch(() => 0), 15);
                let ticked = false;

                for (let i = 0; i < cnt && !ticked; i++) {
                    const cb = boxes.nth(i);
                    const rect = await cb.evaluate((node) => {
                        const r = node.getBoundingClientRect();
                        return { y: r.top, x: r.left, w: r.width, h: r.height, vis: r.width > 0 || !!node.closest("label") };
                    }).catch(() => null);
                    if (!rect || !rect.vis) continue;
                    if (ddBox && (rect.y < ddBox.y - 5 || rect.y > ddBox.y + ddBox.height + 500)) continue;

                    const target = cb.locator("xpath=ancestor::label[1]");
                    const useLabel = (await target.count().catch(() => 0)) > 0;
                    log(`Dropdown ${n}: ticking first checkbox option`);
                    await smartClick(useLabel ? target : cb);
                    await page.waitForTimeout(500);
                    ticked = true;
                }

                if (ticked) {
                    const confirm = await firstVisible(
                        page,
                        [page.getByRole("button", { name: /^(ok|done|apply|confirm|save)$/i })],
                        1500
                    );
                    if (confirm) {
                        log(`Dropdown ${n}: clicking OK/Done`);
                        await smartClick(confirm);
                        await page.waitForTimeout(600);
                    }
                    handled++;
                } else {
                    log(`Dropdown ${n}: no options found -> closing it`);
                    await page.keyboard.press("Escape").catch(() => { });
                    await page.waitForTimeout(300);
                }
            }

            if (await goHomeIfMoved(n)) continue;
            log(`Dropdown ${n}: URL unchanged`);

            // a site alert/popup may appear after a selection
            await clearPopups(page).catch(() => { });
        } catch (err) {
            log(`Dropdown ${n}: error (${String(err.message).split("\n")[0]}) -> skipped`);
            skipped++;
            await page.keyboard.press("Escape").catch(() => { });
        }
    }

    log(`Dropdown pass finished: ${handled} filled, ${skipped} skipped`);
    return { handled, skipped };
}


// --------------------------------------------------
// Nav-bar pass + hidden-form (quote button) pass
//  - click each nav item / quote button
//  - if it tries to leave the URL -> cancelled, move on to the next item
//  - if it stays and NEW fields appear -> fill them until a sensitive field
//    and save an element screenshot of that form
// --------------------------------------------------
async function scanNav(page) {
    return page.evaluate(() => {
        document.querySelectorAll("[data-nav]").forEach((e) => e.removeAttribute("data-nav"));
        const roots = document.querySelectorAll("header, nav, [role='navigation']");
        const seen = new Set();
        const out = [];

        roots.forEach((root) => {
            root
                .querySelectorAll("a, button, [role='menuitem'], [role='button'], [aria-haspopup], [aria-expanded]")
                .forEach((el) => {
                    const r = el.getBoundingClientRect();
                    const cs = getComputedStyle(el);
                    if (r.width < 20 || r.height < 12 || cs.visibility === "hidden" || cs.display === "none") return;
                    if (r.top + window.scrollY > 400) return; // top bar only

                    const text = (
                        (el.innerText || el.getAttribute("aria-label") || "")
                            .split("\n").map((t) => t.trim()).filter(Boolean)[0] || ""
                    ).slice(0, 40);
                    if (text.length < 2) return;
                    if (/log ?out|sign ?out/i.test(text)) return;
                    if (/^(submit|pay\b|payment|confirm|delete|cancel|subscribe|download|place order)/i.test(text)) return;
                    if (/^[\d\s\-+()]{6,}$/.test(text)) return;                 // phone numbers
                    const href = (el.getAttribute("href") || "").trim().toLowerCase();
                    if (/^(tel:|mailto:|javascript:|whatsapp:|sms:)/.test(href)) return;

                    const key = text.toLowerCase();
                    if (seen.has(key)) return;
                    if (out.some((o) => o.el.contains(el) || el.contains(o.el))) return;

                    seen.add(key);
                    const idx = out.length;
                    el.setAttribute("data-nav", String(idx));
                    out.push({ el, idx, text });
                });
        });

        return out.map(({ idx, text }) => ({ idx, text }));
    });
}

async function scanCtas(page, ctaSource, avoidSource) {
    return page.evaluate(({ ctaSource, avoidSource }) => {
        const cta = new RegExp(ctaSource, "i");
        const avoid = new RegExp(avoidSource, "i");
        document.querySelectorAll("[data-cta]").forEach((e) => e.removeAttribute("data-cta"));

        const seen = new Set();
        const out = [];
        document.querySelectorAll("button, a, [role='button']").forEach((el) => {
            if (el.closest("header, nav, footer, [role='navigation']")) return;
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            if (r.width < 30 || r.height < 16 || cs.visibility === "hidden" || cs.display === "none") return;
            if (r.top + window.scrollY > 2500) return;

            const text = ((el.innerText || el.getAttribute("aria-label") || "")
                .split("\n").map((t) => t.trim()).filter(Boolean)[0] || "").slice(0, 40);
            if (text.length < 3 || !cta.test(text) || avoid.test(text)) return;

            const key = text.toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);

            const idx = out.length;
            el.setAttribute("data-cta", String(idx));
            out.push({ idx, text });
        });
        return out;
    }, { ctaSource, avoidSource });
}

// Keys of all visible form fields; optionally marks fields not in `before`
async function fieldKeys(page, before = null, mark = false) {
    return page.evaluate(({ before, mark }) => {
        const known = new Set(before || []);
        document.querySelectorAll("[data-newf]").forEach((e) => e.removeAttribute("data-newf"));
        const out = [];

        document.querySelectorAll("input, select, textarea").forEach((el) => {
            const type = (el.type || "").toLowerCase();
            if (["hidden", "submit", "button", "image", "checkbox", "radio"].includes(type)) return;
            if (el.closest("footer")) return;
            if (type === "search" || /search/i.test([el.name, el.id, el.placeholder, el.getAttribute("aria-label"), el.getAttribute("role")].join(" "))) return;
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            if (r.width < 5 || r.height < 5 || cs.visibility === "hidden" || cs.display === "none") return;

            const key = [el.tagName, type, el.name, el.id, el.placeholder,
                Math.round(r.x / 20), Math.round((r.y + window.scrollY) / 20)].join("|");
            out.push(key);
            if (mark && !known.has(key)) el.setAttribute("data-newf", "1");
        });
        return out;
    }, { before, mark });
}

// Largest ancestor (up to ~900x1000) around a field = the form / card / modal
async function findCardContainer(locator) {
    try {
        const handle = await locator.evaluateHandle((n) => {
            let el = n;
            let best = null;
            while (el && el !== document.body && el !== document.documentElement) {
                const r = el.getBoundingClientRect();
                if (r.width <= 900 && r.height <= 1000 && r.width >= 200) best = el;
                else if (r.width > 900 || r.height > 1000) break;
                el = el.parentElement;
            }
            return best;
        });
        return handle.asElement();
    } catch {
        return null;
    }
}

// Save a LAYOUT screenshot showing the form around `anchor` in its page
async function saveRevealedShot(page, anchor, label, state, record) {
    const container = await findCardContainer(anchor);
    if (!container) {
        record(`Element screenshot skipped for "${label}" (could not find the form area)`);
        return;
    }
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "form";
    const filename = `element-${state.ts}-${state.shots.length + 1}-${slug}.png`;

    try {
        if (state.prep) await state.prep();
        await captureElementShot(page, container, path.join(screenshotDir, filename));
        state.shots.push({ label, url: `/screenshots/${filename}` });
        record(`Element (layout) screenshot saved: ${label}`, { filename });
    } catch (err) {
        record(`Element screenshot failed for "${label}": ${String(err.message).split("\n")[0]}`);
    }
}

// Fill ordinary fields and follow Continue/Next until a sensitive field shows up
async function fillAndAdvance(page, guard, stats, record) {
    let sensitive = null;

    for (let step = 0; step < MAX_STEPS; step++) {
        const closed = await clearPopups(page).catch(() => 0);
        stats.interactions += closed;
        stats.popupsHandled += closed;
        if (closed) record(`Closed ${closed} popup(s)`);

        sensitive = await findSensitiveField(page);
        if (sensitive) break;

        stats.fieldsFilled += await fillVisibleFields(page, (m) => record(m));

        sensitive = await findSensitiveField(page);
        if (sensitive) break;

        // Only ordinary Continue/Next buttons; never final submit/purchase
        const nextButton = page
            .getByRole("button", { name: /^(continue|next|continue to next step|next step)$/i })
            .first();

        const canClick =
            (await nextButton.isVisible().catch(() => false)) &&
            (await nextButton.isEnabled().catch(() => false));
        if (!canClick) break;

        try {
            await nextButton.click({ timeout: 2500 });
            stats.interactions++;
            stats.stepsVisited++;
            record("Continue/Next clicked", { step: stats.stepsVisited });
            await page.waitForTimeout(1200);

            if (normalizeUrl(page.url()) !== guard.home) {
                record(`URL changed to ${page.url()} -> going back and stopping`);
                await page.goBack({ timeout: 15000 }).catch(() => { });
                break;
            }
        } catch {
            record("Continue/Next could not be completed", { step: stats.stepsVisited });
            break;
        }
    }

    if (!sensitive) sensitive = await findSensitiveField(page);
    return { sensitive };
}

async function closePanel(page) {
    await page.keyboard.press("Escape").catch(() => { });
    await page.waitForTimeout(300);
    await clearPopups(page).catch(() => { });
    await page.mouse.move(5, 5).catch(() => { });
    await page.waitForTimeout(300);
}

// Did new fields appear? If so: fill them (until sensitive) + layout screenshot.
async function revealCheck({ page, guard, state, stats, record, before, label }) {
    await fieldKeys(page, before, true);
    const newFields = page.locator('[data-newf="1"]');
    const newCount = await newFields.count().catch(() => 0);
    if (newCount === 0) return false;

    record(`${label}: ${newCount} new field(s) appeared, URL unchanged -> filling`);
    const anchorHandle = await newFields.first().elementHandle().catch(() => null);

    const { sensitive } = await fillAndAdvance(page, guard, stats, record);

    if (sensitive) {
        record(`${label}: sensitive field "${sensitive.label}" reached -> stopped for this form`);
        if (state.keys.has(sensitive.label)) {
            record(`${label}: same form already captured, no new screenshot`);
            return true;
        }
        state.keys.add(sensitive.label);
        await saveRevealedShot(page, sensitive.locator, label, state, record);
    } else if (anchorHandle && (await anchorHandle.isVisible().catch(() => false))) {
        await saveRevealedShot(page, page.locator('[data-newf="1"]').first(), label, state, record);
    } else {
        record(`${label}: form closed itself, no screenshot`);
    }
    return true;
}

// Text of a "you are blocked" page (Access Denied, captcha...), or null
async function isBlockedPage(page) {
    return page
        .evaluate(() => {
            const text = ((document.title || "") + " " + ((document.body && document.body.innerText) || "").slice(0, 600));
            const m = text.match(
                /access denied|request blocked|403 forbidden|you don't have permission|are you a robot|captcha|unusual traffic|temporarily blocked|pardon our interruption/i
            );
            return m ? m[0] : null;
        })
        .catch(() => null);
}

// Back to the original URL. Uses "Back" first (no new request when the browser
// has the page cached), waits a little between visits so the site is not
// hammered, and stops the run if the site starts blocking.
async function returnHome(page, guard, record) {
    await page.waitForTimeout(1200 + Math.floor(Math.random() * 1000));

    if (normalizeUrl(page.url()) !== guard.home) {
        await page.goBack({ waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => { });
    }
    if (normalizeUrl(page.url()) !== guard.home) {
        await page.goto(guard.homeFull, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => { });
    }

    await page.waitForTimeout(1500);
    await clearPopups(page).catch(() => { });

    const blocked = await isBlockedPage(page);
    if (blocked) {
        guard.blocked = true;
        record(`The site is blocking the scan ("${blocked}") -> stopping page visits`);
        return;
    }
    record("Back on the original URL");
}

// Quote-style buttons that reveal hidden forms
async function explorePass({ page, kind, title, maxItems, scan, guard, state, stats, record }) {
    const done = new Set();

    for (let i = 0; i < maxItems; i++) {
        if (guard.blocked) return;
        const items = await scan().catch(() => []);
        const next = items.find((x) => !done.has(x.text.toLowerCase()));
        if (!next) break;
        done.add(next.text.toLowerCase());

        const n = done.size;
        const loc = page.locator(`[data-${kind}="${next.idx}"]`).first();
        record(`${title} ${n}: "${next.text}" - clicking`);

        const before = await fieldKeys(page);
        const attemptsBefore = guard.attempts;

        await smartClick(loc);
        stats.interactions++;
        await page.waitForTimeout(1000);

        if (normalizeUrl(page.url()) !== guard.home) {
            record(`${title} ${n}: URL changed to ${page.url()} -> going back, moving to next`);
            await returnHome(page, guard, record);
            continue;
        }
        if (guard.attempts > attemptsBefore) {
            record(`${title} ${n}: "${next.text}" would open another page -> cancelled, moving to next`);
            continue;
        }

        const handled = await revealCheck({
            page, guard, state, stats, record, before, label: `${title}: ${next.text}`,
        });
        if (!handled) record(`${title} ${n}: opened, URL unchanged, no fields found`);

        await closePanel(page);
    }
}

// All visible links on the page, as "text|href" keys
async function visibleAnchorKeys(page) {
    return page.evaluate(() => {
        const out = [];
        document.querySelectorAll("a[href]").forEach((a) => {
            const r = a.getBoundingClientRect();
            const cs = getComputedStyle(a);
            if (r.width < 5 || r.height < 5 || cs.visibility === "hidden" || cs.display === "none") return;
            out.push(((a.innerText || "").trim().slice(0, 60)) + "|" + a.href);
        });
        return out;
    });
}

// Links that became visible after a click (= the opened menu's links)
async function newMenuLinks(page, before, homeKey, maxLinks) {
    return page.evaluate(({ before, homeKey, maxLinks }) => {
        const known = new Set(before);
        const seen = new Set();
        const out = [];
        const norm = (u) => {
            try {
                const x = new URL(u);
                return x.origin + x.pathname.replace(/\/$/, "") + x.search;
            } catch { return u; }
        };

        document.querySelectorAll("a[href]").forEach((a) => {
            if (out.length >= maxLinks) return;
            if (a.closest("footer")) return;
            const r = a.getBoundingClientRect();
            const cs = getComputedStyle(a);
            if (r.width < 5 || r.height < 5 || cs.visibility === "hidden" || cs.display === "none") return;

            const text = (a.innerText || a.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 60);
            const key = text + "|" + a.href;
            if (known.has(key)) return;
            if (text.length < 2) return;

            const href = a.href;
            if (!/^https?:/i.test(href)) return;               // skip mailto:, tel:, javascript:
            if (norm(href) === homeKey) return;                 // same page (hash links etc.)
            if (seen.has(href)) return;
            seen.add(href);

            out.push({ text, href });
        });
        return out;
    }, { before, homeKey, maxLinks });
}

// Mark the visible link with this href so it can be clicked
async function markMenuLink(page, href) {
    return page.evaluate((href) => {
        document.querySelectorAll("[data-sub]").forEach((e) => e.removeAttribute("data-sub"));
        for (const a of document.querySelectorAll("a[href]")) {
            if (a.href !== href) continue;
            const r = a.getBoundingClientRect();
            const cs = getComputedStyle(a);
            if (r.width < 5 || r.height < 5 || cs.visibility === "hidden" || cs.display === "none") continue;
            a.setAttribute("data-sub", "1");
            return true;
        }
        return false;
    }, href);
}

// --------------------------------------------------
// Nav bar, deep pass (hover menus):
//   1. HOVER each top nav item (Products, Claims, Support...) so its
//      dropdown opens (falls back to a click if hover shows nothing)
//   2. click EVERY link inside that dropdown, one by one
//   3. after each click check whether the URL changed (it normally does),
//      write it to the log, go back to the original URL, hover the same
//      dropdown again and continue with the next link
// Navigation is ALLOWED during this pass (guard.allowNav = true).
// --------------------------------------------------

// Move the mouse onto an element (like a real user) so hover menus open
async function hoverOpen(page, loc) {
    const box = await loc.boundingBox().catch(() => null);
    if (!box) return null;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(5, 5).catch(() => { });
    await page.mouse.move(cx, cy, { steps: 8 }).catch(() => { });
    await page.waitForTimeout(900);
    return { cx, cy };
}

// Glide from the nav item to the link (keeps the hover menu open), then click
async function moveAndClick(page, from, locator) {
    const b = await locator.boundingBox().catch(() => null);
    const vp = page.viewportSize() || { width: 1366, height: 900 };
    if (!b || b.y < 0 || b.y + b.height > vp.height) return smartClick(locator);

    if (from) await page.mouse.move(from.cx, from.cy).catch(() => { });
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 15 });
    await page.waitForTimeout(150);
    await page.mouse.down();
    await page.waitForTimeout(60);
    await page.mouse.up();
    return true;
}

async function navDeepPass({ page, guard, state, stats, record, navReport }) {
    const doneTop = new Set();
    let totalLinks = 0;

    // (re)open a top nav item: hover first, click if asked
    const reopenTop = async (text, mode = "hover") => {
        const items = await scanNav(page).catch(() => []);
        const it = items.find((x) => x.text.toLowerCase() === text.toLowerCase());
        if (!it) return null;
        const loc = page.locator(`[data-nav="${it.idx}"]`).first();
        if (mode === "hover") return hoverOpen(page, loc);
        const box = await loc.boundingBox().catch(() => null);
        await smartClick(loc);
        await page.waitForTimeout(900);
        return box ? { cx: box.x + box.width / 2, cy: box.y + box.height / 2 } : null;
    };

    // make sure the link is visible: marked -> hover again -> click the item
    const ensureLink = async (topText, href, topPos) => {
        if (await markMenuLink(page, href)) return topPos;
        let pos = await reopenTop(topText, "hover");
        if (await markMenuLink(page, href)) return pos || topPos;
        pos = await reopenTop(topText, "click");
        if (await markMenuLink(page, href)) return pos || topPos;
        return null;
    };

    for (let i = 0; i < MAX_NAV; i++) {
        if (guard.blocked) {
            record("Stopping nav pass: the site is blocking requests");
            return;
        }
        const items = await scanNav(page).catch(() => []);
        const next = items.find((x) => !doneTop.has(x.text.toLowerCase()));
        if (!next) break;
        doneTop.add(next.text.toLowerCase());

        const n = doneTop.size;
        const topLoc = page.locator(`[data-nav="${next.idx}"]`).first();

        try {
        const beforeLinks = await visibleAnchorKeys(page);
        const beforeFields = await fieldKeys(page);
        const tabsBefore = guard.tabs;

        // ---- 1) hover the nav item ----
        record(`Nav ${n}: "${next.text}" - hovering`);
        let topPos = await hoverOpen(page, topLoc);
        let subs = await newMenuLinks(page, beforeLinks, guard.home, MAX_SUB);

        // ---- 2) nothing opened on hover -> click it ----
        if (!subs.length) {
            record(`Nav ${n}: "${next.text}" - nothing on hover, clicking`);
            await smartClick(topLoc);
            stats.interactions++;
            await page.waitForTimeout(1200);

            if (normalizeUrl(page.url()) !== guard.home) {
                const newUrl = page.url();
                record(`Nav ${n}: URL changed to ${newUrl}`);
                navReport.push({ menu: next.text, item: next.text, result: "URL changed", url: newUrl });
                await returnHome(page, guard, record);
                continue;
            }
            if (guard.tabs > tabsBefore) {
                record(`Nav ${n}: opened a new tab (${guard.lastTab}) -> closed`);
                navReport.push({ menu: next.text, item: next.text, result: "new tab", url: guard.lastTab });
                continue;
            }

            subs = await newMenuLinks(page, beforeLinks, guard.home, MAX_SUB);

            if (!subs.length) {
                const handled = await revealCheck({
                    page, guard, state, stats, record, before: beforeFields, label: `Nav: ${next.text}`,
                });
                if (!handled) record(`Nav ${n}: URL unchanged, no dropdown links or fields found`);
                navReport.push({ menu: next.text, item: next.text, result: "URL unchanged", url: page.url() });
                await closePanel(page);
                continue;
            }
        }

        record(`Nav ${n}: dropdown opened with ${subs.length} link(s), URL unchanged so far`);

        // ---- 3) click every link in the dropdown, one by one ----
        for (let j = 0; j < subs.length; j++) {
            if (guard.blocked) {
                record("Stopping nav pass: the site is blocking requests");
                return;
            }
            if (totalLinks >= MAX_NAV_LINKS) {
                record(`Nav link limit (${MAX_NAV_LINKS}) reached -> stopping nav pass`);
                return;
            }
            totalLinks++;
            const sub = subs[j];
            const tag = `Nav ${n}.${j + 1}`;

            try {

            const pos = await ensureLink(next.text, sub.href, topPos);
            if (!pos && !(await markMenuLink(page, sub.href))) {
                record(`${tag}: "${sub.text}" not visible any more -> skipped`);
                continue;
            }
            topPos = pos || topPos;

            record(`${tag}: "${sub.text}" - clicking`);
            const tabs = guard.tabs;
            const fieldsBefore = await fieldKeys(page);

            await moveAndClick(page, topPos, page.locator('[data-sub="1"]').first());
            stats.interactions++;
            await page.waitForTimeout(1500);

            if (normalizeUrl(page.url()) !== guard.home) {
                const newUrl = page.url();
                record(`${tag}: URL changed to ${newUrl}`);
                navReport.push({ menu: next.text, item: sub.text, result: "URL changed", url: newUrl });
                await returnHome(page, guard, record);
                record(`Nav ${n}: hovering "${next.text}" again`);
                topPos = (await reopenTop(next.text, "hover")) || topPos;
                continue;
            }

            if (guard.tabs > tabs) {
                record(`${tag}: opened a new tab (${guard.lastTab}) -> closed`);
                navReport.push({ menu: next.text, item: sub.text, result: "new tab", url: guard.lastTab });
                continue;
            }

            record(`${tag}: URL unchanged`);
            navReport.push({ menu: next.text, item: sub.text, result: "URL unchanged", url: page.url() });

            const handled = await revealCheck({
                page, guard, state, stats, record, before: fieldsBefore, label: `Nav: ${sub.text}`,
            });
            if (handled) {
                await closePanel(page);
                topPos = (await reopenTop(next.text, "hover")) || topPos;
            }
            } catch (err) {
                // the click started a real navigation while we were still reading the page
                record(`${tag}: page changed during the click -> checking the URL`);
                await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => { });
                if (normalizeUrl(page.url()) !== guard.home) {
                    record(`${tag}: URL changed to ${page.url()}`);
                    navReport.push({ menu: next.text, item: sub.text, result: "URL changed", url: page.url() });
                }
                await returnHome(page, guard, record);
                topPos = (await reopenTop(next.text, "hover").catch(() => null)) || topPos;
            }
        }

        await closePanel(page);
        } catch (err) {
            record(`Nav ${n}: page changed during the click -> checking the URL`);
            await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => { });
            if (normalizeUrl(page.url()) !== guard.home) {
                record(`Nav ${n}: URL changed to ${page.url()}`);
                navReport.push({ menu: next.text, item: next.text, result: "URL changed", url: page.url() });
            }
            await returnHome(page, guard, record);
        }
    }
}

// Run a phase; if the page navigates/crashes mid-way, log it, get back to the
// original URL and carry on with the next phase instead of failing the run.
async function safePhase(name, fn, page, guard, record, fallback = null) {
    try {
        return await fn();
    } catch (e) {
        record(`${name} stopped early: ${String(e.message).split("\n")[0]}`);
        await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => { });
        if (normalizeUrl(page.url()) !== guard.home) {
            await returnHome(page, guard, record);
        }
        return fallback;
    }
}

// --------------------------------------------------
// Aditya Birla quote flow (stops when the phone field is reached)
//   Members dropdown -> tick Self -> OK -> Get free quote
//   -> age -> Continue -> Contact details (email optional, mobile)
// Never types into the mobile field.
// --------------------------------------------------
async function runQuoteFlowUntilPhone(page, log, prep = null) {
    let fieldsFilled = 0;
    let stepsVisited = 1;

    await clearPopups(page).catch(() => { });

    // Screenshot 1: full page BEFORE any field is touched
    await clearPopupsSettled(page).catch(() => { });
    await scrollToLoadContent(page).catch(() => { });
    await clearPopupsSettled(page).catch(() => { });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(700);

    const ts = Date.now();
    const fullFilename = `full-${ts}.png`;
    if (prep) await prep();
    await takeFullPage(page, path.join(screenshotDir, fullFilename), log, { beforeTile: () => clearPopups(page) });
    log("Captured full-page screenshot (before filling anything)");

    // Make sure we're at the top so the hero widget is in place
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);

    // Step 1: open the "Members" dropdown.
    // "Open" = any of Self / Spouse / Son / Daughter is visible.
    const isOpen = async () =>
        (await page
            .getByText(/^(self|spouse|son|daughter)$/i)
            .filter({ visible: true })
            .count()
            .catch(() => 0)) > 0;

    // Real mouse click with hover + press delay (works on custom dropdowns)
    const mouseClick = async (el) => {
        await el.evaluate((n) => n.scrollIntoView({ block: "center" })).catch(() => { });
        await page.waitForTimeout(300);
        const box = await el.boundingBox().catch(() => null);
        if (!box) return false;
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;
        await page.mouse.move(x, y, { steps: 5 });
        await page.waitForTimeout(150);
        await page.mouse.down();
        await page.waitForTimeout(80);
        await page.mouse.up();
        await page.waitForTimeout(800);
        return true;
    };

    const memberCandidates = [
        page.getByText(/^members$/i),
        page.locator('[placeholder*="member" i], [aria-label*="member" i]'),
        page.getByText(/members/i),
    ];

    let opened = await isOpen();

    for (const group of memberCandidates) {
        if (opened) break;
        const count = await group.count().catch(() => 0);

        for (let i = 0; i < count && !opened; i++) {
            const el = group.nth(i);
            if (!(await el.isVisible().catch(() => false))) continue;

            // element itself, then parent, then grandparent (stop as soon as open)
            const targets = [el, el.locator(".."), el.locator("../..")];
            for (const t of targets) {
                if (await isOpen()) { opened = true; break; }
                await mouseClick(t);
                if (await isOpen()) { opened = true; break; }
                // fallback: DOM click
                await t.evaluate((n) => n.click()).catch(() => { });
                await page.waitForTimeout(600);
                if (await isOpen()) { opened = true; break; }
            }
        }
    }

    if (!opened) {
        await page
            .screenshot({ path: path.join(screenshotDir, `debug-members-${Date.now()}.png`) })
            .catch(() => { });

        // Dump the HTML around "Members" so the selector can be fixed
        const html = await page
            .getByText(/^members$/i)
            .first()
            .evaluate((n) => {
                let el = n;
                for (let i = 0; i < 3 && el.parentElement; i++) el = el.parentElement;
                return el.outerHTML.slice(0, 2500);
            })
            .catch(() => "no element with text 'Members' found");

        log("Members dropdown did not open (see debug screenshot)");
        log("DEBUG HTML: " + html);
        return { success: false, fieldsFilled, stepsVisited };
    }
    log("Opened Members dropdown");

    // Step 2 + 3: tick "Self" (verified), click OK, and handle the site's
    // "Please select at least one members" alert by retrying.
    const alertLocator = page.getByText(/please select at least one/i).filter({ visible: true });

    const isSelfChecked = () =>
        page
            .evaluate(() => {
                const leaves = [...document.querySelectorAll("*")].filter(
                    (e) => e.children.length === 0 && /^\s*self\s*$/i.test(e.textContent || "") && e.offsetParent !== null
                );
                for (const leaf of leaves) {
                    let n = leaf;
                    for (let i = 0; i < 4 && n; i++) {
                        const cb = n.querySelector && n.querySelector('input[type="checkbox"]');
                        if (cb) {
                            return cb.checked || cb.getAttribute("aria-checked") === "true";
                        }
                        n = n.parentElement;
                    }
                }
                return null; // unknown
            })
            .catch(() => null);

    const selfText = () => page.getByText(/^self$/i).filter({ visible: true }).first();

    const selfStrategies = [
        async () => {
            await page.getByRole("checkbox", { name: /^self$/i }).first().check({ force: true, timeout: 2000 });
        },
        async () => {
            await mouseClick(page.locator("label").filter({ hasText: /^\s*self\s*$/i }).filter({ visible: true }).first());
        },
        async () => {
            await mouseClick(selfText());
        },
        async () => {
            // checkbox square sits just left of the label text
            const box = await selfText().boundingBox();
            if (box) {
                await page.mouse.click(box.x - 20, box.y + box.height / 2);
                await page.waitForTimeout(500);
            }
        },
        async () => {
            await selfText().evaluate((n) => {
                let el = n;
                for (let i = 0; i < 4 && el; i++) {
                    const cb = el.querySelector && el.querySelector('input[type="checkbox"]');
                    if (cb) { cb.click(); return; }
                    el = el.parentElement;
                }
            });
        },
    ];

    let membersDone = false;

    for (let attempt = 0; attempt < 3 && !membersDone; attempt++) {
        // make sure the list is open
        if (!(await isOpen())) {
            const m = page.getByText(/^members$/i).filter({ visible: true }).first();
            await mouseClick(m);
        }

        // tick Self; stop once it reports checked (or after all strategies)
        for (let k = 0; k < selfStrategies.length; k++) {
            const idx = (k + attempt) % selfStrategies.length;
            try { await selfStrategies[idx](); } catch { }
            await page.waitForTimeout(400);
            const checked = await isSelfChecked();
            if (checked === true) { log("Selected Self (verified)"); break; }
            if (checked === null && k === 0 && attempt === 0) { /* unknown state: keep trying only if alert appears */ break; }
            if (checked === false) continue;
        }

        // click the list's OK button
        const ok = await firstVisible(
            page,
            [page.getByRole("button", { name: /^ok$/i }), page.getByText(/^ok$/i).filter({ visible: true })],
            3000
        );
        if (ok) {
            await smartClick(ok);
            await page.waitForTimeout(800);
            log("Clicked OK");
        }

        // did the site complain?
        if (await alertLocator.first().isVisible().catch(() => false)) {
            log("Site alert: please select at least one member -> retrying");
            const alertOk = page
                .locator("div")
                .filter({ hasText: /please select at least one/i })
                .last()
                .getByText(/^ok$/i)
                .first();
            await smartClick(alertOk);
            await page.waitForTimeout(600);
        } else {
            membersDone = true;
        }
    }

    if (!membersDone) {
        await page
            .screenshot({ path: path.join(screenshotDir, `debug-self-${Date.now()}.png`) })
            .catch(() => { });
        const html = await page
            .getByText(/^self$/i)
            .first()
            .evaluate((n) => {
                let el = n;
                for (let i = 0; i < 3 && el.parentElement; i++) el = el.parentElement;
                return el.outerHTML.slice(0, 2500);
            })
            .catch(() => "no Self element found");
        log("Could not select Self (see debug-self screenshot)");
        log("DEBUG HTML: " + html);
        return { success: false, fieldsFilled, stepsVisited };
    }
    fieldsFilled++;

    // Step 3: Get free quote
    const quote = await firstVisible(page, [
        page.getByRole("button", { name: /get free quote/i }),
        page.getByText(/get free quote/i),
    ]);
    if (!quote) {
        log("Get free quote button not found");
        return { success: false, fieldsFilled, stepsVisited };
    }
    await smartClick(quote);
    stepsVisited++;
    log("Clicked Get free quote");

    // Step 4: age ("Personal details" step)
    await page
        .getByText(/my age is/i)
        .filter({ visible: true })
        .first()
        .waitFor({ state: "visible", timeout: 10000 })
        .catch(() => { });
    await page.waitForTimeout(600);

    const age = await firstVisible(page, [
        page.locator('input[placeholder*="age" i], input[name*="age" i], input[aria-label*="age" i], input[id*="age" i]'),
        page.getByText(/my age is/i).locator("xpath=following::input[1]"),
        page
            .locator('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="button"])')
            .filter({ visible: true }),
        page.locator("select").filter({ visible: true }),
    ], 8000);

    if (!age) {
        const html = await page
            .getByText(/my age is/i)
            .first()
            .evaluate((n) => {
                let el = n;
                for (let i = 0; i < 3 && el.parentElement; i++) el = el.parentElement;
                return el.outerHTML.slice(0, 2500);
            })
            .catch(() => "no 'My Age is' text found");
        await page
            .screenshot({ path: path.join(screenshotDir, `debug-age-${Date.now()}.png`) })
            .catch(() => { });
        log("Age field not found (see debug-age screenshot)");
        log("DEBUG HTML: " + html);
        return { success: false, fieldsFilled, stepsVisited };
    }

    const ageTag = await age.evaluate((n) => n.tagName.toLowerCase()).catch(() => "input");
    if (ageTag === "select") {
        const opts = await age.locator("option").evaluateAll((os) =>
            os.filter((o) => o.value && !o.disabled).map((o) => o.value)
        );
        if (opts.length) await age.selectOption(opts[0]).catch(() => { });
    } else {
        // type like a real user (custom inputs often ignore fill())
        await smartClick(age);
        await page.keyboard.press("Control+A").catch(() => { });
        await page.keyboard.press("Backspace").catch(() => { });
        await page.keyboard.type("30", { delay: 80 });
        await page.waitForTimeout(400);
    }
    fieldsFilled++;
    log("Entered age 30");

    const cont = await firstVisible(page, [
        page.getByRole("button", { name: /^continue$/i }),
        page.getByText(/^continue$/i),
    ]);
    if (cont) {
        await smartClick(cont);
        stepsVisited++;
        log("Clicked Continue");
    }

    // Step 5: contact details. Wait for the mobile field, do NOT type into it.
    const phone = await firstVisible(
        page,
        [
            page.getByPlaceholder(/mobile/i),
            page.getByLabel(/mobile/i),
            page.locator('input[type="tel"], input[name*="mobile" i], input[name*="phone" i]'),
            page.getByText(/mobile number/i).locator("xpath=following::input[1]"),
        ],
        15000
    );

    if (!phone) {
        log("Phone field not detected");
        return { success: false, fieldsFilled, stepsVisited };
    }

    // Optional email
    const email = await firstVisible(
        page,
        [
            page.getByPlaceholder(/email/i),
            page.getByLabel(/email/i),
            page.locator('input[type="email"], input[name*="email" i]'),
            page.getByText(/email id/i).locator("xpath=following::input[1]"),
        ],
        2000
    );
    if (email && FILL_EMAIL) {
        await email.fill("test@example.com");
        fieldsFilled++;
        log("Filled test email");
    }

    await page.waitForTimeout(500);
    log("Phone number field reached");

    // Find the white "Contact details" card: the largest ancestor of the phone
    // field that contains "Contact details" + "Proceed" but is still card-sized.
    let container = null;
    try {
        const handle = await phone.evaluateHandle((n) => {
            let el = n;
            let best = null;
            while (el && el !== document.body && el !== document.documentElement) {
                const r = el.getBoundingClientRect();
                const txt = el.innerText || "";
                const hasAll = /contact details/i.test(txt) && /proceed/i.test(txt);
                if (hasAll && r.width < 700 && r.height < 900) best = el;
                if (hasAll && r.width >= 700) break;
                el = el.parentElement;
            }
            return best;
        });
        container = handle.asElement();
    } catch { }

    if (!container) {
        const fallback = await firstVisible(
            page,
            [
                phone.locator("xpath=ancestor::form[1]"),
                phone.locator("xpath=ancestor::div[4]"),
            ],
            2000
        );
        container = fallback ? await fallback.elementHandle() : null;
    }

    // Go back to the very top so the hero banner + card are in their natural place
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(700);

    // Screenshot 2: after auto-fill, top of the page = hero banner with the
    // Contact details card inside it, cropped just below the card.
    const elementFilename = `quote-before-phone-${ts}.png`;
    const vp = page.viewportSize() || { width: 1366, height: 900 };
    let heroHeight = vp.height;

    if (container) {
        const box = await container.boundingBox().catch(() => null);
        if (box) heroHeight = Math.ceil(Math.min(box.y + box.height + 40, 1400));
    }

    if (prep) await prep();
    await page.screenshot({
        path: path.join(screenshotDir, elementFilename),
        clip: { x: 0, y: 0, width: vp.width, height: heroHeight },
        animations: "disabled",
        timeout: 30000,
    });
    log("Captured hero + contact-details screenshot");

    return {
        success: true,
        screenshotUrl: `/screenshots/${fullFilename}`,
        elementScreenshotUrl: `/screenshots/${elementFilename}`,
        fieldsFilled,
        stepsVisited,
    };
}

// --------------------------------------------------
// Main screenshot API
// --------------------------------------------------
app.post("/api/screenshot", async (req, res) => {
    const { url, selector } = req.body;
    // Stabilizer options (all optional):
    //   stabilize: false      -> do not stabilize (default: on)
    //   mask: [".chat", ...]  -> extra volatile elements to cover before screenshots
    //   maskMode: "mask" | "hide"
    //   freezeTime: true      -> fixed date + seeded random numbers
    const stabilizeOn = req.body.stabilize !== false;
    const stabilizeOptions = {
        maskSelectors: Array.isArray(req.body.mask) ? req.body.mask : [],
        ...(req.body.maskMode ? { maskMode: req.body.maskMode } : {}),
    };
    const freezeTime = req.body.freezeTime === true || stabilizerConfig.freezeTime;

    if (!url) {
        return res.status(400).json({ error: "URL is required" });
    }

    let parsedUrl;
    try {
        parsedUrl = new URL(url);
    } catch {
        return res.status(400).json({ error: "Invalid URL" });
    }

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        return res.status(400).json({ error: "Only HTTP and HTTPS URLs are supported" });
    }

    let browser;
    const stats = { interactions: 0, fieldsFilled: 0, stepsVisited: 1, popupsHandled: 0 };
    const actions = [];

    // Every movement is printed in the terminal AND returned in actionLog
    function record(action, details = {}) {
        console.log(action);
        actions.push({ action, time: new Date().toISOString(), ...details });
    }

    const navReport = [];
    const guard = {
        on: false,
        allowNav: false,
        blocked: false,
        attempts: 0,
        tabs: 0,
        lastTab: "",
        home: normalizeUrl(parsedUrl.href),
        homeFull: parsedUrl.href,
    };
    const state = { ts: Date.now(), shots: [], keys: new Set(), prep: null, stab: { enabled: stabilizeOn } };

    const scanId = `scan-${state.ts}`;
    const startedAt = new Date().toISOString();

    // Builds the scan summary (states + interactions counted one way for every
    // flow), saves it to /scans/<scanId>.json and returns it for the response.
    const finish = (status, extra = {}) => {
        const m = computeScanMetrics(actions, navReport);
        const summary = {
            scanId,
            url: parsedUrl.href,
            status,
            startedAt,
            finishedAt: new Date().toISOString(),
            durationMs: Date.now() - state.ts,
            states: m.states,
            interactions: m.interactions,
            interactionBreakdown: m.breakdown,
            fieldsFilled: stats.fieldsFilled,
            stepsVisited: stats.stepsVisited,
            popupsHandled: stats.popupsHandled,
            navLinksChecked: navReport.length,
            stabilizer: state.stab,
            ...extra,
            actionLog: actions,
        };
        try { saveScanSummary(scansDir, summary); } catch { }
        return summary;
    };

    try {
        // Set headless: false and slowMo: 300 to watch it run while debugging
        browser = await chromium.launch({ headless: true });

        const context = await browser.newContext({
            viewport: { width: 1366, height: 900 },
            deviceScaleFactor: 1,
            userAgent: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${browser.version()} Safari/537.36`,
            locale: "en-IN",
            timezoneId: "Asia/Kolkata",
        });

        if (stabilizeOn && freezeTime) {
            await installDeterministicEnvironment(context);
            state.stab.freezeTime = true;
        }

        const page = await context.newPage();

        // Make the page hold still before every screenshot (animations off,
        // volatile elements masked, wait until the page stops changing)
        state.prep = async () => {
            if (!stabilizeOn) return;
            try {
                const info = await stabilizePage(page, stabilizeOptions, (m) => record(m));
                state.stab = { ...state.stab, ...info };
            } catch (e) {
                record(`Stabilizer skipped: ${String(e.message).split("\n")[0]}`);
            }
        };

        await setupNavigationGuard(page, context, guard, (m) => record(m));

        // Dismiss JS alert/confirm/prompt dialogs
        page.on("dialog", async (dialog) => {
            try {
                const msg = dialog.message();
                const type = dialog.type();
                await dialog.dismiss();
                if (type === "beforeunload") {
                    guard.attempts++;
                    record("Page tried to navigate away -> cancelled, staying on this URL");
                } else {
                    stats.interactions++;
                    stats.popupsHandled++;
                    record(`JavaScript dialog dismissed: "${msg}"`, { type });
                }
            } catch { }
        });

        record(`Opening ${parsedUrl.href}`);

        // The first page load. If the site cuts the connection (what bot protection
        // usually does), try once more, then report "blocked" instead of "failed".
        let loadError = null;
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                await page.goto(parsedUrl.href, { waitUntil: "domcontentloaded", timeout: 60000 });
                loadError = null;
                break;
            } catch (e) {
                loadError = e;
                if (!CONNECTION_BLOCK_ERRORS.test(e.message) || attempt === 2) break;
                record(`First page load failed (${errorCode(e)}) -> trying once more`);
                await page.waitForTimeout(3000);
            }
        }

        if (loadError) {
            if (!CONNECTION_BLOCK_ERRORS.test(loadError.message)) throw loadError;

            record(`The site closed the connection (${errorCode(loadError)}) -> it is blocking automated browsers. Nothing to scan.`);
            await browser.close();
            browser = null;
            return res.json(finish("blocked", {
                message: "The site closed the connection before the page loaded. This is how bot protection usually blocks automated browsers.",
                errorCode: errorCode(loadError),
                screenshotUrl: null,
                elementScreenshotUrl: null,
                elementScreenshots: [],
            }));
        }
        await page.waitForTimeout(2500);

        const blockedAtStart = await isBlockedPage(page);
        if (blockedAtStart) {
            record(`The site refused the first page load ("${blockedAtStart}") -> nothing to scan. Try https:// in the URL, or ask the site owner to allow your IP.`);
            await browser.close();
            browser = null;
            return res.json(finish("blocked", {
                message: "The site blocked the scan on the first page load",
                screenshotUrl: null,
                elementScreenshotUrl: null,
                elementScreenshots: [],
            }));
        }

        // ---------- Aditya Birla quote flow ----------
        if (parsedUrl.hostname.includes("adityabirlahealthinsurance.com")) {
            const quoteResult = await runQuoteFlowUntilPhone(page, (m) => record(m), state.prep);

            if (quoteResult.success) {
                // evidence crop for the requested selector (if any)
                let selectorCropUrl = null;
                const cropFile = `evidence-${state.ts}.png`;
                await state.prep();
                if (await captureSelectorCrop(page, selector, path.join(screenshotDir, cropFile), (m) => record(m))) {
                    selectorCropUrl = `/screenshots/${cropFile}`;
                }

                await browser.close();
                browser = null;

                return res.json(finish("completed", {
                    message: "Quote flow completed up to the phone number field",
                    screenshotUrl: quoteResult.screenshotUrl,
                    elementScreenshotUrl: quoteResult.elementScreenshotUrl,
                    elementScreenshots: [{ label: "main (phone step layout)", url: quoteResult.elementScreenshotUrl }],
                    selectorCropUrl,
                    stoppedBeforePhone: true,
                }));
            }

            record("Quote flow did not reach phone field; using generic flow");
            await page.goto(parsedUrl.href, { waitUntil: "domcontentloaded", timeout: 60000 });
            await page.waitForTimeout(2000);
        }

        // ---------- Generic flow for any other site ----------
        record(`Loaded URL: ${page.url()}`);
        record(`Page title: ${await page.title()}`);

        // 1) Clear popups, fully load the page, then FULL-PAGE screenshot
        //    before touching anything.
        // wait for an automatic popup to open, cancel it, then load the whole page
        stats.popupsHandled += await waitAndDismissPopups(page, record);
        await scrollToLoadContent(page);
        record("Page fully loaded (lazy content scrolled in)");
        // popups can also open while scrolling
        stats.popupsHandled += await waitAndDismissPopups(page, record, { waitMs: 4000, minWaitMs: 1500 });
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(700);

        const fullFilename = `full-${state.ts}.png`;
        await state.prep();
        await takeFullPage(page, path.join(screenshotDir, fullFilename), (m) => record(m), {
            // a popup that opens while the page is being captured is cancelled first
            beforeTile: async () => {
                await clearPopups(page);
                await dismissOverlays(page, record);
            },
        });
        record("Full-page screenshot saved (before any interaction)", { filename: fullFilename });

        // 2) From now on the browser must stay on this URL
        guard.home = normalizeUrl(page.url());
        guard.homeFull = page.url();
        guard.on = true;
        await page.evaluate(() => { window.__navGuard = true; }).catch(() => { });
        record("Navigation guard ON - staying on this URL");

        // 3) Nav bar: click every top item, then every link inside its menu.
        //    The URL normally changes -> log it, go back, continue.
        //    (navigation is allowed during this pass only)
        await page.evaluate(() => window.scrollTo(0, 0));
        guard.allowNav = true;
        await page.evaluate(() => { window.__navGuard = false; }).catch(() => { });
        await safePhase("Nav pass", () => navDeepPass({ page, guard, state, stats, record, navReport }), page, guard, record);
        guard.allowNav = false;
        await page.evaluate(() => { window.__navGuard = true; }).catch(() => { });
        record(`Nav bar pass finished: ${navReport.length} link(s) checked`);

        if (guard.blocked) {
            record("Waiting 20 seconds, then trying the page once more...");
            await page.waitForTimeout(20000);
            await page.goto(guard.homeFull, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => { });
            await page.waitForTimeout(2500);

            const still = await isBlockedPage(page);
            if (still) {
                record(`Still blocked ("${still}") -> finishing with what was captured before the block`);
                await browser.close();
                browser = null;
                return res.json(finish("blocked", {
                    message: "The site started blocking the scan during the nav pass. The full-page screenshot and the nav results above were captured before that.",
                    screenshotUrl: `/screenshots/${fullFilename}`,
                    elementScreenshotUrl: state.shots[0] ? state.shots[0].url : null,
                    elementScreenshots: state.shots,
                    navigationCheck: navReport,
                }));
            }
            guard.blocked = false;
            record("Access restored -> continuing");
            await clearPopupsSettled(page);
        }

        // 4) Open every form-style dropdown on the page and fill it
        await page.evaluate(() => window.scrollTo(0, 0));
        const dd = await safePhase("Dropdown pass", () => dropdownPass(page, guard, (m) => record(m)), page, guard, record, { handled: 0, skipped: 0 });
        stats.interactions += dd.handled;
        stats.fieldsFilled += dd.handled;

        // 5) Click quote-style buttons that reveal hidden forms
        await page.evaluate(() => window.scrollTo(0, 0));
        await safePhase("Quote button pass", () => explorePass({
            page, kind: "cta", title: "Quote button", maxItems: MAX_CTAS,
            scan: () => scanCtas(page, CTA_REGEX.source, AVOID_REGEX.source),
            guard, state, stats, record,
        }), page, guard, record);
        record("Quote button pass finished");

        // 6) Fill whatever is on the page now and follow Continue/Next,
        //    stopping at the first sensitive field.
        const { sensitive } = await fillAndAdvance(page, guard, stats, record);
        stats.popupsHandled += await clearPopups(page).catch(() => 0);

        if (sensitive) {
            record(`Sensitive field reached: "${sensitive.label}" -> stopped before entering anything`);
            if (!state.keys.has(sensitive.label)) {
                state.keys.add(sensitive.label);

                // main element shot: top of page down to the form (like the Aditya Birla one)
                const container = await findCardContainer(sensitive.locator);
                const mainFile = `element-${state.ts}-main.png`;
                await state.prep();
                await captureElementShot(page, container, path.join(screenshotDir, mainFile));
                state.shots.unshift({ label: "main (sensitive field area)", url: `/screenshots/${mainFile}` });
                record("Element screenshot saved (at the sensitive field)", { filename: mainFile });
            }
        }

        // Fallback: nothing revealed -> screenshot the selector / main / body
        let elementSelector = selector || "main";
        if (!state.shots.length) {
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.waitForTimeout(500);

            // Nothing was revealed: the element screenshot is the layout of the top of
            // the page (the full page is already saved separately)
            const fallbackFile = `element-${state.ts}.png`;
            elementSelector = "top of page";
            await state.prep();
            await captureElementShot(page, null, path.join(screenshotDir, fallbackFile));
            state.shots.push({ label: elementSelector, url: `/screenshots/${fallbackFile}` });
            record("Element screenshot saved (layout of the top of the page)", { filename: fallbackFile });
        }

        // evidence crop for the requested selector (if any)
        let selectorCropUrl = null;
        const cropFile = `evidence-${state.ts}.png`;
        await state.prep();
        if (await captureSelectorCrop(page, selector, path.join(screenshotDir, cropFile), (m) => record(m))) {
            selectorCropUrl = `/screenshots/${cropFile}`;
        }

        guard.on = false;
        await browser.close();
        browser = null;

        return res.json(finish("completed", {
            message: "Done",
            screenshotUrl: `/screenshots/${fullFilename}`,
            elementScreenshotUrl: state.shots[0].url,
            elementScreenshots: state.shots,
            selectorCropUrl,
            stoppedBeforeSensitiveField: !!sensitive || state.keys.size > 0,
            sensitiveField: sensitive ? sensitive.label : null,
            dropdowns: dd,
            navigationCheck: navReport,
        }));
    } catch (error) {
        console.error("Audit failed:", error.message);

        return res.status(500).json(finish("failed", {
            error: "Screenshot automation failed",
            details: error.message,
            elementScreenshots: state.shots,
            navigationCheck: navReport,
        }));
    } finally {
        if (browser) {
            await browser.close().catch(() => { });
        }
    }
});

// --------------------------------------------------
// Scan history: how many scans ran, and the states / interactions of each
// --------------------------------------------------
// --------------------------------------------------
// State script runner
//   POST /api/script
//   body: {
//     "url": "https://...",            (or "url" inside the script)
//     "script": { "name": "...", "steps": [ ... ] }   (an object, a JSON string or YAML text)
//     "maxStates": 10,                 (optional state cap)
//     "stabilize": false,              (optional, default on)
//     "mask": [".chat"]                (optional volatile elements to cover)
//   }
// Runs the steps (click, type, wait, capture) on ONE page and saves every
// captured state in order. A failed step is logged with its reason; the run
// carries on. The scan is saved like every other scan (see /api/scans).
// --------------------------------------------------
app.post("/api/script", async (req, res) => {
    const body = req.body || {};
    const scriptInput = body.script !== undefined ? body.script : body.steps ? body : undefined;

    if (scriptInput === undefined) {
        return res.status(400).json({ error: 'Send a "script" with a list of "steps".' });
    }

    let parsed;
    try {
        parsed = parseScript(scriptInput, stateScriptConfig);
    } catch (e) {
        if (e instanceof ScriptError) return res.status(400).json({ error: e.message });
        throw e;
    }

    const url = body.url || parsed.url;
    let parsedUrl;
    try {
        parsedUrl = new URL(url);
    } catch {
        return res.status(400).json({ error: 'Send the page address as "url" (in the request or in the script).' });
    }
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        return res.status(400).json({ error: "Only HTTP and HTTPS URLs are supported" });
    }

    const ts = Date.now();
    const scanId = `scan-${ts}`;
    const startedAt = new Date().toISOString();
    const actions = [];
    const record = (action, details = {}) => {
        console.log(action);
        actions.push({ action, time: new Date().toISOString(), ...details });
    };

    const summarize = (status, extra = {}) => {
        const summary = {
            scanId,
            type: "script",
            url: parsedUrl.href,
            scriptName: parsed.name,
            status,
            startedAt,
            finishedAt: new Date().toISOString(),
            durationMs: Date.now() - ts,
            ...extra,
            actionLog: actions,
        };
        try { saveScanSummary(scansDir, summary); } catch { }
        return summary;
    };

    let browser;
    try {
        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({
            viewport: { width: 1366, height: 900 },
            deviceScaleFactor: 1,
            userAgent: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${browser.version()} Safari/537.36`,
            locale: "en-IN",
            timezoneId: "Asia/Kolkata",
        });
        const page = await context.newPage();

        // JavaScript alerts/confirms are dismissed and logged
        page.on("dialog", async (dialog) => {
            try {
                record(`JavaScript dialog dismissed: "${dialog.message()}"`);
                await dialog.dismiss();
            } catch { }
        });

        // ---- open the page ----
        record(`Opening ${parsedUrl.href}`);
        try {
            await page.goto(parsedUrl.href, { waitUntil: "domcontentloaded", timeout: 60000 });
        } catch (e) {
            if (!CONNECTION_BLOCK_ERRORS.test(e.message)) throw e;
            record(`The site closed the connection (${errorCode(e)}) -> it is blocking automated browsers. Nothing to run.`);
            await browser.close();
            browser = null;
            return res.json(summarize("blocked", {
                message: "The site closed the connection before the page loaded.",
                errorCode: errorCode(e),
                capturedStates: [],
                counts: { steps: parsed.steps.length, ok: 0, failed: 0, skipped: parsed.steps.length, statesCaptured: 0, statesSkipped: 0, interactions: 0 },
                states: 0,
                interactions: 0,
            }));
        }
        await page.waitForTimeout(1500);

        const blockedText = await isBlockedPage(page);
        if (blockedText) {
            record(`The site is blocking the scan ("${blockedText}") -> nothing to run`);
            await browser.close();
            browser = null;
            return res.json(summarize("blocked", {
                message: "The site answered with a block page.",
                capturedStates: [],
                counts: { steps: parsed.steps.length, ok: 0, failed: 0, skipped: parsed.steps.length, statesCaptured: 0, statesSkipped: 0, interactions: 0 },
                states: 0,
                interactions: 0,
            }));
        }

        // popups that open by themselves would sit on top of every state
        await waitAndDismissPopups(page, record, { waitMs: 4000, minWaitMs: 1500 });

        // ---- keep every state steady (animations off, volatile parts masked) ----
        const stabilizeOn = body.stabilize !== false;
        const prep = stabilizeOn
            ? async () => {
                try {
                    await stabilizePage(
                        page,
                        { maskSelectors: Array.isArray(body.mask) ? body.mask : [] },
                        (m) => record(m)
                    );
                } catch (e) {
                    record(`Stabilizer skipped: ${String(e.message).split("\n")[0]}`);
                }
            }
            : null;

        // ---- run the script ----
        const result = await runStateScript(page, parsed, {
            maxStates: body.maxStates,
            outDir: screenshotDir,
            filePrefix: `state-${scanId}`,
            fileUrl: (file) => `/screenshots/${file}`,
            prep,
            log: (m) => record(m),
        });

        await browser.close();
        browser = null;

        return res.json(summarize(result.status, {
            // same two numbers as every other scan: states captured, interactions done
            states: result.counts.statesCaptured,
            interactions: result.counts.interactions,
            stateCap: result.stateCap,
            capped: result.capped,
            capturedStates: result.states,
            skippedStates: result.skippedStates,
            warnings: result.warnings,
            counts: result.counts,
            steps: result.steps,
        }));
    } catch (error) {
        console.error("Script run failed:", error.message);
        return res.status(500).json(summarize("failed", {
            error: "State script run failed",
            details: error.message,
            capturedStates: [],
            states: 0,
            interactions: 0,
        }));
    } finally {
        if (browser) await browser.close().catch(() => { });
    }
});

// --------------------------------------------------
// Compare two screenshots from the screenshots folder.
//   GET /api/compare?a=full-111.png&b=full-222.png[&threshold=0.01]
// --------------------------------------------------
app.get("/api/compare", async (req, res) => {
    const { a, b } = req.query;
    const safe = /^[\w.-]+\.png$/;

    if (!safe.test(String(a || "")) || !safe.test(String(b || ""))) {
        return res.status(400).json({ error: "Give two screenshot file names, for example ?a=full-1.png&b=full-2.png" });
    }

    const fileA = path.join(screenshotDir, a);
    const fileB = path.join(screenshotDir, b);
    if (!fs.existsSync(fileA) || !fs.existsSync(fileB)) {
        return res.status(404).json({ error: "Screenshot not found" });
    }

    const options = {};
    if (req.query.threshold !== undefined) {
        const t = Number(req.query.threshold);
        if (!Number.isFinite(t) || t < 0 || t > 1) {
            return res.status(400).json({ error: "threshold must be a number between 0 and 1" });
        }
        options.threshold = t;
    }

    try {
        const diffName = `diff-${Date.now()}.png`;
        const result = await compareImages(fileA, fileB, { ...options, diffPath: path.join(screenshotDir, diffName) });
        res.json({ a, b, ...result, diffPath: undefined, diffUrl: `/screenshots/${diffName}` });
    } catch (err) {
        res.status(500).json({ error: "Comparison failed", details: err.message });
    }
});

app.get("/api/scans", (req, res) => {
    const scans = listScans(scansDir);
    res.json({
        totalScans: scans.length,
        totalStates: scans.reduce((n, x) => n + (x.states || 0), 0),
        totalInteractions: scans.reduce((n, x) => n + (x.interactions || 0), 0),
        scans,
    });
});

app.get("/api/scans/:id", (req, res) => {
    const scan = readScan(scansDir, req.params.id);
    if (!scan) return res.status(404).json({ error: "Scan not found" });
    res.json(scan);
});

app.listen(PORT, () => {
    console.log(`Backend running at http://localhost:${PORT}`);
});