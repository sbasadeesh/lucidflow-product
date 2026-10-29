// Settings for the screenshot stabilizer.
// All numbers, limits and defaults live here, not in the code.

module.exports = {
    // --- comparing two screenshots -------------------------------------
    // Largest share of pixels allowed to differ between two scans.
    // 0.005 = 0.5%. Two scans "match" when the difference is at or below this.
    threshold: 0.005,

    // A pixel only counts as different when a colour channel (0-255) differs
    // by MORE than this. Hides tiny anti-aliasing / font-smoothing noise.
    pixelTolerance: 10,

    // --- making a page hold still --------------------------------------
    disableAnimations: true, // CSS animations + transitions jump to their end state
    pauseMedia: true,        // pause <video> / <audio> and rewind to the start
    pauseCarousels: true,    // click visible "Pause" buttons of sliders, stop <marquee> tickers
    hideCaret: true,         // hide the blinking text cursor

    // --- hiding volatile elements --------------------------------------
    // "mask" = draw a solid colour box over the element (layout stays the same)
    // "hide" = hide it with a custom stylesheet (visibility: hidden)
    maskMode: "mask",
    maskColor: "#ff00ff",

    // Selectors masked on every scan. Add your own per site in the request
    // ("mask": [".chat-widget", "#ad-banner"]).
    defaultMaskSelectors: ["[data-volatile]"],

    // Extra CSS added to the page before the screenshot (optional)
    extraCss: "",

    // --- waiting until the page stops changing -------------------------
    settleIntervalMs: 150,  // gap between the two checks
    settleTimeoutMs: 3000,  // give up after this long

    // --- fixed time and random numbers (off by default) ----------------
    // Turn on for pages that print the date or random values. It can break
    // pages that depend on the real clock, so it is opt-in.
    freezeTime: false,
    fixedTime: "2026-01-01T00:00:00.000Z",
    randomSeed: 42,

    // --- diff image ----------------------------------------------------
    diffColor: { r: 255, g: 0, b: 0 },
};