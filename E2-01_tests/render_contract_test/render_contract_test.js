// E2-01: render a URL like a customer sees it, as the engine does it today.
// Regression coverage of EXISTING behaviour (no production change); see
// docs/validation/PR-35-local-validation.md for exactly what is and is not claimed.
//
//   T1  invalid URLs are rejected with the current messages and response shape, before any page is opened
//   T2  a valid URL is rendered with JavaScript, in the fixed 1366 px viewport, while the page keeps
//       the network busy; content that JavaScript adds 1 s after load is what the scan sees and saves
//   T3  a page that never answers stops at the real 60 s load limit as "could not assess",
//       with no screenshot, and the engine releases the connection and keeps working
//
// One engine (the E2-09 helper, unchanged) and one local site serve the whole file.

const test = require("node:test");
const assert = require("node:assert/strict");
const sharp = require("sharp");

const { startEngine, runScript, scanPage } = require("../../E2-09_tests/fixture");
const {
    startSite,
    waitFor,
    RAW_TITLE,
    RAW_TEXT,
    JS_TEXT,
    RAW_COLOUR,
    JS_COLOUR,
    PING_EVERY_MS,
    BLOCK,
} = require("../fixture");

const VIEWPORT_WIDTH = 1366; // main's fixed viewport (server.js newContext)
const LOAD_LIMIT_MS = 60000; // main's page load limit (openAndCheckPage)

let site;
let engine;

test.before(async () => {
    site = await startSite();
    engine = await startEngine();
}, { timeout: 60000 });

test.after(async () => {
    if (engine) await engine.stop();
    if (site) await site.close();
});

async function post(route, body) {
    const res = await fetch(engine.baseUrl + route, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    return { httpStatus: res.status, body: await res.json() };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// T1
// ---------------------------------------------------------------------------
test("T1: invalid URLs are rejected with the current message and shape, and the page is never opened", { timeout: 60000 }, async () => {
    const probe = `${site.host}/probe`; // every URL that names the local site points at /probe
    const SCREENSHOT = {
        required: "URL is required",
        invalid: "Invalid URL",
        protocol: "Only HTTP and HTTPS URLs are supported",
    };
    const SCRIPT = {
        invalid: 'Send the page address as "url" (in the request or in the script).',
        protocol: "Only HTTP and HTTPS URLs are supported",
    };

    const screenshotCases = [
        { label: "no url", body: {}, error: SCREENSHOT.required },
        { label: "empty text", body: { url: "" }, error: SCREENSHOT.required },
        { label: "only spaces", body: { url: "   " }, error: SCREENSHOT.invalid },
        { label: "no scheme", body: { url: "example.com" }, error: SCREENSHOT.invalid },
        { label: "plain words", body: { url: "not a url" }, error: SCREENSHOT.invalid },
        { label: "no host", body: { url: "http://" }, error: SCREENSHOT.invalid },
        { label: "not text", body: { url: 123 }, error: SCREENSHOT.invalid },
        { label: "local site without scheme", body: { url: probe }, error: SCREENSHOT.invalid },
        { label: "host:port read as a scheme", body: { url: `localhost:${site.host.split(":")[1]}/probe` }, error: SCREENSHOT.protocol },
        { label: "ftp", body: { url: `ftp://${probe}` }, error: SCREENSHOT.protocol },
        { label: "javascript", body: { url: `javascript:location.href='http://${probe}'` }, error: SCREENSHOT.protocol },
        { label: "file", body: { url: "file:///C:/probe" }, error: SCREENSHOT.protocol },
    ];
    const script = { name: "check", steps: [{ action: "wait", ms: 50 }] };
    const scriptCases = [
        { label: "no url", body: { script }, error: SCRIPT.invalid },
        { label: "no scheme", body: { url: "example.com", script }, error: SCRIPT.invalid },
        { label: "local site without scheme", body: { url: probe, script }, error: SCRIPT.invalid },
        { label: "ftp", body: { url: `ftp://${probe}`, script }, error: SCRIPT.protocol },
        { label: "javascript", body: { url: `javascript:location.href='http://${probe}'`, script }, error: SCRIPT.protocol },
    ];

    for (const [route, cases] of [["/api/screenshot", screenshotCases], ["/api/script", scriptCases]]) {
        for (const c of cases) {
            const r = await post(route, c.body);
            assert.equal(r.httpStatus, 400, `${route} ${c.label}: HTTP 400`);
            assert.deepEqual(r.body, { error: c.error }, `${route} ${c.label}: exactly { error } with the current message`);
        }
    }

    // nothing was opened: the local site never saw a request for /probe ...
    assert.equal(site.count("probe"), 0, "no rejected URL reached the local site");
    // ... and the counter does count (positive control)
    await fetch(`${site.url}/probe`);
    assert.equal(site.count("probe"), 1, "the probe counter counts a real request");
});

// ---------------------------------------------------------------------------
// T2
// ---------------------------------------------------------------------------
test("T2: a valid URL is rendered with JavaScript in the fixed viewport while the page keeps the network busy", { timeout: 180000 }, async (t) => {
    // the raw HTML (what a plain download sees) has only the starting content
    const raw = await (await fetch(`${site.url}/js-page`)).text();
    const rawWithoutScripts = raw.replace(/<script[\s\S]*?<\/script>/gi, "");
    assert.ok(raw.includes(`<title>${RAW_TITLE}</title>`), "raw title");
    assert.ok(raw.includes(`<p id="out">${RAW_TEXT}</p>`), "raw text");
    assert.ok(!rawWithoutScripts.includes(JS_TEXT), "the JavaScript text is not in the raw markup");

    const pingsBefore = site.count("ping");
    const started = Date.now();
    const r = await scanPage(engine, `${site.url}/js-page`);
    const elapsed = Date.now() - started;
    const pings = site.count("ping") - pingsBefore;

    assert.equal(r.httpStatus, 200);
    assert.equal(r.result, "assessed", `scan result (${r.status}: ${r.reason || ""})`);
    assert.equal(r.statusCode, 200);

    // the engine's own reading of the page: the title JavaScript set 1 s after load
    const titles = (r.actionLog || []).map((a) => a.action).filter((a) => a.startsWith("Page title: "));
    assert.ok(titles.length >= 1, "the engine logged the page title");
    assert.equal(titles[0], `Page title: ${JS_TEXT}`, "the engine saw the JavaScript title, not the raw one");

    // the saved full-page evidence: 1366 px wide, and the block painted by JavaScript is red
    assert.equal(typeof r.screenshotUrl, "string", "a full-page screenshot was saved");
    const png = Buffer.from(await (await fetch(engine.baseUrl + r.screenshotUrl)).arrayBuffer());
    const meta = await sharp(png).metadata();
    assert.equal(meta.width, VIEWPORT_WIDTH, "the screenshot has the fixed viewport width");
    assert.ok(meta.height >= 900, `the screenshot is at least one screen high (${meta.height})`);
    const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
    const x = Math.round(BLOCK.width / 2);
    const y = Math.round(BLOCK.height / 2);
    const i = (y * info.width + x) * info.channels;
    const pixel = [data[i], data[i + 1], data[i + 2]];
    const near = (a, b) => a.every((v, k) => Math.abs(v - b[k]) <= 30);
    assert.ok(near(pixel, JS_COLOUR), `the block is the JavaScript colour in the screenshot, got rgb(${pixel.join(", ")})`);
    assert.ok(!near(pixel, RAW_COLOUR), "the block is not the raw colour");

    // the network stayed busy for the whole scan, and the scan still finished
    assert.ok(pings >= 10, `the page kept requesting /ping during the scan (${pings} requests)`);
    // after the scan the page is gone: no more requests
    const settled = site.count("ping");
    await sleep(PING_EVERY_MS * 6);
    assert.equal(site.count("ping"), settled, "no requests after the scan (the browser was closed)");

    t.diagnostic(`T2 scan took ${elapsed} ms; /ping requests during the scan: ${pings}`);
});

// ---------------------------------------------------------------------------
// T3
// ---------------------------------------------------------------------------
test("T3: a page that never answers stops at the 60 s load limit as could not assess, with no screenshot and cleanup", { timeout: 180000 }, async (t) => {
    const started = Date.now();
    const r = await scanPage(engine, `${site.url}/hang`);
    const elapsed = Date.now() - started;

    assert.equal(r.httpStatus, 200, "E2-06 contract: the endpoint answers 200 with the outcome");
    assert.equal(r.result, "could not assess");
    assert.equal(r.status, "load_failed");
    assert.equal(r.errorCode, "TIMEOUT");
    assert.match(r.reason, /did not load in time/);
    assert.equal(r.statusCode, null, "no answer came back, so there is no status code");
    assert.equal(r.screenshotUrl, null, "no screenshot");
    assert.deepEqual(r.elementScreenshots, [], "no element screenshots");
    assert.ok(elapsed >= LOAD_LIMIT_MS - 1000, `the real limit was waited for (${elapsed} ms)`);
    assert.ok(elapsed < LOAD_LIMIT_MS + 30000, `and the scan stopped soon after it (${elapsed} ms)`);
    assert.equal(site.count("hang"), 1, "one attempt (a timeout is not retried)");

    // cleanup: the browser released the held connection
    const released = await waitFor(() => site.openHangSockets() === 0, 15000);
    assert.ok(released, `the held connection was closed by the engine (${site.openHangSockets()} still open)`);

    // and the engine still works
    const next = await runScript(engine, `${site.url}/js-page`);
    assert.equal(next.result, "assessed", "a normal page right after the timeout is assessed");

    t.diagnostic(`T3 timeout scan took ${elapsed} ms`);
});
