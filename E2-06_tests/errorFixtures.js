// Helpers for the error handling tests (not a test file itself).
//   startSite()    a small local web site that answers with every kind of page:
//                  normal, 403 / 404 / 500 / 503, a block page, redirects,
//                  a "Page not found" page that says 200, a dropped connection
//   startEngine()  starts YOUR server.js on a free port, so the tests call the
//                  real /api/screenshot and /api/script endpoints
//   scan() / runScript()  send a request to the engine and return its answer

const http = require("http");
const net = require("net");
const path = require("path");
const { spawn } = require("child_process");

const PAGE = (title, body) => `<!doctype html><html><head><title>${title}</title></head><body>${body}</body></html>`;

function listen(server) {
    return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
}

async function freePort() {
    const server = net.createServer();
    const port = await listen(server);
    await new Promise((r) => server.close(r));
    return port;
}

// ---------------------------------------------------------------------------
// the local web site
// ---------------------------------------------------------------------------
async function startSite() {
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, "http://localhost");
        const p = url.pathname;
        const send = (status, html, headers = {}) => {
            res.writeHead(status, { "Content-Type": "text/html", ...headers });
            res.end(html);
        };

        // a normal page
        if (p === "/ok") return send(200, PAGE("Normal page", "<h1>Welcome</h1><p>This page loads normally and has some ordinary text on it.</p>"));

        // plain error pages (the wording avoids anything that looks like a bot-block page)
        const plain = { 403: "Not allowed here.", 404: "Nothing at this address.", 500: "Something broke.", 503: "Back soon." };
        const m = p.match(/^\/status\/(\d{3})$/);
        if (m) return send(Number(m[1]), PAGE(`Error ${m[1]}`, `<p>${plain[m[1]] || "Error."}</p>`));

        // a 403 that is really bot protection
        if (p === "/blocked-403") {
            return send(403, PAGE("Access Denied", "<h1>Access Denied</h1><p>You don't have permission to access this server.</p>"));
        }

        // redirects
        if (p === "/redirect") return send(302, "", { Location: "/ok" });
        if (p === "/redirect-301") return send(301, "", { Location: "/ok" });
        if (p === "/chain") return send(301, "", { Location: "/chain-2" });
        if (p === "/chain-2") return send(302, "", { Location: "/ok" });
        if (p === "/redirect-to-missing") return send(302, "", { Location: "/status/404" });
        if (p === "/redirect-js") {
            return send(200, PAGE("Moving", "<p>Moving...</p><script>location.replace('/ok')</script>"));
        }

        // says "not found" but the status is 200
        if (p === "/soft-404") return send(200, PAGE("Page Not Found", "<h1>Page not found</h1><p>The page you wanted is gone.</p>"));

        // the connection is dropped before any answer (what some bot protection does)
        if (p === "/cut") return req.socket.destroy();

        send(404, PAGE("Missing", "<p>No such page.</p>"));
    });

    const port = await listen(server);
    return {
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => server.close(r)),
    };
}

// ---------------------------------------------------------------------------
// the engine (your server.js)
// ---------------------------------------------------------------------------
async function startEngine() {
    const port = await freePort();
    const root = path.resolve(__dirname, ".."); // the folder with server.js

    const child = spawn(process.execPath, ["server.js"], {
        cwd: root,
        env: { ...process.env, PORT: String(port) },
        stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (output += d));

    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`The engine did not start in 30 seconds. Its output:\n${output}`)), 30000);
        const check = setInterval(() => {
            if (/Backend running/.test(output)) {
                clearInterval(check);
                clearTimeout(timer);
                resolve();
            }
        }, 100);
        child.on("exit", (code) => {
            clearInterval(check);
            clearTimeout(timer);
            reject(new Error(`The engine stopped with code ${code}. Its output:\n${output}`));
        });
    });

    return {
        baseUrl: `http://127.0.0.1:${port}`,
        logs: () => output,
        stop: () => new Promise((resolve) => {
            child.once("exit", resolve);
            child.kill();
            setTimeout(resolve, 3000);
        }),
    };
}

async function post(engine, route, body) {
    const res = await fetch(engine.baseUrl + route, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const json = await res.json();
    return { httpStatus: res.status, ...json };
}

// a normal scan of one page
const scan = (engine, url, extra = {}) => post(engine, "/api/screenshot", { url, ...extra });

// a one-step script: opens the page and captures it (a quick way to scan a page that loads)
const runScript = (engine, url) =>
    post(engine, "/api/script", { url, script: { name: "check", steps: [{ action: "capture", name: "page" }] } });

async function getJson(engine, route) {
    const res = await fetch(engine.baseUrl + route);
    return res.json();
}

module.exports = { startSite, startEngine, scan, runScript, post, getJson };
