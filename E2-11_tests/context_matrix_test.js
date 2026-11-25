const { describe, it, before, after } = require("node:test");
const assert = require("node:assert");
const { chromium } = require("playwright");
const { analyzeContexts } = require("../context_analyzer/context_analyzer");
const { startServers } = require("./fixture");

describe("E2-11: Shadow DOM, iframe, and Canvas Matrix", () => {
    let browser, server;

    before(async () => {
        // Use the new dual-server setup
        server = await startServers();
        browser = await chromium.launch({ headless: true });
    });

    after(async () => {
        if (browser) await browser.close();
        if (server) server.close();
    });

    it("AC1: Same-origin and open shadow controls are linked, unsupported carry reasons", async () => {
        const page = await browser.newPage();
        
        // Wait for "load" (avoids the LF-CAP-001 networkidle trap)
        await page.goto(server.url, { waitUntil: "load" });
        
        // Give iframes a moment to attach their contexts in Playwright
        await page.waitForTimeout(1000);
        
        const matrix = await analyzeContexts(page);

        // Debug log so if it fails again, you can see exactly what was detected
        console.log("Detected Matrix:", matrix);

        // Check Iframes
        assert.strictEqual(matrix.same_origin_iframes.length, 1, "Missing same-origin iframe");
        assert.strictEqual(matrix.cross_origin_iframes.length, 1, "Missing cross-origin iframe");

        // Check Shadow DOMs and Canvas
        assert.strictEqual(matrix.open_shadow_doms, 1, "Missing open shadow root");
        assert.strictEqual(matrix.closed_shadow_doms, 1, "Missing closed shadow root");
        assert.strictEqual(matrix.canvases, 1, "Missing canvas");
    });

    it("AC2: Unsupported contexts trigger SAFE_HOLD instead of invented success", async () => {
        const page = await browser.newPage();
        await page.goto(server.url, { waitUntil: "load" });
        await page.waitForTimeout(1000);
        
        const matrix = await analyzeContexts(page);

        // Because we have a canvas, closed shadow, and cross-origin iframe, the status must be SAFE_HOLD
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

        // Convert to JSON to ignore object references in deep equality
        assert.deepStrictEqual(JSON.parse(JSON.stringify(matrix1)), JSON.parse(JSON.stringify(matrix2)), "Matrices should match across identical runs");
    });
});
