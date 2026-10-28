// Shared fixture for the screenshot tests (not a test file itself).
// A page whose content never changes on its own, so every result is repeatable.
//
//   #title  blue box, 300 x 80, at the top
//   #lazy   grey block far below the fold - turns RED only when scrolled into view
//           (this is how a lazy-loaded section behaves)

const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");

const VIEWPORT = { width: 1366, height: 900 };

const FIXTURE_HTML = `
<!doctype html>
<html>
<head>
  <style>
    body { margin: 0; font-family: Arial, sans-serif; }
    #title { width: 300px; height: 80px; margin: 20px; background: rgb(0, 0, 255); }
    #spacer { height: 2500px; background: #f4f4f4; }
    #lazy { width: 600px; height: 400px; margin: 20px; background: rgb(200, 200, 200); }
    #footer { height: 200px; background: #ddd; }
  </style>
</head>
<body>
  <div id="title">Title</div>
  <div id="spacer"></div>
  <div id="lazy"></div>
  <div id="footer"></div>
  <script>
    new IntersectionObserver((entries, obs) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.style.background = "rgb(255, 0, 0)";
          obs.disconnect();
        }
      });
    }).observe(document.getElementById("lazy"));
  </script>
</body>
</html>`;

async function launchBrowser() {
    return chromium.launch({ headless: true });
}

async function openFixture(browser) {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.setContent(FIXTURE_HTML);
    return { page, context };
}

function makeTmpDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "shot-tests-"));
}

function removeDir(dir) {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
}

module.exports = { VIEWPORT, FIXTURE_HTML, launchBrowser, openFixture, makeTmpDir, removeDir };
