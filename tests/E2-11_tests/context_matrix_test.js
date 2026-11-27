const { describe, it, before, after } = require("node:test");
const assert = require("node:assert");
const { chromium } = require("playwright");
const { analyzeContexts } = require("../../backend/src/modules/context_analyzer/context_analyzer");
const { startServers } = require("./fixture");

describe("E2-11: Shadow DOM, iframe, and Canvas Matrix", () => {
    let browser, server;

    before(async () => {
        server = await startServers();
        browser = await chromium.launch({ headless: true });
    });

    after(async () => {
        if (browser) await browser.close();
        if (server) server.close();
    });

    it("AC1: Same-origin and open shadow controls are linked, unsupported carry reasons", async () => {
        const page = await browser.newPage();

        await page.goto(server.url, { waitUntil: "load" });
        await page.waitForTimeout(1000);

        const matrix = await analyzeContexts(page);

        console.log("Detected Matrix:", matrix);

        assert.strictEqual(matrix.same_origin_iframe_origins.length, 1, "Missing same-origin iframe origin");
        assert.strictEqual(new URL(matrix.same_origin_iframe_origins[0]).origin, matrix.same_origin_iframe_origins[0], "Same-origin iframe should persist origin only");

        assert.strictEqual(matrix.cross_origin_iframe_origins.length, 1, "Missing cross-origin iframe origin");
        assert.strictEqual(new URL(matrix.cross_origin_iframe_origins[0]).origin, matrix.cross_origin_iframe_origins[0], "Cross-origin iframe should persist origin only");
        assert.match(matrix.cross_origin_iframe_origins[0], /^https?:\/\/127\.0\.0\.1:\d+$/);

        assert.strictEqual(matrix.open_shadow_roots, 1, "Missing open shadow root");
        assert.strictEqual(matrix.suspected_closed_shadow_custom_elements, 1, "Missing suspected custom element count");
        assert.strictEqual(matrix.canvases, 1, "Missing canvas");
    });

    it("AC2: Unsupported contexts trigger SAFE_HOLD instead of invented success", async () => {
        const page = await browser.newPage();
        await page.goto(server.url, { waitUntil: "load" });
        await page.waitForTimeout(1000);

        const matrix = await analyzeContexts(page);

        assert.strictEqual(matrix.status, "SAFE_HOLD");
        assert.strictEqual(matrix.reason, "UNSUPPORTED_CONTEXT_DETECTED");
    });

    it("AC3: Repeated execution produces identical matrix", async () => {
        const page1 = await browser.newPage();
        await page1.goto(server.url, { waitUntil: "load" });
        await page1.waitForTimeout(1000);
        const matrix1 = await analyzeContexts(page1);

        const page2 = await browser.newPage();
        await page2.goto(server.url, { waitUntil: "load" });
        await page2.waitForTimeout(1000);
        const matrix2 = await analyzeContexts(page2);

        assert.deepStrictEqual(JSON.parse(JSON.stringify(matrix1)), JSON.parse(JSON.stringify(matrix2)), "Matrices should match across identical runs");
    });
});