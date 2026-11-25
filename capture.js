// --------------------------------------------------
// capture.render(url)  (E2-01)
//
// Opens a URL in a real browser (Playwright / Chromium) and returns the page rendered the
// way a customer sees it:
//   - JavaScript is executed (it is a real browser, not a plain HTTP fetch)
//   - a fixed viewport, so every scan has the same layout
//   - waits for the "load" event, then for the network to go idle (best effort, capped),
//     then for document.readyState === "complete"
//   - a page that has not loaded after 30 seconds stops with a "timeout" error
//   - an invalid address stops at once with a clear message
//
//   const capture = require("./capture");
//   const r = await capture.render("https://example.com", { onPage: async (page, context) => { ... } });
//   r.page, r.context, r.browser, r.finalUrl, r.statusCode, r.title, r.loadMs, r.networkIdle, r.close()
//
// Errors are RenderError with: code ("invalid_url" | "timeout" | "load_failed"),
// message (clear, safe to show to the analyst) and httpStatus (400 | 504 | 502).
// On any error the browser is already closed.
//
// All numbers come from capture.config.js. Options passed to render() override them.
// --------------------------------------------------

const { chromium } = require("playwright");
const defaults = require("./capture.config");

class RenderError extends Error {
    constructor(code, message, httpStatus) {
        super(message);
        this.name = "RenderError";
        this.code = code;
        this.httpStatus = httpStatus;
    }
}

const firstLine = (text) => String(text || "").split("\n")[0].trim();
const clip = (text, max = 80) => (String(text).length > max ? `${String(text).slice(0, max)}...` : String(text));
const seconds = (ms) => `${Math.round((ms / 1000) * 10) / 10}`;

// --------------------------------------------------
// Checking the address (acceptance criterion 3). Returns a URL object or throws RenderError.
// --------------------------------------------------
function validateUrl(input) {
    const text = typeof input === "string" ? input.trim() : "";

    if (!text) {
        throw new RenderError("invalid_url", "Enter a URL to scan, for example https://www.example.com.", 400);
    }

    let parsed;
    try {
        parsed = new URL(text);
    } catch {
        throw new RenderError(
            "invalid_url",
            `"${clip(text)}" is not a valid web address. Enter the full address, including https://, for example https://www.example.com.`,
            400
        );
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new RenderError(
            "invalid_url",
            `Only http:// and https:// addresses can be scanned ("${parsed.protocol}//" is not supported).`,
            400
        );
    }
    if (!parsed.hostname) {
        throw new RenderError("invalid_url", `"${clip(text)}" has no website name. Enter an address like https://www.example.com.`, 400);
    }

    return parsed;
}

// --------------------------------------------------
// A navigation error in plain words (criterion 2 for the timeout)
// --------------------------------------------------
function navigationError(error, parsed, cfg) {
    const message = String(error && error.message);

    if ((error && error.name === "TimeoutError") || /timeout .*exceeded/i.test(message)) {
        return new RenderError(
            "timeout",
            `The page did not finish loading within ${seconds(cfg.timeoutMs)} seconds, so the scan was stopped.`,
            504
        );
    }
    if (/ERR_NAME_NOT_RESOLVED/.test(message)) {
        return new RenderError("load_failed", `The website "${parsed.hostname}" could not be found. Check the spelling of the address.`, 502);
    }
    if (/ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|ERR_CONNECTION_CLOSED|ERR_CONNECTION_TIMED_OUT|ERR_ADDRESS_UNREACHABLE|ERR_EMPTY_RESPONSE/.test(message)) {
        return new RenderError("load_failed", `The website "${parsed.hostname}" did not answer. It may be down, or the address may be wrong.`, 502);
    }
    if (/ERR_CERT|ERR_SSL/.test(message)) {
        return new RenderError("load_failed", `The website "${parsed.hostname}" has a security certificate problem, so it could not be opened.`, 502);
    }
    if (/ERR_UNSAFE_PORT/.test(message)) {
        return new RenderError("load_failed", `The browser blocks port ${parsed.port || "(none)"} for safety, so "${parsed.hostname}" cannot be opened on it. Use a different port.`, 502);
    }
    if (/ERR_TOO_MANY_REDIRECTS/.test(message)) {
        return new RenderError("load_failed", "The page redirects in a loop and never loads.", 502);
    }
    return new RenderError("load_failed", `The page could not be loaded: ${firstLine(message)}`, 502);
}

// --------------------------------------------------
// render
//   options: any key of capture.config.js, plus
//     log(message)                   called with progress lines
//     onPage(page, context)          called BEFORE the page is opened (add routes, listeners, guards)
// --------------------------------------------------
async function render(url, options = {}) {
    const cfg = { ...defaults, ...options, viewport: { ...defaults.viewport, ...(options.viewport || {}) } };
    const log = typeof options.log === "function" ? options.log : () => { };

    const parsed = validateUrl(url); // nothing starts for an invalid address

    let browser;
    try {
        browser = await chromium.launch({ headless: cfg.headless });

        const userAgent =
            cfg.userAgent ||
            `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${browser.version()} Safari/537.36`;

        const context = await browser.newContext({
            viewport: cfg.viewport,
            deviceScaleFactor: cfg.deviceScaleFactor,
            javaScriptEnabled: true,
            locale: cfg.locale,
            timezoneId: cfg.timezoneId,
            userAgent,
        });
        const page = await context.newPage();

        if (typeof options.onPage === "function") await options.onPage(page, context);

        // ---- 1. open the page: JavaScript runs; the clock for the timeout starts here ----
        log(`Opening ${parsed.href}`);
        const navStart = Date.now();
        let response;
        try {
            response = await page.goto(parsed.href, { waitUntil: cfg.waitUntil, timeout: cfg.timeoutMs });
        } catch (e) {
            throw navigationError(e, parsed, cfg);
        }

        // ---- 2. wait for the network to go idle, but never longer than the time that is left ----
        // Many sites never go fully quiet (analytics, chat widgets), so this is best effort.
        // If it does not go idle, the defined condition below decides.
        let networkIdle = false;
        const idleBudget = Math.min(cfg.networkIdleMs, Math.max(cfg.timeoutMs - (Date.now() - navStart), 0));
        if (idleBudget > 0) {
            try {
                await page.waitForLoadState("networkidle", { timeout: idleBudget });
                networkIdle = true;
            } catch { /* not idle in time: carry on */ }
        }

        // ---- 3. the defined condition: the document is complete, then a short settle ----
        await page
            .waitForFunction(() => document.readyState === "complete", null, { timeout: cfg.readyStateWaitMs })
            .catch(() => { });
        await page.waitForTimeout(cfg.settleMs);

        const readyState = await page.evaluate(() => document.readyState).catch(() => "unknown");
        const title = await page.title().catch(() => "");
        const loadMs = Date.now() - navStart;
        log(`Rendered in ${loadMs} ms (HTTP ${response ? response.status() : "?"}, ${networkIdle ? "network idle" : "network not idle, continued after the wait limit"})`);

        return {
            browser,
            context,
            page,
            url: parsed.href,
            finalUrl: page.url(),
            statusCode: response ? response.status() : null,
            title,
            readyState,
            networkIdle,
            loadMs,
            viewport: { ...cfg.viewport },
            close: () => browser.close().catch(() => { }),
        };
    } catch (error) {
        if (browser) await browser.close().catch(() => { });
        throw error;
    }
}

module.exports = { render, validateUrl, RenderError };