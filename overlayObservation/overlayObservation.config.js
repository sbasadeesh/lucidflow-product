// Settings for overlay recurrence observation (PROPOSED contract,
// see docs/overlay-recurrence-observation.md).
//
// Disabled by default. When enabled it only reads the page and writes
// diagnostic lines to the engine's standard output; it never changes scan
// behaviour, outcomes, waits, responses or saved scans.
//
//   LF_OVERLAY_OBSERVATION=1                  turn observation on
//   LF_OVERLAY_OBSERVATION_WINDOW_MS=<n>      observation window (integer ms, 1..60000)
//
// CI and other test suites must NOT set these: engines they start inherit the
// environment and would then observe (and print diagnostics) too.

const DEFAULTS = Object.freeze({ enabled: false, windowMs: 3000, maxTracked: 10 });
// Upper bound for the window (proposed value). The popup loops last at most 8 s, so a
// longer window could never complete; larger or invalid values fall back to the default.
const MAX_WINDOW_MS = 60000;

function positiveInt(value, fallback) {
    if (typeof value !== "string" || !/^[1-9]\d*$/.test(value.trim())) return fallback;
    const n = Number(value.trim());
    return Number.isSafeInteger(n) && n <= MAX_WINDOW_MS ? n : fallback;
}

function resolveConfig(env = {}) {
    return {
        enabled: env.LF_OVERLAY_OBSERVATION === "1",
        windowMs: positiveInt(env.LF_OVERLAY_OBSERVATION_WINDOW_MS, DEFAULTS.windowMs),
        maxTracked: DEFAULTS.maxTracked,
    };
}

module.exports = { ...resolveConfig(process.env), resolveConfig, DEFAULTS, MAX_WINDOW_MS };
