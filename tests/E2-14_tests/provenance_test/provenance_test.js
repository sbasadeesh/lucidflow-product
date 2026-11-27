// E2-14 provenance tests. generateProvenance is a standalone utility: it is not yet
// called by the scan engine and is not part of any API response or saved scan schema.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const pkg = require("../../../package.json");
const { generateProvenance, resolveCodeRevision, UNAVAILABLE } = require("../../../Provenance & cleanUp/provenance");

const REAL_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.33 Safari/537.36";
const SHA = "0123456789abcdef0123456789abcdef01234567";

test("AC1: provenance includes versions, environment and budgets", () => {
    const budgets = { maxStates: 10, maxInteractions: 5 };
    const prov = generateProvenance(budgets, {}, { codeRevision: SHA });

    assert.equal(prov.engineVersion, pkg.version, "engine version comes from package.json");
    assert.equal(prov.nodeVersion, process.version);
    assert.equal(prov.os, `${os.platform()} ${os.release()}`);
    assert.ok(prov.environment.timezone);
    assert.ok(prov.environment.memoryMB > 0);
    assert.ok(prov.environment.cpuCores > 0);
    assert.deepEqual(prov.budgets, budgets);
    assert.notEqual(prov.budgets, budgets, "budgets are copied, not shared");
});

test("the caller's real user agent, locale and profile name are recorded unchanged", () => {
    const prov = generateProvenance({}, { name: "desktop-1366", userAgent: REAL_UA, locale: "en-GB" }, { codeRevision: SHA });
    assert.equal(prov.accessProfile.name, "desktop-1366");
    assert.equal(prov.accessProfile.userAgent, REAL_UA);
    assert.equal(prov.accessProfile.locale, "en-GB");
    assert.equal(prov.accessProfile.isAuthenticated, false);
    assert.equal(prov.codeRevision, SHA);
});

test("missing access metadata is reported as unavailable, never as a made-up value", () => {
    const prov = generateProvenance({}, {}, { codeRevision: SHA });
    assert.equal(UNAVAILABLE, "unavailable");
    assert.equal(prov.accessProfile.name, UNAVAILABLE);
    assert.equal(prov.accessProfile.userAgent, UNAVAILABLE);
    assert.equal(prov.accessProfile.locale, UNAVAILABLE);
    const text = JSON.stringify(prov);
    assert.doesNotMatch(text, /Mozilla\/5\.0\.\.\./, "no placeholder user agent");
    assert.doesNotMatch(text, /default-desktop/, "no placeholder profile name");

    const blank = generateProvenance({}, { name: "  ", userAgent: "", locale: 42 }, { codeRevision: SHA });
    assert.equal(blank.accessProfile.name, UNAVAILABLE);
    assert.equal(blank.accessProfile.userAgent, UNAVAILABLE);
    assert.equal(blank.accessProfile.locale, UNAVAILABLE);
});

test("a code revision is taken from the caller or the CI environment when valid", () => {
    assert.equal(resolveCodeRevision({ codeRevision: SHA }), SHA);
    assert.equal(resolveCodeRevision({ env: { GITHUB_SHA: SHA }, repoDir: os.tmpdir() }), SHA);
    assert.equal(generateProvenance({}, {}, { codeRevision: SHA.toUpperCase() }).codeRevision, SHA);
});

test("the code revision is unavailable when it cannot be determined", () => {
    const notARepo = fs.mkdtempSync(path.join(os.tmpdir(), "e2-14-norepo-"));
    try {
        assert.equal(resolveCodeRevision({ env: {}, repoDir: notARepo }), UNAVAILABLE);
        assert.equal(resolveCodeRevision({ env: { GITHUB_SHA: "not-a-sha" }, repoDir: notARepo }), UNAVAILABLE);
        assert.equal(resolveCodeRevision({ codeRevision: "main", env: {}, repoDir: notARepo }), UNAVAILABLE);
        assert.equal(generateProvenance({}, {}, { env: {}, repoDir: notARepo }).codeRevision, UNAVAILABLE);
    } finally {
        fs.rmSync(notARepo, { recursive: true, force: true });
    }
});

test("inside this git checkout the code revision resolves to a full commit SHA", () => {
    const rev = resolveCodeRevision({ env: {} });
    assert.match(rev, /^[0-9a-f]{40}$/);
});
