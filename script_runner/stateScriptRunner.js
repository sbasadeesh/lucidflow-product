const { stabilizePage, captureRawObservation } = require("../stabilizer/screenshotStabilizer");
const { buildRawObservationManifest } = require("../screenshotModule");
const config = require("./stateScript.config");
const path = require("path");

class ScriptError extends Error {
    constructor(message, code) {
        super(message);
        this.name = "ScriptError";
        this.code = code;
    }
}

function parseYaml(yamlString) {
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

        // 1. Budget Validation (Aligned with LF-JRN-004 Rule)
    const maxStates = script.maxStates ?? options?.maxStates ?? config.maxStates;
    const maxInteractions = script.maxInteractions ?? options?.maxInteractions ?? config.maxInteractions;
    const maxTimeMs = script.maxTimeMs ?? options?.maxTimeMs ?? config.maxTimeMs;

    // Reject negative budgets
    if (maxStates < 0 || maxInteractions < 0 || maxTimeMs < 0) {
        throw new ScriptError("Budgets cannot be negative", "SAFE_REJECT");
    }
    
    // Reject noninteger budgets (e.g., 2.5 states)
    if (!Number.isInteger(maxStates) || !Number.isInteger(maxInteractions)) {
        throw new ScriptError("Budgets must be whole numbers", "SAFE_REJECT");
    }
    
    // Reject zero budgets
    if (maxStates === 0 && maxInteractions === 0) {
        throw new ScriptError("Both state and interaction budgets are 0. Nothing can be done.", "SAFE_REJECT");
    }
    let statesCaptured = 0;
    let interactions = 0;
    let startTime = Date.now();

    const capturedStates = [];
    const warnings = [];
    const stepResults = [];

    if (steps.length > config.maxActions) {
        throw new ScriptError(`Script has ${steps.length} actions, which exceeds the max budget of ${config.maxActions}`, "ACTION_BUDGET_EXCEEDED");
    }

    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const stepName = `Step ${i + 1}: ${step.action}`;

        // --- Check Time Budget ---
        const elapsed = Date.now() - startTime;
        if (isExhausted(elapsed, maxTimeMs)) {
            warnings.push(`Time budget of ${maxTimeMs}ms exhausted (${elapsed}ms used). Stopping.`);
            stepResults.push({ index: i + 1, action: step.action, status: "stopped", reason: "TIME_EXHAUSTED" });
            break; // Stop the whole run
        }

        // --- Check State Budget ---
        if (step.action === "capture" && isExhausted(statesCaptured, maxStates)) {
            warnings.push(`State budget of ${maxStates} exhausted. Skipped: ${stepName}`);
            stepResults.push({ index: i + 1, action: step.action, status: "stopped", reason: "STATE_EXHAUSTED" });
            continue;
        }

        // --- Check Interaction Budget ---
        const isInteraction = ["click", "type", "select", "hover"].includes(step.action);
        if (isInteraction && isExhausted(interactions, maxInteractions)) {
            warnings.push(`Interaction budget of ${maxInteractions} exhausted. Skipped: ${stepName}`);
            stepResults.push({ index: i + 1, action: step.action, status: "stopped", reason: "INTERACTION_EXHAUSTED" });
            continue;
        }

        try {
            if (step.action === "hover") {
                const locator = page.locator(step.selector).first();
                await locator.waitFor({ state: "visible", timeout: config.selectorTimeoutMs });
                await locator.hover();
                interactions++;
                stepResults.push({ index: i + 1, action: step.action, status: "ok" });
            } 
            else if (step.action === "click") {
                const locator = page.locator(step.selector).first();
                await locator.waitFor({ state: "visible", timeout: config.selectorTimeoutMs });
                await locator.click();
                interactions++;
                stepResults.push({ index: i + 1, action: step.action, status: "ok" });
            } 
            else if (step.action === "type") {
                const locator = page.locator(step.selector).first();
                await locator.waitFor({ state: "visible", timeout: config.selectorTimeoutMs });
                await locator.fill(step.value || step.text || "");
                interactions++;
                stepResults.push({ index: i + 1, action: step.action, status: "ok" });
            } 
            else if (step.action === "select") {
                const locator = page.locator(step.selector).first();
                await locator.waitFor({ state: "visible", timeout: config.selectorTimeoutMs });
                await locator.selectOption(step.value);
                interactions++;
                stepResults.push({ index: i + 1, action: step.action, status: "ok" });
            } 
            else if (step.action === "wait") {
                let ms = Number(step.ms) || 1000;
                if (ms > config.maxWaitMs) {
                    ms = config.maxWaitMs;
                    warnings.push(`Wait time ${step.ms}ms is above the limit, cut to ${config.maxWaitMs}ms`);
                }
                await page.waitForTimeout(ms);
                stepResults.push({ index: i + 1, action: step.action, status: "ok" });
            } 
            else if (step.action === "scroll") {
                await page.evaluate((y) => window.scrollTo(0, y), Number(step.y) || 500);
                stepResults.push({ index: i + 1, action: step.action, status: "ok" });
            } 
            else if (step.action === "capture") {
                const rawLabel = step.name || step.safeLabel || `state-${statesCaptured + 1}`;
                // Remove spaces/special chars, limit to 15 characters
                const safeLabel = rawLabel.replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-').slice(0, 15);
                const filePrefix = `${options.filePrefix}-${statesCaptured + 1}-${safeLabel}`;
                
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
            } 
            else {
                throw new ScriptError(`Unknown action: ${step.action}. Arbitrary code execution is not allowed.`, "UNKNOWN_ACTION");
            }
        } catch (err) {
            if (err.name === "TimeoutError" || err.message.includes("strict mode violation") || err.message.includes("not found")) {
                stepResults.push({ index: i + 1, action: step.action, status: "failed", reason: "MISSING_SELECTOR" });
                options.log(`${stepName} failed: selector "${step.selector}" not found.`);
            } else {
                stepResults.push({ index: i + 1, action: step.action, status: "failed", reason: err.message });
                options.log(`${stepName} failed: ${err.message}`);
            }
        }
    }

        // Map internal status to the authoritative LF-JRN-004 outcome vocabulary
    let outcome = "CONTROL_OK";
    if (capturedStates.length === 0) {
        outcome = "NOT_APPLICABLE"; 
    }
    
    // Check if we hit any cap to mark it as PARTIAL
    const isPartial = warnings.some(w => w.includes("exhausted"));

    return {
        status: isPartial ? "partial" : (capturedStates.length > 0 ? "completed" : "not_assessed"),
        outcome: outcome,
        partial: isPartial,
        counts: { steps: steps.length, statesCaptured, interactions, timeMs: Date.now() - startTime },
        budgets: { maxStates, maxInteractions, maxTimeMs },
        states: capturedStates,
        warnings,
        steps: stepResults
    };
}

module.exports = { runStateScript, parseScript, ScriptError };