const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const SCANS_DIR = path.join(REPO_ROOT, "scans");
const SCREENSHOTS_DIR = path.join(REPO_ROOT, "screenshots");
const SNAPSHOTS_DIR = path.join(REPO_ROOT, "snapshots");

module.exports = {
    REPO_ROOT,
    SCANS_DIR,
    SCREENSHOTS_DIR,
    SNAPSHOTS_DIR,
};