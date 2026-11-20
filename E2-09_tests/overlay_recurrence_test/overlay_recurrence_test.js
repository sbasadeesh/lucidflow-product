const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const { chromium } = require("playwright");
const { dismissOverlays } = require("../../server");

let browser;
let server;
let baseUrl;

// HTML Fixture 1: Popup closes but reappears after 1.5 seconds
const RECURRING_POPUP_HTML = `<!doctype html>
<html><body>
  <div id="popup" style="position:fixed; top:10px; left:10px; width:200px; height:100px; background:red; z-index:1000;">
    <p>Overlay Content</p>
    <button id="close">Close</button>
  </div>
  <script>
    document.getElementById('close').addEventListener('click', () => {
      document.getElementById('popup').style.display = 'none';
      setTimeout(() => {
        document.getElementById('popup').style.display = 'block';
      }, 1500);
    });
  </script>
</body></html>`;

// HTML Fixture 2: Popup closes and stays closed
const NON_RECURRING_POPUP_HTML = `<!doctype html>
<html><body>
  <div id="popup" style="position:fixed; top:10px; left:10px; width:200px; height:100px; background:red; z-index:1000;">
    <p>Overlay Content</p>
    <button id="close">Close</button>
  </div>
  <script>
    document.getElementById('close').addEventListener('click', () => {
      document.getElementById('popup').style.display = 'none';
    });
  </script>
</body></html>`;

test.before(async () => {
    browser = await chromium.launch({ headless: true });
    server = http.createServer((req, res) => {
        res.setHeader("Content-Type", "text/html");
        if (req.url === "/recurring") return res.end(RECURRING_POPUP_HTML);
        if (req.url === "/non-recurring") return res.end(NON_RECURRING_POPUP_HTML);
        res.end("OK");
    });
    await new Promise(r => server.listen(0, "127.0.0.1", r));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
    if (browser) await browser.close();
    if (server) server.close();
});

test("AC1 & AC2: recurring overlay returns typed rejection OVERLAY_RECURRENCE_DETECTED", { timeout: 60000 }, async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${baseUrl}/recurring`);

    const guard = { overlayRecurred: false, recurrenceReason: null, recurrenceTrace: null };
    const record = () => {}; // Silent logger for tests

    // This should take OBSERVATION_WINDOW_MS (5000ms) + 1.5s for recurrence
    const dismissed = await dismissOverlays(page, record, guard);

    assert.equal(dismissed, 1, "Should dismiss exactly 1 overlay");
    
    // AC2 Check: Controlled rejection is triggered
    assert.equal(guard.overlayRecurred, true, "The engine should flag that the overlay recurred");
    assert.equal(guard.recurrenceReason, "OVERLAY_RECURRENCE_DETECTED");

    // AC1 Check: Event trace links dismissal and recurrence
    assert.ok(guard.recurrenceTrace, "Should contain an event trace");
    assert.ok(guard.recurrenceTrace.family.includes("overlay content"), "Trace should contain the overlay signature");
    assert.ok(guard.recurrenceTrace.observedForMs >= 5000, "Trace should record the observation window time");

    await context.close();
});

test("AC2: non-recurring overlay does not trigger rejection", { timeout: 60000 }, async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${baseUrl}/non-recurring`);

    const guard = { overlayRecurred: false, recurrenceReason: null, recurrenceTrace: null };
    const record = () => {};

    // Waits OBSERVATION_WINDOW_MS (5000ms) but overlay stays closed
    const dismissed = await dismissOverlays(page, record, guard);

    assert.equal(dismissed, 1, "Should dismiss exactly 1 overlay");
    assert.equal(guard.overlayRecurred, false, "Should NOT flag recurrence");
    assert.equal(guard.recurrenceReason, null);

    await context.close();
});

test("AC3: repeated execution produces the same rejection", { timeout: 120000 }, async () => {
    // Run the recurring test twice to prove stability
    const runTest = async () => {
        const context = await browser.newContext();
        const page = await context.newPage();
        await page.goto(`${baseUrl}/recurring`);
        const guard = { overlayRecurred: false, recurrenceReason: null, recurrenceTrace: null };
        await dismissOverlays(page, () => {}, guard);
        await context.close();
        return guard.overlayRecurred;
    };

    const result1 = await runTest();
    const result2 = await runTest();

    assert.equal(result1, true);
    assert.equal(result2, true);
    assert.deepEqual(result1, result2, "Both runs should produce the same result");
});