// --------------------------------------------------
// State fingerprint (proposed PR #39 recovery contract, version 1)
//
// getStateFingerprint(page, options?) -> { version, hash, counts }
//   hash   SHA-256 of the supported DOM signals below, in document order
//   counts { textBlocks, controls, sensitiveControls, overlays } (numbers only)
//
// Supported signals (see docs/state-fingerprint-and-action-journal.md):
//   - visible text: text nodes whose parent element is visible, whitespace collapsed
//   - form fields (non-sensitive only): checkbox/radio checked state; for VISIBLE fields the
//     input/textarea value and the selected option indexes of a select
//   - visible overlays: elements matching overlaySelectors that are visible and have a size
// Never used: hidden inputs, password/tel/file values, anything inside ignoreSelectors, and
// any state of a field the runner's sensitive-field rule flags (only its presence counts).
// The result holds no page text, field values or DOM - only the hash and counts.
//
// It does not de-duplicate states, suppress screenshots or infer timers.
// --------------------------------------------------

const crypto = require("crypto");
const defaults = require("./stateFingerprint.config");
const scriptDefaults = require("../../config/stateScript.config");
const { fieldDescriptor, isSensitiveField } = require("../../capture/stateScriptRunner");

const FINGERPRINT_VERSION = 1;
const CONTROLS = "input, textarea, select";

function selectorList(value, name) {
    if (!Array.isArray(value) || value.some((s) => typeof s !== "string" || !s.trim())) {
        throw new TypeError(`${name} must be a list of non-empty CSS selectors`);
    }
    return value.join(", ");
}

// Turns a browser "not a valid selector" error into a clear one.
async function inPage(promise) {
    try {
        return await promise;
    } catch (e) {
        if (/valid selector/i.test(e.message)) {
            throw new TypeError("ignoreSelectors or overlaySelectors contains an invalid CSS selector");
        }
        throw e;
    }
}

async function getStateFingerprint(page, options = {}) {
    const ignore = selectorList(options.ignoreSelectors ?? defaults.ignoreSelectors, "ignoreSelectors");
    const overlay = selectorList(options.overlaySelectors ?? defaults.overlaySelectors, "overlaySelectors");
    const cfg = { ...scriptDefaults, ...(options.config || {}) };

    // ---- text and overlays (one call, nothing but strings comes back) ----
    const { text, overlays } = await inPage(page.evaluate(({ ignore, overlay }) => {
        // throws "... is not a valid selector" for a bad list, even on an empty page
        if (ignore) document.createDocumentFragment().querySelector(ignore);
        if (overlay) document.createDocumentFragment().querySelector(overlay);
        const ignored = (el) => !!(ignore && el.closest(ignore));
        const visible = (el) => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });

        const text = [];
        if (document.body) {
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
                const parent = node.parentElement;
                if (!parent || ignored(parent) || !visible(parent)) continue;
                const t = node.nodeValue.replace(/\s+/g, " ").trim();
                if (t) text.push(t);
            }
        }

        const overlays = [];
        if (overlay) {
            for (const el of document.querySelectorAll(overlay)) {
                if (ignored(el) || !visible(el)) continue;
                const r = el.getBoundingClientRect();
                if (r.width <= 0 || r.height <= 0) continue;
                overlays.push([el.tagName.toLowerCase(), el.getAttribute("role") || "", el.getAttribute("aria-modal") || ""].join("|"));
            }
        }
        return { text, overlays };
    }, { ignore, overlay }));

    // ---- form fields: decide "sensitive" first, read a value only when it is not ----
    const fields = page.locator(CONTROLS);
    const total = await fields.count();
    const controls = [];
    let sensitiveControls = 0;

    for (let i = 0; i < total; i++) {
        const el = fields.nth(i);
        const info = await el.evaluate(fieldDescriptor).catch(() => null);
        if (!info) continue; // the field went away
        const sensitive = isSensitiveField(info, cfg);
        if (sensitive) sensitiveControls++;

        const state = await el.evaluate((node, { ignore, expectType, includeValue }) => {
            if (ignore && node.closest(ignore)) return null;
            const tag = node.tagName.toLowerCase();
            const type = (node.type || "").toLowerCase();
            if (type !== expectType) return { kind: tag, changed: true }; // changed since it was checked: no value
            if (type === "hidden") return null;
            const kind = `${tag}:${type}`;
            const key = node.name || node.id || "";
            if (!includeValue) return { kind, key, sensitive: true }; // nothing about a sensitive field's state
            if (type === "checkbox" || type === "radio") return { kind, key, checked: node.checked };
            if (!node.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return null;
            if (["password", "tel", "file", "submit", "button", "reset", "image"].includes(type)) return { kind, key };
            if (tag === "select") {
                return { kind, key, selected: [...node.options].map((o, n) => (o.selected ? n : -1)).filter((n) => n >= 0) };
            }
            return { kind, key, value: node.value };
        }, { ignore, expectType: info.type, includeValue: !sensitive }).catch(() => null); // null: the field went away
        if (state) controls.push(state);
    }

    const hash = crypto
        .createHash("sha256")
        .update(JSON.stringify({ v: FINGERPRINT_VERSION, text, controls, overlays }))
        .digest("hex");

    return {
        version: FINGERPRINT_VERSION,
        hash,
        counts: { textBlocks: text.length, controls: controls.length, sensitiveControls, overlays: overlays.length },
    };
}

module.exports = { getStateFingerprint, FINGERPRINT_VERSION };
