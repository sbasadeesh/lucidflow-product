const http = require("http");

function startServers() {
    return new Promise((resolve) => {
        // 1. Start a second, isolated server to act as the cross-origin site
        const crossServer = http.createServer((req, res) => {
            res.writeHead(200, { "content-type": "text/html" });
            res.end("<body>Cross Origin Content</body>");
        });

        crossServer.listen(0, "127.0.0.1", () => {
            const crossPort = crossServer.address().port;
            
            // 2. Build the main HTML using the dynamic cross-origin port
            const COMPLEX_HTML = `
            <!doctype html>
            <html>
            <body>
              <h1>Complex Contexts</h1>
              <canvas id="myCanvas" width="100" height="100"></canvas>
              <iframe id="same-iframe" src="/iframe-content"></iframe>
              
              <!-- This is now a real cross-origin frame (different port) -->
              <iframe id="cross-iframe" src="http://127.0.0.1:${crossPort}/"></iframe>

              <div id="open-shadow"></div>
              <script>
                const openEl = document.getElementById('open-shadow');
                const shadow = openEl.attachShadow({ mode: 'open' });
                shadow.innerHTML = '<p>I am inside an open shadow DOM</p>';
              </script>

              <my-closed-element id="closed-shadow"></my-closed-element>
              <script>
                class MyClosedElement extends HTMLElement {
                  constructor() {
                    super();
                    const shadow = this.attachShadow({ mode: 'closed' });
                    shadow.innerHTML = '<p>I am hidden</p>';
                  }
                }
                customElements.define('my-closed-element', MyClosedElement);
              </script>
            </body>
            </html>
            `;

            // 3. Start the main server
            const mainServer = http.createServer((req, res) => {
                res.writeHead(200, { "content-type": "text/html" });
                if (req.url === "/iframe-content") {
                    res.end("<body><input type='text' id='inner-input'></body>");
                } else {
                    res.end(COMPLEX_HTML);
                }
            });

            mainServer.listen(0, "127.0.0.1", () => {
                resolve({
                    url: `http://127.0.0.1:${mainServer.address().port}`,
                    close: () => {
                        mainServer.close();
                        crossServer.close();
                    }
                });
            });
        });
    });
}

module.exports = { startServers };