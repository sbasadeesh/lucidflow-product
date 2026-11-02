// Fixture site for the state script tests (not a test file itself).
// A tiny local web server with one page that has the usual interactive states:
//   #open-modal  opens #modal (a yellow box on top of the page), #close-modal closes it
//   #toggle      switches between OFF and ON (a green bar appears)
//   #expand      opens #panel (a blue block)
//   #name        a normal text field
//   #phone       a mobile number field (must never be typed into)
//   #leave       a link to another page

const http = require("http");

const PAGE = `<!doctype html>
<html><head><title>Fixture</title><style>
  body { margin: 0; font-family: Arial, sans-serif; background: #fff; height: 1200px; }
  button, input, a { margin: 12px; font-size: 16px; }
  .modal { display: none; position: fixed; left: 25%; top: 20%; width: 50%; height: 40%;
           background: rgb(255, 204, 0); border: 4px solid #333; z-index: 100; }
  .modal.open { display: block; }
  #bar { width: 400px; height: 60px; margin: 12px; background: rgb(200, 200, 200); }
  #bar.on { background: rgb(0, 170, 0); }
  #panel { width: 500px; height: 200px; margin: 12px; background: rgb(0, 100, 220); }
</style></head>
<body>
  <h1>Fixture page</h1>
  <button id="open-modal" onclick="document.getElementById('modal').classList.add('open')">Open modal</button>
  <div id="modal" class="modal">
    <p>Modal content</p>
    <button id="close-modal" onclick="document.getElementById('modal').classList.remove('open')">Close</button>
  </div>

  <button id="toggle" onclick="
      const b = document.getElementById('bar'); b.classList.toggle('on');
      this.textContent = b.classList.contains('on') ? 'Toggle: ON' : 'Toggle: OFF';">Toggle: OFF</button>
  <div id="bar"></div>

  <button id="expand" onclick="document.getElementById('panel').hidden = false">Expand</button>
  <div id="panel" hidden></div>

  <div><input id="name" placeholder="Full name"></div>
  <div><input id="phone" type="tel" placeholder="Mobile number"></div>
  <a id="leave" href="/other">Leave this page</a>
</body></html>`;

function startFixtureServer() {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            res.setHeader("Content-Type", "text/html");
            if (req.url === "/other") return res.end("<html><body><h1>Other page</h1></body></html>");
            res.end(PAGE);
        });
        server.listen(0, "127.0.0.1", () => {
            const { port } = server.address();
            resolve({
                url: `http://127.0.0.1:${port}/`,
                close: () => new Promise((r) => server.close(r)),
            });
        });
    });
}

// settings that keep the tests fast (the defaults wait 3 seconds for a missing element)
const FAST = { stepTimeoutMs: 400, settleMs: 100 };

module.exports = { startFixtureServer, FAST };
