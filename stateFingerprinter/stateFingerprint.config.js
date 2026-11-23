// Settings for the state fingerprinter (proposed PR #39 recovery contract).
// See docs/state-fingerprint-and-action-journal.md.

module.exports = {
    // Elements left out of the fingerprint: their text, form fields and overlays.
    // This is the ONLY way dynamic content (clocks, countdowns, tickers) is normalised.
    // Empty by default: nothing is ignored unless it is configured.
    ignoreSelectors: [],

    // Elements that count as an overlay when they are visible.
    // Same list as the original PR #39 fingerprinter.
    overlaySelectors: ['[role="dialog"]', '[aria-modal="true"]', ".popup", ".overlay", ".modal"],
};
