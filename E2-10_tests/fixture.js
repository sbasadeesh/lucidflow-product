const http = require("http");

const LAZY_HTML = `
<!doctype html>
<html>
<head>
  <style>.spinner { display: block; } .spinner.hidden { display: none; }</style>
</head>
<body>
  <div class="spinner">Loading...</div>
  <div id="content" style="display:none;">Hello World</div>
  <script>
    setTimeout(() => {
      document.querySelector('.spinner').classList.add('hidden');
      document.getElementById('content').style.display = 'block';
    }, 1500);
  </script>
</body>
</html>
`;

const NEVER_IDLE_HTML = `
<!doctype html>
<html>
<head>
  <style>.spinner { display: block; }</style>
</head>
<body>
  <div class="spinner">Forever loading...</div>
  <script>
    // Simulates a page that never finishes loading
    setInterval(() => { console.log("telemetry ping"); }, 1000);
  </script>
</body>
</html>
`;

function startServer(port = 0) {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            res.writeHead(200, { "content-type": "text/html" });
            if (req.url === "/lazy") res.end(LAZY_HTML);
            else res.end(NEVER_IDLE_HTML);
        });
        server.listen(port, "127.0.0.1", () => {
            resolve({ url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() });
        });
    });
}
module.exports = { startServer };