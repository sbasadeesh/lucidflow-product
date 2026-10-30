// Story:       As the engine, I must fail safely on blocked, redirected, or error pages.
// Criterion 2: Given a redirect, when scanned, then the final URL is recorded.
//
// Pages that load are scanned with the script endpoint (one capture step),
// which is quick. Pages that end on an error use the normal scan.

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

test("Test: after a redirect the final URL is recorded", { timeout: 120000 }, async () => {
    const r = await runScript(engine, `${site.url}/redirect`);

    assert.equal(r.requestedUrl, `${site.url}/redirect`, "the address that was asked for is kept");
    assert.equal(r.finalUrl, `${site.url}/ok`, "the address the browser ended on");
    assert.equal(r.redirected, true);
    assert.equal(r.statusCode, 200, "the status of the final page");
    assert.equal(r.result, "assessed", "a redirect to a normal page is still assessed");
});

test("the redirect chain lists each hop with its status code", { timeout: 120000 }, async () => {
    const r = await runScript(engine, `${site.url}/redirect`);

    assert.equal(r.redirectChain.length, 1);
    assert.equal(r.redirectChain[0].url, `${site.url}/redirect`);
    assert.equal(r.redirectChain[0].status, 302);
});

test("a permanent redirect (301) is recorded too", { timeout: 120000 }, async () => {
    const r = await runScript(engine, `${site.url}/redirect-301`);

    assert.equal(r.finalUrl, `${site.url}/ok`);
    assert.equal(r.redirectChain[0].status, 301);
});

test("a chain of redirects: every hop is listed and the last page is the final URL", { timeout: 120000 }, async () => {
    const r = await runScript(engine, `${site.url}/chain`);

    assert.equal(r.finalUrl, `${site.url}/ok`);
    assert.deepEqual(
        r.redirectChain.map((h) => [h.url, h.status]),
        [
            [`${site.url}/chain`, 301],
            [`${site.url}/chain-2`, 302],
        ]
    );
});

test("a redirect done by JavaScript is recorded too", { timeout: 120000 }, async () => {
    const r = await runScript(engine, `${site.url}/redirect-js`);

    assert.equal(r.finalUrl, `${site.url}/ok`);
    assert.equal(r.redirected, true);
});

test("a page without a redirect: the final URL is the requested URL and redirected is false", { timeout: 120000 }, async () => {
    const r = await runScript(engine, `${site.url}/ok`);

    assert.equal(r.finalUrl, `${site.url}/ok`);
    assert.equal(r.requestedUrl, `${site.url}/ok`);
    assert.equal(r.redirected, false);
    assert.deepEqual(r.redirectChain, []);
});

test("a redirect that ends on an error page: could not assess, with the final URL and its status code", { timeout: 120000 }, async () => {
    const r = await scan(engine, `${site.url}/redirect-to-missing`);

    assert.equal(r.result, "could not assess");
    assert.equal(r.statusCode, 404, "the status of the page the redirect led to");
    assert.equal(r.finalUrl, `${site.url}/status/404`);
    assert.equal(r.redirected, true);
    assert.equal(r.redirectChain[0].status, 302);
});

test("the redirect is written in the log", { timeout: 120000 }, async () => {
    const r = await runScript(engine, `${site.url}/chain`);
    const lines = r.actionLog.map((a) => a.action);

    assert.ok(lines.some((l) => l.startsWith("Redirected:") && l.includes("/chain-2") && l.includes("/ok")), lines.join("\n"));
    assert.ok(lines.some((l) => l.startsWith("Final URL:") && l.includes(`${site.url}/ok`)));
});

test("the final URL is saved with the scan", { timeout: 120000 }, async () => {
    const r = await runScript(engine, `${site.url}/redirect`);
    const saved = await getJson(engine, `/api/scans/${r.scanId}`);

    assert.equal(saved.finalUrl, `${site.url}/ok`);
    assert.equal(saved.redirected, true);
});
