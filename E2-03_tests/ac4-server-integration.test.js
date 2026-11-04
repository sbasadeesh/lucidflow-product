// AC4 Server Integration Test
// Exercise the real POST /api/screenshot endpoint with a deterministic fixture
// Verify: actual server-generated action logs → computeScanMetrics → saved summary → GET retrieval

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const http = require("http");

const { readScan } = require("../screenshotModule");

let serverProc = null;
let fixtureProc = null;
const scansDir = path.join(__dirname, "..", "scans");
const screenshotDir = path.join(__dirname, "..", "screenshots");
const PORT = 5000;
const FIXTURE_PORT = 8765;

const timeouts = {
    serverStart: 15000,
    fixturePage: 3000,
    request: 120000,
};

// ============================================================
// Test Suite Setup
// ============================================================

test.before(async () => {
    // Clean up scans and screenshots from previous runs
    [scansDir, screenshotDir].forEach((dir) => {
        if (fs.existsSync(dir)) {
            fs.rmSync(dir, { recursive: true, force: true });
        }
        fs.mkdirSync(dir, { recursive: true });
    });

    // Start fixture server (simple HTTP server serving a test HTML page)
    console.log("[AC4] Starting fixture server on localhost:8765...");
    fixtureProc = spawn("node", [path.join(__dirname, "fixture-server.js")], {
        stdio: ["ignore", "pipe", "pipe"],
        detached: false,
    });

    await new Promise((r) => setTimeout(r, 500));

    // Start E2-03 server
    console.log("[AC4] Starting E2-03 server on localhost:5000...");
    serverProc = spawn("node", [path.join(__dirname, "..", "server.js")], {
        stdio: ["ignore", "pipe", "pipe"],
        detached: false,
        env: { ...process.env, NODE_ENV: "test" },
    });

    // Wait for server to start
    await new Promise((resolve, reject) => {
        const start = Date.now();
        const checkReady = () => {
            if (Date.now() - start > timeouts.serverStart) {
                reject(new Error(`Server did not start within ${timeouts.serverStart}ms`));
                return;
            }
            http.get(`http://localhost:${PORT}/`, (res) => {
                if (res.statusCode === 200) resolve();
                else checkReady();
            }).on("error", checkReady);
        };
        checkReady();
    });

    console.log("[AC4] Servers started successfully");
});

test.after(async () => {
    console.log("[AC4] Cleaning up processes...");
    if (serverProc) {
        serverProc.kill("SIGTERM");
        await new Promise((r) => setTimeout(r, 500));
        if (!serverProc.killed) serverProc.kill("SIGKILL");
    }
    if (fixtureProc) {
        fixtureProc.kill("SIGTERM");
        await new Promise((r) => setTimeout(r, 500));
        if (!fixtureProc.killed) fixtureProc.kill("SIGKILL");
    }
    console.log("[AC4] Cleanup complete");
});

// ============================================================
// Test: Real scan endpoint → metrics → persistence
// ============================================================

test("AC4: POST /api/screenshot with fixture → computeScanMetrics → GET /api/scans/:id", async (t) => {
    const fixtureUrl = `http://localhost:${FIXTURE_PORT}/page.html`;

    console.log(`[AC4] Calling POST /api/screenshot with fixture: ${fixtureUrl}`);

    // Call the real scan endpoint
    const scanResponse = await new Promise((resolve, reject) => {
        const postData = JSON.stringify({ url: fixtureUrl });

        const options = {
            hostname: "localhost",
            port: PORT,
            path: "/api/screenshot",
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(postData),
            },
            timeout: timeouts.request,
        };

        const req = http.request(options, (res) => {
            let data = "";
            res.on("data", (chunk) => { data += chunk; });
            res.on("end", () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error(`Failed to parse response: ${e.message}`));
                }
            });
        });

        req.on("error", reject);
        req.write(postData);
        req.end();
    });

    console.log("[AC4] Scan endpoint returned");

    // Verify response structure
    assert.ok(scanResponse, "response exists");
    assert.ok(scanResponse.scanId, "scanId present");
    assert.ok(scanResponse.actionLog, "actionLog present");
    assert.ok(Array.isArray(scanResponse.actionLog), "actionLog is array");
    assert.ok(scanResponse.actionLog.length > 0, "actionLog has entries");

    console.log(`[AC4] Scan ID: ${scanResponse.scanId}`);
    console.log(`[AC4] Action log entries: ${scanResponse.actionLog.length}`);
    scanResponse.actionLog.forEach((entry, idx) => {
        if (idx < 5 || idx >= scanResponse.actionLog.length - 2) {
            console.log(`      [${idx}] ${entry.action}`);
        } else if (idx === 5) {
            console.log(`      ...`);
        }
    });

    // ===== AC4 REQUIREMENT: Metrics computed from real action log =====
    console.log("[AC4] Verifying metrics computation...");

    assert.ok(
        typeof scanResponse.states === "number" && scanResponse.states >= 1,
        `states is number >= 1, got: ${scanResponse.states}`
    );
    assert.ok(
        typeof scanResponse.interactions === "number" && scanResponse.interactions >= 0,
        `interactions is number >= 0, got: ${scanResponse.interactions}`
    );
    assert.ok(
        scanResponse.interactionBreakdown && typeof scanResponse.interactionBreakdown === "object",
        `interactionBreakdown is object`
    );

    const breakdown = scanResponse.interactionBreakdown;
    const breakdownSum = (breakdown.clicks || 0) + (breakdown.hovers || 0) +
                         (breakdown.fieldsFilled || 0) + (breakdown.selections || 0) +
                         (breakdown.dialogsHandled || 0);

    assert.equal(
        breakdownSum,
        scanResponse.interactions,
        `breakdown sum (${breakdownSum}) matches interactions (${scanResponse.interactions})`
    );

    console.log(`[AC4] Metrics: states=${scanResponse.states}, interactions=${scanResponse.interactions}`);
    console.log(`[AC4] Breakdown: ${JSON.stringify(breakdown)}`);

    // ===== AC4 REQUIREMENT: Summary persisted to disk =====
    console.log("[AC4] Verifying persistence...");

    const summaryFile = path.join(scansDir, `${scanResponse.scanId}.json`);
    assert.ok(
        fs.existsSync(summaryFile),
        `Summary file persisted: ${summaryFile}`
    );

    // ===== AC4 REQUIREMENT: Retrieved via GET /api/scans/:id =====
    console.log("[AC4] Verifying GET /api/scans/:id retrieval...");

    const retrieved = await new Promise((resolve, reject) => {
        const options = {
            hostname: "localhost",
            port: PORT,
            path: `/api/scans/${scanResponse.scanId}`,
            method: "GET",
            timeout: 5000,
        };

        const req = http.request(options, (res) => {
            let data = "";
            res.on("data", (chunk) => { data += chunk; });
            res.on("end", () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error(`Failed to parse GET response: ${e.message}`));
                }
            });
        });

        req.on("error", reject);
        req.end();
    });

    assert.ok(retrieved, "GET /api/scans/:id returned data");
    assert.equal(retrieved.scanId, scanResponse.scanId, "scanId matches");
    assert.equal(retrieved.states, scanResponse.states, "states match");
    assert.equal(retrieved.interactions, scanResponse.interactions, "interactions match");
    assert.deepEqual(retrieved.interactionBreakdown, scanResponse.interactionBreakdown, "breakdown matches");
    assert.deepEqual(retrieved.actionLog, scanResponse.actionLog, "actionLog matches");

    console.log("[AC4] ✅ Full AC4 cycle verified:");
    console.log("[AC4]    Fixture → POST /api/screenshot → action log + metrics");
    console.log("[AC4]    → saveScanSummary() → GET /api/scans/:id");
    console.log("[AC4]    All data integrity verified");

    return {
        scanId: scanResponse.scanId,
        states: scanResponse.states,
        interactions: scanResponse.interactions,
        actionLogLength: scanResponse.actionLog.length,
        breakdown: scanResponse.interactionBreakdown,
    };
});

// ============================================================
// Test: Verify API endpoint list includes the scan
// ============================================================

test("AC4: GET /api/scans lists saved scans", async (t) => {
    await new Promise((r) => setTimeout(r, 500)); // Allow file I/O to complete

    const list = await new Promise((resolve, reject) => {
        const options = {
            hostname: "localhost",
            port: PORT,
            path: "/api/scans",
            method: "GET",
            timeout: 5000,
        };

        const req = http.request(options, (res) => {
            let data = "";
            res.on("data", (chunk) => { data += chunk; });
            res.on("end", () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error(`Failed to parse list response: ${e.message}`));
                }
            });
        });

        req.on("error", reject);
        req.end();
    });

    assert.ok(list, "GET /api/scans returned data");
    assert.ok(Array.isArray(list.scans), "scans is array");
    assert.ok(list.scans.length > 0, "at least one scan in history");
    assert.ok(
        list.totalScans >= 1,
        `totalScans >= 1, got: ${list.totalScans}`
    );
    assert.ok(
        typeof list.totalStates === "number" && list.totalStates >= 1,
        `totalStates is number >= 1`
    );
    assert.ok(
        typeof list.totalInteractions === "number" && list.totalInteractions >= 0,
        `totalInteractions is number >= 0`
    );

    console.log("[AC4] Scan history list verified:");
    console.log(`[AC4]    Total scans: ${list.totalScans}`);
    console.log(`[AC4]    Total states: ${list.totalStates}`);
    console.log(`[AC4]    Total interactions: ${list.totalInteractions}`);
});
