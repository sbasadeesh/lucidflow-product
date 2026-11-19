const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { cleanupEphemeralArtifacts } = require("../../Provenance & cleanUp/cleanup");

let tmpDir1, tmpDir2;

test.before(() => {
    // Create two temporary directories for testing
    tmpDir1 = fs.mkdtempSync(path.join(os.tmpdir(), "cleanup-test-1-"));
    tmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), "cleanup-test-2-"));
});

test.after(() => {
    // Clean up the temporary directories
    fs.rmSync(tmpDir1, { recursive: true, force: true });
    fs.rmSync(tmpDir2, { recursive: true, force: true });
});

test("AC1: Cleanup deletes old files and keeps new ones", async () => {
    const oldFile = path.join(tmpDir1, "old.png");
    const newFile = path.join(tmpDir1, "new.png");
    
    fs.writeFileSync(oldFile, "data");
    fs.writeFileSync(newFile, "data");
    
    // Make the old file 10 days old (older than the 7-day config)
    const tenDaysAgo = Date.now() - (10 * 24 * 60 * 60 * 1000);
    fs.utimesSync(oldFile, tenDaysAgo / 1000, tenDaysAgo / 1000);

    // Trigger cleanup
    const result = await cleanupEphemeralArtifacts([tmpDir1]);
    
    assert.equal(result.deleted, 1);
    assert.equal(fs.existsSync(oldFile), false, "Old file should be deleted");
    assert.equal(fs.existsSync(newFile), true, "New file should remain");
});

test("AC1: Cleanup handles multiple directories simultaneously", async () => {
    const oldFile1 = path.join(tmpDir1, "old-1.png");
    const oldFile2 = path.join(tmpDir2, "old-2.png");
    
    fs.writeFileSync(oldFile1, "data");
    fs.writeFileSync(oldFile2, "data");
    
    const tenDaysAgo = Date.now() - (10 * 24 * 60 * 60 * 1000);
    fs.utimesSync(oldFile1, tenDaysAgo / 1000, tenDaysAgo / 1000);
    fs.utimesSync(oldFile2, tenDaysAgo / 1000, tenDaysAgo / 1000);

    // Trigger cleanup on BOTH directories
    const result = await cleanupEphemeralArtifacts([tmpDir1, tmpDir2]);
    
    assert.equal(result.deleted, 2);
    assert.equal(fs.existsSync(oldFile1), false);
    assert.equal(fs.existsSync(oldFile2), false);
});

test("AC2: Cleanup safely ignores directories that do not exist", async () => {
    const result = await cleanupEphemeralArtifacts(["./fake-directory-that-doesnt-exist"]);
    assert.equal(result.deleted, 0);
    assert.equal(result.error, null);
});