// E2-02 DOM/style evidence PROTOTYPE: allowlisted structural/style JSON collector.
// Two gates required: LF_DOM_EVIDENCE=1 and LF_DOM_EVIDENCE_ACK=retention-unapproved-local-only.
// Not approved for production. See docs/dom-evidence.md.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { validateRecord } = require("./domEvidence.schema");
const config = require("./domEvidence.config");

// Gates
function resolveGate(env = process.env) {
    const enabled = env.LF_DOM_EVIDENCE === "1" && env.LF_DOM_EVIDENCE_ACK === "retention-unapproved-local-only";
    return { enabled, reasonCode: !enabled && env.LF_DOM_EVIDENCE === "1" ? "ACK_REQUIRED" : enabled ? null : "OFF" };
}

function startupLine(gate) {
    // Silent when disabled (both gates required): print nothing for OFF or ACK_REQUIRED
    return null;
}

// In-page collector: returns { ok, reasonCode, elements?, candidates?, ... } or { ok: false, reasonCode }
// Runs synchronously in the page; Node waits with a timeout.
function collectorScript(deadline = Date.now() + 2000) {
    const schema = require('./domEvidence.schema');
    const tagsArray = schema.HTML_TAGS.concat(['x-other']);
    const typesArray = schema.HTML_TYPES.concat(['other']);
    const rolesArray = schema.ARIA_ROLES.concat(['other']);
    
    return `
(() => {
    const deadline = ${deadline};
    const start = Date.now();
    const result = { ok: false, reasonCode: null, candidates: 0, stored: 0, invalidValues: 0, tooDeep: 0, hiddenInputs: 0, frames: 0, shadowHosts: 0 };
    // Allowlists passed from Node as JSON
    const TAGS = new Set(${JSON.stringify(tagsArray)});
    const TYPES = new Set(${JSON.stringify(typesArray)});
    const ROLES = new Set(${JSON.stringify(rolesArray)});
    const DISPLAYS = new Set(['none', 'block', 'inline', 'inline-block', 'flex', 'inline-flex', 'grid', 'inline-grid', 'table', 'table-row', 'table-cell', 'list-item', 'contents', 'flow-root']);
    const COLOR_RE = /^rgba?\\(\\d{1,3}, \\d{1,3}, \\d{1,3}(, (0|1|0?\\.\\d{1,6}))?\\)$/;
    const FONT_SIZE_RE = /^\\d{1,4}(\\.\\d{1,4})?px$/;
    
    try {
        // 1. page metadata - detect reload via multiple methods
        const getNavType = () => {
            try {
                // Try modern Navigation Timing Level 2 API
                const navEntries = performance.getEntriesByType("navigation");
                if (navEntries.length > 0) {
                    const type = navEntries[0].type;
                    if (type === "reload" || type === "back_forward") return type;
                }
            } catch { }
            // Fallback to deprecated Navigation Timing API
            try {
                if (performance.navigation) {
                    if (performance.navigation.type === 1) return "reload";
                    if (performance.navigation.type === 2) return "back_forward";
                }
            } catch { }
            // Last resort: check if navigation has recent resources (indicates reload)
            try {
                const resources = performance.getEntriesByType("resource");
                if (resources.length > 0) {
                    const now = Date.now();
                    const recentResources = resources.filter(r => now - r.startTime < 1000);
                    // If many resources were recently loaded, might indicate a reload
                    if (recentResources.length > 5) return "likely-reload";
                }
            } catch { }
            return null;
        };
        
        const href1 = location.href;
        const navType1 = getNavType();
        const viewport = { width: window.innerWidth || 1366, height: window.innerHeight || 900 };
        const scroll = { x: window.scrollX || 0, y: window.scrollY || 0 };
        const docNodeCount = document.getElementsByTagName("*").length + document.childNodes.length;
        if (docNodeCount > 50000) { result.reasonCode = "TOO_LARGE_DOCUMENT"; return result; }
        // If we detect a reload navigation, that means the page was reloaded before this script ran
        if (navType1 === "reload" || navType1 === "back_forward" || navType1 === "likely-reload") { result.reasonCode = "PAGE_CHANGED"; return result; }
        
        // 2. collect candidates
        const selector = "a, button, input, select, textarea, label, h1, h2, h3, h4, h5, h6, img, dialog, details, summary, [role]";
        const all = document.querySelectorAll(selector);
        result.candidates = all.length;
        if (all.length > 300) { result.reasonCode = "TOO_MANY_ELEMENTS"; return result; }
        
        // Count frames and shadow hosts
        let frames = document.querySelectorAll("iframe, frame").length;
        let shadowHosts = 0;
        for (const el of document.querySelectorAll("*")) {
            if (el.shadowRoot) shadowHosts++;
        }
        
        const elements = [];
        let tooDeep = 0;
        let hiddenInputs = 0;
        for (const el of all) {
            if (Date.now() > deadline) { result.reasonCode = "TIMEOUT"; return result; }
            const path = getPath(el);
            if (path === null) {
                tooDeep++;
                continue;
            }
            // Skip hidden inputs
            if (el.tagName === "INPUT" && el.type === "hidden") {
                hiddenInputs++;
                continue;
            }
            const tag = sanitizeTag(el.tagName.toLowerCase());
            const type = sanitizeType(el);
            const role = sanitizeRole(el.getAttribute("role"));
            const state = getState(el);
            const box = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            const color = sanitizeColor(cs.color);
            const display = sanitizeDisplay(cs.display);
            const fontSize = sanitizeFontSize(cs.fontSize);
            const opacity = sanitizeOpacity(cs.opacity);
            
            if (color !== cs.color || display !== cs.display || fontSize !== cs.fontSize || opacity !== cs.opacity) {
                result.invalidValues++;
            }
            
            elements.push({
                path, tag, type: type || null, role: role || null, state,
                box: { x: Math.round(box.left), y: Math.round(box.top), width: Math.round(box.width), height: Math.round(box.height) },
                visible: cs.visibility !== "hidden" && cs.opacity !== "0" && cs.display !== "none",
                style: { color, display, fontSize, opacity },
            });
        }
        
        // 3. check for page changes during collection
        const href2 = location.href;
        const navType2 = getNavType();
        if (href1 !== href2 || navType2 === "reload" || navType2 === "back_forward" || navType2 === "likely-reload") { result.reasonCode = "PAGE_CHANGED"; return result; }
        
        result.ok = true;
        result.elements = elements;
        result.tooDeep = tooDeep;
        result.hiddenInputs = hiddenInputs;
        result.frames = frames;
        result.shadowHosts = shadowHosts;
        result.capturedAt = new Date().toISOString();
        result.viewport = viewport;
        result.scroll = scroll;
        result.docNodeCount = docNodeCount;
        return result;
    } catch (e) {
        result.reasonCode = "CAPTURE_FAILED";
        return result;
    }
    
    function sanitizeTag(tag) { return TAGS.has(tag) ? tag : 'x-other'; }
    function sanitizeType(el) {
        const t = el.tagName === "INPUT" ? (el.type || "text").toLowerCase() : el.tagName === "BUTTON" ? (el.type || "button").toLowerCase() : null;
        return t && TYPES.has(t) ? t : (t ? 'other' : null);
    }
    function sanitizeRole(role) {
        const r = role ? role.toLowerCase() : null;
        return r && ROLES.has(r) ? r : (r ? 'other' : null);
    }
    function sanitizeColor(c) {
        return typeof c === "string" && COLOR_RE.test(c) ? c : null;
    }
    function sanitizeDisplay(d) {
        return typeof d === "string" && DISPLAYS.has(d) ? d : null;
    }
    function sanitizeFontSize(f) {
        return typeof f === "string" && FONT_SIZE_RE.test(f) ? f : null;
    }
    function sanitizeOpacity(o) {
        return typeof o === "string" && /^(0|1|0?\\.\\d{1,6})$/.test(o) ? o : null;
    }
    
    function getPath(el, depth = 0) {
        if (!el || el === document.body) return "html > body";
        if (el === document.documentElement) return "html";
        if (depth > 64) return null;
        const rawTag = el.tagName.toLowerCase();
        const tag = sanitizeTag(rawTag);
        let sibling = el.previousElementSibling, n = 1;
        while (sibling) { 
            const sibTag = sanitizeTag(sibling.tagName.toLowerCase());
            if (sibTag === tag) n++; 
            sibling = sibling.previousElementSibling; 
        }
        const segment = n > 1 ? \`\${tag}:nth-of-type(\${n})\` : tag;
        const parent = getPath(el.parentElement, depth + 1);
        if (parent === null) return null;
        return parent ? \`\${parent} > \${segment}\` : segment;
    }
    function getState(el) {
        return {
            checked: el.tagName === "INPUT" && el.type === "checkbox" ? el.checked : null,
            disabled: el.disabled || null,
            required: el.required || null,
            readOnly: el.readOnly || null,
            open: el.tagName === "DIALOG" ? el.open : (el.tagName === "DETAILS" ? el.open : false),
            expanded: null,
            ariaChecked: null,
            ariaDisabled: null,
            ariaHidden: null,
            ariaModal: null,
            selectedIndex: el.tagName === "SELECT" ? el.selectedIndex : null,
            multiple: el.tagName === "SELECT" ? el.multiple : null,
        };
    }
})()
    `;
}

// Node-side collection: runs the in-page collector with a timeout, validates results, and builds the record.
async function collect(page, { testHooks = {} } = {}) {
    const start = Date.now();
    const deadline = start + config.captureTimeoutMs;
    
    // Register a listener for main-frame navigation BEFORE any page changes
    let navigationObserved = false;
    const navHandler = () => {
        navigationObserved = true;
    };
    page.on("framenavigated", navHandler);
    
    // Capture baseline URL before any changes
    const urlBefore = await page.url();
    
    try {
        // Invoke test hook if provided - may cause page changes
        if (testHooks.betweenReads) await testHooks.betweenReads(page);
        
        // in-page collection with timeout
        const result = await Promise.race([
            page.evaluate(collectorScript(deadline)),
            new Promise((_, r) => setTimeout(() => r(null), config.captureTimeoutMs + 500)),
        ]);
        
        if (!result) {
            page.off("framenavigated", navHandler);
            return { ok: false, reasonCode: "TIMEOUT" };
        }
        
        // Check if URL changed during collection
        const urlAfter = await page.url();
        const urlChanged = urlBefore !== urlAfter;
        
        // If we observed navigation or URL changed, it's PAGE_CHANGED
        if (navigationObserved || urlChanged) {
            page.off("framenavigated", navHandler);
            return { ok: false, reasonCode: "PAGE_CHANGED" };
        }
        
        // The collector's internal checks for page-change-during-collection are still performed
        page.off("framenavigated", navHandler);
        return result;
    } catch (e) {
        page.off("framenavigated", navHandler);
        // If navigation was observed and an error occurred, classify as PAGE_CHANGED
        if (navigationObserved) {
            return { ok: false, reasonCode: "PAGE_CHANGED" };
        }
        // Re-throw test hook exceptions; don't swallow them
        if (e.message && e.message.includes && e.message.includes("betweenReads")) throw e;
        return { ok: false, reasonCode: "CAPTURE_FAILED" };
    }
}

function buildRecord({ scanId, seq, endpoint, link, collected }) {
    const record = {
        schemaVersion: 1,
        scanId,
        seq,
        endpoint,
        link,
        capturedAt: collected.capturedAt || new Date().toISOString(),
        durationMs: collected.durationMs || 0,
        viewport: collected.viewport || { width: 1366, height: 900 },
        scroll: collected.scroll || { x: 0, y: 0 },
        document: { width: collected.viewport?.width || 1366, height: collected.viewport?.height || 900, nodeCount: collected.docNodeCount || 0 },
        elements: [],
        counts: { candidates: collected.candidates || 0, stored: 0, invalidValues: collected.invalidValues || 0 },
        excluded: { frames: collected.frames || 0, shadowHosts: collected.shadowHosts || 0, hiddenInputs: collected.hiddenInputs || 0, tooDeep: collected.tooDeep || 0 },
    };
    
    // process elements
    if (collected.elements) {
        for (const el of collected.elements) {
            const processed = {
                path: el.path,
                tag: el.tag,
                type: el.type,
                role: el.role,
                state: el.state,
                box: el.box,
                visible: el.visible,
                hiddenReason: null,
                inViewport: false,
                style: {
                    color: el.style?.color || null,
                    backgroundColor: null,
                    effectiveBackgroundColor: null,
                    fontSize: el.style?.fontSize || null,
                    fontWeight: null,
                    opacity: el.style?.opacity || null,
                    display: el.style?.display || null,
                    visibility: null,
                    position: null,
                    zIndex: null,
                    pointerEvents: null,
                },
            };
            record.elements.push(processed);
            record.counts.stored++;
        }
    }
    
    return { record, errors: validateRecord(record) };
}

function writeEvidence({ dir, scanId, seq, content, fs: fsImpl = fs }) {
    // 1. check path safety
    if (!/^scan-\d{1,16}$/.test(scanId) || seq < 1 || seq > 999) return { ok: false, reasonCode: "UNSAFE_PATH" };
    
    // 2. ensure directory exists and is safe (not a link/junction)
    try {
        fsImpl.mkdirSync(dir, { recursive: true });
        // verify it's a directory, not a file or symlink
        const stat = fsImpl.lstatSync(dir);
        if (!stat.isDirectory()) return { ok: false, reasonCode: "UNSAFE_PATH" };
    } catch (e) {
        return { ok: false, reasonCode: "UNSAFE_PATH" };
    }
    
    const filename = `${scanId}.dom-${String(seq).padStart(3, "0")}.json`;
    const filepath = path.join(dir, filename);
    const tempname = `${filename}.partial-${process.pid}-${crypto.randomBytes(3).toString("hex")}`;
    const temppath = path.join(dir, tempname);
    
    try {
        // 3. write to temp file using injected fs: exclusive create with open/write/close
        let fd;
        try {
            fd = fsImpl.openSync(temppath, "wx");
        } catch (openErr) {
            if (openErr.code === "EEXIST") {
                return { ok: false, reasonCode: "COLLISION" };
            }
            return { ok: false, reasonCode: "WRITE_FAILED" };
        }
        
        // Encode content to UTF-8 buffer
        const buffer = Buffer.from(content, "utf8");
        let written = 0;
        
        try {
            // Write buffer in chunks, respecting partial writes
            while (written < buffer.length) {
                const bytesWritten = fsImpl.writeSync(fd, buffer, written);
                if (bytesWritten === 0) {
                    // Zero progress = write failure
                    throw Object.assign(new Error("No progress on write"), { code: "ENOSPC" });
                }
                written += bytesWritten;
            }
        } catch (writeErr) {
            // Write failed - close and clean up
            try { fsImpl.closeSync(fd); } catch { }
            try { fsImpl.unlinkSync(temppath); } catch { }
            return { ok: false, reasonCode: "WRITE_FAILED" };
        }
        
        // Close the temp file before publishing the final name
        try {
            fsImpl.closeSync(fd);
        } catch (closeErr) {
            // Close failed - clean up and report write failure
            try { fsImpl.unlinkSync(temppath); } catch { }
            return { ok: false, reasonCode: "WRITE_FAILED" };
        }
        
        // 4. check if target exists before creating link
        try {
            fsImpl.statSync(filepath);
            // File exists - collision
            try { fsImpl.unlinkSync(temppath); } catch { }
            return { ok: false, reasonCode: "COLLISION" };
        } catch (e) {
            if (e.code !== "ENOENT") throw e;
        }
        
        // 5. link to final name (atomic)
        try {
            fsImpl.linkSync(temppath, filepath);
        } catch (linkErr) {
            // linkSync failed - clean up and report write failure
            try { fsImpl.unlinkSync(temppath); } catch { }
            if (linkErr && linkErr.code === "EEXIST") {
                return { ok: false, reasonCode: "COLLISION" };
            }
            return { ok: false, reasonCode: "WRITE_FAILED" };
        }
        
        // 6. remove temp (cleanup)
        try { fsImpl.unlinkSync(temppath); } catch { }
        
        return { ok: true, file: filename, bytes: Buffer.byteLength(content, "utf8") };
    } catch (e) {
        try { fsImpl.unlinkSync(temppath); } catch { }
        // Explicitly check for specific error codes
        const errorCode = e && e.code ? e.code : null;
        if (errorCode === "EEXIST") return { ok: false, reasonCode: "COLLISION" };
        // Any other error during write is a write failure
        return { ok: false, reasonCode: "WRITE_FAILED" };
    }
}

function createSession({ scanId, dir, env = process.env, write = console.log, config: cfg = {} }) {
    const gate = resolveGate(env);
    if (!gate.enabled) return null;
    
    const cfg2 = { ...config, ...cfg };
    let seq = 0;
    const created = [];
    let pointsWritten = 0;
    
    const session = {
        async screenshotPoint(page, { label, rawOk, rawObservationIndex }) {
            if (!rawOk) return report({ status: "not_saved", reasonCode: "NO_RAW_OBSERVATION" });
            const c = await collect(page);
            if (!c.ok) return report({ status: "not_saved", reasonCode: c.reasonCode });
            
            const labels = ["full-page", "evidence-crop", "sensitive-field", "top-of-page", "quote-before-phone"];
            const link = { label: labels.includes(label) ? label : "element", rawObservationIndex };
            return captureAndWrite({ link, endpoint: "screenshot", collected: c });
        },
        
        async scriptPrepare(page, { index, step }) {
            session._pending = { page, index, step };
            const c = await collect(page);
            if (!c.ok) return session._pending = { ...session._pending, collected: c };
            session._pending.collected = c;
        },
        
        async scriptComplete({ index, step, ok }) {
            const pending = session._pending || {};
            session._pending = null;
            
            if (!ok) {
                seq++;
                return { status: "not_saved", reasonCode: "SCREENSHOT_FAILED" };
            }
            if (!pending.collected?.ok) {
                // Report the capture failure (report() uses seq+1, so we need to increment seq after)
                const r = report({ status: "not_saved", reasonCode: pending.collected?.reasonCode || "INCOMPLETE", endpoint: "script", link: { step, stateIndex: index } });
                seq++;
                return r;
            }
            
            const link = { step, stateIndex: index };
            const result = captureAndWrite({ link, endpoint: "script", collected: pending.collected });
            return result;
        },
        
        flush() {
            if (session._pending && session._pending.collected && session._pending.collected.ok) {
                const r = report({ status: "not_saved", reasonCode: "INCOMPLETE" });
                write(`[dom-evidence] ${JSON.stringify(r)}`);
            }
            session._pending = null;
        },
        
        afterSummary() {
            const summaryPath = path.join(dir, `${scanId}.json`);
            if (!fs.existsSync(summaryPath)) {
                let removed = 0, failed = 0;
                for (const file of created) {
                    try {
                        fs.unlinkSync(path.join(dir, file));
                        removed++;
                    } catch {
                        failed++;
                    }
                }
                try {
                    write(`[dom-evidence] ${JSON.stringify({ schemaVersion: 1, scanId, orphanRemoved: removed, orphanRemoveFailed: failed })}`);
                } catch (e) {
                    // Ignore write failures
                }
            }
        },
    };
    
    function report(partial) {
        const rec = { schemaVersion: 1, scanId, seq: seq + 1, endpoint: partial.endpoint, link: partial.link, ...partial };
        try {
            write(`[dom-evidence] ${JSON.stringify(rec)}`);
        } catch (e) {
            // Ignore write failures - capture should not be blocked by output
        }
        return partial;
    }
    
    function captureAndWrite({ link, endpoint, collected }) {
        if (pointsWritten >= cfg2.maxCapturePointsPerScan) {
            return report({ status: "not_saved", reasonCode: "LIMIT_REACHED", endpoint, link });
        }
        
        const { record, errors } = buildRecord({ scanId, seq: seq + 1, endpoint, link, collected });
        if (errors.length > 0) {
            return report({ status: "not_saved", reasonCode: "SCHEMA_ERROR", endpoint, link });
        }
        
        const content = JSON.stringify(record);
        if (Buffer.byteLength(content, "utf8") > cfg2.maxFileBytes) {
            return report({ status: "not_saved", reasonCode: "TOO_LARGE", endpoint, link });
        }
        
        seq++;
        const wr = writeEvidence({ dir, scanId, seq, content });
        if (!wr.ok) {
            return report({ status: "not_saved", reasonCode: wr.reasonCode, endpoint, link });
        }
        
        created.push(wr.file);
        pointsWritten++;
        const rec = {
            status: "saved",
            reasonCode: null,
            endpoint,
            link,
            file: wr.file,
            bytes: wr.bytes,
            elements: record.counts.stored,
            durationMs: collected.durationMs || 0,
        };
        try {
            write(`[dom-evidence] ${JSON.stringify({ schemaVersion: 1, scanId, seq, ...rec })}`);
        } catch { }
        return rec;
    }
    
    return session;
}

module.exports = {
    resolveGate,
    startupLine,
    collect,
    buildRecord,
    writeEvidence,
    createSession,
};
