// E2-14 cleanup of ephemeral capture artifacts - PRODUCTION entry point.
// Standalone utility: the scan engine does not call it yet.
//
// The repository root is always derived from this module's own location and cannot be chosen by
// the caller. Only these options are accepted: tempRoot, maxAgeDays, eligibleFilePattern (narrows
// the fixed "tmp-*" rule) and protectedDirs (adds to the fixed scans/screenshots protection).
// Any other option - including repoRoot and the internal test hooks now/unlink - is rejected
// before anything is deleted. See ./cleanupCore.js for the rules and the documented
// check/delete race limitation.
const path = require("path");
const core = require("./cleanupCore");

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const ALLOWED_OPTIONS = new Set(["tempRoot", "maxAgeDays", "eligibleFilePattern", "protectedDirs"]);

function checkOptions(options) {
    if (options === undefined || options === null) return {};
    if (typeof options !== "object" || Array.isArray(options)) {
        throw new core.CleanupConfigError("options must be an object");
    }
    const unknown = Object.keys(options).filter((k) => !ALLOWED_OPTIONS.has(k));
    if (unknown.length) throw new core.CleanupConfigError(`unsupported option(s): ${unknown.join(", ")}`);
    return { ...options };
}

function validateCleanupConfig(options = {}) {
    return core.validateForRepo(REPO_ROOT, checkOptions(options));
}

async function cleanupEphemeralArtifacts(targets, options = {}) {
    let checked;
    try {
        checked = checkOptions(options);
    } catch (e) {
        return {
            deleted: 0, deletedFiles: [], skipped: [], rejected: [], aborted: null,
            errors: [{ path: null, code: "CLEANUP_INVALID_CONFIG", message: e.message }],
            error: "CLEANUP_INVALID_CONFIG",
        };
    }
    return core.cleanupForRepo(REPO_ROOT, targets, checked);
}

module.exports = { cleanupEphemeralArtifacts, validateCleanupConfig };
