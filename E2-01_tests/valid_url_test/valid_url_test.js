// Criterion 1: Given a valid URL, when scan starts, then the page loads with JavaScript executed.

const test = require("node:test");
const assert = require("node:assert/strict");

const capture = require("../../capture");
const { startFixtureServer, expected } = require("../fixture");

const want = expected["js-page"];
let site;

test.before(async () => {
    site = await startFixtureServer();
});

test.after(async () => {
    if (site) await site.close();
});

test("Given a valid URL, when the scan starts, then the page loads with JavaScript executed", { timeout: 60000 }, async () => {
    const r = await capture.render(`${site.url}/${want.file}`);
    try {
        assert.equal(r.statusCode, want.status);
        assert.equal(r.title, want.title);
        assert.equal(await r.page.textContent(want.selector), want.textAfterJavaScript);
    } finally {
        await r.close();
    }
});

test("Given a valid URL, when the scan starts, then the words that only JavaScript adds are on the page, and are not in the raw HTML", { timeout: 60000 }, async () => {
    // the raw HTML, as a plain download would see it
    const raw = await (await fetch(`${site.url}/${want.file}`)).text();
    assert.ok(raw.includes(want.textInHtml), "the raw HTML has the starting text");
    assert.ok(!raw.includes(`>${want.textAfterJavaScript}<`), "the raw HTML does not have the JavaScript text");

    // the page as the engine renders it
    const r = await capture.render(`${site.url}/${want.file}`);
    try {
        const shown = await r.page.textContent(want.selector);
        assert.equal(shown, want.textAfterJavaScript);
        assert.notEqual(shown, want.textInHtml);
    } finally {
        await r.close();
    }
});

test("Given a valid URL, when the scan starts, then the page is rendered in the fixed viewport", { timeout: 60000 }, async () => {
    const r = await capture.render(`${site.url}/${want.file}`);
    try {
        assert.deepEqual(r.viewport, want.viewport);
        assert.deepEqual(r.page.viewportSize(), want.viewport);
        const inner = await r.page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
        assert.deepEqual(inner, want.viewport);
    } finally {
        await r.close();
    }
});

test("Given a valid URL, when the page has loaded, then the document is complete", { timeout: 60000 }, async () => {
    const r = await capture.render(`${site.url}/${want.file}`);
    try {
        assert.equal(r.readyState, "complete");
        assert.ok(r.finalUrl.endsWith(want.file));
        assert.ok(Number.isFinite(r.loadMs) && r.loadMs >= 0, "the load time is reported");
    } finally {
        await r.close();
    }
});

test("Given a setup callback, when the scan starts, then the callback runs before the page is opened", { timeout: 60000 }, async () => {
    let urlWhenCalled = null;
    const r = await capture.render(`${site.url}/${want.file}`, {
        onPage: async (page) => {
            urlWhenCalled = page.url();
        },
    });
    await r.close();
    assert.equal(urlWhenCalled, "about:blank", "nothing was opened yet when the callback ran");
});

test("Given a rendered page, when it is closed, then the browser is closed", { timeout: 60000 }, async () => {
    const r = await capture.render(`${site.url}/${want.file}`);
    assert.equal(r.browser.isConnected(), true);
    await r.close();
    assert.equal(r.browser.isConnected(), false);
});