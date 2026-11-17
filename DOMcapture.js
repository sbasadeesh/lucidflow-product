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
// 1. the DOM snapshot (acceptance criterion 1)
// ---------------------------------------------------------------------------
// The DOM is the live page after JavaScript has run. It is saved as an .html file with the time it was
// taken in a comment on the first line, and the same time is returned.
// <script> elements are left out by default (stripScripts in the config), and very long data: addresses
// are shortened. The live page is never changed.
async function captureDom(page, options = {}) {
    const cfg = { ...defaults, ...options };
    const when = options.now instanceof Date ? options.now : new Date();
    const timestamp = when.toISOString();
    const pageUrl = page.url();

    const dom = await page.evaluate(({ stripScripts, maxDataUri }) => {
        const doctype = document.doctype ? new XMLSerializer().serializeToString(document.doctype) : "";

        // work on a copy, so the live page is never changed
        const root = document.documentElement.cloneNode(true);

        // scripts (tracking, tag managers, framework code) are not what a visitor sees, and they bury the elements
        let scriptsRemoved = 0;
        if (stripScripts) {
            root.querySelectorAll("script").forEach((el) => {
                el.remove();
                scriptsRemoved++;
            });
        }

        // very long data: addresses (inline images and fonts) are shortened
        let dataUrisShortened = 0;
        root.querySelectorAll("*").forEach((el) => {
            Array.prototype.slice.call(el.attributes).forEach((attr) => {
                if (/^data:/i.test(attr.value) && attr.value.length > maxDataUri) {
                    el.setAttribute(attr.name, "data:[removed " + attr.value.length + " characters]");
                    dataUrisShortened++;
                }
            });
        });

        return {
            html: doctype + "\n" + root.outerHTML,
            title: document.title || "",
            elementCount: document.getElementsByTagName("*").length, // counted on the live page
            scriptsRemoved,
            dataUrisShortened,
        };
    }, { stripScripts: cfg.stripScripts, maxDataUri: cfg.maxDataUriLength });

    const notes = `scripts removed: ${dom.scriptsRemoved}, long data: addresses shortened: ${dom.dataUrisShortened}`;
    const body = `<!-- DOM snapshot | captured at ${timestamp} | ${pageUrl} | ${notes} -->\n${dom.html}\n`;
    const bytes = Buffer.byteLength(body, "utf8");

    const result = { saved: false, timestamp, capturedAtMs: when.getTime(), pageUrl, title: dom.title, elementCount: dom.elementCount, scriptsRemoved: dom.scriptsRemoved, dataUrisShortened: dom.dataUrisShortened, bytes, file: null, path: null, reason: null };

    if (bytes > cfg.maxDomBytes) {
        // never cut a snapshot: a cut DOM would look complete and is not
        result.reason = `the DOM is ${bytes} bytes, more than the limit of ${cfg.maxDomBytes}, so it was not saved`;
        return result;
    }
    if (!options.dir) {
        result.reason = 'no "dir" given to save the DOM in';
        return result;
    }

    fs.mkdirSync(options.dir, { recursive: true });
    const file = `${options.baseName || `dom-${when.getTime()}`}.dom.html`;
    fs.writeFileSync(path.join(options.dir, file), body, "utf8");

    result.saved = true;
    result.file = file;
    result.path = path.join(options.dir, file);
    return result;
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
// both, for one state, saved as files
//   <baseName>.dom.html       the DOM snapshot, with its timestamp
//   <baseName>.styles.json    the styles of the elements, with the same timestamp and a selector per element
// ---------------------------------------------------------------------------
async function captureState(page, options = {}) {
    const cfg = { ...defaults, ...options };
    const log = options.log || (() => { });
    const now = new Date();
    const index = options.index || 1;
    const name = String(options.name || `state ${index}`);
    const baseName = `${options.filePrefix || `state-${now.getTime()}`}-${String(index).padStart(2, "0")}-${slug(name)}`;
    const fileUrl = options.fileUrl || ((file) => `/${cfg.folder}/${file}`);

    const state = { name, index, timestamp: now.toISOString(), url: page.url(), dom: null, styles: null };

    // ---- the DOM ----
    try {
        const dom = await captureDom(page, { ...cfg, dir: options.dir, baseName, now });
        state.dom = {
            saved: dom.saved,
            file: dom.file,
            url: dom.saved ? fileUrl(dom.file) : null,
            timestamp: dom.timestamp,
            bytes: dom.bytes,
            elementCount: dom.elementCount,
            scriptsRemoved: dom.scriptsRemoved,
            reason: dom.reason,
        };
        if (!dom.saved) log(`State "${name}": DOM not saved: ${dom.reason}`);
    } catch (e) {
        state.dom = { saved: false, file: null, url: null, timestamp: now.toISOString(), bytes: 0, elementCount: 0, reason: firstLine(e.message) };
        log(`State "${name}": DOM not saved: ${state.dom.reason}`);
    }

    // ---- the styles ----
    try {
        const styles = await captureStyles(page, { ...cfg, selectors: options.selectors, includeDefaults: options.includeDefaults ?? true, now });
        let file = null;
        if (options.dir) {
            fs.mkdirSync(options.dir, { recursive: true });
            file = `${baseName}.styles.json`;
            fs.writeFileSync(path.join(options.dir, file), JSON.stringify({ name, ...styles }, null, 2), "utf8");
        }
        state.styles = {
            saved: Boolean(file),
            file,
            url: file ? fileUrl(file) : null,
            timestamp: styles.timestamp,
            elements: styles.elements.length,
            truncated: styles.truncated,
            queries: styles.queries,
            reason: file ? null : 'no "dir" given to save the styles in',
        };
        if (styles.truncated) log(`State "${name}": more than ${cfg.maxElements} elements, the rest were left out of the styles file`);
    } catch (e) {
        state.styles = { saved: false, file: null, url: null, timestamp: now.toISOString(), elements: 0, truncated: false, queries: [], reason: firstLine(e.message) };
        log(`State "${name}": styles not saved: ${state.styles.reason}`);
    }

    return state;
}

module.exports = { captureDom, captureStyles, captureElementStyle, captureState };