/**
 * E2-07 Mutation Test: Prove Guard Mechanism is Actually Responsible
 * 
 * ISOLATED EXECUTION: Creates real git detached worktree, runs behavioral tests.
 * - Mutation 1: Disable guard → execute auth wall test → verify NOT blocked
 * - Mutation 2: Restore guard → execute auth wall test → verify IS blocked  
 * - Proves guard is the actual mechanism, not dead code
 * 
 * Uses real git worktree with all dependencies (node_modules symlink).
 * Never modifies active source tree.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync, execFileSync, spawn } = require("child_process");

let fixtureServer;
let fixtureUrl;

const repoRoot = path.join(__dirname, "..", "..");
const originalServerPath = path.join(repoRoot, "server.js");
const nodeModulesPath = path.join(repoRoot, "node_modules");
let worktreeDir;
let worktreeServerPath;
let childProcess;
let cleanOriginal;  // Store the clean server.js from worktree

test.before(async (t) => {
    console.log("\n=== E2-07 Mutation Test (Real Worktree with Behavioral Execution) ===\n");
    
    // Create temporary directory for worktree
    worktreeDir = path.join(os.tmpdir(), `e2-07-mutation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    console.log(`📁 Creating real git worktree: ${worktreeDir}`);
    
    try {
        // Create REAL detached git worktree from current HEAD
        execFileSync("git", ["worktree", "add", "--detach", worktreeDir, "HEAD"], {
            cwd: repoRoot,
            stdio: "pipe"
        });
        console.log(`✓ Git worktree created (detached from HEAD)`);
    } catch (err) {
        throw new Error(`Failed to create git worktree: ${err.message}`);
    }
    
    worktreeServerPath = path.join(worktreeDir, "server.js");
    
    // Capture the clean worktree server.js content for use across mutations
    cleanOriginal = fs.readFileSync(worktreeServerPath, "utf8");
    
    // Link node_modules to make dependencies available in worktree
    const worktreeNodeModules = path.join(worktreeDir, "node_modules");
    if (fs.existsSync(nodeModulesPath) && !fs.existsSync(worktreeNodeModules)) {
        try {
            // Try junction (Windows-friendly)
            execFileSync("cmd", ["/c", "mklink", "/J", worktreeNodeModules, nodeModulesPath], {
                stdio: "pipe"
            });
            console.log(`✓ node_modules linked (junction)`);
        } catch (e1) {
            try {
                // Fallback: symlink
                fs.symlinkSync(nodeModulesPath, worktreeNodeModules, "dir");
                console.log(`✓ node_modules linked (symlink)`);
            } catch (e2) {
                console.log(`⚠ Could not link node_modules (${e1.message}), relying on existing install`);
            }
        }
    }
    
    // Start fixture server
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
    
    if (childProcess) {
        try {
            childProcess.kill("SIGTERM");
        } catch (e) {}
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Clean up git worktree
    if (worktreeDir) {
        try {
            execFileSync("git", ["worktree", "remove", "--force", worktreeDir], {
                cwd: repoRoot,
                stdio: "pipe"
            });
            console.log(`✓ Worktree removed`);
        } catch (err) {
            console.log(`  (worktree cleanup: ${err.message})`);
        }
    }
});

function pollForReadiness(url, deadline = 10000) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        
        const poll = () => {
            const elapsed = Date.now() - startTime;
            if (elapsed > deadline) {
                reject(new Error(`Engine did not respond after ${deadline}ms`));
                return;
            }
            
            const options = new URL(url);
            const req = http.get(options, (res) => {
                if (res.statusCode === 200) {
                    resolve();
                } else {
                    setTimeout(poll, 500);
                }
            });
            
            req.on("error", () => {
                setTimeout(poll, 500);
            });
            
            req.setTimeout(1000);
        };
        
        poll();
    });
}

function makeRequest(url, payload, timeout = 30000) {
    return new Promise((resolve, reject) => {
        const timeoutHandle = setTimeout(() => {
            reject(new Error(`Request timeout after ${timeout}ms`));
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

async function startMutatedEngine(mutation, port, cleanOriginal) {
    // Always restore from clean original first (cleans up mutations from previous test)
    fs.writeFileSync(worktreeServerPath, cleanOriginal, "utf8");
    
    // Apply mutation if provided
    let toRun = cleanOriginal;
    if (mutation) {
        toRun = mutation(cleanOriginal);
        fs.writeFileSync(worktreeServerPath, toRun, "utf8");
    }
    
    // Spawn child process
    return new Promise((resolve, reject) => {
        let ready = false;
        let stdout = "";
        let stderr = "";
        
        childProcess = spawn(process.execPath, [worktreeServerPath], {
            cwd: worktreeDir,
            stdio: ["ignore", "pipe", "pipe"],
            env: { ...process.env, PORT: String(port) }
        });
        
        let stdoutTimeout;
        
        childProcess.stdout.on("data", (data) => {
            stdout += data.toString();
            if (!ready) {
                console.log(`    [engine stdout] ${data.toString().trim()}`);
                ready = true;
                clearTimeout(stdoutTimeout);
                resolve({ ready: true });
            }
        });
        
        childProcess.stderr.on("data", (data) => {
            stderr += data.toString();
            if (!ready) {
                console.log(`    [engine stderr] ${data.toString().trim()}`);
            }
        });
        
        childProcess.on("error", (err) => {
            ready = true;
            reject(new Error(`Engine spawn error: ${err.message}`));
        });
        
        childProcess.on("exit", (code, signal) => {
            if (!ready) {
                ready = true;
                reject(new Error(`Engine exited prematurely: code ${code}, signal ${signal}\n${stderr}`));
            }
        });
        
        // Timeout: if no stdout/stderr within 3s, try polling
        stdoutTimeout = setTimeout(async () => {
            if (!ready) {
                try {
                    await pollForReadiness(`http://127.0.0.1:${port}/`, 5000);
                    ready = true;
                    resolve({ ready: true });
                } catch (pollErr) {
                    ready = true;
                    reject(new Error(`Engine failed to start: ${pollErr.message}\nStderr: ${stderr}`));
                }
            }
        }, 3000);
    });
}

test("MUTATION-1: Disable guard in worktree → execute auth wall test → expect NOT blocked", async (t) => {
    console.log("\n[MUTATION-1] Testing with guard DISABLED in worktree...");
    
    // Mutation: disable guard
    const disableGuardMutation = (src) => {
        return src.replace(
            "const security = await checkSecurityGuards(page);",
            "const security = { blocked: false }; // MUTATED: guard disabled"
        );
    };
    
    // Get available port
    const tempServer = http.createServer();
    const port = await new Promise((resolve) => {
        tempServer.listen(0, "127.0.0.1", () => {
            const p = tempServer.address().port;
            tempServer.close(() => resolve(p));
        });
    });
    
    console.log(`  Spawning engine with disabled guard on port ${port}...`);
    
    try {
        await startMutatedEngine(disableGuardMutation, port, cleanOriginal);
        const engineUrl = `http://127.0.0.1:${port}`;
        
        // Wait for engine readiness
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Execute behavioral test: hit auth wall with disabled guard
        console.log(`  Executing behavioral test: POST ${engineUrl}/api/screenshot...`);
        const response = await makeRequest(`${engineUrl}/api/screenshot`, {
            url: `${fixtureUrl}/login`,
            selector: "body"
        }, 30000);
        
        console.log(`  Response status: "${response.body.status}"`);
        
        // With guard disabled, auth wall should NOT block
        if (response.body.status === "blocked") {
            throw new Error("MUTATION FAILED: Guard still blocks when it should be disabled");
        }
        
        console.log("  ✓ MUTATION CORRECT: Auth wall NOT blocked (guard is disabled)");
        console.log("  ✓ Behavioral execution confirms mutation effective");
    } finally {
        if (childProcess) {
            childProcess.kill("SIGTERM");
            childProcess = null;
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
});

test("MUTATION-2: Restore guard in worktree → execute auth wall test → expect IS blocked", async (t) => {
    console.log("\n[MUTATION-2] Testing with guard RESTORED in worktree...");
    
    // Get available port
    const tempServer = http.createServer();
    const port = await new Promise((resolve) => {
        tempServer.listen(0, "127.0.0.1", () => {
            const p = tempServer.address().port;
            tempServer.close(() => resolve(p));
        });
    });
    
    console.log(`  Spawning engine with restored guard on port ${port}...`);
    
    try {
        // No mutation = original code (cleanOriginal will be restored)
        await startMutatedEngine(null, port, cleanOriginal);
        const engineUrl = `http://127.0.0.1:${port}`;
        
        // Wait for engine readiness
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Execute behavioral test: hit auth wall with guard restored
        console.log(`  Executing behavioral test: POST ${engineUrl}/api/screenshot...`);
        const response = await makeRequest(`${engineUrl}/api/screenshot`, {
            url: `${fixtureUrl}/login`,
            selector: "body"
        }, 30000);
        
        console.log(`  Response status: "${response.body.status}"`);
        console.log(`  Response reason: "${response.body.reason}"`);
        
        // With guard restored, auth wall MUST block
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
    } finally {
        if (childProcess) {
            childProcess.kill("SIGTERM");
            childProcess = null;
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
});

test("MUTATION-3: Verify original source unchanged", async (t) => {
    console.log("\n[MUTATION-3] Verifying original source unchanged...");
    
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
