// Shared fixture for the overlay recurrence observation tests (not a test file itself).
//   startSite()    local 127.0.0.1 site (random port) with controlled popup pages
//   startEngine()  starts this repository's server.js on a free port with the given
//                  environment, and keeps its standard output for inspection
//   observations() parses the "[overlay-observation]" lines from that output
// Nothing here contacts the network.

const http = require("http");
const net = require("net");
const path = require("path");
const { spawn } = require("child_process");
const { chromium } = require("playwright");

const PRIVATE_TEXT = "PRIVATE-OVERLAY-TEXT-7731 jane.doe@example.com 9876543210";

const page = (title, body) =>
    `<!doctype html><html><head><title>${title}</title></head><body><h1>${title}</h1><p>Ordinary page content for the scan.</p>${body}</body></html>`;

// A promo overlay the engine detects (fixed, large, "modal" class hint) and closes
// with its "Got it" control. clearPopups() does not match it.
const overlay = (id, inner) =>
    `<div id="${id}" class="promo-modal" style="position:fixed;top:120px;left:200px;width:420px;height:220px;background:#fff;border:2px solid #333;z-index:1000">${inner}</div>`;

const PAGES = {
    // closes with its control and stays closed
    "/stays-closed": page("Stays closed", overlay("promo", `<p>Summer offer ${PRIVATE_TEXT}</p><button id="ok">Got it</button>`) +
        `<script>document.getElementById('ok').onclick = () => { document.getElementById('promo').style.display = 'none'; };</script>`),

    // closes with its control, then the SAME element is shown again 1000 ms later (once).
    // The engine confirms the dismissal about 600 ms after the click, so the overlay is
    // still hidden at that check (400 ms margin) and comes back well before the quiet exit.
    "/recurs": page("Recurs", overlay("promo", `<p>Summer offer ${PRIVATE_TEXT}</p><button id="ok">Got it</button>`) +
        `<script>let shown = 0; document.getElementById('ok').onclick = () => {
            const p = document.getElementById('promo'); p.style.display = 'none';
            if (!shown++) setTimeout(() => { p.style.display = 'block'; }, 1000);
        };</script>`),

    // B1 gap, event-driven (no timers): closing the promo reveals an in-page "Accept all"
    // button. On the next popup-loop tick, after the observation poll, the existing
    // clearPopups() clicks that button, and its handler shows the SAME promo again, so it
    // is visible again only between the poll and the dismissOverlays() scan of that tick.
    "/b1-gap": page("Between poll and scan", overlay("promo", `<p>Summer offer</p><button id="ok">Got it</button>`) +
        `<div><button id="accept" style="display:none">Accept all</button></div>` +
        `<script>let closes = 0;
            document.getElementById('ok').onclick = () => {
                document.getElementById('promo').style.display = 'none';
                if (!closes++) document.getElementById('accept').style.display = 'inline-block';
            };
            document.getElementById('accept').onclick = () => {
                document.getElementById('accept').remove();
                document.getElementById('promo').style.display = 'block';
            };</script>`),

    // closes with its control; 800 ms later a DIFFERENT overlay appears and stays
    "/different": page("Different", overlay("promo", `<p>Summer offer</p><button id="ok">Got it</button>`) +
        `<script>document.getElementById('ok').onclick = () => {
            document.getElementById('promo').style.display = 'none';
            setTimeout(() => { document.body.insertAdjacentHTML('beforeend',
                '<div style="position:fixed;top:40px;left:40px;width:300px;height:160px;background:#eef;z-index:999" class="newsletter-popup"><p>Newsletter signup with a different layout</p><a href="#">Learn more</a><a href="#">Read the terms</a></div>'); }, 800);
        };</script>`),

    // no close control; closes on Escape and stays closed
    "/escape": page("Escape", overlay("promo", `<p>Press escape to continue reading</p>`) +
        `<script>document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.getElementById('promo').style.display = 'none'; });</script>`),

    // no close control and ignores Escape: the engine falls back to hiding it
    "/hidden-fallback": page("Hidden fallback", overlay("promo", `<p>This overlay cannot be closed by the visitor</p>`)),

    // no overlay at all
    "/plain": page("Plain", ""),
};

function listen(server) {
    return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
}

async function freePort() {
    const s = net.createServer();
    const port = await listen(s);
    await new Promise((r) => s.close(r));
    return port;
}

async function startSite() {
    const server = http.createServer((req, res) => {
        const p = new URL(req.url, "http://localhost").pathname;
        if (PAGES[p]) {
            res.writeHead(200, { "Content-Type": "text/html" });
            return res.end(PAGES[p]);
        }
        res.writeHead(404, { "Content-Type": "text/html" });
        res.end("<p>No such page.</p>");
    });
    const port = await listen(server);
    return { url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) };
}

async function startEngine(env = {}) {
    const port = await freePort();
    const root = path.resolve(__dirname, "..", "..");
    const clean = { ...process.env };
    delete clean.LF_OVERLAY_OBSERVATION;
    delete clean.LF_OVERLAY_OBSERVATION_WINDOW_MS;
    const child = spawn(process.execPath, ["server.js"], {
        cwd: root,
        env: { ...clean, ...env, PORT: String(port) },
        stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (output += d));
    await new Promise((resolve, reject) => {
        // a child that did not become ready is stopped, so a failed start leaves no process behind
        const timer = setTimeout(() => { child.kill(); reject(new Error(`engine did not start:\n${output}`)); }, 30000);
        const check = setInterval(() => {
            if (/Backend running/.test(output)) { clearInterval(check); clearTimeout(timer); resolve(); }
        }, 100);
        child.on("exit", (code) => { clearInterval(check); clearTimeout(timer); reject(new Error(`engine exited ${code}:\n${output}`)); });
    });
    let mark = 0;
    return {
        baseUrl: `http://127.0.0.1:${port}`,
        logs: () => output,
        // output written since the previous call (one request at a time per engine)
        sinceLast: () => { const s = output.slice(mark); mark = output.length; return s; },
        stop: () => new Promise((resolve) => { child.once("exit", resolve); child.kill(); setTimeout(resolve, 3000); }),
    };
}

async function post(engine, route, body) {
    const res = await fetch(engine.baseUrl + route, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    return { httpStatus: res.status, ...(await res.json()) };
}

// a one-step script with no capture, so no screenshot is written
const runScript = (engine, url) =>
    post(engine, "/api/script", { url, script: { name: "observe", steps: [{ action: "wait", ms: 50 }] } });

const scanPage = (engine, url) => post(engine, "/api/screenshot", { url });

function observations(text) {
    return String(text)
        .split(/\r?\n/)
        .filter((l) => l.startsWith("[overlay-observation] "))
        .map((l) => JSON.parse(l.slice("[overlay-observation] ".length)));
}

// actionLog text with volatile parts (times, ids, ports, file names) removed
function normalizedLog(result) {
    return (result.actionLog || []).map((a) =>
        String(a.action)
            .replace(/scan-\d+/g, "scan-N")
            .replace(/\b\d{10,}\b/g, "N")
            .replace(/127\.0\.0\.1:\d+/g, "127.0.0.1:P")
            .replace(/\d+ms\b/g, "Nms")
            .replace(/[A-Za-z]:\\[^\s"]+|\/[^\s"]*\.png/g, "FILE")
    );
}

// Starts several engines; if any fails, the ones that started are stopped before the error is raised.
async function startEngines(envs) {
    const settled = await Promise.allSettled(envs.map((env) => startEngine(env)));
    const started = settled.filter((s) => s.status === "fulfilled").map((s) => s.value);
    const failed = settled.find((s) => s.status === "rejected");
    if (failed) {
        await Promise.all(started.map((e) => e.stop()));
        throw failed.reason;
    }
    return started;
}

// Test-only preload (outside the production code) that replaces the observer with one
// whose methods throw; used to prove observation failures cannot change a scan.
const THROWING_OBSERVER_PRELOAD = path.join(__dirname, "throwing_observer_preload.js");

function stubCalls(text) {
    return String(text).split(/\r?\n/).filter((l) => l.startsWith("[stub-observer-call] ")).map((l) => l.slice(21).trim());
}

async function launchBrowser() {
    return chromium.launch({ headless: true });
}

async function openHtml(browser, html) {
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1 });
    const pg = await context.newPage();
    await pg.setContent(html);
    return { page: pg, context };
}

module.exports = {
    PRIVATE_TEXT, THROWING_OBSERVER_PRELOAD, startSite, startEngine, startEngines, runScript, scanPage,
    observations, stubCalls, normalizedLog, launchBrowser, openHtml, overlay,
};
