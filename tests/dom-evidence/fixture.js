// Local synthetic site for the E2-02 DOM/style evidence prototype tests (not a test file).
// Everything is served from 127.0.0.1 on a free port. No real website is used.
// Every prohibited kind of data on /markers carries a unique synthetic marker, so the tests can
// prove that none of them reaches the new evidence output.

const http = require("http");

// one marker per prohibited source (checked case-insensitively)
const MARKERS = [
    "SYNTH-TEXT", "SYNTH-LABEL", "SYNTH-ARIA", "SYNTH-ALT", "SYNTH-TITLEATTR", "SYNTH-PLACEHOLDER",
    "SYNTH-VALUE-ATTR", "SYNTH-LIVE-VALUE", "SYNTH-TEXTAREA", "SYNTH-OPTION", "SYNTH-HIDDEN", "SYNTH-DATA",
    "SYNTH-ID", "SYNTH-HREF", "SYNTH-QUERY", "SYNTH-HANDLER", "SYNTH-INLINE-STYLE", "SYNTH-CSS-URL",
    "SYNTH-SCRIPT", "SYNTH-JSONLD", "SYNTH-COMMENT", "SYNTH-NOSCRIPT", "SYNTH-TEMPLATE", "SYNTH-FRAME",
    "SYNTH-SHADOW", "SYNTH-CUSTOM-TAG", "SYNTH-ROLE", "SYNTH-TYPE", "SYNTH-PAGE-TITLE", "SYNTH-OVERRIDE",
];

const MARKERS_PAGE = `<!doctype html>
<html lang="en"><head><title>SYNTH-PAGE-TITLE</title>
<script type="application/ld+json">{"name":"SYNTH-JSONLD"}</script>
<style>.bg { background-image: url("/img.png?SYNTH-CSS-URL"); width: 40px; height: 40px; }</style>
<script>window.__k = "SYNTH-SCRIPT";</script>
</head><body>
<!-- SYNTH-COMMENT -->
<noscript>SYNTH-NOSCRIPT</noscript>
<template><p>SYNTH-TEMPLATE</p></template>
<h1 id="SYNTH-ID-H1" class="SYNTH-ID-CLASS" data-x="SYNTH-DATA">SYNTH-TEXT heading</h1>
<p>Visible SYNTH-TEXT paragraph</p>
<form action="/submit?SYNTH-HREF-ACTION">
  <label for="SYNTH-ID-FOR">SYNTH-LABEL</label>
  <input id="SYNTH-ID-FOR" name="SYNTH-ID-NAME" value="SYNTH-VALUE-ATTR" placeholder="SYNTH-PLACEHOLDER" aria-label="SYNTH-ARIA" title="SYNTH-TITLEATTR">
  <input id="live" type="text">
  <input type="hidden" name="csrf" value="SYNTH-HIDDEN">
  <input type="SYNTH-TYPE" value="x">
  <textarea>SYNTH-TEXTAREA</textarea>
  <select><option>SYNTH-OPTION</option><option selected>Other</option></select>
  <input id="agree" type="checkbox" checked>
  <button type="button" role="SYNTH-ROLE" onclick="window.__h='SYNTH-HANDLER'" style="background:url('/b.png?SYNTH-INLINE-STYLE')">Go SYNTH-TEXT</button>
</form>
<a href="/next?SYNTH-HREF">SYNTH-TEXT link</a>
<img src="/i.png?SYNTH-HREF-SRC" srcset="/i2.png?SYNTH-HREF-SRCSET 2x" alt="SYNTH-ALT" width="10" height="10">
<video poster="/p.png?SYNTH-HREF-POSTER" width="20" height="20"></video>
<iframe srcdoc="<p>SYNTH-FRAME</p>" width="30" height="30"></iframe>
<div id="host"></div>
<synth-custom-tag role="button">SYNTH-CUSTOM-TAG</synth-custom-tag>
<div class="bg" role="region"></div>
<script>
  document.getElementById("live").value = "SYNTH-LIVE-VALUE";
  document.getElementById("host").attachShadow({ mode: "open" }).innerHTML = "<button>SYNTH-SHADOW</button>";
</script>
</body></html>`;

// a form with a modal that only client-side code opens (no request, no reload)
const FORM_PAGE = `<!doctype html>
<html lang="en"><head><title>Form</title></head><body>
<h1>Form</h1>
<form><input id="agree" type="checkbox" checked><label for="agree">Agree</label>
<button id="open" type="button">Open</button></form>
<dialog id="modal"><p>Modal</p><button type="button">Close</button></dialog>
<script>document.getElementById("open").onclick = () => document.getElementById("modal").show();</script>
</body></html>`;

// getComputedStyle returns a free-form value / throws, to check value validation and failure handling
const OVERRIDE_PAGE = `<!doctype html><html><head><title>Override</title></head><body>
<h1>Override</h1><button type="button">Go</button>
<script>
  const real = window.getComputedStyle.bind(window);
  window.getComputedStyle = (el) => new Proxy(real(el), { get: (t, k) => (typeof t[k] === "function" ? t[k].bind(t) : (typeof k === "string" && k !== "length" ? "url(SYNTH-OVERRIDE)" : t[k])) });
</script></body></html>`;

const BROKEN_PAGE = `<!doctype html><html><head><title>Broken</title></head><body>
<h1>Broken</h1><button id="b" type="button">Go</button>
<script>window.getComputedStyle = () => { throw new Error("SYNTH-OVERRIDE broken getComputedStyle"); };</script>
</body></html>`;

// each getComputedStyle call is slow, so a collection cannot finish inside a short timeout
const SLOW_PAGE = `<!doctype html><html><head><title>Slow</title></head><body>
<h1>Slow</h1>${'<button type="button">b</button>'.repeat(200)}
<script>
  const real = window.getComputedStyle.bind(window);
  window.getComputedStyle = (el) => { const end = performance.now() + 25; while (performance.now() < end) {} return real(el); };
</script></body></html>`;

const MANY_PAGE = `<!doctype html><html><head><title>Many</title></head><body>${'<button type="button">b</button>'.repeat(301)}</body></html>`;
const HUGE_PAGE = `<!doctype html><html><head><title>Huge</title></head><body>${"<span></span>".repeat(50001)}</body></html>`;
const DEEP_PAGE = `<!doctype html><html><head><title>Deep</title></head><body>${"<div>".repeat(70)}<button type="button">deep</button>${"</div>".repeat(70)}<button type="button">shallow</button></body></html>`;

const PAGES = {
    "/markers": MARKERS_PAGE,
    "/form": FORM_PAGE,
    "/override": OVERRIDE_PAGE,
    "/broken": BROKEN_PAGE,
    "/slow": SLOW_PAGE,
    "/many": MANY_PAGE,
    "/huge": HUGE_PAGE,
    "/deep": DEEP_PAGE,
};

async function startSite() {
    const counts = {};
    const sockets = new Set();
    const server = http.createServer((req, res) => {
        const p = new URL(req.url, "http://localhost").pathname;
        counts[p] = (counts[p] || 0) + 1;
        if (PAGES[p]) {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
            return res.end(PAGES[p]);
        }
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("not found");
    });
    server.on("connection", (s) => {
        sockets.add(s);
        s.once("close", () => sockets.delete(s));
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    return {
        url: `http://127.0.0.1:${server.address().port}`,
        count: (p) => counts[p] || 0,
        raw: (p) => PAGES[p],
        close: () => new Promise((resolve) => {
            if (server.closeAllConnections) server.closeAllConnections();
            for (const s of sockets) s.destroy();
            server.close(() => resolve());
        }),
    };
}

// every marker found in a text (case-insensitive)
function markersIn(text) {
    const t = String(text).toUpperCase();
    return MARKERS.filter((m) => t.includes(m));
}

module.exports = { startSite, markersIn, MARKERS };
