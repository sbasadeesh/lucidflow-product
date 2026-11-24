const { describe, it, before, after } = require("node:test");
const assert = require("node:assert");
const { chromium } = require("playwright");
const { waitForReadiness } = require("../../screenshotModule");
const { startServer } = require("../fixture");

describe("E2-10: Dynamic Readiness & Lazy Capture", () => {
    let browser, server;

    before(async () => {
        server = await startServer();
        browser = await chromium.launch({ headless: true });
    });

    after(async () => {
        if (browser) await browser.close();
        if (server) server.close();
    });

    it("AC1: Lazy-loaded content is captured while visible, timeout is recorded", async () => {
        const page = await browser.newPage();
        await page.goto(`${server.url}/lazy`);
        
        // We expect it to find the #content landmark and wait for the spinner to hide
        const result = await waitForReadiness(page, { 
            landmark: "#content", 
            spinner: ".spinner",
            timeoutMs: 5000 
        });

        assert.strictEqual(result.status, "CONTROL_OK");
        // Proves it actually waited for the 1.5s timeout in the fixture
        assert.ok(result.durationMs >= 1000, "Should have waited at least 1000ms");
        
        const isContentVisible = await page.locator("#content").isVisible();
        assert.strictEqual(isContentVisible, true);
    });

    it("AC2: Never-idle page returns typed reason SAFE_HOLD (no invented success)", async () => {
        const page = await browser.newPage();
        await page.goto(`${server.url}/never-idle`);
        
        // We expect it to timeout because the spinner never hides
        const result = await waitForReadiness(page, { 
            landmark: "#content", 
            spinner: ".spinner",
            timeoutMs: 2000 
        });

        assert.strictEqual(result.status, "SAFE_HOLD");
        assert.strictEqual(result.reason, "READINESS_TIMEOUT");
    });
});