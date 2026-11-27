// Settings for the E2-14 provenance and cleanup utilities.
// These are standalone utilities: the scan engine does not call them yet.
// Provisional utility configuration - not confirmed E2-14 product acceptance criteria.
module.exports = {
    // Eligible temporary files older than this many days are deleted (value unchanged from PR #38)
    cleanupAgeDays: 7,
    // The only folder cleanup may touch: a strict descendant of the repository root.
    tempDir: "./temp",
    // Extra protected folders (relative to the repository root). These are ADDED to the
    // built-in protection of ./scans and ./screenshots, which cannot be removed.
    protectedDirs: [],
};
