// E2-02 DOM/style evidence PROTOTYPE: engine tests against the real server.js on local synthetic pages.
// Three engines from the unchanged E2-09 helper: gates off, only the feature flag (no acknowledgement),
// and both gates on. Not production enablement: see docs/dom-evidence.md.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { startEngines, normalizedLog } = require("../../overlay-observation/fixture");
const { startSite, markersIn } = require("../fixture");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const SCANS = path.join(ROOT, "scans");
const ACK = "retention-unapproved-local-only";

let site;
let off;
let flagOnly;
let on;
const createdEvidence = new Set();
const createdSummaries = new Set();

const domLines = (text) =>
    String(text).split(/\r?\n/).filter((l) => l.startsWith("[dom-evidence] ")).map((l) => JSON.parse(l.slice("[dom-evidence] ".length)));
const withoutDomLines = (text) => String(text).split(/\r?\n/).filter((l) => !l.startsWith("[dom-evidence] ")).join("\n");

async function post(engine, route, body) {
    const res = await fetch(engine.baseUrl + route, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json();
    if (json.scanId) createdSummaries.add(json.scanId);
    return { httpStatus: res.status, ...json };
}

// one request per engine, its new stdout, and its evidence records
async function run(engine, route, body) {
    engine.sinceLast();
    const r = await post(engine, route, body);
    const out = engine.sinceLast();
    const records = domLines(out).filter((x) => x.scanId === r.scanId && x.seq !== undefined);
    for (const x of records) if (x.file) createdEvidence.add(x.file);
    return { r, out, records };
}

const script = (name) => ({
    name,
    steps: [
        { action: "capture", name: "SYNTH-STATE-NAME closed" },
        { action: "click", selector: "#open" },
        { action: "capture", name: "SYNTH-STATE-NAME open" },
    ],
});

const evidenceFilesFor = (scanId) => (fs.existsSync(SCANS) ? fs.readdirSync(SCANS).filter((f) => f.startsWith(`${scanId}.dom-`)) : []);

test.before(async () => {
    site = await startSite();
    [off, flagOnly, on] = await startEngines([
        { LF_DOM_EVIDENCE: "", LF_DOM_EVIDENCE_ACK: "" },
        { LF_DOM_EVIDENCE: "1", LF_DOM_EVIDENCE_ACK: "" },
        { LF_DOM_EVIDENCE: "1", LF_DOM_EVIDENCE_ACK: ACK },
    ]);
}, { timeout: 90000 });

test.after(async () => {
    await Promise.all([off, flagOnly, on].filter(Boolean).map((e) => e.stop()));
    if (site) await site.close();
    // remove exactly what these tests created: evidence named in their records, and their summaries
    for (const f of createdEvidence) fs.rmSync(path.join(SCANS, f), { force: true });
    for (const id of createdSummaries) fs.rmSync(path.join(SCANS, `${id}.json`), { force: true });
});

test("gates: only the both-gates engine records evidence; flag-only or flag-off prints no startup diagnostic per contract", { timeout: 60000 }, () => {
    assert.deepEqual(domLines(off.logs()), [], "off: no [dom-evidence] output at all");
    assert.deepEqual(domLines(flagOnly.logs()), [], "flag only: no startup diagnostic (silent disabled per contract)");
    assert.deepEqual(domLines(on.logs()), [], "on: nothing printed at startup");
});

test("script endpoint: one record per captured state, linked by step, written only for real states", { timeout: 120000 }, async () => {
    const url = `${site.url}/form`;
    const docs0 = site.count("/form");
    const a = await run(off, "/api/script", { url, script: script("off") });
    const docs1 = site.count("/form");
    const b = await run(on, "/api/script", { url, script: script("on") });
    const docs2 = site.count("/form");
    const c = await run(flagOnly, "/api/script", { url, script: script("flag") });

    assert.equal(a.r.result, "assessed");
    assert.equal(b.r.result, "assessed");
    assert.deepEqual(a.records, [], "off: no records");
    assert.deepEqual(c.records, [], "flag only: no records");
    assert.deepEqual(evidenceFilesFor(a.r.scanId), []);
    assert.deepEqual(evidenceFilesFor(c.r.scanId), []);
    assert.equal(docs2 - docs1, docs1 - docs0, "the same number of document requests with evidence on and off");

    assert.equal(b.records.length, 2, "one record per capture point");
    for (const [i, rec] of b.records.entries()) {
        assert.equal(rec.status, "saved", rec.reasonCode);
        const state = b.r.capturedStates[i];
        assert.deepEqual(rec.link, { step: state.step, stateIndex: state.index }, "linked to the captured state");
        assert.deepEqual(evidenceFilesFor(b.r.scanId).includes(rec.file), true);
    }
    const files = b.records.map((x) => JSON.parse(fs.readFileSync(path.join(SCANS, x.file), "utf8")));
    const dialog = (f) => f.elements.find((e) => e.tag === "dialog");
    assert.equal(dialog(files[0]).visible, false, "first state: modal closed");
    assert.equal(dialog(files[1]).visible, true, "second state: modal open");
    assert.equal(files[0].elements.find((e) => e.type === "checkbox").state.checked, true);

    // existing outputs are unchanged by the feature
    assert.deepEqual(normalizedLog(b.r), normalizedLog(a.r), "same action log");
    assert.deepEqual(Object.keys(b.r).sort(), Object.keys(a.r).sort(), "same response keys");
    assert.deepEqual(b.r.counts, a.r.counts);
    assert.equal(b.r.capturedStates.length, a.r.capturedStates.length);
    const saved = (id) => JSON.parse(fs.readFileSync(path.join(SCANS, `${id}.json`), "utf8"));
    assert.deepEqual(Object.keys(saved(b.r.scanId)).sort(), Object.keys(saved(a.r.scanId)).sort(), "same saved-summary keys");
});

test("screenshot endpoint: exactly one record per raw observation, linked by index and label", { timeout: 180000 }, async () => {
    const url = `${site.url}/form`;
    const a = await run(off, "/api/screenshot", { url });
    const b = await run(on, "/api/screenshot", { url });
    assert.equal(b.r.result, a.r.result);
    assert.equal(b.r.status, a.r.status);
    assert.deepEqual(Object.keys(b.r).sort(), Object.keys(a.r).sort(), "same response keys");
    assert.equal(b.r.states, a.r.states);
    assert.equal(b.r.interactions, a.r.interactions);
    assert.deepEqual(b.r.rawObservations.map((o) => o.label), a.r.rawObservations.map((o) => o.label), "same raw observations");
    assert.deepEqual(a.records, []);

    assert.equal(b.records.length, b.r.rawObservations.length, "one record per state.prep call");
    b.records.forEach((rec, i) => {
        assert.equal(rec.status, "saved", rec.reasonCode);
        assert.equal(rec.link.rawObservationIndex, i);
        assert.ok(b.r.rawObservations[i].rawPath, "the linked raw observation exists");
    });
});

test("privacy: no prohibited marker in any new output; pre-existing logs are only compared, not claimed redacted", { timeout: 120000 }, async (t) => {
    const url = `${site.url}/markers?q=SYNTH-QUERY`;
    const body = { url, script: { name: "markers", steps: [{ action: "capture", name: "SYNTH-STATE-NAME" }] } };
    const a = await run(off, "/api/script", body);
    const b = await run(on, "/api/script", body);
    assert.equal(b.records.length, 1);
    assert.equal(b.records[0].status, "saved", b.records[0].reasonCode);

    // strict: the new outputs
    const file = path.join(SCANS, b.records[0].file);
    const newOutput = [b.records[0].file, fs.readFileSync(file, "utf8"), ...domLines(b.out).map((x) => JSON.stringify(x))].join("\n");
    assert.deepEqual(markersIn(newOutput), [], "no marker in the evidence file, its name or the stdout records");

    // existing outputs: identical on and off; markers there are pre-existing behaviour
    const existing = (x) => [JSON.stringify(x.r), withoutDomLines(x.out)].join("\n");
    assert.deepEqual(markersIn(existing(b)), markersIn(existing(a)), "the feature adds no marker to existing outputs");
    assert.deepEqual(normalizedLog(b.r), normalizedLog(a.r));
    t.diagnostic(`pre-existing markers in existing outputs (not changed by this feature): ${markersIn(existing(a)).join(", ") || "none"}`);
});

test("capture failure: not_saved with a fixed reason, no file, and the scan outcome is unchanged", { timeout: 120000 }, async () => {
    const url = `${site.url}/broken`;
    const body = { url, script: { name: "broken", steps: [{ action: "capture", name: "one" }] } };
    const a = await run(off, "/api/script", body);
    const b = await run(on, "/api/script", body);
    assert.equal(b.r.result, a.r.result);
    assert.equal(b.r.status, a.r.status);
    assert.deepEqual(b.r.counts, a.r.counts);
    assert.equal(b.records.length, 1);
    assert.equal(b.records[0].status, "not_saved");
    assert.equal(b.records[0].reasonCode, "CAPTURE_FAILED");
    assert.deepEqual(evidenceFilesFor(b.r.scanId), []);
    assert.deepEqual(markersIn(domLines(b.out).map((x) => JSON.stringify(x)).join("\n")), [], "no raw error text in the new output");
    assert.deepEqual(normalizedLog(b.r), normalizedLog(a.r));
});
