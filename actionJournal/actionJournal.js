// --------------------------------------------------
// Action journal (proposed PR #39 recovery contract)
//
// buildActionJournal(runResult) -> [{ index, action, outcome, reason }]
//   Built from the result of stateScriptRunner.runStateScript, AFTER the run.
//   - one entry per ATTEMPTED step, in script order (skipped steps are left out)
//   - action:  click | hover | type | wait | capture, or null for a missing/unknown action
//   - outcome: "ok" only when the runner said "ok"; everything else is "failed"
//   - reason:  null for "ok", otherwise a fixed code (never the runner's message text,
//              which can contain selectors, typed text or browser error text)
// It never changes the run result and adds nothing to it.
// --------------------------------------------------

const SUPPORTED_ACTIONS = ["click", "hover", "type", "wait", "capture"];

// runner failure message (start) -> code
const REASON_CODES = [
    [/^The step has no "action"/, "MISSING_ACTION"],
    [/^Unknown action /, "UNKNOWN_ACTION"],
    [/^The step has (no|an empty) "selector"/, "MISSING_SELECTOR"],
    [/^Element not found or not visible within /, "ELEMENT_NOT_FOUND"],
    [/^Invalid selector /, "INVALID_SELECTOR"],
    [/^Click failed on /, "CLICK_FAILED"],
    [/^Hover failed on /, "HOVER_FAILED"],
    [/^The step has no "text"/, "MISSING_TEXT"],
    [/^Refused to type into /, "SENSITIVE_FIELD_REFUSED"],
    [/^Typing failed on /, "TYPE_FAILED"],
    [/^Waited \d+ms but /, "WAIT_TIMEOUT"],
    [/^A wait step needs /, "INVALID_WAIT"],
    [/^Screenshot failed/, "SCREENSHOT_FAILED"],
    [/^Unexpected error/, "UNEXPECTED_ERROR"],
];

function reasonCode(reason) {
    const text = typeof reason === "string" ? reason : "";
    for (const [pattern, code] of REASON_CODES) if (pattern.test(text)) return code;
    return "STEP_FAILED";
}

function buildActionJournal(runResult) {
    if (!runResult || typeof runResult !== "object" || !Array.isArray(runResult.steps)) {
        throw new TypeError("buildActionJournal needs a runner result with a steps list");
    }
    return runResult.steps
        .filter((s) => s && s.status !== "skipped")
        .map((s) => {
            const ok = s.status === "ok";
            return {
                index: s.index,
                action: SUPPORTED_ACTIONS.includes(s.action) ? s.action : null,
                outcome: ok ? "ok" : "failed",
                reason: ok ? null : reasonCode(s.reason),
            };
        });
}

module.exports = { buildActionJournal, SUPPORTED_ACTIONS };
