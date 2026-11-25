// --------------------------------------------------
// DOM and style capture (E2-02)
//
// For every state the engine saves:
//   1. the DOM snapshot: the page as it is NOW, after JavaScript has run, with the time it was taken
//   2. the computed size, colour and visibility of the elements, each with a selector
//      that finds that element again, so a finding can point to it
//
//   captureDom(page, { dir, baseName })            saves the DOM snapshot
//   captureStyles(page, { selectors })             reads the styles of elements (not saved)
//   captureElementStyle(page, selector)            one element, or null if there is none
//   captureState(page, { name, index, dir, ... })  both, saved as files, for one state
//
// All numbers come from domCapture.config.js
// --------------------------------------------------

const fs = require("fs");
const path = require("path");
const defaults = require("./DOMcapture.config");

const firstLine = (text) => String(text || "").split("\n")[0].trim();

function slug(text, maxLength = 40) {
    return (
        String(text || "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, maxLength) || "state"
    );
}

// ---------------------------------------------------------------------------
// Runs INSIDE the page. It must not use anything from outside this function.
// ---------------------------------------------------------------------------
function inPageCollect({ queries, maxElements, maxPerSelector, maxText, props }) {
    const esc = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/[^\w-]/g, "\\$&"));
    const unique = (sel) => {
        try {
            return document.querySelectorAll(sel).length === 1;
        } catch {
            return false;
        }
    };
    const round = (n) => Math.round(n * 100) / 100;

    // a selector that finds exactly this element again
    const selectorFor = (el) => {
        if (el.id) {
            const byId = "#" + esc(el.id);
            if (unique(byId)) return byId;
        }
        for (const attr of ["data-testid", "data-test", "data-qa"]) {
            const v = el.getAttribute(attr);
            if (v) {
                const sel = "[" + attr + '="' + v.replace(/"/g, '\\"') + '"]';
                if (unique(sel)) return sel;
            }
        }
        // otherwise the path from the nearest element with a unique id (or from <html>)
        const parts = [];
        for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
            if (node === document.documentElement) {
                parts.unshift("html");
                break;
            }
            if (node.id) {
                const s = "#" + esc(node.id);
                if (unique(s)) {
                    parts.unshift(s);
                    break;
                }
            }
            let part = node.tagName.toLowerCase();
            const parent = node.parentElement;
            if (parent) {
                const same = Array.prototype.filter.call(parent.children, (c) => c.tagName === node.tagName);
                if (same.length > 1) part += ":nth-of-type(" + (same.indexOf(node) + 1) + ")";
            }
            parts.unshift(part);
        }
        return parts.join(" > ");
    };

    const alpha = (color) => {
        const m = String(color).match(/rgba?\(([^)]+)\)/);
        if (!m) return 1;
        const p = m[1].split(/[,\s/]+/).filter(Boolean);
        return p.length >= 4 ? parseFloat(p[3]) : 1;
    };
    // the colour a visitor actually sees behind the element: the first ancestor that is not see-through
    const effectiveBackground = (el) => {
        for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
            const bg = getComputedStyle(n).backgroundColor;
            if (alpha(bg) > 0) return bg;
        }
        return "rgb(255, 255, 255)"; // the page itself
    };

    const describe = (el) => {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        const opacity = parseFloat(cs.opacity);

        let hiddenBecause = null;
        if (cs.display === "none") hiddenBecause = "display:none";
        else if (cs.visibility === "hidden" || cs.visibility === "collapse") hiddenBecause = "visibility:" + cs.visibility;
        else if (opacity === 0) hiddenBecause = "opacity:0";
        else if (r.width <= 0 || r.height <= 0) hiddenBecause = "zero size";

        const text = (el.innerText || el.value || el.getAttribute("aria-label") || el.alt || "").replace(/\s+/g, " ").trim();
        const computed = { width: cs.width, height: cs.height };
        props.forEach((p) => { computed[p] = cs[p]; });

        const selector = selectorFor(el);
        return {
            selector,
            selectorUnique: unique(selector),
            tag: el.tagName.toLowerCase(),
            id: el.id || null,
            classes: Array.prototype.slice.call(el.classList, 0, 10),
            text: text.slice(0, maxText),
            size: { width: round(r.width), height: round(r.height) },
            position: { x: round(r.left + window.scrollX), y: round(r.top + window.scrollY) },
            colour: {
                color: cs.color,
                backgroundColor: cs.backgroundColor,
                effectiveBackgroundColor: effectiveBackground(el),
            },
            visibility: {
                visible: hiddenBecause === null,
                reason: hiddenBecause,
                display: cs.display,
                visibility: cs.visibility,
                opacity: cs.opacity,
                inViewport: r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth,
            },
            computed,
        };
    };

    const seen = new Set();
    const elements = [];
    const report = [];
    let truncated = false;

    for (const query of queries) {
        let nodes;
        try {
            nodes = Array.prototype.slice.call(document.querySelectorAll(query));
        } catch (e) {
            report.push({ query, matched: 0, error: "not a valid selector" });
            continue;
        }
        report.push({ query, matched: nodes.length, error: null });

        let taken = 0;
        for (const el of nodes) {
            if (seen.has(el)) continue;
            if (taken >= maxPerSelector) break;
            if (elements.length >= maxElements) {
                truncated = true;
                break;
            }
            seen.add(el);
            taken++;
            elements.push(describe(el));
        }
    }

    return {
        elements,
        queries: report,
        truncated,
        title: document.title || "",
    };
}

// ---------------------------------------------------------------------------
// 1. DOM snapshot writer — disabled
// ---------------------------------------------------------------------------
// Returns the same saved:false shape callers already handle. It does not read the page or write a file.
async function captureDom(page, options = {}) {
    // Legacy writer is disabled. Return before any page read or filesystem write.
    // There is no environment flag that turns this back on.
    const when = options.now instanceof Date ? options.now : new Date();
    return {
        saved: false,
        timestamp: when.toISOString(),
        capturedAtMs: when.getTime(),
        pageUrl: null,
        title: "",
        elementCount: 0,
        scriptsRemoved: 0,
        dataUrisShortened: 0,
        bytes: 0,
        file: null,
        path: null,
        reason: "disabled",
    };
}


// ---------------------------------------------------------------------------
// 2. computed size, colour and visibility, with a selector for each element (criterion 2)
// ---------------------------------------------------------------------------
//   options.selectors        CSS selectors to read (a text or a list)
//   options.includeDefaults  also read the default elements (default: only when no selectors are given)
async function captureStyles(page, options = {}) {
    const cfg = { ...defaults, ...options };
    const when = options.now instanceof Date ? options.now : new Date();

    const asked = options.selectors === undefined || options.selectors === null ? [] : [].concat(options.selectors).filter((s) => typeof s === "string" && s.trim());
    const queries = asked.slice();
    if (options.includeDefaults === true || (options.includeDefaults === undefined && queries.length === 0)) queries.push(cfg.defaultSelectors);

    const found = await page.evaluate(inPageCollect, {
        queries,
        maxElements: cfg.maxElements,
        maxPerSelector: cfg.maxPerSelector,
        maxText: cfg.maxTextLength,
        props: cfg.styleProperties,
    });

    return {
        timestamp: when.toISOString(),
        pageUrl: page.url(),
        title: found.title,
        viewport: page.viewportSize(),
        queries: found.queries,
        elements: found.elements,
        truncated: found.truncated,
    };
}

// One element, by selector: its size, colour and visibility. null when nothing matches.
async function captureElementStyle(page, selector, options = {}) {
    const styles = await captureStyles(page, { ...options, selectors: [selector], includeDefaults: false, maxPerSelector: 1 });
    return styles.elements[0] || null;
}

// ---------------------------------------------------------------------------
// Combined state writer — disabled
// ---------------------------------------------------------------------------
// Returns saved:false for both the DOM and the styles. It does not read the page or write a file.
async function captureState(page, options = {}) {
    // Legacy writer is disabled. Return before any page read or filesystem write.
    // There is no environment flag that turns this back on.
    const now = new Date();
    const index = options.index || 1;
    const name = String(options.name || `state ${index}`);
    const timestamp = now.toISOString();
    const disabledDom = {
        saved: false,
        file: null,
        url: null,
        timestamp,
        bytes: 0,
        elementCount: 0,
        reason: "disabled",
    };
    const disabledStyles = {
        saved: false,
        file: null,
        url: null,
        timestamp,
        elements: 0,
        truncated: false,
        queries: [],
        reason: "disabled",
    };
    return { name, index, timestamp, url: null, dom: disabledDom, styles: disabledStyles };

}

module.exports = { captureDom, captureStyles, captureElementStyle, captureState };
