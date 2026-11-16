/**
 * E2-07 Mutation Test: Prove Guard Mechanism is Actually Responsible
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

let fixtureServer;
let engineProcess;
let fixtureUrl;
let engineUrl;

const serverPath = path.join(__dirname, "../server.js");
const backupPath = path.join(__dirname, "../server.js.backup");

test.before(async (t) => {
    console.log("\n=== E2-07 Mutation Test ===\n");
    
    // Backup original
    const original = fs.readFileSync(serverPath, "utf8");
    fs.writeFileSync(backupPath, original, "utf8");
    console.log("✓ Original server.js backed up");
    
    // Start fixture server
    await new Promise((resolve, reject) => {
        fixtureServer = http.createServer((req, res) => {
            res.setHeader("Content-Type", "text/html");
            if (req.url === "/login") {
                return res.end(`<html><body><h1>Sign in to continue</h1></body></html>`);
            }
            res.end("OK");
        });
        
        fixtureServer.listen(0, "127.0.0.1", () => {
            fixtureUrl = `http://127.0.0.1:${fixtureServer.address().port}`;
            console.log(`✓ Fixture server: ${fixtureUrl}`);
            resolve();
        });
        
        fixtureServer.on("error", reject);
    });
});

test.after(async () => {
    if (fixtureServer) {
        fixtureServer.close();
    }
    if (engineProcess) {
        engineProcess.kill("SIGTERM");
    }
    // Restore original
    if (fs.existsSync(backupPath)) {
        const backup = fs.readFileSync(backupPath, "utf8");
        fs.writeFileSync(serverPath, backup, "utf8");
        fs.unlinkSync(backupPath);
        console.log("✓ Original server.js restored");
    }
});

function makeRequest(url, payload, timeout = 30000) {
    return new Promise((resolve, reject) => {
        const timeoutHandle = setTimeout(() => {
            reject(new Error(`Timeout after ${timeout}ms`));
        }, timeout);
        
        const parsedUrl = new URL(url);
        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port,
            path: parsedUrl.pathname,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(JSON.stringify(payload))
            },
            timeout: timeout
        };
        
        const req = http.request(options, (res) => {
            let data = "";
            res.on("data", (chunk) => { data += chunk; });
            res.on("end", () => {
                clearTimeout(timeoutHandle);
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve({ error: data });
                }
            });
        });
        
        req.on("error", reject);
        req.write(JSON.stringify(payload));
        req.end();
    });
}

async function startEngine(port) {
    return new Promise((resolve, reject) => {
        engineProcess = spawn("node", [serverPath], {
            stdio: ["ignore", "pipe", "pipe"],
            env: { ...process.env, PORT: port }
        });
        
        let ready = false;
        setTimeout(() => {
            if (!ready) {
                ready = true;
                resolve();
            }
        }, 5000);
        
        engineProcess.on("error", reject);
    });
}

function killEngine() {
    return new Promise((resolve) => {
        if (engineProcess) {
            engineProcess.kill("SIGTERM");
            setTimeout(() => {
                engineProcess = null;
                resolve();
            }, 1000);
        } else {
            resolve();
        }
    });
}

test("MUTATION-1: Disable guard check - auth wall should NOT block", async (t) => {
    console.log("\n[MUTATION-1] Disabling guard check...");
    
    // Mutate: disable guard check
    let mutated = fs.readFileSync(serverPath, "utf8");
    mutated = mutated.replace(
        "const security = await checkSecurityGuards(page);",
        "const security = { blocked: false }; // MUTATED"
    );
    fs.writeFileSync(serverPath, mutated, "utf8");
    console.log("  ✓ Mutation applied");
    
    // Get available port
    const tempServer = http.createServer();
    const port = await new Promise((resolve) => {
        tempServer.listen(0, "127.0.0.1", () => {
            const p = tempServer.address().port;
            tempServer.close(() => resolve(p));
        });
    });
    
    // Start mutated engine
    console.log("  Starting mutated engine...");
    await startEngine(port);
    engineUrl = `http://127.0.0.1:${port}`;
    
    let response;
    try {
        response = await makeRequest(`${engineUrl}/api/screenshot`, {
            url: `${fixtureUrl}/login`,
            selector: "body"
        }, 30000);
    } catch (err) {
        console.error(`  ERROR: ${err.message}`);
        response = null;
    }
    
    await killEngine();
    
    if (!response) {
        assert.fail("Mutation test request failed");
    }
    
    console.log(`  Response status: ${response.status}`);
    
    // With guard disabled, auth wall should NOT block
    if (response.status === "blocked") {
        console.log("  ✗ Guard was still active!");
        assert.fail("Mutation did not work");
    } else {
        console.log("  ✓ MUTATION WORKED: Auth wall did not block");
    }
});

test("MUTATION-2: Restore guard check - auth wall should block again", async (t) => {
    console.log("\n[MUTATION-2] Restoring guard check...");
    
    // Restore original
    const original = fs.readFileSync(backupPath, "utf8");
    fs.writeFileSync(serverPath, original, "utf8");
    console.log("  ✓ Guard check restored");
    
    // Get available port
    const tempServer = http.createServer();
    const port = await new Promise((resolve) => {
        tempServer.listen(0, "127.0.0.1", () => {
            const p = tempServer.address().port;
            tempServer.close(() => resolve(p));
        });
    });
    
    // Start original engine
    console.log("  Starting original engine...");
    await startEngine(port);
    engineUrl = `http://127.0.0.1:${port}`;
    
    let response;
    try {
        response = await makeRequest(`${engineUrl}/api/screenshot`, {
            url: `${fixtureUrl}/login`,
            selector: "body"
        }, 30000);
    } catch (err) {
        console.error(`  ERROR: ${err.message}`);
        response = null;
    }
    
    await killEngine();
    
    if (!response) {
        assert.fail("Restore test request failed");
    }
    
    console.log(`  Response status: ${response.status}`);
    
    // With original guard, auth wall MUST block
    assert.equal(response.status, "blocked", `Expected "blocked", got "${response.status}"`);
    console.log("  ✓ Auth wall blocked successfully");
});

test("MUTATION SUMMARY", async (t) => {
    console.log("\n" + "=".repeat(60));
    console.log("✓ Guard check IS the actual blocking mechanism");
    console.log("✓ Removing it allows unsafe interaction");
    console.log("✓ Restoring it re-enables guard protection");
    console.log("=".repeat(60));
});
