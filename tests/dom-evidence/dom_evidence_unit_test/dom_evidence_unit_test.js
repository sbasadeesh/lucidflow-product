// E2-02 DOM/style evidence PROTOTYPE: unit tests (one browser, a local synthetic site, temp folders).
// Not production enablement: see docs/dom-evidence.md.
//
// The module is loaded lazily so that, against a baseline without it, each test fails with its own
// clear reason instead of the whole file failing to load.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");

const { startSite, markersIn } = require("../fixture");
const { runStateScript } = require("../../../backend/src/capture/stateScriptRunner");

function mod() {
    try {
        return require("../../../backend/src/modules/domEvidence/domEvidence");
    } catch (e) {
        assert.fail(`domEvidence module is not available: ${String(e.message).split("\n")[0]}`);
    }
}
function schema() {
    try {
        return require("../../../backend/src/modules/domEvidence/domEvidence.schema");
    } catch (e) {
        assert.fail(`domEvidence schema is not available: ${String(e.message).split("\n")[0]}`);
    }
}

const ON = { LF_DOM_EVIDENCE: "1", LF_DOM_EVIDENCE_ACK: "retention-unapproved-local-only" };
const SCAN = "scan-1700000000001";

let browser;
let site;
const tmpDirs = [];

function tmpDir() {
    // realpath: os.tmpdir() may differ in case or use a short name from the real path
    const d = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "e2-02-dom-")));
    tmpDirs.push(d);
    return d;
}

async function open(p) {
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const page = await context.newPage();
    await page.goto(site.url + p, { waitUntil: "load" });
    return { page, context };
}

// a session writing into a temp folder and collecting its stdout lines in memory
function session(dir, extra = {}) {
    const lines = [];
    const s = mod().createSession({ scanId: SCAN, dir, env: ON, write: (line) => lines.push(line), ...extra });
    return { s, lines };
}

test.before(async () => {
    browser = await chromium.launch({ headless: true });
    site = await startSite();
}, { timeout: 60000 });

test.after(async () => {
    if (browser) await browser.close();
    if (site) await site.close();
    for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// gates
// ---------------------------------------------------------------------------
test("gates: enabled only when both gates have their exact values", () => {
    const { resolveGate, createSession, startupLine } = mod();
    const cases = [
        [{}, false, "OFF"],
        [{ LF_DOM_EVIDENCE: "1" }, false, "ACK_REQUIRED"],
        [{ LF_DOM_EVIDENCE: "1", LF_DOM_EVIDENCE_ACK: "yes" }, false, "ACK_REQUIRED"],
        [{ LF_DOM_EVIDENCE: "true", LF_DOM_EVIDENCE_ACK: ON.LF_DOM_EVIDENCE_ACK }, false, "OFF"],
        [{ LF_DOM_EVIDENCE_ACK: ON.LF_DOM_EVIDENCE_ACK }, false, "OFF"],
        [ON, true, null],
    ];
    for (const [env, enabled, reason] of cases) {
        const g = resolveGate(env);
        assert.equal(g.enabled, enabled, JSON.stringify(env));
        assert.equal(g.reasonCode, reason, JSON.stringify(env));
        assert.equal(createSession({ scanId: SCAN, dir: os.tmpdir(), env }) === null, !enabled, "no session when disabled");
    }
    // startupLine returns null under the approved silent-startup contract (no diagnostic printed when disabled)
    assert.equal(startupLine(resolveGate({})), null, "nothing is printed when off");
    assert.equal(startupLine(resolveGate({ LF_DOM_EVIDENCE: "1" })), null, "nothing is printed when flag only (ACK_REQUIRED internally but silent output)");
    assert.equal(startupLine(resolveGate(ON)), null, "nothing is printed at startup when enabled");
});

// ---------------------------------------------------------------------------
// privacy, schema and value domains
// ---------------------------------------------------------------------------
test("privacy: no prohibited marker in the collector output, the record, the file or the stdout line", { timeout: 60000 }, async () => {
    const { collect, buildRecord } = mod();
    const { validateRecord } = schema();
    // positive control: every marker really is on the page
    const raw = site.raw("/markers");
    const { page, context } = await open("/markers?q=SYNTH-QUERY");
    const live = await page.evaluate(() => document.documentElement.outerHTML + document.getElementById("live").value + document.getElementById("host").shadowRoot.innerHTML + location.href + document.title);
    const missing = require("../fixture").MARKERS.filter((m) => m !== "SYNTH-OVERRIDE" && !markersIn(raw + live).includes(m));
    assert.deepEqual(missing, [], "positive control: the fixture contains every marker");

    const htmlBefore = await page.evaluate(() => document.documentElement.outerHTML);
    const c = await collect(page);
    const htmlAfter = await page.evaluate(() => document.documentElement.outerHTML);
    assert.equal(htmlAfter, htmlBefore, "collection does not change the page");
    assert.equal(c.ok, true, `collected (${c.reasonCode})`);
    assert.deepEqual(markersIn(JSON.stringify(c)), [], "no marker in the raw collector output");

    const { record } = buildRecord({ scanId: SCAN, seq: 1, endpoint: "script", link: { step: 1, stateIndex: 1 }, collected: c });
    assert.deepEqual(markersIn(JSON.stringify(record)), [], "no marker in the record");
    assert.deepEqual(validateRecord(record), [], "every key and value is in its allowed domain");

    // invalid role / type / custom tag are mapped, never stored raw
    const els = record.elements;
    assert.ok(els.some((e) => e.role === "other"), "invalid role becomes other");
    assert.ok(els.some((e) => e.tag === "x-other" && e.role === "button"), "custom element becomes x-other");
    assert.ok(els.every((e) => !(e.tag === "input" && e.type === "hidden")), "hidden inputs are not stored");
    assert.ok(record.excluded.hiddenInputs >= 1 && record.excluded.frames >= 1 && record.excluded.shadowHosts >= 1, JSON.stringify(record.excluded));
    const checkbox = els.find((e) => e.tag === "input" && e.type === "checkbox");
    assert.equal(checkbox.state.checked, true, "boolean state is kept");
    const select = els.find((e) => e.tag === "select");
    assert.equal(select.state.selectedIndex, 1, "selected option position only");

    // the whole persisted path: file name, file content and stdout line
    const dir = tmpDir();
    const { s, lines } = session(dir);
    const rec = await s.screenshotPoint(page, { label: "element-SYNTH-TEXT-slug", rawOk: true, rawObservationIndex: 0 });
    assert.equal(rec.status, "saved", rec.reasonCode);
    assert.equal(rec.link.label, "element", "element-<slug> labels are not stored");
    const files = fs.readdirSync(dir);
    assert.deepEqual(files, [`${SCAN}.dom-001.json`]);
    assert.deepEqual(markersIn(files.join(" ") + fs.readFileSync(path.join(dir, files[0]), "utf8") + lines.join("\n")), []);
    await context.close();
});

test("schema: free-form computed-style values are rejected even when the page fakes them", { timeout: 60000 }, async () => {
    const { collect, buildRecord } = mod();
    const { validateRecord } = schema();
    const { page, context } = await open("/override");
    const c = await collect(page);
    assert.equal(c.ok, true, c.reasonCode);
    assert.deepEqual(markersIn(JSON.stringify(c)), [], "no free-form value in the collector output");
    const { record } = buildRecord({ scanId: SCAN, seq: 1, endpoint: "script", link: { step: 1, stateIndex: 1 }, collected: c });
    assert.deepEqual(validateRecord(record), []);
    assert.ok(record.counts.invalidValues > 0, "rejected values are counted");
    assert.ok(record.elements.every((e) => Object.values(e.style).every((v) => v === null)), "every faked style value became null");
    await context.close();
});

test("schema: validateRecord rejects unknown keys and out-of-domain values", () => {
    const { validateRecord } = schema();
    const good = {
        schemaVersion: 1, scanId: SCAN, seq: 1, endpoint: "script", link: { step: 1, stateIndex: 1 },
        capturedAt: "2026-01-01T00:00:00.000Z", durationMs: 5, viewport: { width: 1366, height: 900 }, scroll: { x: 0, y: 0 },
        document: { width: 1366, height: 900, nodeCount: 10 }, elements: [], counts: { candidates: 0, stored: 0, invalidValues: 0 },
        excluded: { frames: 0, shadowHosts: 0, hiddenInputs: 0, tooDeep: 0 },
    };
    assert.deepEqual(validateRecord(good), []);
    assert.notDeepEqual(validateRecord({ ...good, title: "x" }), [], "unknown key");
    assert.notDeepEqual(validateRecord({ ...good, endpoint: "SYNTH" }), [], "bad enum");
    assert.notDeepEqual(validateRecord({ ...good, scanId: "../x" }), [], "bad scanId");
    const el = {
        path: "html > body > button", tag: "button", type: "button", role: null,
        state: { checked: null, disabled: false, required: null, readOnly: null, open: null, expanded: null, ariaChecked: null, ariaDisabled: null, ariaHidden: null, ariaModal: null, selectedIndex: null, multiple: null },
        box: { x: 0, y: 0, width: 10, height: 10 }, visible: true, hiddenReason: null, inViewport: true,
        style: { color: "rgb(0, 0, 0)", backgroundColor: "rgba(0, 0, 0, 0)", effectiveBackgroundColor: "rgb(255, 255, 255)", fontSize: "16px", fontWeight: "400", opacity: "1", display: "inline-block", visibility: "visible", position: "static", zIndex: "auto", pointerEvents: "auto" },
    };
    assert.deepEqual(validateRecord({ ...good, elements: [el] }), []);
    assert.notDeepEqual(validateRecord({ ...good, elements: [{ ...el, text: "SYNTH" }] }), [], "text key");
    assert.notDeepEqual(validateRecord({ ...good, elements: [{ ...el, style: { ...el.style, color: "url(x)" } }] }), [], "url value");
    assert.notDeepEqual(validateRecord({ ...good, elements: [{ ...el, path: "html > body > synth-x" }] }), [], "unknown tag in path");
});

test("dynamic state: the modal opened by client code is captured as visible, without navigation", { timeout: 60000 }, async () => {
    const { collect, buildRecord } = mod();
    const { page, context } = await open("/form");
    const before = site.count("/form");
    const closed = buildRecord({ scanId: SCAN, seq: 1, endpoint: "script", link: { step: 1, stateIndex: 1 }, collected: await collect(page) }).record;
    await page.click("#open");
    const opened = buildRecord({ scanId: SCAN, seq: 2, endpoint: "script", link: { step: 3, stateIndex: 2 }, collected: await collect(page) }).record;
    const dialog = (r) => r.elements.find((e) => e.tag === "dialog");
    assert.equal(dialog(closed).visible, false);
    assert.equal(dialog(closed).state.open, false);
    assert.equal(dialog(opened).visible, true);
    assert.equal(dialog(opened).state.open, true);
    assert.equal(site.count("/form"), before, "no extra document request");
    await context.close();
});

// ---------------------------------------------------------------------------
// limits, traversal bounds, timeout
// ---------------------------------------------------------------------------
test("limits: too many candidates and too large documents are rejected, not truncated; deep elements are only counted", { timeout: 60000 }, async () => {
    const { collect, buildRecord } = mod();
    let r = await open("/many");
    assert.equal((await collect(r.page)).reasonCode, "TOO_MANY_ELEMENTS");
    await r.context.close();
    r = await open("/huge");
    assert.equal((await collect(r.page)).reasonCode, "TOO_LARGE_DOCUMENT");
    await r.context.close();
    r = await open("/deep");
    const c = await collect(r.page);
    assert.equal(c.ok, true);
    const { record } = buildRecord({ scanId: SCAN, seq: 1, endpoint: "script", link: { step: 1, stateIndex: 1 }, collected: c });
    assert.ok(record.excluded.tooDeep >= 1, "the deep button is counted, not stored");
    assert.ok(record.elements.every((e) => e.path.split(" > ").length <= 64));
    assert.ok(record.elements.some((e) => e.tag === "button"), "the shallow button is stored");
    await r.context.close();
});

test("limits: an oversized record is rejected before anything is written", { timeout: 60000 }, async () => {
    const dir = tmpDir();
    const { s } = session(dir, { config: { maxFileBytes: 200 } });
    const { page, context } = await open("/form");
    const rec = await s.screenshotPoint(page, { label: "full-page", rawOk: true, rawObservationIndex: 0 });
    assert.equal(rec.status, "not_saved");
    assert.equal(rec.reasonCode, "TOO_LARGE");
    assert.deepEqual(fs.readdirSync(dir), [], "no file and no partial file");
    await context.close();
});

test("limits: capture points beyond the per-scan limit are LIMIT_REACHED", { timeout: 60000 }, async () => {
    const dir = tmpDir();
    const { s } = session(dir, { config: { maxCapturePointsPerScan: 2 } });
    const { page, context } = await open("/form");
    const r = [];
    for (let i = 0; i < 3; i++) r.push(await s.screenshotPoint(page, { label: "full-page", rawOk: true, rawObservationIndex: i }));
    assert.deepEqual(r.map((x) => x.reasonCode), [null, null, "LIMIT_REACHED"]);
    assert.equal(fs.readdirSync(dir).length, 2);
    await context.close();
});

test("timeout: a late result is never written and does not hold up the next capture", { timeout: 90000 }, async () => {
    const dir = tmpDir();
    const { s, lines } = session(dir, { config: { captureTimeoutMs: 300 } });
    const slow = await open("/slow");
    const t0 = Date.now();
    const rec = await s.screenshotPoint(slow.page, { label: "full-page", rawOk: true, rawObservationIndex: 0 });
    assert.equal(rec.reasonCode, "TIMEOUT");
    assert.ok(Date.now() - t0 < 3000, "the caller is released soon after the timeout");
    await new Promise((r) => setTimeout(r, 2000)); // longer than the in-page work would have taken unbounded? (200 x 25 ms = 5 s)
    assert.deepEqual(fs.readdirSync(dir), [], "nothing written by the late result");
    assert.equal(lines.length, 1, "exactly one record for the capture point");
    // the same page: the next evaluate is not stuck behind unbounded work (in-page deadline)
    const t1 = Date.now();
    await slow.page.evaluate(() => 1);
    assert.ok(Date.now() - t1 < 1500, `the page is responsive again (${Date.now() - t1} ms)`);
    await slow.context.close();
    const ok = await open("/form");
    assert.equal((await s.screenshotPoint(ok.page, { label: "full-page", rawOk: true, rawObservationIndex: 1 })).status, "saved");
    await ok.context.close();
});

// ---------------------------------------------------------------------------
// PAGE_CHANGED
// ---------------------------------------------------------------------------
test("PAGE_CHANGED: same-URL reload, pushState and hash change during collection are detected", { timeout: 60000 }, async () => {
    const { collect } = mod();
    const changes = {
        reload: (page) => page.reload({ waitUntil: "load" }),
        pushState: (page) => page.evaluate(() => history.pushState({}, "", "/form?moved")),
        hash: (page) => page.evaluate(() => { location.hash = "#moved"; }),
    };
    for (const [name, change] of Object.entries(changes)) {
        const { page, context } = await open("/form");
        const c = await collect(page, { testHooks: { betweenReads: change } });
        assert.equal(c.reasonCode, "PAGE_CHANGED", name);
        await context.close();
    }
    const { page, context } = await open("/form");
    assert.equal((await collect(page)).ok, true, "control: no change gives a normal collection");
    await context.close();
});

// ---------------------------------------------------------------------------
// writer: path safety, collision, partial writes
// ---------------------------------------------------------------------------
test("writer: unsafe names, linked folders, collisions and failed writes", () => {
    const { writeEvidence } = mod();
    const dir = tmpDir();
    const content = '{"ok":true}';
    assert.equal(writeEvidence({ dir, scanId: "../scan-1", seq: 1, content }).reasonCode, "UNSAFE_PATH");
    assert.equal(writeEvidence({ dir, scanId: SCAN, seq: 0, content }).reasonCode, "UNSAFE_PATH");
    assert.equal(writeEvidence({ dir, scanId: SCAN, seq: 1000, content }).reasonCode, "UNSAFE_PATH");

    const ok = writeEvidence({ dir, scanId: SCAN, seq: 1, content });
    assert.equal(ok.ok, true);
    const again = writeEvidence({ dir, scanId: SCAN, seq: 1, content: '{"other":1}' });
    assert.equal(again.reasonCode, "COLLISION");
    assert.equal(fs.readFileSync(path.join(dir, ok.file), "utf8"), content, "never overwritten");

    // a link step that fails, and the exclusive-create fallback that fails too
    const failing = { ...fs, linkSync: () => { throw Object.assign(new Error("x"), { code: "EIO" }); } };
    const w = writeEvidence({ dir, scanId: SCAN, seq: 2, content, fs: failing });
    assert.equal(w.reasonCode, "WRITE_FAILED");
    // a write that fails after the temp file was created
    const failWrite = { ...fs, writeSync: () => { throw Object.assign(new Error("x"), { code: "ENOSPC" }); } };
    assert.equal(writeEvidence({ dir, scanId: SCAN, seq: 3, content, fs: failWrite }).reasonCode, "WRITE_FAILED");
    assert.deepEqual(fs.readdirSync(dir).sort(), [ok.file], "no final file and no .partial file left behind");

    // a folder that is a link / junction is refused
    const target = tmpDir();
    const link = path.join(tmpDir(), "linked");
    try {
        fs.symlinkSync(target, link, process.platform === "win32" ? "junction" : "dir");
    } catch (e) {
        return; // cannot create links here: covered on other platforms
    }
    assert.equal(writeEvidence({ dir: link, scanId: SCAN, seq: 1, content }).reasonCode, "UNSAFE_PATH");
    assert.deepEqual(fs.readdirSync(target), [], "nothing written through the link");
});

// ---------------------------------------------------------------------------
// script endpoint linkage and the runner hooks
// ---------------------------------------------------------------------------
test("script linkage: evidence is written only after the state's screenshot succeeded", { timeout: 60000 }, async () => {
    const dir = tmpDir();
    const { s, lines } = session(dir);
    const { page, context } = await open("/form");
    await s.scriptPrepare(page, { index: 1, step: 2 });
    assert.deepEqual(fs.readdirSync(dir), [], "nothing is written before the screenshot result");
    const failed = await s.scriptComplete({ index: 1, step: 2, ok: false });
    assert.equal(failed.status, "not_saved");
    assert.equal(failed.reasonCode, "SCREENSHOT_FAILED");
    assert.deepEqual(fs.readdirSync(dir), [], "failed-screenshot evidence is never written");
    await s.scriptPrepare(page, { index: 1, step: 3 }); // the runner reuses index 1 after a failure
    const saved = await s.scriptComplete({ index: 1, step: 3, ok: true });
    assert.equal(saved.status, "saved");
    assert.deepEqual(saved.link, { step: 3, stateIndex: 1 });
    assert.equal(saved.file, `${SCAN}.dom-002.json`, "a new seq, no collision with the failed point");
    await s.scriptPrepare(page, { index: 2, step: 4 });
    s.flush();
    assert.equal(lines.length, 3, "exactly one record per capture point, including one never completed");
    assert.equal(JSON.parse(lines[2].replace(/^\[dom-evidence\] /, "")).reasonCode, "INCOMPLETE");
    await context.close();
});

test("runner: prep receives { index, step } and afterCapture reports the screenshot result", { timeout: 60000 }, async () => {
    const out = tmpDir();
    const calls = [];
    // 1) a screenshot that succeeds
    let r = await open("/form");
    await runStateScript(r.page, { name: "t", steps: [{ action: "capture", name: "a" }] }, {
        outDir: out, filePrefix: "t1",
        prep: async (info) => calls.push(["prep", info]),
        afterCapture: async (info) => calls.push(["after", info]),
    });
    await r.context.close();
    // 2) a screenshot that fails: the page is closed inside prep
    r = await open("/form");
    const res = await runStateScript(r.page, { name: "t", steps: [{ action: "capture", name: "b" }] }, {
        outDir: out, filePrefix: "t2",
        prep: async (info) => { calls.push(["prep", info]); await r.page.close(); },
        afterCapture: async (info) => calls.push(["after", info]),
    });
    await r.context.close();
    assert.equal(res.counts.failed, 1, "the second screenshot failed");
    assert.deepEqual(calls, [
        ["prep", { index: 1, step: 1 }], ["after", { index: 1, step: 1, ok: true }],
        ["prep", { index: 1, step: 1 }], ["after", { index: 1, step: 1, ok: false }],
    ]);
});

// ---------------------------------------------------------------------------
// screenshot endpoint linkage, orphan removal, stdout isolation
// ---------------------------------------------------------------------------
test("screenshot linkage: no raw observation means nothing is collected", { timeout: 60000 }, async () => {
    const dir = tmpDir();
    const { s } = session(dir);
    const { page, context } = await open("/form");
    const rec = await s.screenshotPoint(page, { label: "full-page", rawOk: false, rawObservationIndex: null });
    assert.equal(rec.reasonCode, "NO_RAW_OBSERVATION");
    assert.deepEqual(fs.readdirSync(dir), []);
    await context.close();
});

test("orphans: only files created by this request are removed when its summary was not saved", { timeout: 60000 }, async () => {
    const dir = tmpDir();
    const { s, lines } = session(dir);
    const { page, context } = await open("/form");
    await s.screenshotPoint(page, { label: "full-page", rawOk: true, rawObservationIndex: 0 });
    await s.screenshotPoint(page, { label: "top-of-page", rawOk: true, rawObservationIndex: 1 });
    await context.close();
    // files that this request did not create, including one with a matching-looking name
    fs.writeFileSync(path.join(dir, "scan-1700000000002.dom-001.json"), "{}");
    fs.writeFileSync(path.join(dir, `${SCAN}.dom-099.json`), "{}");
    s.afterSummary(); // no scans/<scanId>.json exists
    assert.deepEqual(fs.readdirSync(dir).sort(), [`${SCAN}.dom-099.json`, "scan-1700000000002.dom-001.json"]);
    const last = JSON.parse(lines[lines.length - 1].replace(/^\[dom-evidence\] /, ""));
    assert.deepEqual(last, { schemaVersion: 1, scanId: SCAN, orphanRemoved: 2, orphanRemoveFailed: 0 });

    // with the summary saved, nothing is removed and nothing extra is printed
    const dir2 = tmpDir();
    const t = session(dir2);
    const r2 = await open("/form");
    await t.s.screenshotPoint(r2.page, { label: "full-page", rawOk: true, rawObservationIndex: 0 });
    await r2.context.close();
    fs.writeFileSync(path.join(dir2, `${SCAN}.json`), "{}");
    const before = t.lines.length;
    t.s.afterSummary();
    assert.equal(fs.readdirSync(dir2).length, 2);
    assert.equal(t.lines.length, before);
});

test("stdout failure isolation: a failing writer never breaks capture or the caller", { timeout: 60000 }, async () => {
    const dir = tmpDir();
    const s = mod().createSession({ scanId: SCAN, dir, env: ON, write: () => { throw new Error("stdout broken"); } });
    const { page, context } = await open("/form");
    const rec = await s.screenshotPoint(page, { label: "full-page", rawOk: true, rawObservationIndex: 0 });
    assert.equal(rec.status, "saved");
    assert.equal(fs.readdirSync(dir).length, 1);
    assert.doesNotThrow(() => s.afterSummary());
    await context.close();
});
