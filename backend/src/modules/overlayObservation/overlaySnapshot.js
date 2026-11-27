// --------------------------------------------------
// Read-only overlay snapshot (PROPOSED contract, see
// docs/overlay-recurrence-observation.md).
//
//   snapshotOverlays(page)      identities of the overlays visible right now
//   identifyTarget(page, idx)   identity of the element dismissOverlays tagged
//                               data-popup-target="<idx>" (or null)
//
// Candidate rules are the same as dismissOverlays in server.js. Nothing is
// clicked, typed, marked or changed. Text is hashed inside the page; only
// hashes, counts and rounded geometry are returned.
// --------------------------------------------------

// Runs in the browser. Must be self-contained (page.evaluate serialises it).
function collect({ mode, idx }) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // small non-cryptographic hash (cyrb53), hex; keeps raw text inside the page
    const hash = (str) => {
        let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
        for (let i = 0; i < str.length; i++) {
            const ch = str.charCodeAt(i);
            h1 = Math.imul(h1 ^ ch, 2654435761);
            h2 = Math.imul(h2 ^ ch, 1597334677);
        }
        h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
        h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
        return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
    };

    const isCandidate = (el) => {
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) === 0) return false;
        if (cs.position !== "fixed" && cs.position !== "absolute") return false;
        const r = el.getBoundingClientRect();
        if (r.width < 150 || r.height < 100) return false;
        const hint = (el.id + " " + (typeof el.className === "string" ? el.className : "")).toLowerCase();
        const isDialog =
            el.getAttribute("role") === "dialog" ||
            el.getAttribute("aria-modal") === "true" ||
            /modal|popup|pop-up|dialog|lightbox|overlay|interstitial/.test(hint);
        const z = parseInt(cs.zIndex, 10) || 0;
        const big = r.width * r.height >= vw * vh * 0.12;
        if (!(isDialog || (cs.position === "fixed" && z >= 100 && big))) return false;
        if (cs.position === "fixed" && r.height < 120 && r.width > vw * 0.6 && !isDialog) return false;
        if (el.querySelector("header, nav, main, footer")) return false;
        return true;
    };

    const B = 40; // geometry bucket (px)
    const identity = (el) => {
        const r = el.getBoundingClientRect();
        const tags = {};
        el.querySelectorAll("*").forEach((c) => { const t = c.tagName.toLowerCase(); tags[t] = (tags[t] || 0) + 1; });
        const classes = (typeof el.className === "string" ? el.className : "").split(/\s+/).filter(Boolean).sort();
        const structure = JSON.stringify([
            el.tagName.toLowerCase(), el.id, classes,
            Object.keys(tags).sort().map((t) => [t, tags[t]]),
            el.querySelectorAll("button, [role='button']").length,
            el.querySelectorAll("a[href]").length,
            el.querySelectorAll("input, select, textarea").length,
        ]);
        const text = (el.innerText || "").replace(/\s+/g, " ").trim().toLowerCase();
        return {
            tag: el.tagName.toLowerCase(),
            role: el.getAttribute("role") || "",
            ariaModal: el.getAttribute("aria-modal") || "",
            structureHash: hash(structure),
            textHash: hash(text),
            textLength: text.length,
            geometry: [r.left, r.top, r.width, r.height].map((v) => Math.round(v / B) * B).join(","),
        };
    };

    if (mode === "target") {
        const el = document.querySelector(`[data-popup-target="${String(idx).replace(/[^0-9]/g, "")}"]`);
        return el ? identity(el) : null;
    }

    const hits = [];
    document.querySelectorAll("body *").forEach((el) => { if (isCandidate(el)) hits.push(el); });
    return hits.filter((el) => !hits.some((o) => o !== el && o.contains(el))).map(identity);
}

async function snapshotOverlays(page) {
    return page.evaluate(collect, { mode: "all" });
}

async function identifyTarget(page, idx) {
    if (!Number.isInteger(idx) || idx < 0) throw new TypeError("idx must be a non-negative integer");
    return page.evaluate(collect, { mode: "target", idx });
}

module.exports = { snapshotOverlays, identifyTarget };
