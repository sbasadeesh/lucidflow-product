// Settings for the screenshot stabilizer.
// All numbers, limits and defaults live here, not in the code.

module.exports = {
    // --- comparing two screenshots -------------------------------------
    threshold: 0.005,
    pixelTolerance: 10,

    // --- making a page hold still --------------------------------------
    disableAnimations: true,
    pauseMedia: true,
    pauseCarousels: true,
    hideCaret: true,

    // --- hiding volatile elements --------------------------------------
    maskMode: "mask",        // "mask" | "hide" | "off"
    maskColor: "#ff00ff",
    defaultMaskSelectors: ["[data-volatile]"],
    extraCss: "",

    // --- waiting until the page stops changing -------------------------
    settleIntervalMs: 150,
    settleTimeoutMs: 3000,

    // --- fixed time and random numbers (off by default) ----------------
    freezeTime: false,
    fixedTime: "2026-01-01T00:00:00.000Z",
    randomSeed: 42,

    // --- diff image ----------------------------------------------------
    diffColor: { r: 255, g: 0, b: 0 },

    // --- [E2-04] raw observation preservation --------------------------
    // A raw (pre-stabilization) screenshot is ALWAYS saved before masking
    // or animation disabling. Stabilized evidence is a SEPARATE artifact.
    preserveRaw: true,

    // Selectors matching any of these are treated as detection signals.
    // If masking would hide one, stabilizePage returns a typed rejection
    // instead of silently producing "clean" coverage.
    detectionSignals: [
        /countdown|timer|clock|time-?left|remaining|expir/i,
        /popup|overlay|modal|banner|toast|snackbar|alert|notif/i,
        /\[data-evidence\]/,
    ],

    // Typed rejection codes
    rejectionCodes: {
        STABILIZATION_HIDES_DETECTION_SIGNAL: "STABILIZATION_HIDES_DETECTION_SIGNAL",
        STABILIZATION_SIZE_MISMATCH: "STABILIZATION_SIZE_MISMATCH",
        STABILIZATION_NOT_SETTLED: "STABILIZATION_NOT_SETTLED",
    },
};