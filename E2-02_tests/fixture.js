// Common fixture for the E2-02 tests (not a test file itself).
//   expected               what each test checks against
//   page                   the local test page
//   startFixtureServer()   a local web server for the page (no internet needed)

const http = require("http");

const expected = {
    file: "styles-page.html",
    title: "Fixture: DOM and styles",

    // criterion 1: the DOM is saved after JavaScript has run
    lateSelector: "#late",
    textInHtml: "not yet",                   // in the raw HTML
    textAfterJavaScript: "Added by JavaScript", // only the script puts this on the page

    // criterion 2: computed size, colour and visibility
    big: { selector: "#big", size: { width: 200, height: 50 }, color: "rgb(255, 0, 0)", backgroundColor: "rgb(0, 0, 255)" },
    gone: { selector: "#gone", reason: "display:none", size: { width: 0, height: 0 } },
    invisible: { selector: "#invisible", reason: "visibility:hidden", visibility: "hidden" },
    faint: { selector: "#faint", reason: "opacity:0", opacity: "0" },

    // developer note: selectors point back to the element
    listItems: ["first", "second", "third"],
};

const page = `<!doctype html>
<html>
<head>
<title>${expected.title}</title>
<style>
    #big { display: block; box-sizing: border-box; width: 200px; height: 50px; color: rgb(255, 0, 0); background-color: rgb(0, 0, 255); }
    #gone { display: none; }
    #invisible { visibility: hidden; box-sizing: border-box; width: 100px; height: 20px; }
    #faint { opacity: 0; box-sizing: border-box; width: 100px; height: 20px; }
</style>
</head>
<body>
    <h1>Fixture page</h1>
    <button id="big">Big button</button>
    <button id="gone">Gone</button>
    <button id="invisible">Invisible</button>
    <button id="faint">Faint</button>
    <ul id="list"><li>first</li><li>second</li><li>third</li></ul>
    <div id="late">${expected.textInHtml}</div>
    <script>
        setTimeout(function () {
            document.getElementById("late").textContent = "${expected.textAfterJavaScript}";
        }, 300);
    </script>
</body>
</html>`;

async function startFixtureServer() {
    const server = http.createServer((req, res) => {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(page);
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

    return {
        url: `http://127.0.0.1:${server.address().port}/${expected.file}`,
        close: () => {
            if (server.closeAllConnections) server.closeAllConnections();
            return new Promise((resolve) => server.close(resolve));
        },
    };
}

module.exports = { startFixtureServer, expected, page };