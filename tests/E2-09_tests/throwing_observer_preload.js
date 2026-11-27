// TEST-ONLY preload (loaded with node --require into a spawned engine; never used by
// production code). It replaces the overlay observer with one whose every method
// throws, and records each call on standard output, so the engine tests can prove that
// observation failures (note, visibility note, poll, output) cannot change a scan.
const path = require("path");
const observerModule = require(path.join(__dirname, "..", "..", "overlayObservation", "overlayObserver"));

const call = (name) => process.stdout.write(`[stub-observer-call] ${name}\n`);
const boom = (name) => () => { call(name); throw new Error(`stub ${name} failure`); };

observerModule.createOverlayObserver = () => ({
    hasOpen() { call("hasOpen"); return true; },   // forces the poll path on every tick
    noteVisible: boom("noteVisible"),
    noteDismissed: boom("noteDismissed"),
    poll: boom("poll"),
    end: boom("end"),
    records: boom("records"),
    summary: boom("summary"),
});
observerModule.formatDiagnostics = boom("formatDiagnostics");
