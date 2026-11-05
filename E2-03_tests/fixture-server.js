// Simple HTTP server for AC4 fixture testing
// Serves a minimal HTML page with deterministic elements for scan testing

const http = require("http");
const PORT = 8765;

const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AC4 Test Fixture</title>
    <style>
        body { font-family: sans-serif; margin: 40px; background: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background: white; padding: 20px; border-radius: 5px; }
        h1 { color: #333; }
        p { color: #666; line-height: 1.6; }
        .action-box { background: #e8f4f8; border-left: 4px solid #0099cc; padding: 10px; margin: 10px 0; }
        button { background: #0099cc; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; }
        button:hover { background: #0077aa; }
        button:active { background: #005588; }
        input { padding: 8px; margin: 5px 0; border: 1px solid #ccc; border-radius: 3px; width: 100%; box-sizing: border-box; }
        select { padding: 8px; margin: 5px 0; border: 1px solid #ccc; border-radius: 3px; width: 100%; box-sizing: border-box; }
        .status { color: #0099cc; font-weight: bold; }
    </style>
</head>
<body>
    <div class="container">
        <h1>AC4 Test Fixture Page</h1>
        <p>This page is used to verify E2-03 scan metrics end-to-end.</p>

        <div class="action-box">
            <strong>Deterministic Actions:</strong>
            <ul>
                <li>Click "Start Scan" button → records 1 click interaction</li>
                <li>Fill name field → records 1 fieldsFilled interaction</li>
                <li>Select option from dropdown → records 1 selection</li>
                <li>Click "Submit" button → records 1 click interaction</li>
            </ul>
        </div>

        <h2>Form</h2>
        <form id="testForm">
            <label for="name">Name:</label>
            <input type="text" id="name" name="name" placeholder="Enter your name" />

            <label for="option">Select an option:</label>
            <select id="option" name="option">
                <option value="">-- Choose --</option>
                <option value="opt1">Option 1</option>
                <option value="opt2">Option 2</option>
                <option value="opt3">Option 3</option>
            </select>

            <br />
            <button type="button" id="submitBtn">Submit</button>
        </form>

        <p id="result" class="status" style="display: none;"></p>
    </div>

    <script>
        // Track user interactions for logging
        const interactions = [];

        // Name field
        document.getElementById("name").addEventListener("change", () => {
            interactions.push({ type: "fill", field: "name", timestamp: new Date().toISOString() });
        });

        // Dropdown
        document.getElementById("option").addEventListener("change", () => {
            interactions.push({ type: "select", field: "option", timestamp: new Date().toISOString() });
        });

        // Submit button
        document.getElementById("submitBtn").addEventListener("click", (e) => {
            e.preventDefault();
            interactions.push({ type: "click", button: "submit", timestamp: new Date().toISOString() });
            document.getElementById("result").style.display = "block";
            document.getElementById("result").textContent = "✓ Form submitted. Interactions logged: " + interactions.length;
        });

        console.log("Fixture page loaded");
    </script>
</body>
</html>`;

const server = http.createServer((req, res) => {
    if (req.url === "/page.html" || req.url === "/") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
    } else {
        res.writeHead(404);
        res.end("Not found");
    }
});

server.listen(PORT, () => {
    console.log(`[FIXTURE] Fixture server listening on http://localhost:${PORT}`);
});

server.on("error", (err) => {
    console.error(`[FIXTURE] Server error:`, err);
    process.exit(1);
});

// Graceful shutdown
process.on("SIGTERM", () => {
    console.log("[FIXTURE] SIGTERM received, shutting down");
    server.close(() => process.exit(0));
});

process.on("SIGINT", () => {
    console.log("[FIXTURE] SIGINT received, shutting down");
    server.close(() => process.exit(0));
});
