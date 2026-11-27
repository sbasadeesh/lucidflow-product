// E2-14 production cleanup API boundary tests.
// The production entry point must always use the repository it lives in; callers cannot select
// another repository root (not even an isolated one under os.tmpdir()) or pass test-only hooks.
// Every destructive call here targets only a disposable fixture, so even an implementation that
// wrongly honours the override can only delete fixture files.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const production = require("../../../Provenance & cleanUp/cleanup");

const DAY = 24 * 60 * 60 * 1000;
const fixtures = [];

function makeFixture() {
    const repo = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "e2-14-public-")), "repo");
    fixtures.push(path.dirname(repo));
    const root = path.join(repo, "temp");
    fs.mkdirSync(root, { recursive: true });
    const file = path.join(root, "tmp-old.png");
    fs.writeFileSync(file, "data");
    const t = (Date.now() - 30 * DAY) / 1000;
    fs.utimesSync(file, t, t);
    return { repo, root, file };
}

test.after(() => {
    for (const f of fixtures) fs.rmSync(f, { recursive: true, force: true });
});

test("the production API rejects an alternative repoRoot before deleting anything", async () => {
    const { repo, root, file } = makeFixture();
    for (const options of [{ repoRoot: repo, tempRoot: root }, { repoRoot: repo }, { repoRoot: repo, tempRoot: "temp" }]) {
        const r = await production.cleanupEphemeralArtifacts(undefined, options);
        assert.equal(r.error, "CLEANUP_INVALID_CONFIG", JSON.stringify(Object.keys(options)));
        assert.equal(r.deleted, 0);
        assert.equal(fs.existsSync(file), true, "the fixture file survives");
    }
    assert.throws(() => production.validateCleanupConfig({ repoRoot: repo, tempRoot: root }), /CLEANUP_INVALID_CONFIG/);
});

test("the production API rejects test-only hooks and unknown options", async () => {
    const { root, file } = makeFixture();
    for (const options of [{ tempRoot: root, unlink: () => {} }, { tempRoot: root, now: Date.now() }, { tempRoot: root, bogus: 1 }]) {
        const r = await production.cleanupEphemeralArtifacts(undefined, options);
        assert.equal(r.error, "CLEANUP_INVALID_CONFIG", JSON.stringify(Object.keys(options)));
        assert.equal(r.deleted, 0);
    }
    assert.equal(fs.existsSync(file), true);
});

test("the production API rejects a temporary root outside its own repository", async () => {
    const { root, file } = makeFixture();
    const r = await production.cleanupEphemeralArtifacts(undefined, { tempRoot: root });
    assert.equal(r.error, "CLEANUP_INVALID_CONFIG");
    assert.equal(r.deleted, 0);
    assert.equal(fs.existsSync(file), true);
});

test("the production module exposes only the production entry points", () => {
    assert.deepEqual(Object.keys(production).sort(), ["cleanupEphemeralArtifacts", "validateCleanupConfig"]);
});

test("the production default configuration is inside the module's own repository (validated, not run)", () => {
    const cfg = production.validateCleanupConfig({});
    const repo = fs.realpathSync.native(path.resolve(__dirname, "..", "..", ".."));
    assert.equal(path.dirname(cfg.tempRootReal).toLowerCase(), repo.toLowerCase());
});
