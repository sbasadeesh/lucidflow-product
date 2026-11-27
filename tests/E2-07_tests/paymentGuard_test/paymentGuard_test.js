const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const { chromium } = require("playwright");
const { checkSecurityGuards } = require("../../../backend/src/modules/security-guard/securityGuard");

let browser, server, baseUrl;

test.before(async () => {
    browser = await chromium.launch({ headless: true });
    server = http.createServer((req, res) => {
        res.setHeader("Content-Type", "text/html");
        if (req.url === "/checkout") return res.end("<html><body>Enter your Card Number</body></html>");
        if (req.url === "/payment") return res.end("<html><body>Proceed to Pay</body></html>");
        res.end("OK");
    });
    await new Promise(r => server.listen(0, "127.0.0.1", r));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
    if (browser) await browser.close();
    if (server) server.close();
});

test("AC2: Payment and Checkout pages are flagged as PAYMENT_REQUIRED", async () => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(`${baseUrl}/checkout`);
    let result = await checkSecurityGuards(page);
    assert.equal(result.blocked, true);
    assert.equal(result.reason, "PAYMENT_REQUIRED");

    await page.goto(`${baseUrl}/payment`);
    result = await checkSecurityGuards(page);
    assert.equal(result.blocked, true);
    assert.equal(result.reason, "PAYMENT_REQUIRED");

    await context.close();
});