// Developer note: never return "no dark pattern" for a page that could not be loaded.
// Here that means: a page that could not be loaded never gets result "assessed".

const test = require("node:test");
const assert = require("node:assert/strict");

const { startSite, startEngine, scan, runScript, post, getJson } = require("../errorFixtures");

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

test("Test: a page that answers 200 but says \"Page not found\" is still could not assess", { timeout: 120000 }, async () => {
    const r = await scan(engine, `${site.url}/soft-404`);

    assert.equal(r.result, "could not assess");
    assert.equal(r.status, "http_error");
    assert.equal(r.statusCode, 200, "the real status is kept, it was a 200");
    assert.equal(r.screenshotUrl, null);
});

test("a site that drops the connection (bot protection) is could not assess, with an error code", { timeout: 120000 }, async () => {
    const r = await scan(engine, `${site.url}/cut`);

    assert.equal(r.result, "could not assess");
    assert.equal(r.status, "blocked");
    assert.match(r.errorCode, /^ERR_/);
    assert.equal(r.statusCode, null, "no answer came back, so there is no status code");
    assert.ok(r.actionLog.some((a) => a.action.includes("trying once more")), "it tried once more before giving up");
});

test("an address that does not exist is could not assess", { timeout: 120000 }, async () => {
    // .invalid is reserved: it never exists
    const r = await scan(engine, "http://this-address-does-not-exist.invalid/");

    assert.equal(r.result, "could not assess");
    assert.equal(r.status, "load_failed");
    assert.ok(r.errorCode, "an error code is given");
    assert.equal(r.screenshotUrl, null);
});

test("no failed page is ever reported as assessed", { timeout: 240000 }, async () => {
    const failing = ["/status/403", "/status/404", "/status/500", "/blocked-403", "/soft-404", "/redirect-to-missing"];

    for (const path of failing) {
        const r = await scan(engine, site.url + path);
        assert.notEqual(r.result, "assessed", `${path} must not be assessed`);
        assert.equal(r.result, "could not assess", path);
        assert.equal(r.screenshotUrl, null, `${path} must not give a screenshot`);
        assert.equal(r.states, 0, `${path} must have no states`);
        assert.ok(r.reason, `${path} must give a reason`);
    }
});

test("a page that loads normally is assessed (the check does not block good pages)", { timeout: 120000 }, async () => {
    const r = await runScript(engine, `${site.url}/ok`);

    assert.equal(r.result, "assessed");
    assert.equal(r.status, "completed");
    assert.equal(r.statusCode, 200);
    assert.equal(r.counts.statesCaptured, 1);
});

test("scans that could not be assessed are saved and listed, so nothing disappears", { timeout: 120000 }, async () => {
    const r = await scan(engine, `${site.url}/status/500`);

    const list = await getJson(engine, "/api/scans");
    const found = list.scans.find((s) => s.scanId === r.scanId);

    assert.ok(found, "the scan is in the history");
    assert.equal(found.result, "could not assess");
    assert.equal(found.statusCode, 500);
});

test("a request without a URL is rejected before any scan starts", { timeout: 60000 }, async () => {
    const r = await post(engine, "/api/screenshot", {});
    assert.equal(r.httpStatus, 400);
    assert.ok(r.error);
});

test("a script that is not valid is rejected with a clear message", { timeout: 60000 }, async () => {
    const r = await post(engine, "/api/script", { url: `${site.url}/ok`, script: "{ not valid" });
    assert.equal(r.httpStatus, 400);
    assert.ok(r.error.length > 10);
});
