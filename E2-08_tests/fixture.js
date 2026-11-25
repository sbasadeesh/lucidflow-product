// Shared fixture for the state fingerprint and action journal tests (not a test file itself).
// Every page is local HTML set with page.setContent; nothing is loaded from the network.
// Screenshots go to a disposable folder under os.tmpdir().

const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");

const VIEWPORT = { width: 1000, height: 700 };

async function launchBrowser() {
    return chromium.launch({ headless: true });
}

async function openHtml(browser, html) {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.setContent(html);
    return { page, context };
}

function makeTmpDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "e2-08-tests-"));
}

function removeDir(dir) {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
}

module.exports = { VIEWPORT, launchBrowser, openHtml, makeTmpDir, removeDir };
