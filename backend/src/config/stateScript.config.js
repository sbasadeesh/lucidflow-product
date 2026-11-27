// Settings for the state script runner.
// All numbers, limits and defaults live here, not in the code.

module.exports = {
    // --- state cap ------------------------------------------------------
    maxStates: 10,       // default cap: extra "capture" steps are skipped with a warning
    hardMaxStates: 50,   // a script or request can raise the cap, but never above this

    // --- script size ----------------------------------------------------
    maxSteps: 100,       // longest script accepted

    // --- timing ---------------------------------------------------------
    stepTimeoutMs: 3000, // how long a step waits for its element before it fails
    maxWaitMs: 10000,    // longest "wait" or step timeout a script may ask for
    settleMs: 400,       // pause after a click or typing so the page can react
    typeDelayMs: 30,     // gap between keys when a step types key by key
    hoverMs: 600,        // pause after a hover so a dropdown menu can open

    // --- behaviour ------------------------------------------------------
    stopOnFail: false,   // false: a failed step is logged and the script goes on
    stayOnPage: true,    // a click that leaves the page is undone (back to the start URL)
    captureMode: "viewport", // "viewport" or "fullPage" (a capture step can override it)

    // --- safety ---------------------------------------------------------
    // "type" steps never type into fields that look like these
    sensitivePattern:
        "(mobile|phone|\\btel\\b|contact\\s?(no|number)|\\botp\\b|one[\\s-]?time|vehicle|registration|reg\\.?\\s?(no|number)|number\\s?plate|licen[cs]e|\\bpan\\b|aadhaar|aadhar|card\\s?number|\\bcvv\\b|\\bcvc\\b|expiry|password|passcode|account\\s?(no|number)|\\bifsc\\b|\\bssn\\b|passport|chassis|engine\\s?(no|number))",

    // --- names ----------------------------------------------------------
    nameMaxLength: 40,   // longest state name used in file names
};