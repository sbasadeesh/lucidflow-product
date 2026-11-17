// Settings for capture.render (E2-01).
// All numbers and defaults live here, not in the code.

module.exports = {
    timeoutMs: 30000,        // a page that has not loaded after this long stops the scan with a timeout message
    waitUntil: "load",       // the page counts as loaded at the browser "load" event (scripts and images done)
    networkIdleMs: 8000,     // then wait up to this long for the network to go quiet (best effort, never an error)
    readyStateWaitMs: 5000,  // the defined condition: document.readyState === "complete"
    settleMs: 1500,          // short pause so scripts that render after "load" have drawn the page

    viewport: { width: 1366, height: 900 }, // fixed, so every scan sees the same layout
    deviceScaleFactor: 1,
    locale: "en-IN",
    timezoneId: "Asia/Kolkata",
    userAgent: null,         // null = a normal Chrome user agent built from the installed browser version
    headless: true,          // false to watch it run while debugging
};