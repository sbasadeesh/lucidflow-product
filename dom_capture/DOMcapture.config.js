// Settings for domCapture (E2-02).
// All numbers, limits and defaults live here, not in the code.

module.exports = {
    folder: "snapshots",          // where the DOM and style files are saved (next to server.js)

    // what is left out of the saved DOM so the file stays readable (the live page is never changed)
    stripScripts: true,           // <script> elements (tracking, tag managers, framework code) are not saved
    maxDataUriLength: 200,        // a data: address longer than this (inline image or font) is shortened

    maxDomBytes: 10 * 1024 * 1024, // a DOM bigger than this is NOT saved (it is never cut), and the reason is reported

    // elements recorded for a state when no selector is asked for: the things a visitor sees and uses
    defaultSelectors:
        "a, button, input, select, textarea, label, h1, h2, h3, img, " +
        "[role='button'], [role='dialog'], [aria-modal='true'], dialog",

    maxElements: 300,             // more elements than this: the rest are left out and "truncated" is true
    maxPerSelector: 20,           // most elements recorded for one selector
    maxTextLength: 80,            // longest element text stored

    // computed style values stored for every element, besides size, colour and visibility
    styleProperties: ["fontSize", "fontWeight", "position", "zIndex", "pointerEvents"],
};