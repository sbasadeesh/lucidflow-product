const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const { chromium } = require("playwright");
const { checkSecurityGuards } = require("../../security_guard/securityGuard");

let browser, server, baseUrl;

test.before(async () => {
    browser = await chromium.launch({ headless: true });
    server = http.createServer((req, res) => {
        res.setHeader("Content-Type", "text/html");
        if (req.url === "/login") return res.end("<html><body>Please sign in to continue</body></html>");
        if (req.url === "/otp") return res.end("<html><body>Enter the OTP sent to your mobile</body></html>");
        if (req.url === "/safe") return res.end("<html><body>Welcome to our homepage</body></html>");
        res.end("OK");
    });
    await new Promise(r => server.listen(0, "127.0.0.1", r));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
    if (browser) await browser.close();
    if (server) server.close();
});

test("AC1: Login and OTP pages are flagged as AUTH_REQUIRED", async () => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(`${baseUrl}/login`);
    let result = await checkSecurityGuards(page);
    assert.equal(result.blocked, true);
    assert.equal(result.reason, "AUTH_REQUIRED");

    await page.goto(`${baseUrl}/otp`);
    result = await checkSecurityGuards(page);
    assert.equal(result.blocked, true);
    assert.equal(result.reason, "AUTH_REQUIRED");

    await page.goto(`${baseUrl}/safe`);
    result = await checkSecurityGuards(page);
    assert.equal(result.blocked, false);

    await context.close();
});