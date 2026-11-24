// --------------------------------------------------
// Overlay recurrence observer (PROPOSED contract, see
// docs/overlay-recurrence-observation.md). Pure: no browser, no I/O.
//
//   const o = createOverlayObserver({ windowMs, maxTracked, clock, phase })
//   o.noteDismissed(signature, { method, context })  // confirmed close_control / escape only
//   o.noteVisible(signature, { context })            // the dismissal scan saw it visible again
//   o.poll(visibleSignatures, { context })           // on an existing loop tick
//
// "signature"/"identity" here means a MATCHING signature (structure, text hash, geometry
// bucket), not a proven identity: identical-looking overlays cannot be told apart.
//   o.end(reason)                                    // loop ended / page gone / snapshot failed
//   o.records(), o.summary(), o.hasOpen()
//
// A record is "recurred", "not_observed" or "incomplete" (with a reason).
// Records hold no overlay text, identity components or URLs.
// --------------------------------------------------

const crypto = require("crypto");

const METHODS = Object.freeze(["close_control", "escape"]);
const END_REASONS = Object.freeze(["QUIET_EXIT", "BUDGET_ENDED", "NAVIGATED", "PAGE_CLOSED", "SNAPSHOT_FAILED"]);
const IDENTITY_KEYS = Object.freeze(["tag", "role", "ariaModal", "structureHash", "textHash", "textLength", "geometry"]);

function checkIdentity(identity) {
    if (!identity || typeof identity !== "object") throw new TypeError("identity must be an object");
    for (const k of IDENTITY_KEYS) {
        if (!(k in identity)) throw new TypeError(`identity is missing "${k}"`);
    }
    return identity;
}

// All components must be equal. Identical overlays (the same element shown
// again, an identical replacement, or a distinct look-alike) cannot be told apart.
function matchIdentity(a, b) {
    if (!a || !b) return false;
    return IDENTITY_KEYS.every((k) => a[k] === b[k]);
}

function overlayIdOf(identity) {
    checkIdentity(identity);
    const canonical = JSON.stringify(IDENTITY_KEYS.map((k) => identity[k]));
    return "ov-" + crypto.createHash("sha256").update(canonical).digest("hex").slice(0, 12);
}

function createOverlayObserver({ windowMs, maxTracked = 10, clock = Date.now, phase = null } = {}) {
    if (!Number.isInteger(windowMs) || windowMs <= 0) throw new TypeError("windowMs must be a positive integer");
    if (!Number.isInteger(maxTracked) || maxTracked <= 0) throw new TypeError("maxTracked must be a positive integer");
    if (typeof clock !== "function") throw new TypeError("clock must be a function");

    const tracked = [];
    let untracked = 0;
    const iso = (ms) => new Date(ms).toISOString();

    function close(r, state, reason, now) {
        r.state = state;
        r.reason = reason;
        r.endedMs = now;
        if (state === "recurred") r.recurrenceMs = now;
    }

    return {
        noteDismissed(identity, { method, context } = {}) {
            checkIdentity(identity);
            if (!METHODS.includes(method)) return null;          // hidden fallback and anything else: not observed
            if (tracked.length >= maxTracked) { untracked++; return null; }
            const overlayId = overlayIdOf(identity);
            tracked.push({
                overlayId, method, identity, context: context === undefined ? null : String(context),
                dismissedMs: clock(), state: "open", reason: null, recurrenceMs: null, endedMs: null,
            });
            return overlayId;
        },

        // The dismissal scan saw this overlay visible (before acting on it). It can only
        // mark matching OPEN records as recurred within the window; it never sets
        // not_observed, never ends a record for another reason, and a closed record is
        // never changed again (so it cannot double-count with poll).
        noteVisible(signature, { context } = {}) {
            checkIdentity(signature);
            const now = clock();
            for (const r of tracked) {
                if (r.state !== "open") continue;
                if (context !== undefined && r.context !== null && String(context) !== r.context) continue;
                if (now - r.dismissedMs <= windowMs && matchIdentity(r.identity, signature)) close(r, "recurred", null, now);
            }
        },

        poll(visible, { context } = {}) {
            if (!Array.isArray(visible)) throw new TypeError("poll needs a list of visible overlay identities");
            const now = clock();
            for (const r of tracked) {
                if (r.state !== "open") continue;
                if (context !== undefined && r.context !== null && String(context) !== r.context) {
                    close(r, "incomplete", "NAVIGATED", now);
                    continue;
                }
                const elapsed = now - r.dismissedMs;
                if (elapsed <= windowMs && visible.some((v) => matchIdentity(r.identity, v))) {
                    close(r, "recurred", null, now);
                } else if (elapsed >= windowMs) {
                    close(r, "not_observed", null, now);
                }
            }
        },

        end(reason) {
            if (!END_REASONS.includes(reason)) throw new TypeError(`unknown end reason "${reason}"`);
            const now = clock();
            for (const r of tracked) if (r.state === "open") close(r, "incomplete", reason, now);
        },

        hasOpen() {
            return tracked.some((r) => r.state === "open");
        },

        records() {
            return tracked.map((r) => ({
                overlayId: r.overlayId,
                method: r.method,
                phase,
                state: r.state,
                reason: r.reason,
                dismissedAt: iso(r.dismissedMs),
                recurrenceObservedAt: r.recurrenceMs === null ? null : iso(r.recurrenceMs),
                observationEndedAt: r.endedMs === null ? null : iso(r.endedMs),
                observedForMs: r.endedMs === null ? null : r.endedMs - r.dismissedMs,
                windowMs,
            }));
        },

        summary() {
            const count = (s) => tracked.filter((r) => r.state === s).length;
            return {
                phase, windowMs, tracked: tracked.length, untracked,
                recurred: count("recurred"), not_observed: count("not_observed"),
                incomplete: count("incomplete"), open: count("open"),
            };
        },
    };
}

// One "[overlay-observation]" line per record plus one summary line.
function formatDiagnostics(observer) {
    const lines = observer.records().map((r) => `[overlay-observation] ${JSON.stringify(r)}`);
    lines.push(`[overlay-observation-summary] ${JSON.stringify(observer.summary())}`);
    return lines;
}

module.exports = { createOverlayObserver, matchIdentity, overlayIdOf, formatDiagnostics, METHODS, END_REASONS, IDENTITY_KEYS };
