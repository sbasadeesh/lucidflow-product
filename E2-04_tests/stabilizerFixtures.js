// Fixture pages for the stabilizer tests (not a test file itself).
// Both pages are fixed HTML: any difference between two scans comes from
// animations or "volatile" content, not from the page changing on its own.

const { VIEWPORT } = require("./fixture");

// Static layout + CSS animations (spinner, pulsing box, sliding box).
// Two scans taken at different moments would catch them in different positions.
function animatedHtml({ extraBlock = false } = {}) {
    return `<!doctype html>
<html><head><style>
  body { margin: 0; font-family: Arial, sans-serif; background: #fff; }
  h1 { margin: 20px; font-size: 32px; }
  #spinner { width: 120px; height: 120px; margin: 20px; background: rgb(0, 120, 255);
             animation: spin 1s linear infinite; }
  #pulse { width: 300px; height: 100px; margin: 20px; background: rgb(0, 160, 80);
           animation: pulse 0.8s ease-in-out infinite alternate; }
  #slider { width: 100px; height: 60px; margin: 20px; background: rgb(240, 160, 0);
            position: relative; animation: slide 1.2s ease-in-out infinite alternate; }
  #extra { width: 500px; height: 300px; margin: 20px; background: rgb(200, 0, 0); }
  @keyframes spin  { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @keyframes pulse { from { opacity: 0.2; } to { opacity: 1; } }
  @keyframes slide { from { left: 0; } to { left: 400px; } }
</style></head>
<body>
  <h1>Quote page</h1>
  <div id="spinner"></div>
  <div id="pulse"></div>
  <div id="slider"></div>
  ${extraBlock ? '<div id="extra"></div>' : ""}
</body></html>`;
}

// A page with VOLATILE content:
//   #ad     big box whose colour depends on `seed` (a different ad each visit)
//   #clock  text that a script rewrites every 30 ms
//   #spin   CSS animation
// `seed` stands for "which visit is this": scan 1 uses seed 1, scan 2 uses seed 2.
function volatileHtml(seed) {
    const adColour = seed % 2 === 1 ? "rgb(220, 40, 40)" : "rgb(40, 40, 220)";
    return `<!doctype html>
<html><head><style>
  body { margin: 0; font-family: monospace; background: #fff; }
  h1 { margin: 20px; font-size: 28px; }
  #ad { width: 500px; height: 300px; margin: 20px; background: ${adColour}; }
  #clock { width: 320px; height: 40px; margin: 20px; font-size: 22px; overflow: hidden; background: #eee; }
  #spin { width: 80px; height: 80px; margin: 20px; background: rgb(0, 120, 255);
          animation: spin 1s linear infinite; }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
</style></head>
<body>
  <h1>Offers</h1>
  <div id="ad">advert ${seed}</div>
  <div id="clock"></div>
  <div id="spin"></div>
  <script>
    const clock = document.getElementById("clock");
    const tick = () => { clock.textContent = new Date().toISOString() + " " + Math.random().toFixed(6); };
    tick();
    setInterval(tick, 30);
  </script>
</body></html>`;
}

// Open a page in its own browser context
async function openHtml(browser, html) {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.setContent(html);
    return { page, context };
}

module.exports = { animatedHtml, volatileHtml, openHtml };