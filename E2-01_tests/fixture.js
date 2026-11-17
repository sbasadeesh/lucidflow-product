// Common fixture for the E2-01 tests (not a test file itself).
// One file holds everything the three criteria tests need:
//   expected          the expected results (what each test checks against)
//   pages             the local test pages (served by the fixture server, no internet needed)
//   startFixtureServer()   starts a local web server for the pages

const http = require("http");

// ---------------------------------------------------------------------------
// expected results
// ---------------------------------------------------------------------------
const expected = {
    // criterion 1: valid URL, JavaScript executed
    "js-page": {
        file: "js-page.html",
        status: 200,
        title: "Fixture: JavaScript page",
        selector: "#out",
        textInHtml: "JavaScript has not run",           // in the raw HTML
        textAfterJavaScript: "Rendered by JavaScript",
        viewport: { width: 1366, height: 900 },   // only the script puts this on the page
    },

    // criterion 2: slow page, timeout with a clear message
    "slow-page": {
        file: "slow-page.html",
        delayMs: 5000,       // the server answers after this long
        testLimitMs: 1500,   // the tests use a short limit so they run fast (the real default is 30 s)
        errorCode: "timeout",
        httpStatus: 504,
        messageContains: "did not finish loading within 1.5 seconds, so the scan was stopped",
    },

        // a site that cannot be reached (nothing listens on port 1)
    unreachable: {
        url: "http://127.0.0.1:1",
        errorCode: "load_failed",
        httpStatus: 502,
        messageContains: "did not answer",
    },

    // criterion 3: invalid URL, clear error
    "invalid-urls": {
        errorCode: "invalid_url",
        httpStatus: 400,
        cases: [
            { label: "empty text", input: "", messageContains: "Enter a URL" },
            { label: "only spaces", input: "   ", messageContains: "Enter a URL" },
            { label: "no https://", input: "example.com", messageContains: "including https://" },
            { label: "plain words", input: "not a url", messageContains: "not a valid web address" },
            { label: "no website name", input: "http://", messageContains: "not a valid web address" },
            { label: "ftp address", input: "ftp://example.com/file", messageContains: "Only http:// and https://" },
            { label: "javascript: address", input: "javascript:alert(1)", messageContains: "Only http:// and https://" },
            { label: "file:// address", input: "file:///etc/passwd", messageContains: "Only http:// and https://" },
        ],
    },
};

// ---------------------------------------------------------------------------
// the local test pages
// ---------------------------------------------------------------------------
const pages = {
    // The words "Rendered by JavaScript" are NOT in this HTML. Only the script puts them on the page.
    "js-page.html": `<!doctype html>
<html>
<head><title>${expected["js-page"].title}</title></head>
<body>
    <h1>Fixture page</h1>
    <div id="out">${expected["js-page"].textInHtml}</div>
    <script>
        setTimeout(function () {
            document.getElementById("out").textContent = "${expected["js-page"].textAfterJavaScript}";
        }, 300);
    </script>
</body>
</html>`,

    // served only after expected["slow-page"].delayMs
    "slow-page.html": `<!doctype html>
<html>
<head><title>Fixture: slow page</title></head>
<body><h1>This page is served late on purpose</h1></body>
</html>`,
};

// ---------------------------------------------------------------------------
// the local web server
// ---------------------------------------------------------------------------
async function startFixtureServer() {
    const server = http.createServer((req, res) => {
        const name = new URL(req.url, "http://localhost").pathname.replace(/^\//, "");
        const html = pages[name];

        if (html === undefined) {
            res.writeHead(404);
            return res.end("no such fixture");
        }

        const send = () => {
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(html);
        };

        if (name === expected["slow-page"].file) {
            setTimeout(send, expected["slow-page"].delayMs).unref();
            return;
        }
        send();
    });

    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

    return {
        url: `http://127.0.0.1:${server.address().port}`,
        close: () => {
            if (server.closeAllConnections) server.closeAllConnections();
            return new Promise((resolve) => server.close(resolve));
        },
    };
}
module.exports = { startFixtureServer, expected, pages };