const { stabilizePage, captureRawObservation } = require("../stabilizer/screenshotStabilizer");
const { buildRawObservationManifest } = require("../screenshotModule");
const config = require("./stateScript.config");
const path = require("path");
const { getStateFingerprint, checkForCollision } = require("../stateFingerprinter/stateFingerprinter");

// --- ADDED HELPER: Returns ISO string with IST offset (+05:30) ---
function getISTTimestamp() {
    const date = new Date();
    const istDate = new Date(date.getTime() + (5.5 * 60 * 60 * 1000));
    return istDate.toISOString().replace('Z', '+05:30');
}
// ----------------------------------------------------------------

class ScriptError extends Error {
    constructor(message, code) {
        super(message);
        this.name = "ScriptError";
        this.code = code;
    }
}

function parseYaml(yamlString) {
    // ... (keep your existing parseYaml code)
    const result = { steps: [] };
    let currentStep = null;
    yamlString.split("\n").forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) return;
        if (trimmed === "steps:") return;
        if (trimmed.startsWith("- ")) {
            if (currentStep) result.steps.push(currentStep);
            currentStep = {};
            const [key, ...val] = trimmed.substring(2).split(":");
            currentStep[key.trim()] = val.join(":").trim();
        } else if (currentStep && trimmed.includes(":")) {
            const [key, ...val] = trimmed.split(":");
            currentStep[key.trim()] = val.join(":").trim();
        }
    });
    if (currentStep) result.steps.push(currentStep);
    return result;
}

function parseScript(input) {
    if (typeof input === "string") {
        try { return JSON.parse(input); } catch { return parseYaml(input); }
    }
    return input;
}

function isExhausted(current, limit) {
    if (limit === undefined || limit === null) return false;
    return current >= limit;
}

async function runStateScript(page, script, options) {
    const steps = script.steps || [];

    // ... (keep your budget validation logic)
    const maxStates = script.maxStates ?? options?.maxStates ?? config.maxStates;
    const maxInteractions = script.maxInteractions ?? options?.maxInteractions ?? config.maxInteractions;
    const maxTimeMs = script.maxTimeMs ?? options?.maxTimeMs ?? config.maxTimeMs;

    if (maxStates < 0 || maxInteractions < 0 || maxTimeMs < 0) {
        throw new ScriptError("Budgets cannot be negative", "SAFE_REJECT");
    }
    if (!Number.isInteger(maxStates) || !Number.isInteger(maxInteractions)) {
        throw new ScriptError("Budgets must be whole numbers", "SAFE_REJECT");
    }
    if (maxStates === 0 && maxInteractions === 0) {
        throw new ScriptError("Both state and interaction budgets are 0. Nothing can be done.", "SAFE_REJECT");
    }

    let statesCaptured = 0;
    let interactions = 0;
    let startTime = Date.now();

    const capturedStates = [];
    const warnings = [];
    const stepResults = [];
    const actionJournal = [];
    let previousFingerprint = null;

    if (steps.length > config.maxActions) {
        throw new ScriptError(`Script has ${steps.length} actions, which exceeds the max budget of ${config.maxActions}`, "ACTION_BUDGET_EXCEEDED");
    }

    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const stepName = `Step ${i + 1}: ${step.action}`;

        // ... (keep your step loop and actions)

        try {
            // ... (keep hover, click, type, select, wait, scroll)
            if (step.action === "hover") {
                // ...
            }
            // ...
            else if (step.action === "capture") {
                const rawLabel = step.name || step.safeLabel || `state-${statesCaptured + 1}`;
                const safeLabel = rawLabel.replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-').slice(0, 15);
                const filePrefix = `${options.filePrefix}-${statesCaptured + 1}-${safeLabel}`;

                // --- E2-08: State Fingerprinting ---
                const currentFingerprint = await getStateFingerprint(page);

                const collisionReason = checkForCollision(previousFingerprint, currentFingerprint);
                if (collisionReason) {
                    throw new ScriptError(`Collision detected: ${collisionReason}`, collisionReason);
                }

                const isDuplicate = previousFingerprint &&
                    previousFingerprint.hash === currentFingerprint.hash &&
                    !currentFingerprint.hasTimer;

                if (isDuplicate) {
                    warnings.push(`State deduplicated (hash match): ${safeLabel}`);
                    capturedStates.push({
                        name: safeLabel,
                        index: statesCaptured + 1,
                        step: i + 1,
                        file: null,
                        url: null,
                        rawUrl: null,
                        selector: null,
                        deduplicated: true
                    });
                    statesCaptured++;
                    stepResults.push({ index: i + 1, action: step.action, status: "ok" });

                    actionJournal.push({
                        step: i + 1,
                        action: "capture",
                        label: safeLabel,
                        result: "deduplicated",
                        fingerprint: currentFingerprint.hash,
                        timestamp: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
                    });

                    previousFingerprint = currentFingerprint;
                    continue;
                }

                previousFingerprint = currentFingerprint;

                const rawFile = `raw-${filePrefix}.png`;
                if (captureRawObservation) {
                    await captureRawObservation(page, path.join(options.outDir, rawFile), options.log);
                }

                if (options.prep) await options.prep(safeLabel);

                const finalFile = `${filePrefix}.png`;
                let finalUrl = options.fileUrl(finalFile);

                try {
                    if (step.selector) {
                        await page.locator(step.selector).first().screenshot({ path: path.join(options.outDir, finalFile), animations: "disabled", timeout: 10000 });
                    } else {
                        await page.screenshot({ path: path.join(options.outDir, finalFile), fullPage: true, animations: "disabled", timeout: 30000 });
                    }
                } catch (shotErr) {
                    options.log(`[WARNING] Screenshot failed for "${safeLabel}": ${shotErr.message}`);
                }

                capturedStates.push({
                    name: safeLabel,
                    index: statesCaptured + 1,
                    step: i + 1,
                    file: finalFile,
                    url: finalUrl,
                    rawUrl: options.fileUrl(rawFile),
                    selector: step.selector || null
                });
                statesCaptured++;
                stepResults.push({ index: i + 1, action: step.action, status: "ok" });

                actionJournal.push({
                    step: i + 1,
                    action: "capture",
                    label: safeLabel,
                    result: "captured",
                    fingerprint: currentFingerprint.hash,
                    timestamp: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
                });
            }
            // ...
        } catch (err) {
            // ...
        }
    }

    // ... (keep return statement)
    let outcome = "CONTROL_OK";
    if (capturedStates.length === 0) outcome = "NOT_APPLICABLE";
    const isPartial = warnings.some(w => w.includes("exhausted"));

    return {
        status: isPartial ? "partial" : (capturedStates.length > 0 ? "completed" : "not_assessed"),
        outcome: outcome,
        partial: isPartial,
        counts: { steps: steps.length, statesCaptured, interactions, timeMs: Date.now() - startTime },
        budgets: { maxStates, maxInteractions, maxTimeMs },
        states: capturedStates,
        warnings,
        steps: stepResults,
        actionJournal
    };
}

// Export the helper just in case you need it elsewhere
module.exports = { runStateScript, parseScript, ScriptError, getISTTimestamp };