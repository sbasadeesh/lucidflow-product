// Local test site for the E2-01 render contract tests (not a test file itself).
// Everything is served from 127.0.0.1 on a free port; no real website is used.
//
//   /js-page  a page whose visible content is changed by JavaScript 1 second after it loads,
//             and which keeps the network busy (it requests /ping every 250 ms, forever)
//   /ping     answers 204 and is counted
//   /probe    answers 200 and is counted (used to prove that a rejected URL was never opened)
//   /hang     accepts the request and never answers (the socket is held until close())

const http = require("http");

// what the raw HTML contains, and what only JavaScript puts on the page
const RAW_TITLE = "Raw title";
const RAW_TEXT = "JavaScript has not run";
const JS_TEXT = "Rendered by JavaScript";
const RAW_COLOUR = [200, 200, 200]; // the block before JavaScript runs (grey)
const JS_COLOUR = [220, 20, 20]; // the block after JavaScript runs (red)
const JS_DELAY_MS = 1000; // the change happens this long after the page loads
const PING_EVERY_MS = 250;
// the block is at the top left of the page, so its centre is always inside the first screen
const BLOCK = { width: 400, height: 300 };

const rgb = (c) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;

const JS_PAGE = `<!doctype html>
<html>
<head>
<title>${RAW_TITLE}</title>
<style>
  body { margin: 0; font-family: sans-serif; }
  #block { width: ${BLOCK.width}px; height: ${BLOCK.height}px; background: ${rgb(RAW_COLOUR)}; }
</style>
</head>
<body>
<div id="block"></div>
<p id="out">${RAW_TEXT}</p>
<script>
  setTimeout(function () {
    document.getElementById("block").style.background = "${rgb(JS_COLOUR)}";
    document.getElementById("out").textContent = "${JS_TEXT}";
    document.title = "${JS_TEXT}";
  }, ${JS_DELAY_MS});
  setInterval(function () {
    fetch("/ping?t=" + Date.now()).catch(function () {});
  }, ${PING_EVERY_MS});
</script>
</body>
</html>`;

async function startSite() {
    const counts = { ping: 0, probe: 0, hang: 0 };
    const hanging = new Set(); // sockets of /hang requests that are still open
    const sockets = new Set(); // every socket, so close() can never be held up

    const server = http.createServer((req, res) => {
        const p = new URL(req.url, "http://localhost").pathname;
        if (p === "/js-page") {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
            return res.end(JS_PAGE);
        }
        if (p === "/ping") {
            counts.ping++;
            res.writeHead(204, { "Cache-Control": "no-store" });
            return res.end();
        }
        if (p === "/probe") {
            counts.probe++;
            res.writeHead(200, { "Content-Type": "text/html" });
            return res.end("<!doctype html><title>probe</title><p>probe</p>");
        }
        if (p === "/hang") {
            counts.hang++;
            const s = req.socket;
            hanging.add(s);
            s.once("close", () => hanging.delete(s));
            return; // never answer
        }
        res.writeHead(404, { "Content-Type": "text/html" });
        res.end("<p>No such page.</p>");
    });
    server.on("connection", (s) => {
        sockets.add(s);
        s.once("close", () => sockets.delete(s));
    });

    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;

    return {
        url: `http://127.0.0.1:${port}`,
        host: `127.0.0.1:${port}`,
        count: (name) => counts[name],
        openHangSockets: () => hanging.size,
        close: () =>
            new Promise((resolve) => {
                if (server.closeAllConnections) server.closeAllConnections();
                for (const s of sockets) s.destroy();
                server.close(() => resolve());
            }),
    };
}

// polls a condition until it is true or the time is up; returns the last value
async function waitFor(check, timeoutMs, everyMs = 200) {
    const end = Date.now() + timeoutMs;
    let value = check();
    while (!value && Date.now() < end) {
        await new Promise((r) => setTimeout(r, everyMs));
        value = check();
    }
    return value;
}

module.exports = {
    startSite,
    waitFor,
    RAW_TITLE,
    RAW_TEXT,
    JS_TEXT,
    RAW_COLOUR,
    JS_COLOUR,
    JS_DELAY_MS,
    PING_EVERY_MS,
    BLOCK,
};
