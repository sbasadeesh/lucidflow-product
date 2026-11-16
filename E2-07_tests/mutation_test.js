/**
 * E2-07 Mutation Test: Prove Guard Mechanism is Actually Responsible
 * 
 * ISOLATED EXECUTION: Creates temporary worktree copy and runs behavioral tests
 * against mutated and restored engine code.
 * 
 * - Mutation 1: Disable guard → execute test → verify auth wall NOT blocked
 * - Mutation 2: Restore → execute test → verify auth wall IS blocked
 * - Proves guard is the actual mechanism, not dead code
 * 
 * Never modifies active source tree. Engine started fresh for each mutation.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn, execSync } = require("child_process");

let fixtureServer;
let fixtureUrl;

const repoRoot = path.join(__dirname, "..");
const originalServerPath = path.join(repoRoot, "server.js");
let worktreeDir;
let mutatedServerPath;

test.before(async (t) => {
    console.log("\n=== E2-07 Mutation Test (Behavioral Execution with Isolated Worktree) ===\n");
    
    // Create temporary worktree directory
    worktreeDir = path.join(repoRoot, ".worktrees", `mutation-behavioral-${Date.now()}`);
    fs.mkdirSync(worktreeDir, { recursive: true });
    console.log(`✓ Isolated worktree created: ${worktreeDir}`);
    
    // Copy server.js to worktree (never modify original)
    mutatedServerPath = path.join(worktreeDir, "server.js");
    const originalContent = fs.readFileSync(originalServerPath, "utf8");
    fs.writeFileSync(mutatedServerPath, originalContent, "utf8");
    console.log(`✓ server.js copied to isolated worktree (${Math.round(originalContent.length / 1024)}KB)`);
    
    // Start fixture server for mutation tests
    await new Promise((resolve, reject) => {
        fixtureServer = http.createServer((req, res) => {
            res.setHeader("Content-Type", "text/html");
            if (req.url === "/login") {
                return res.end(`<html><body><h1>Sign in</h1><form><input type="email" id="email" placeholder="Email" /><button type="submit">Sign In</button></form></body></html>`);
            }
            res.end("<html><body><h1>OK</h1></body></html>");
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
    
    // Clean up worktree directory
    if (worktreeDir && fs.existsSync(worktreeDir)) {
        try {
            execSync(`powershell -Command "Remove-Item -Path '${worktreeDir}' -Recurse -Force"`, { stdio: "ignore" });
            console.log(`✓ Worktree cleaned up`);
        } catch (e) {
            try {
                const removeDir = (dir) => {
                    if (fs.existsSync(dir)) {
                        fs.readdirSync(dir).forEach(f => {
                            const fullPath = path.join(dir, f);
                            if (fs.lstatSync(fullPath).isDirectory()) {
                                removeDir(fullPath);
                            } else {
                                fs.unlinkSync(fullPath);
                            }
                        });
                        fs.rmdirSync(dir);
                    }
                };
                removeDir(worktreeDir);
                console.log(`✓ Worktree cleaned up (fallback)`);
            } catch (e2) {
                console.log(`  (worktree cleanup pending)`);
            }
        }
    }
});

function makeRequest(url, payload, timeout = 30000) {
    return new Promise((resolve, reject) => {
        const timeoutHandle = setTimeout(() => {
            reject(new Error(`Timeout after ${timeout}ms`));
        }, timeout);
        
        try {
            const parsedUrl = new URL(url);
            const options = {
                hostname: parsedUrl.hostname,
                port: parsedUrl.port,
                path: parsedUrl.pathname,
                method: "POST",
                headers: { "Content-Type": "application/json" }
            };
            
            const req = http.request(options, (res) => {
                let data = "";
                res.on("data", (chunk) => { data += chunk; });
                res.on("end", () => {
                    clearTimeout(timeoutHandle);
                    try {
                        resolve({ status: res.statusCode, body: JSON.parse(data) });
                    } catch (e) {
                        resolve({ status: res.statusCode, body: data });
                    }
                });
            });
            
            req.on("error", (err) => {
                clearTimeout(timeoutHandle);
                reject(err);
            });
            
            req.write(JSON.stringify(payload));
            req.end();
        } catch (err) {
            clearTimeout(timeoutHandle);
            reject(err);
        }
    });
}

async function startEngineWithServer(serverPath, port) {
    return new Promise((resolve, reject) => {
        let engineProcess;
        let ready = false;
        const readyTimeout = setTimeout(() => {
            if (!ready) {
                ready = true;
                resolve({ process: engineProcess });
            }
        }, 8000);
        
        try {
            engineProcess = spawn("node", [serverPath], {
                stdio: ["ignore", "pipe", "pipe"],
                env: { ...process.env, PORT: port }
            });
            
            engineProcess.stdout.on("data", (data) => {
                if (!ready) {
                    ready = true;
                    clearTimeout(readyTimeout);
                    resolve({ process: engineProcess });
                }
            });
            
            engineProcess.stderr.on("data", (data) => {
                if (!ready) {
                    ready = true;
                    clearTimeout(readyTimeout);
                    resolve({ process: engineProcess });
                }
            });
            
            engineProcess.on("error", (err) => {
                if (!ready) {
                    ready = true;
                    clearTimeout(readyTimeout);
                    reject(err);
                }
            });
        } catch (err) {
            clearTimeout(readyTimeout);
            reject(err);
        }
    });
}

test("MUTATION-1: Disable guard → execute behavioral test → auth wall NOT blocked", async (t) => {
    console.log("\n[MUTATION-1] Testing with guard DISABLED...");
    
    // Apply mutation to worktree copy
    const original = fs.readFileSync(mutatedServerPath, "utf8");
    let mutated = original.replace(
        "const security = await checkSecurityGuards(page);",
        "const security = { blocked: false }; // MUTATED"
    );
    fs.writeFileSync(mutatedServerPath, mutated, "utf8");
    console.log("  ✓ Guard disabled in worktree copy");
    
    // Get available port
    const tempServer = http.createServer();
    const port = await new Promise((resolve) => {
        tempServer.listen(0, "127.0.0.1", () => {
            const p = tempServer.address().port;
            tempServer.close(() => resolve(p));
        });
    });
    
    // Start engine with disabled guard
    console.log(`  Starting mutated engine on port ${port}...`);
    const { process: engineProcess } = await startEngineWithServer(mutatedServerPath, port);
    const engineUrl = `http://127.0.0.1:${port}`;
    
    // Wait for engine to be ready
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    let response;
    try {
        response = await makeRequest(`${engineUrl}/api/screenshot`, {
            url: `${fixtureUrl}/login`,
            selector: "body"
        }, 30000);
    } catch (err) {
        if (engineProcess) {
            engineProcess.kill("SIGTERM");
        }
        throw new Error(`MUTATION-1 FAILED: Engine request failed: ${err.message}`);
    }
    
    // Kill engine
    if (engineProcess) {
        engineProcess.kill("SIGTERM");
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // With guard disabled, auth wall should NOT block
    console.log(`  Response status: "${response.body.status}"`);
    
    if (response.body.status === "blocked") {
        throw new Error("MUTATION FAILED: Guard still active when it should be disabled");
    }
    
    console.log("  ✓ MUTATION WORKED: Auth wall NOT blocked (guard is disabled)");
    console.log("  ✓ Behavioral execution confirmed mutation effective");
});

test("MUTATION-2: Restore guard → execute behavioral test → auth wall IS blocked", async (t) => {
    console.log("\n[MUTATION-2] Testing with guard RESTORED...");
    
    // Restore original to worktree
    const original = fs.readFileSync(originalServerPath, "utf8");
    fs.writeFileSync(mutatedServerPath, original, "utf8");
    console.log("  ✓ Guard restored in worktree copy");
    
    // Get available port
    const tempServer = http.createServer();
    const port = await new Promise((resolve) => {
        tempServer.listen(0, "127.0.0.1", () => {
            const p = tempServer.address().port;
            tempServer.close(() => resolve(p));
        });
    });
    
    // Start engine with restored guard
    console.log(`  Starting restored engine on port ${port}...`);
    const { process: engineProcess } = await startEngineWithServer(mutatedServerPath, port);
    const engineUrl = `http://127.0.0.1:${port}`;
    
    // Wait for engine to be ready
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    let response;
    try {
        response = await makeRequest(`${engineUrl}/api/screenshot`, {
            url: `${fixtureUrl}/login`,
            selector: "body"
        }, 30000);
    } catch (err) {
        if (engineProcess) {
            engineProcess.kill("SIGTERM");
        }
        throw new Error(`MUTATION-2 FAILED: Engine request failed: ${err.message}`);
    }
    
    // Kill engine
    if (engineProcess) {
        engineProcess.kill("SIGTERM");
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // With guard restored, auth wall MUST block
    console.log(`  Response status: "${response.body.status}"`);
    
    assert.equal(
        response.body.status,
        "blocked",
        "Auth wall should be blocked when guard is restored"
    );
    assert.equal(
        response.body.reason,
        "AUTH_REQUIRED",
        "Guard reason should be AUTH_REQUIRED"
    );
    
    console.log("  ✓ Auth wall IS blocked (guard properly restored)");
    console.log("  ✓ Behavioral execution confirms guard is the actual mechanism");
});

test("MUTATION-3: Verify original source unchanged", async (t) => {
    console.log("\n[MUTATION-3] Verifying original source...");
    
    const current = fs.readFileSync(originalServerPath, "utf8");
    assert(
        current.includes("const security = await checkSecurityGuards(page);"),
        "Original should have guard check"
    );
    assert(
        !current.includes("// MUTATED"),
        "Original should have no mutation markers"
    );
    
    console.log("  ✓ Original server.js unchanged");
    console.log("  ✓ All mutations isolated to worktree");
    console.log("  ✓ MUTATION ISOLATION VERIFIED");
});
