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

// No landmark selector matches, no spinner: should return CONTROL_OK immediately
const NO_LANDMARK_HTML = `
<!doctype html>
<html>
<head><title>Plain page</title></head>
<body>
  <p>No main, no h1, no data-testid, no spinner.</p>
</body>
</html>
`;

// Landmark exists but is hidden: should return SAFE_HOLD
const HIDDEN_LANDMARK_HTML = `
<!doctype html>
<html>
<head><title>Hidden landmark</title></head>
<body>
  <main style="display:none;">Hidden content</main>
</body>
</html>
`;

// Visible spinner that never hides (no landmark): should return SAFE_HOLD
const PERSISTENT_SPINNER_HTML = `
<!doctype html>
<html>
<head>
  <style>.spinner { display: block; }</style>
</head>
<body>
  <div class="spinner">Forever spinning...</div>
</body>
</html>
`;

function startServer(port = 0) {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            res.writeHead(200, { "content-type": "text/html" });
            if (req.url === "/lazy") res.end(LAZY_HTML);
            else if (req.url === "/never-idle") res.end(NEVER_IDLE_HTML);
            else if (req.url === "/no-landmark") res.end(NO_LANDMARK_HTML);
            else if (req.url === "/hidden-landmark") res.end(HIDDEN_LANDMARK_HTML);
            else if (req.url === "/persistent-spinner") res.end(PERSISTENT_SPINNER_HTML);
            else res.end(NEVER_IDLE_HTML);
        });
        server.listen(port, "127.0.0.1", () => {
            resolve({ url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() });
        });
    });
}
module.exports = { startServer };
