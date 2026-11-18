// --------------------------------------------------
// State script runner
//
// Runs a short script of steps on ONE page and captures each state:
//   click    { "action": "click",   "selector": "#open" }
//   hover    { "action": "hover",   "selector": "text=\"Products\"" }   (opens hover menus)
//   type     { "action": "type",    "selector": "#name", "text": "Test User" }
//   wait     { "action": "wait",    "ms": 500 }   or   { "action": "wait", "selector": "#modal", "state": "visible" }
//   capture  { "action": "capture", "name": "modal open" }   (optional "selector", "fullPage")
//
// - every capture step is one state; states are saved in script order
// - more captures than the state cap: the extra states are skipped with a warning
// - a step whose element is missing FAILS with a logged reason; the runner never throws
//   (unless the script itself is not valid: that raises a ScriptError)
//
// All numbers come from stateScript.config.js
// --------------------------------------------------

const path = require("path");
const defaults = require("./stateScript.config");

class ScriptError extends Error {
    constructor(message) {
        super(message);
        this.name = "ScriptError";
    }
}

// A step that cannot run. Its message is the reason that gets logged.
class StepFailure extends Error { }

const firstLine = (text) => String(text || "").split("\n")[0].trim();

function normalizeUrl(u) {
    try {
        const x = new URL(u);
        return x.origin + x.pathname.replace(/\/$/, "") + x.search;
    } catch {
        return u;
    }
}

function slug(text, maxLength) {
    return (
        String(text || "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, maxLength) || "state"
    );
}

// --------------------------------------------------
// Reading a script: an object, a JSON string, or (with js-yaml installed) YAML
// --------------------------------------------------
function parseScript(input, config = defaults) {
    let data = input;

    if (typeof input === "string") {
        const text = input.trim();
        try {
            data = JSON.parse(text);
        } catch (jsonError) {
            let yaml = null;
            try { yaml = require("js-yaml"); } catch { /* not installed */ }

            if (!yaml) {
                throw new ScriptError(
                    `The script is not valid JSON (${firstLine(jsonError.message)}). To use YAML scripts, install js-yaml: npm install js-yaml`
                );
            }
            try {
                data = yaml.load(text);
            } catch (yamlError) {
                throw new ScriptError(`The script is not valid JSON or YAML: ${firstLine(yamlError.message)}`);
            }
        }
    }

    if (Array.isArray(data)) data = { steps: data }; // a bare list of steps is fine

    if (!data || typeof data !== "object") {
        throw new ScriptError('The script must be an object with a "steps" list.');
    }
    if (!Array.isArray(data.steps) || data.steps.length === 0) {
        throw new ScriptError('The script needs a non-empty "steps" list.');
    }
    if (data.steps.length > config.maxSteps) {
        throw new ScriptError(`The script has ${data.steps.length} steps, the limit is ${config.maxSteps}.`);
    }

    return {
        name: String(data.name || "state script").slice(0, 80),
        url: typeof data.url === "string" ? data.url : null,
        maxStates: data.maxStates,
        stopOnFail: data.stopOnFail,
        steps: data.steps,
    };
}

function resolveStateCap(requested, cfg, warnings) {
    if (requested === undefined || requested === null) return cfg.maxStates;

    const n = Number(requested);
    if (!Number.isInteger(n) || n < 1) {
        warnings.push(`maxStates "${requested}" is not a whole number of 1 or more, using ${cfg.maxStates}`);
        return cfg.maxStates;
    }
    if (n > cfg.hardMaxStates) {
        warnings.push(`maxStates ${n} is above the limit of ${cfg.hardMaxStates}, using ${cfg.hardMaxStates}`);
        return cfg.hardMaxStates;
    }
    return n;
}

// --------------------------------------------------
// Finding the element of a step
// --------------------------------------------------
async function findElement(page, selector, timeoutMs) {
    if (typeof selector !== "string" || !selector.trim()) {
        throw new StepFailure('The step has no "selector"');
    }
    const loc = page.locator(selector).first();
    try {
        await loc.waitFor({ state: "visible", timeout: timeoutMs });
        return loc;
    } catch (e) {
        if (/timeout/i.test(e.message)) {
            throw new StepFailure(`Element not found or not visible within ${timeoutMs}ms: ${selector}`);
        }
        throw new StepFailure(`Invalid selector "${selector}": ${firstLine(e.message)}`);
    }
}

async function looksSensitive(loc, cfg) {
    const info = await loc
        .evaluate((el) => {
            const parts = [
                el.type, el.name, el.id, el.placeholder,
                el.getAttribute("aria-label"), el.getAttribute("autocomplete"), el.getAttribute("inputmode"),
            ];
            if (el.labels) [...el.labels].forEach((l) => parts.push(l.innerText));
            return { type: (el.type || "").toLowerCase(), text: parts.filter(Boolean).join(" | ") };
        })
        .catch(() => null);

    if (!info) return false;
    if (info.type === "tel" || info.type === "password") return true;
    return new RegExp(cfg.sensitivePattern, "i").test(info.text);
}

// --------------------------------------------------
// Run a script
//   options: { config, log, prep, outDir, filePrefix, fileUrl, maxStates, stopOnFail }
// --------------------------------------------------
async function runStateScript(page, scriptInput, options = {}) {
    const cfg = { ...defaults, ...(options.config || {}) };
    const log = options.log || (() => { });
    const script = parseScript(scriptInput, cfg); // the only thing that can throw

    const warnings = [];
    const stepResults = [];
    const states = [];
    const skippedStates = [];

    const cap = resolveStateCap(options.maxStates ?? script.maxStates, cfg, warnings);
    const stopOnFail = options.stopOnFail ?? script.stopOnFail ?? cfg.stopOnFail;
    const outDir = options.outDir || process.cwd();
    const filePrefix = options.filePrefix || `state-${Date.now()}`;
    const startUrl = normalizeUrl(page.url());
    const total = script.steps.length;
    const startedAt = Date.now();

    const warn = (message) => {
        warnings.push(message);
        log(`Warning: ${message}`);
    };
    warnings.slice().forEach((w) => log(`Warning: ${w}`)); // cap warnings found above

    const timeoutFor = (step) => {
        const asked = Number(step.timeout);
        if (Number.isFinite(asked) && asked > 0) return Math.min(asked, cfg.maxWaitMs);
        return cfg.stepTimeoutMs;
    };

    const settle = async () => {
        await page.waitForTimeout(cfg.settleMs);
        await page.waitForLoadState("networkidle", { timeout: 1500 }).catch(() => { });
    };

    // a click that leaves the page is undone
    const stayOnPage = async (stepNumber) => {
        if (!cfg.stayOnPage || normalizeUrl(page.url()) === startUrl) return;
        warn(`Step ${stepNumber}: the page navigated away (${page.url()}), going back to the start URL`);
        await page.goBack({ timeout: 10000 }).catch(() => { });
        if (normalizeUrl(page.url()) !== startUrl) {
            await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => { });
        }
        await page.waitForTimeout(500);
    };

    // ---- the four actions ----
    const actions = {
        async click(step, n) {
            const loc = await findElement(page, step.selector, timeoutFor(step));
            try {
                await loc.click({ timeout: timeoutFor(step) });
            } catch (e) {
                throw new StepFailure(`Click failed on ${step.selector}: ${firstLine(e.message)}`);
            }
            await settle();
            await stayOnPage(n);
        },

        // moves the mouse onto the element, like a visitor would, so hover menus open
        async hover(step) {
            const loc = await findElement(page, step.selector, timeoutFor(step));
            try {
                await loc.hover({ timeout: timeoutFor(step) });
            } catch (e) {
                throw new StepFailure(`Hover failed on ${step.selector}: ${firstLine(e.message)}`);
            }
            await page.waitForTimeout(cfg.hoverMs);
        },

        async type(step) {
            const loc = await findElement(page, step.selector, timeoutFor(step));
            if (step.text === undefined || step.text === null) throw new StepFailure('The step has no "text"');

            if (await looksSensitive(loc, cfg)) {
                throw new StepFailure(
                    `Refused to type into ${step.selector}: it looks like a sensitive field (phone, OTP, vehicle number, card, password...)`
                );
            }
            try {
                if (step.keys === true) {
                    await loc.click({ timeout: timeoutFor(step) });
                    await loc.pressSequentially(String(step.text), { delay: cfg.typeDelayMs });
                } else {
                    await loc.fill(String(step.text), { timeout: timeoutFor(step) });
                }
            } catch (e) {
                throw new StepFailure(`Typing failed on ${step.selector}: ${firstLine(e.message)}`);
            }
            await settle();
        },

        async wait(step, n) {
            if (step.selector !== undefined) {
                if (typeof step.selector !== "string" || !step.selector.trim()) {
                    throw new StepFailure('The step has an empty "selector"');
                }
                const state = step.state === "hidden" ? "hidden" : "visible";
                const timeoutMs = timeoutFor(step);
                try {
                    await page.locator(step.selector).first().waitFor({ state, timeout: timeoutMs });
                } catch (e) {
                    if (/timeout/i.test(e.message)) {
                        throw new StepFailure(`Waited ${timeoutMs}ms but ${step.selector} did not become ${state}`);
                    }
                    throw new StepFailure(`Invalid selector "${step.selector}": ${firstLine(e.message)}`);
                }
                return;
            }

            const ms = Number(step.ms);
            if (!Number.isFinite(ms) || ms < 0) throw new StepFailure('A wait step needs "ms" (a number) or a "selector"');
            if (ms > cfg.maxWaitMs) warn(`Step ${n}: wait of ${ms}ms is above the limit, waiting ${cfg.maxWaitMs}ms`);
            await page.waitForTimeout(Math.min(ms, cfg.maxWaitMs));
        },

        async capture(step, n) {
            const name = String(step.name || `state ${states.length + 1}`).slice(0, cfg.nameMaxLength);

            let target = null;
            if (step.selector !== undefined) target = await findElement(page, step.selector, timeoutFor(step));
            if (options.prep) await options.prep();

            const index = states.length + 1;
            const file = `${filePrefix}-${String(index).padStart(2, "0")}-${slug(name, cfg.nameMaxLength)}.png`;
            const fullPath = path.join(outDir, file);
            const fullPage = step.fullPage === undefined ? cfg.captureMode === "fullPage" : step.fullPage === true;

            try {
                if (target) await target.screenshot({ path: fullPath, animations: "disabled", timeout: 30000 });
                else await page.screenshot({ path: fullPath, fullPage, animations: "disabled", timeout: 30000 });
            } catch (e) {
                throw new StepFailure(`Screenshot failed: ${firstLine(e.message)}`);
            }

            states.push({
                index,
                name,
                step: n,
                file,
                url: options.fileUrl ? options.fileUrl(file) : file,
                selector: step.selector || null,
                fullPage: !target && fullPage,
            });
            return `state ${index} saved as ${file}`;
        },
    };

    // ---- go through the steps in order ----
    let capReached = false;
    let stopped = false;

    for (let i = 0; i < total; i++) {
        const n = i + 1;
        const raw = script.steps[i];
        const step = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
        const action = typeof step.action === "string" ? step.action.toLowerCase().trim() : "";
        // a capture is shown by its name, every other step by its selector
        const shown = action === "capture" ? step.name || step.selector : step.selector || step.name;
        const target = shown ? ` "${shown}"` : "";
        const label = `Script step ${n}/${total}: ${action || "(no action)"}${target}`;

        const result = { index: n, action: action || null, selector: step.selector || null, status: "ok", reason: null, durationMs: 0 };
        stepResults.push(result);

        if (stopped) {
            result.status = "skipped";
            result.reason = "an earlier step failed and stopOnFail is on";
            log(`${label} - skipped (${result.reason})`);
            continue;
        }

        if (capReached) {
            result.status = "skipped";
            result.reason = `state cap of ${cap} reached`;
            if (action === "capture") {
                const name = String(step.name || "unnamed state");
                skippedStates.push(name);
                warn(`State "${name}" skipped: state cap of ${cap} reached`);
            } else {
                log(`${label} - skipped (${result.reason})`);
            }
            continue;
        }

        const t0 = Date.now();
        try {
            if (!action) throw new StepFailure('The step has no "action"');
            if (!Object.prototype.hasOwnProperty.call(actions, action)) {
                throw new StepFailure(`Unknown action "${action}" (allowed: click, hover, type, wait, capture)`);
            }
            const note = await actions[action](step, n);
            log(note ? `${label} - ok, ${note}` : `${label} - ok`);
        } catch (e) {
            result.status = "failed";
            result.reason = e instanceof StepFailure ? e.message : `Unexpected error: ${firstLine(e.message)}`;
            log(`${label} - FAILED: ${result.reason}`);
            if (stopOnFail) {
                stopped = true;
                warn(`Step ${n} failed and stopOnFail is on, the remaining steps are skipped`);
            }
        }
        result.durationMs = Date.now() - t0;

        // the cap is full and more captures follow: the rest is skipped
        if (action === "capture" && result.status === "ok" && states.length >= cap && !stopped) {
            const later = script.steps
                .slice(i + 1)
                .filter((s) => s && typeof s.action === "string" && s.action.toLowerCase().trim() === "capture");
            if (later.length) {
                capReached = true;
                warn(`State cap of ${cap} reached: ${later.length} more state(s) will be skipped`);
            }
        }
    }

    const count = (status) => stepResults.filter((s) => s.status === status).length;
    const counts = {
        steps: total,
        ok: count("ok"),
        failed: count("failed"),
        skipped: count("skipped"),
        statesCaptured: states.length,
        statesSkipped: skippedStates.length,
        // an interaction = a click, hover or typing that worked
        interactions: stepResults.filter(
            (s) => s.status === "ok" && (s.action === "click" || s.action === "hover" || s.action === "type")
        ).length,
    };

    return {
        name: script.name,
        status: stopped ? "stopped" : counts.failed ? "completed_with_failures" : "completed",
        stateCap: cap,
        capped: capReached,
        states,
        skippedStates,
        steps: stepResults,
        warnings,
        counts,
        durationMs: Date.now() - startedAt,
    };
}

module.exports = { runStateScript, parseScript, ScriptError, resolveStateCap };