// E2-14 cleanup safety tests.
// Every test builds its own fixture "repository" under os.tmpdir() and passes it as repoRoot,
// so no test can touch the real repository, saved scans or real screenshots.
// Approved scope: cleanup only removes regular files named "tmp-*" that sit directly inside
// the dedicated temporary root, which must be a strict descendant of the repository root.
// It never recurses, never follows links, never deletes directories or persisted evidence,
// and the baseline protections cannot be weakened by options.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
// These tests exercise the INTERNAL implementation, which takes the repository root as an explicit
// argument so that it can point at a disposable fixture. The production entry point
// (cleanup.js) never accepts a repository root; see cleanup_public_api_test.js.
const core = require("../../Provenance & cleanUp/cleanupCore");
const production = require("../../Provenance & cleanUp/cleanup");

function cleanupEphemeralArtifacts(targets, opts = {}) {
    const { repoRoot, ...rest } = opts;
    return core.cleanupForRepo(repoRoot, targets, rest);
}
function validateCleanupConfig(opts = {}) {
    const { repoRoot, ...rest } = opts;
    return core.validateForRepo(repoRoot, rest);
}

const DAY = 24 * 60 * 60 * 1000;
const fixtures = [];

function tmpDir(tag) {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), `e2-14-${tag}-`));
    fixtures.push(d);
    return d;
}

// A fixture repository with a dedicated temporary root and a sibling folder outside it.
// The repository is nested one level down so that even its parent folder is a disposable fixture.
function makeFixture() {
    const repo = path.join(tmpDir("fixture"), "repo");
    fs.mkdirSync(repo);
    const root = path.join(repo, "temp");
    const outside = path.join(repo, "outside");
    fs.mkdirSync(root);
    fs.mkdirSync(outside);
    return { repo, root, outside, opts: { repoRoot: repo, tempRoot: root } };
}

function write(file, ageDays = 0, content = "data") {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    if (ageDays) age(file, ageDays);
    return file;
}

function age(p, days) {
    const t = (Date.now() - days * DAY) / 1000;
    fs.utimesSync(p, t, t);
}

// A directory link: a junction on Windows (no admin rights needed), a symlink elsewhere.
function linkDir(target, link) {
    fs.symlinkSync(target, link, process.platform === "win32" ? "junction" : "dir");
}

test.after(() => {
    for (const f of fixtures.reverse()) fs.rmSync(f, { recursive: true, force: true });
});

test("eligible expired temporary files are removed and fresh ones survive", async () => {
    const { root, opts } = makeFixture();
    const expired = write(path.join(root, "tmp-old.png"), 10);
    const fresh = write(path.join(root, "tmp-new.png"), 0);

    const r = await cleanupEphemeralArtifacts([root], opts);

    assert.equal(r.error, null);
    assert.equal(r.deleted, 1);
    assert.deepEqual(r.deletedFiles, [expired]);
    assert.equal(fs.existsSync(expired), false, "expired temporary file is removed");
    assert.equal(fs.existsSync(fresh), true, "fresh temporary file survives");
});

test("saved scans, referenced screenshots and unrelated files survive, even when old", async () => {
    const { repo, root, opts } = makeFixture();
    const scanJson = write(path.join(root, "scan-1.json"), 30, JSON.stringify({ screenshotUrl: "/screenshots/full-1.png" }));
    const screenshot = write(path.join(root, "full-1.png"), 30);
    const notes = write(path.join(root, "notes.txt"), 30);
    const repoScan = write(path.join(repo, "scans", "tmp-scan.json"), 30);
    const repoShot = write(path.join(repo, "screenshots", "tmp-full.png"), 30);
    const eligible = write(path.join(root, "tmp-old.png"), 30);

    const r = await cleanupEphemeralArtifacts(undefined, opts);

    assert.equal(r.error, null);
    assert.equal(r.deleted, 1);
    for (const kept of [scanJson, screenshot, notes, repoScan, repoShot]) {
        assert.equal(fs.existsSync(kept), true, `${path.basename(kept)} must survive`);
    }
    assert.equal(fs.existsSync(eligible), false);
    assert.ok(r.skipped.some((s) => s.path === scanJson && s.reason === "NOT_ELIGIBLE"));
});

test("the temporary root must be a strict descendant of the repository root, away from scans and screenshots", async () => {
    const { repo } = makeFixture();
    const inScans = write(path.join(repo, "scans", "tmp-old.json"), 30);
    const inShots = write(path.join(repo, "screenshots", "tmp-old.png"), 30);
    const nested = write(path.join(repo, "screenshots", "tmp", "tmp-old.png"), 30);
    const atRepo = write(path.join(repo, "tmp-old.txt"), 30);

    for (const tempRoot of [repo, path.join(repo, "scans"), path.join(repo, "screenshots"), path.join(repo, "screenshots", "tmp"), path.dirname(repo)]) {
        const r = await cleanupEphemeralArtifacts(undefined, { repoRoot: repo, tempRoot });
        assert.equal(r.error, "CLEANUP_INVALID_CONFIG", tempRoot);
        assert.equal(r.deleted, 0);
    }
    for (const kept of [inScans, inShots, nested, atRepo]) assert.equal(fs.existsSync(kept), true);
});

test("callers cannot disable the scans/screenshots protection, but can add protected folders", async () => {
    const { repo, root } = makeFixture();
    const inShots = write(path.join(repo, "screenshots", "tmp-old.png"), 30);
    const inRoot = write(path.join(root, "tmp-old.png"), 30);

    const disabled = await cleanupEphemeralArtifacts(undefined, { repoRoot: repo, tempRoot: path.join(repo, "screenshots"), protectedDirs: [] });
    assert.equal(disabled.error, "CLEANUP_INVALID_CONFIG");
    assert.equal(disabled.deleted, 0);

    const added = await cleanupEphemeralArtifacts(undefined, { repoRoot: repo, tempRoot: root, protectedDirs: ["temp"] });
    assert.equal(added.error, "CLEANUP_INVALID_CONFIG", "an added protected folder is honoured");
    assert.equal(added.deleted, 0);

    assert.equal(fs.existsSync(inShots), true);
    assert.equal(fs.existsSync(inRoot), true);
});

test("eligibility cannot be broadened beyond tmp-* and can only be narrowed", async () => {
    const { root, opts } = makeFixture();
    const notes = write(path.join(root, "notes.txt"), 30);
    const shot = write(path.join(root, "full-1.png"), 30);
    const png = write(path.join(root, "tmp-old.png"), 30);
    const json = write(path.join(root, "tmp-old.json"), 30);

    const broad = await cleanupEphemeralArtifacts(undefined, { ...opts, eligibleFilePattern: /.*/ });
    assert.equal(broad.error, null);
    assert.equal(fs.existsSync(notes), true, "a catch-all pattern does not make notes.txt eligible");
    assert.equal(fs.existsSync(shot), true, "a catch-all pattern does not make full-1.png eligible");
    assert.deepEqual(broad.deletedFiles.sort(), [json, png].sort());

    const png2 = write(path.join(root, "tmp-again.png"), 30);
    const json2 = write(path.join(root, "tmp-again.json"), 30);
    const narrow = await cleanupEphemeralArtifacts(undefined, { ...opts, eligibleFilePattern: /\.png$/ });
    assert.deepEqual(narrow.deletedFiles, [png2]);
    assert.equal(fs.existsSync(json2), true, "the narrowing pattern keeps tmp-again.json");
});

test("stateful regular-expression flags (g, y) are rejected before anything is deleted", async () => {
    const { root, opts } = makeFixture();
    const file = write(path.join(root, "tmp-old.png"), 30);
    for (const re of [/tmp-/g, /tmp-/y, /tmp-/gi]) {
        assert.throws(() => validateCleanupConfig({ ...opts, eligibleFilePattern: re }), /CLEANUP_INVALID_CONFIG/);
        const r = await cleanupEphemeralArtifacts(undefined, { ...opts, eligibleFilePattern: re });
        assert.equal(r.error, "CLEANUP_INVALID_CONFIG", String(re));
        assert.equal(r.deleted, 0);
    }
    assert.equal(fs.existsSync(file), true);
});

test("targets outside the temporary root and path traversal are rejected, and nothing is deleted", async () => {
    const { root, outside, opts } = makeFixture();
    const outsideFile = write(path.join(outside, "tmp-old.png"), 30);
    const insideFile = write(path.join(root, "tmp-old.png"), 30);

    for (const targets of [[outside], [path.join(root, "..", "outside")], [root, `${root}${path.sep}..${path.sep}outside`], ["../outside"]]) {
        const r = await cleanupEphemeralArtifacts(targets, opts);
        assert.equal(r.error, "CLEANUP_REJECTED", JSON.stringify(targets));
        assert.equal(r.deleted, 0);
        assert.ok(r.rejected.some((x) => x.reason === "OUTSIDE_TEMP_ROOT"));
    }
    assert.equal(fs.existsSync(outsideFile), true, "file outside the root survives");
    assert.equal(fs.existsSync(insideFile), true, "nothing is deleted when any target is rejected");
});

test("a subfolder of the temporary root is rejected as a target and causes zero deletions", async () => {
    const { root, opts } = makeFixture();
    const inSub = write(path.join(root, "batch", "tmp-old.png"), 30);
    const inRoot = write(path.join(root, "tmp-old.png"), 30);

    for (const targets of [[path.join(root, "batch")], ["batch"], [root, "batch"], [path.join(root, "missing-sub")]]) {
        const r = await cleanupEphemeralArtifacts(targets, opts);
        assert.equal(r.error, "CLEANUP_REJECTED", JSON.stringify(targets));
        assert.equal(r.deleted, 0);
        assert.deepEqual(r.deletedFiles, []);
        assert.ok(r.rejected.some((x) => x.reason === "SUBFOLDER_TARGET"));
    }
    assert.equal(fs.existsSync(inSub), true);
    assert.equal(fs.existsSync(inRoot), true);
});

test("the root itself may be given as an absolute path, as '.', or omitted, and is cleaned once", async () => {
    const { root, opts } = makeFixture();
    for (const targets of [undefined, [root], ["."], [root, "."], root]) {
        const f = write(path.join(root, "tmp-old.png"), 30);
        const r = await cleanupEphemeralArtifacts(targets, opts);
        assert.equal(r.error, null, JSON.stringify(targets));
        assert.equal(r.deleted, 1, JSON.stringify(targets));
        assert.equal(fs.existsSync(f), false);
    }
});

test("links (symlinks/junctions) cannot redirect deletion outside the root", async () => {
    const { repo, root, outside, opts } = makeFixture();
    const outsideFile = write(path.join(outside, "tmp-old.png"), 30);

    // (a) a linked directory inside the root, used as a target
    const linkInRoot = path.join(root, "link-to-outside");
    linkDir(outside, linkInRoot);
    const asTarget = await cleanupEphemeralArtifacts([linkInRoot], opts);
    assert.equal(asTarget.error, "CLEANUP_REJECTED");
    assert.equal(asTarget.deleted, 0);

    // (b) the same link met as an entry while cleaning the root: skipped, not followed
    const asEntry = await cleanupEphemeralArtifacts(undefined, opts);
    assert.equal(asEntry.error, null);
    assert.equal(asEntry.deleted, 0);
    assert.ok(asEntry.skipped.some((s) => s.path === linkInRoot && s.reason === "LINK"));

    // (c) the temporary root itself is a link
    const linkedRoot = path.join(repo, "linked-temp");
    linkDir(outside, linkedRoot);
    const rootIsLink = await cleanupEphemeralArtifacts(undefined, { repoRoot: repo, tempRoot: linkedRoot });
    assert.equal(rootIsLink.error, "CLEANUP_INVALID_CONFIG");
    assert.equal(rootIsLink.deleted, 0);

    assert.equal(fs.existsSync(outsideFile), true, "the file behind every link survives");
});

test("a linked or junction folder between the repository root and the temporary root is rejected", async () => {
    const { repo } = makeFixture();
    const external = tmpDir("external");
    const externalFile = write(path.join(external, "temp", "tmp-old.png"), 30);
    linkDir(external, path.join(repo, "linked-parent"));

    const r = await cleanupEphemeralArtifacts(undefined, { repoRoot: repo, tempRoot: path.join(repo, "linked-parent", "temp") });
    assert.equal(r.error, "CLEANUP_INVALID_CONFIG");
    assert.equal(r.deleted, 0);
    assert.equal(fs.existsSync(externalFile), true);
});

test("a file symlink inside the root is skipped and its target survives", async (t) => {
    const { root, outside, opts } = makeFixture();
    const outsideFile = write(path.join(outside, "tmp-old.png"), 30);
    const link = path.join(root, "tmp-link.png");
    try {
        fs.symlinkSync(outsideFile, link, "file");
    } catch (e) {
        if (e.code === "EPERM") return t.skip("creating file symlinks needs Developer Mode or admin rights on this Windows host");
        throw e;
    }
    const r = await cleanupEphemeralArtifacts(undefined, { ...opts, now: Date.now() + 365 * DAY });
    assert.equal(r.deleted, 0);
    assert.ok(r.skipped.some((s) => s.path === link && s.reason === "LINK"));
    assert.equal(fs.existsSync(outsideFile), true);
    assert.equal(fs.lstatSync(link).isSymbolicLink(), true, "the link itself is left alone");
});

test("directories are skipped without stopping the run, and are not deleted or entered", async () => {
    const { root, opts } = makeFixture();
    const dir = path.join(root, "tmp-old-dir");
    fs.mkdirSync(dir);
    const nested = write(path.join(dir, "tmp-nested.png"), 30);
    age(dir, 30);
    const file = write(path.join(root, "tmp-old.png"), 30);

    const r = await cleanupEphemeralArtifacts(undefined, opts);

    assert.equal(r.error, null);
    assert.equal(r.deleted, 1);
    assert.equal(fs.existsSync(file), false);
    assert.equal(fs.existsSync(dir), true, "the directory is not deleted");
    assert.equal(fs.existsSync(nested), true, "the directory is not entered");
    assert.ok(r.skipped.some((s) => s.path === dir && s.reason === "DIRECTORY"));
});

test("a deletion error on one eligible file is reported and the other eligible files are still removed", async () => {
    const { root, opts } = makeFixture();
    const a = write(path.join(root, "tmp-a.png"), 30);
    const b = write(path.join(root, "tmp-b.png"), 30);
    const c = write(path.join(root, "tmp-c.png"), 30);
    const failing = (p) => {
        if (p === b) { const e = new Error("simulated lock"); e.code = "EBUSY"; throw e; }
        fs.unlinkSync(p);
    };

    const r = await cleanupEphemeralArtifacts(undefined, { ...opts, unlink: failing });

    assert.equal(r.error, "CLEANUP_PARTIAL_FAILURE");
    assert.equal(r.deleted, 2);
    assert.deepEqual(r.errors.map((e) => [e.path, e.code]), [[b, "EBUSY"]]);
    assert.equal(fs.existsSync(a), false);
    assert.equal(fs.existsSync(b), true);
    assert.equal(fs.existsSync(c), false);
});

test("if the root is replaced by a link during the run, further deletions stop", async () => {
    const { root, opts } = makeFixture();
    const external = tmpDir("swap-link");
    const externalFiles = ["tmp-a.png", "tmp-b.png", "tmp-c.png"].map((n) => write(path.join(external, n), 30));
    for (const n of ["tmp-a.png", "tmp-b.png", "tmp-c.png"]) write(path.join(root, n), 30);
    let swapped = false;
    const swapAfterFirst = (p) => {
        fs.unlinkSync(p);
        if (!swapped) { swapped = true; fs.renameSync(root, `${root}-moved`); linkDir(external, root); }
    };

    const r = await cleanupEphemeralArtifacts(undefined, { ...opts, unlink: swapAfterFirst });

    assert.equal(r.error, "CLEANUP_ABORTED");
    assert.equal(r.deleted, 1, "only the deletion before the swap happened");
    assert.ok(r.aborted && r.aborted.reason, "the abort reason is reported");
    for (const f of externalFiles) assert.equal(fs.existsSync(f), true, `${path.basename(f)} behind the link survives`);
});

test("if the root is replaced by a different directory during the run, further deletions stop", async () => {
    const { root, opts } = makeFixture();
    for (const n of ["tmp-a.png", "tmp-b.png", "tmp-c.png"]) write(path.join(root, n), 30);
    let swapped = false;
    const swapAfterFirst = (p) => {
        fs.unlinkSync(p);
        if (!swapped) {
            swapped = true;
            fs.renameSync(root, `${root}-moved`);
            fs.mkdirSync(root);
            for (const n of ["tmp-b.png", "tmp-c.png"]) write(path.join(root, n), 30);
        }
    };

    const r = await cleanupEphemeralArtifacts(undefined, { ...opts, unlink: swapAfterFirst });

    assert.equal(r.error, "CLEANUP_ABORTED");
    assert.equal(r.deleted, 1);
    assert.equal(fs.existsSync(path.join(root, "tmp-b.png")), true, "files in the replacement folder survive");
    assert.equal(fs.existsSync(path.join(root, "tmp-c.png")), true);
});

test("a missing temporary root is ignored safely", async () => {
    const { repo } = makeFixture();
    const r = await cleanupEphemeralArtifacts(undefined, { repoRoot: repo, tempRoot: path.join(repo, "no-such-temp") });
    assert.equal(r.error, null);
    assert.equal(r.deleted, 0);
});

test("invalid configuration is rejected before anything is deleted", async () => {
    const { repo, root, opts } = makeFixture();
    const file = write(path.join(root, "tmp-old.png"), 30);
    const bad = [
        { ...opts, tempRoot: "" },
        { ...opts, tempRoot: path.parse(root).root },
        { ...opts, maxAgeDays: 0 },
        { ...opts, maxAgeDays: -1 },
        { ...opts, maxAgeDays: Number.NaN },
        { ...opts, maxAgeDays: "7" },
        { ...opts, eligibleFilePattern: "tmp-*" },
        { ...opts, protectedDirs: "scans" },
        { ...opts, protectedDirs: [""] },
        { repoRoot: path.parse(repo).root, tempRoot: root },
        { repoRoot: path.dirname(os.tmpdir()), tempRoot: root },
        { repoRoot: path.join(repo, "no-such-repo"), tempRoot: root },
    ];
    for (const options of bad) {
        assert.throws(() => validateCleanupConfig(options), /CLEANUP_INVALID_CONFIG/, JSON.stringify(options));
        const r = await cleanupEphemeralArtifacts(undefined, options);
        assert.equal(r.error, "CLEANUP_INVALID_CONFIG", JSON.stringify(options));
        assert.equal(r.deleted, 0);
    }
    assert.equal(fs.existsSync(file), true, "nothing was deleted by any invalid configuration");
});

test("the internal implementation requires an explicit repository root and rejects a repoRoot option", () => {
    assert.throws(() => core.validateForRepo(undefined, {}), /CLEANUP_INVALID_CONFIG/);
    const { repo } = makeFixture();
    assert.throws(() => core.validateForRepo(repo, { repoRoot: repo }), /CLEANUP_INVALID_CONFIG/);
});

test("the default configuration uses a temporary root strictly inside the real repository", () => {
    const cfg = production.validateCleanupConfig({});
    const repo = fs.realpathSync.native(path.resolve(__dirname, "..", ".."));
    assert.equal(path.dirname(cfg.tempRootReal).toLowerCase(), repo.toLowerCase());
    assert.notEqual(cfg.tempRootReal.toLowerCase(), repo.toLowerCase());
    assert.equal(cfg.maxAgeDays, 7);
    for (const p of [path.join(repo, "scans"), path.join(repo, "screenshots")]) {
        assert.ok(cfg.protectedDirs.map((x) => x.toLowerCase()).includes(p.toLowerCase()), `${p} is protected`);
    }
});
