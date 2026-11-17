// Criterion 2: Given a slow page, when load exceeds the limit (30 s), then the scan stops with a timeout message.
// The tests use a short limit (expected.json "testLimitMs") so they run fast. The code path is the same as for 30 s.
// The 30 s default itself is checked in config_test.js.

const test = require("node:test");
const assert = require("node:assert/strict");

const capture = require("../../capture");
const { startFixtureServer, expected } = require("../fixture");

const slow = expected["slow-page"];
let site;
const net = require("net");

test.before(async () => {
    site = await startFixtureServer();
});

test.after(async () => {
    if (site) await site.close();
});

test("Given a slow page, when the load takes longer than the limit, then the scan stops with a timeout error", { timeout: 60000 }, async () => {
    await assert.rejects(
        () => capture.render(`${site.url}/${slow.file}`, { timeoutMs: slow.testLimitMs }),
        (e) => {
            assert.ok(e instanceof capture.RenderError, "a RenderError is thrown");
            assert.equal(e.code, slow.errorCode);
            assert.equal(e.httpStatus, slow.httpStatus);
            return true;
        }
    );
});

test("Given a slow page, when the scan stops, then the message says the page did not finish loading and the scan was stopped", { timeout: 60000 }, async () => {
    await assert.rejects(
        () => capture.render(`${site.url}/${slow.file}`, { timeoutMs: slow.testLimitMs }),
        (e) => {
            assert.ok(e.message.includes(slow.messageContains), e.message);
            return true;
        }
    );
});

test("Given a slow page, when the scan stops, then the browser is closed", { timeout: 60000 }, async () => {
    let browser = null;
    await assert.rejects(() =>
        capture.render(`${site.url}/${slow.file}`, {
            timeoutMs: slow.testLimitMs,
            onPage: async (page) => {
                browser = page.context().browser();
            },
        })
    );
    assert.ok(browser, "the browser was started");
    assert.equal(browser.isConnected(), false, "the browser was closed after the timeout");
});

test("Given a page that answers in time, when the limit is longer than the delay, then there is no timeout", { timeout: 60000 }, async () => {
    const r = await capture.render(`${site.url}/${slow.file}`, { timeoutMs: slow.delayMs + 10000 });
    try {
        assert.equal(r.statusCode, 200);
    } finally {
        await r.close();
    }
});

test("Given a site that cannot be reached, when the scan starts, then a clear 'did not answer' error is returned", { timeout: 60000 }, async () => {
    // take a free port, then close it again: nothing listens there, and the browser allows the port
    const probe = net.createServer();
    await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
    const port = probe.address().port;
    await new Promise((resolve) => probe.close(resolve));

    await assert.rejects(
        () => capture.render(`http://127.0.0.1:${port}`),
        (e) => {
            assert.ok(e instanceof capture.RenderError);
            assert.equal(e.code, "load_failed");
            assert.equal(e.httpStatus, 502);
            assert.ok(e.message.includes("did not answer"), e.message);
            return true;
        }
    );
});