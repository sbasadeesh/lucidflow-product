// Story:       As the engine, I must fail safely on blocked, redirected, or error pages.
// Criterion 1: Given a 403, 404 or 500, when scanned, then the result is
//              "could not assess" with the status code.

const test = require("node:test");
const assert = require("node:assert/strict");

const { startSite, startEngine, scan, runScript, getJson } = require("../errorFixtures");

let site;
let engine;

test.before(async () => {
    site = await startSite();
    engine = await startEngine();
});

test.after(async () => {
    if (engine) await engine.stop();
    if (site) await site.close();
});

for (const code of [403, 404, 500]) {
    test(`Test: a ${code} page gives "could not assess" with the status code`, { timeout: 120000 }, async () => {
        const r = await scan(engine, `${site.url}/status/${code}`);

        assert.equal(r.result, "could not assess");
        assert.equal(r.statusCode, code);
        assert.equal(r.status, "http_error");
        assert.ok(r.reason.includes(String(code)), `the reason should name the status: ${r.reason}`);
        assert.equal(r.errorCode, `HTTP_${code}`);
    });
}

test("another error status (503) is handled the same way", { timeout: 120000 }, async () => {
    const r = await scan(engine, `${site.url}/status/503`);
    assert.equal(r.result, "could not assess");
    assert.equal(r.statusCode, 503);
});

test("an error page gives no screenshot, no states and no interactions", { timeout: 120000 }, async () => {
    const r = await scan(engine, `${site.url}/status/404`);

    assert.equal(r.screenshotUrl, null);
    assert.equal(r.elementScreenshotUrl, null);
    assert.deepEqual(r.elementScreenshots, []);
    assert.equal(r.states, 0, "nothing was scanned, so there are no states");
    assert.equal(r.interactions, 0);
    assert.equal(r.stepsVisited, 0);
});

test("the log says that the page could not be assessed, and why", { timeout: 120000 }, async () => {
    const r = await scan(engine, `${site.url}/status/500`);
    const lines = r.actionLog.map((a) => a.action);

    assert.ok(lines.some((l) => l.startsWith("Could not assess:") && l.includes("500")), lines.join("\n"));
});

test("a 403 that is really a block page (Access Denied) is reported as blocked, with its status code", { timeout: 120000 }, async () => {
    const r = await scan(engine, `${site.url}/blocked-403`);

    assert.equal(r.result, "could not assess");
    assert.equal(r.status, "blocked");
    assert.equal(r.statusCode, 403);
    assert.equal(r.errorCode, "HTTP_403");
});

test("the script endpoint handles an error page the same way", { timeout: 120000 }, async () => {
    const r = await runScript(engine, `${site.url}/status/404`);

    assert.equal(r.result, "could not assess");
    assert.equal(r.statusCode, 404);
    assert.equal(r.states, 0);
    assert.deepEqual(r.capturedStates, []);
    assert.equal(r.counts.statesCaptured, 0);
});

test("the result and the status code are saved with the scan", { timeout: 120000 }, async () => {
    const r = await scan(engine, `${site.url}/status/404`);
    const saved = await getJson(engine, `/api/scans/${r.scanId}`);

    assert.equal(saved.result, "could not assess");
    assert.equal(saved.statusCode, 404);
    assert.equal(saved.status, "http_error");
});
