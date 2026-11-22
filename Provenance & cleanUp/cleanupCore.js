// E2-14 cleanup of ephemeral capture artifacts - INTERNAL implementation.
// Not the production API: ./cleanup.js is the production entry point and always uses the
// repository it lives in. This module takes the repository root as an explicit argument so that
// tests can run against disposable fixture repositories inside os.tmpdir().
// Standalone utility: the scan engine does not call it yet.
//
// Conservative scope:
//  - Only regular files named "tmp-*" directly inside ONE dedicated temporary root are deleted,
//    and only when older than the configured age. Targets other than the root itself are rejected.
//  - The temporary root must be a strict descendant of the canonical repository root, with no
//    symlink/junction in any path component between the repository root and the temporary root.
//  - ./scans and ./screenshots are always protected; options can add protected folders or narrow
//    eligibility, but can never remove that protection or widen the "tmp-*" rule.
//  - Configuration and every target are validated before anything is deleted.
//  - Before EACH deletion the root's identity and canonical location are checked again; if anything
//    changed or cannot be verified, no further files are deleted and the reason is reported.
//  - A failure to delete one file is reported and does not stop the others.
//
// Limitation: these checks narrow, but do not eliminate, the window between a check and the
// deletion (Node has no directory-handle based unlink). Do not use this utility on a temporary
// root that untrusted actors can write to concurrently.
const fs = require("fs");
const os = require("os");
const path = require("path");
const config = require("./provenance.config");

const REPO_ROOT = path.resolve(__dirname, "..");
const DAY_MS = 24 * 60 * 60 * 1000;
const BASE_ELIGIBLE = /^tmp-[A-Za-z0-9._-]+$/;              // approved naming rule; not configurable
const BASE_PROTECTED = ["scans", "screenshots"];           // always protected; not removable
const CASE_INSENSITIVE = process.platform === "win32";

class CleanupConfigError extends Error {
    constructor(reason) {
        super(`CLEANUP_INVALID_CONFIG: ${reason}`);
        this.code = "CLEANUP_INVALID_CONFIG";
    }
}

const norm = (p) => (CASE_INSENSITIVE ? p.toLowerCase() : p);
const samePath = (a, b) => norm(path.resolve(a)) === norm(path.resolve(b));

function isInside(parent, child) {
    const rel = path.relative(parent, child);
    return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}
const isStrictlyInside = (parent, child) => isInside(parent, child) && !samePath(parent, child);

function canonical(p) {
    return fs.realpathSync.native(p);
}

// Walks every component from just below `base` down to `target`. Fails on a link/junction or a
// non-directory. Stops quietly at the first missing component. Returns whether `target` exists.
function assertNoLinkedComponents(base, target) {
    const rel = path.relative(base, target);
    let cur = base;
    for (const part of rel.split(path.sep).filter(Boolean)) {
        cur = path.join(cur, part);
        let st;
        try { st = fs.lstatSync(cur); } catch (e) {
            if (e.code === "ENOENT") return false;
            throw new CleanupConfigError(`cannot inspect ${cur} (${e.code || e.message})`);
        }
        if (st.isSymbolicLink()) throw new CleanupConfigError(`linked or junction path component: ${cur}`);
        if (!st.isDirectory()) throw new CleanupConfigError(`path component is not a directory: ${cur}`);
    }
    return true;
}

function resolveRepoRoot(option) {
    const moduleRepo = canonical(REPO_ROOT);
    if (typeof option !== "string" || !option.trim()) throw new CleanupConfigError("repoRoot must be a non-empty path");
    let real;
    try { real = canonical(path.resolve(option)); } catch (e) {
        throw new CleanupConfigError(`repoRoot cannot be resolved (${e.code || e.message})`);
    }
    if (!fs.statSync(real).isDirectory()) throw new CleanupConfigError("repoRoot must be a directory");
    // repoRoot may only be the real repository, or an isolated fixture inside the OS temp folder
    const tmpReal = canonical(os.tmpdir());
    if (!samePath(real, moduleRepo) && !isStrictlyInside(tmpReal, real)) {
        throw new CleanupConfigError("repoRoot must be the repository itself or an isolated folder inside the OS temp directory");
    }
    return { given: path.resolve(option), real };
}

function validateForRepo(repoRoot, options = {}) {
    if (options && Object.prototype.hasOwnProperty.call(options, "repoRoot")) {
        throw new CleanupConfigError("repoRoot is an explicit argument, not an option");
    }
    const repo = resolveRepoRoot(repoRoot);
    if (path.parse(repo.real).root === repo.real) throw new CleanupConfigError("repoRoot must not be a filesystem root");

    const tempDir = options.tempRoot !== undefined ? options.tempRoot : config.tempDir;
    if (typeof tempDir !== "string" || !tempDir.trim()) throw new CleanupConfigError("tempRoot must be a non-empty path");
    const tempRoot = path.resolve(repo.given, tempDir);
    if (!isStrictlyInside(repo.given, tempRoot)) throw new CleanupConfigError("tempRoot must be a strict descendant of the repository root");
    const rel = path.relative(repo.given, tempRoot);

    const rootExists = assertNoLinkedComponents(repo.given, tempRoot);
    const tempRootReal = path.join(repo.real, rel);
    if (rootExists && !samePath(canonical(tempRoot), tempRootReal)) {
        throw new CleanupConfigError("tempRoot does not resolve to its expected canonical location");
    }

    const maxAgeDays = options.maxAgeDays !== undefined ? options.maxAgeDays : config.cleanupAgeDays;
    if (typeof maxAgeDays !== "number" || !Number.isFinite(maxAgeDays) || maxAgeDays <= 0) {
        throw new CleanupConfigError("maxAgeDays must be a positive number");
    }

    const narrowing = options.eligibleFilePattern;
    if (narrowing !== undefined) {
        if (!(narrowing instanceof RegExp)) throw new CleanupConfigError("eligibleFilePattern must be a RegExp");
        if (narrowing.global || narrowing.sticky) throw new CleanupConfigError("eligibleFilePattern must not use the g or y flag");
    }

    const extra = [config.protectedDirs, options.protectedDirs === undefined ? [] : options.protectedDirs];
    for (const list of extra) {
        if (!Array.isArray(list) || list.some((p) => typeof p !== "string" || !p.trim())) {
            throw new CleanupConfigError("protectedDirs must be an array of non-empty paths");
        }
    }
    // baseline protection of the chosen repository AND of the real repository, plus any additions
    const protectedDirs = [];
    const addProtected = (p) => {
        let real;
        try { real = canonical(p); } catch { real = p; }
        if (!protectedDirs.some((x) => samePath(x, real))) protectedDirs.push(real);
    };
    for (const name of BASE_PROTECTED) {
        addProtected(path.join(repo.real, name));
        addProtected(path.join(canonical(REPO_ROOT), name));
    }
    for (const list of extra) for (const p of list) addProtected(path.resolve(repo.real, p));
    for (const dir of protectedDirs) {
        if (isInside(tempRootReal, dir) || isInside(dir, tempRootReal)) {
            throw new CleanupConfigError(`tempRoot overlaps the protected folder ${dir}`);
        }
    }

    let rootId = null;
    if (rootExists) {
        const st = fs.lstatSync(tempRoot, { bigint: true });
        if (!st.isDirectory()) throw new CleanupConfigError("tempRoot must be a directory");
        if (!st.ino) throw new CleanupConfigError("the file system does not report a folder identity, so deletions cannot be verified");
        rootId = { dev: st.dev, ino: st.ino };
    }

    return {
        repoRoot: repo.given, repoRootReal: repo.real, tempRoot, tempRootReal, rootExists, rootId,
        maxAgeDays, narrowing: narrowing || null, protectedDirs,
    };
}

// Every target must be the temporary root itself (".", the absolute root, or omitted).
function checkTargets(targets, cfg) {
    const rejected = [];
    for (const t of targets) {
        if (typeof t !== "string" || !t.trim()) { rejected.push({ target: t, reason: "INVALID_TARGET" }); continue; }
        const resolved = path.resolve(cfg.tempRoot, t);
        if (samePath(resolved, cfg.tempRoot)) continue;
        rejected.push({ target: t, reason: isInside(cfg.tempRoot, resolved) ? "SUBFOLDER_TARGET" : "OUTSIDE_TEMP_ROOT" });
    }
    return rejected;
}

// Re-checks, immediately before a deletion, that the root is still the same folder at the same
// canonical location and that the file is a regular file directly inside it. Returns a reason or null.
function recheckBeforeDelete(cfg, file) {
    try {
        try { assertNoLinkedComponents(cfg.repoRoot, cfg.tempRoot); } catch (e) { return `ROOT_PATH_CHANGED (${e.message})`; }
        const st = fs.lstatSync(cfg.tempRoot, { bigint: true });
        if (st.isSymbolicLink() || !st.isDirectory()) return "ROOT_NOT_A_PLAIN_DIRECTORY";
        if (st.dev !== cfg.rootId.dev || st.ino !== cfg.rootId.ino) return "ROOT_IDENTITY_CHANGED";
        if (!samePath(canonical(cfg.tempRoot), cfg.tempRootReal)) return "ROOT_LOCATION_CHANGED";
        if (!samePath(canonical(path.dirname(file)), cfg.tempRootReal)) return "FILE_PARENT_CHANGED";
        const fst = fs.lstatSync(file);
        if (fst.isSymbolicLink() || !fst.isFile()) return "FILE_CHANGED";
        if (!samePath(path.dirname(canonical(file)), cfg.tempRootReal)) return "FILE_LOCATION_CHANGED";
        return null;
    } catch (e) {
        return `CANNOT_VERIFY (${e.code || e.message})`;
    }
}

/**
 * INTERNAL: deletes expired "tmp-*" regular files directly inside the temporary root of `repoRoot`.
 * Not the production API - use ./cleanup.js, which always passes its own repository root.
 * @param {string} repoRoot the real repository, or an isolated fixture folder inside os.tmpdir()
 * @param {string|string[]} [targets] must be the temporary root itself (or omitted)
 * @param {object} [options] tempRoot, maxAgeDays, eligibleFilePattern (narrows only),
 *        protectedDirs (adds only), now, unlink (test hooks)
 */
async function cleanupForRepo(repoRoot, targets, options = {}) {
    const result = { deleted: 0, deletedFiles: [], skipped: [], errors: [], rejected: [], aborted: null, error: null };

    let cfg;
    try {
        cfg = validateForRepo(repoRoot, options);
    } catch (e) {
        result.error = "CLEANUP_INVALID_CONFIG";
        result.errors.push({ path: null, code: "CLEANUP_INVALID_CONFIG", message: e.message });
        return result;
    }

    const list = targets === undefined ? [cfg.tempRoot] : Array.isArray(targets) ? targets : [targets];
    result.rejected = checkTargets(list, cfg);
    if (result.rejected.length) {
        result.error = "CLEANUP_REJECTED";
        return result; // nothing is deleted when any target is rejected
    }
    if (!cfg.rootExists) return result; // nothing to clean

    const now = typeof options.now === "number" ? options.now : Date.now();
    const maxAgeMs = cfg.maxAgeDays * DAY_MS;
    const unlink = typeof options.unlink === "function" ? options.unlink : fs.unlinkSync;

    let entries;
    try { entries = fs.readdirSync(cfg.tempRoot); } catch (e) {
        result.errors.push({ path: cfg.tempRoot, code: e.code || "READDIR_FAILED", message: e.message });
        result.error = "CLEANUP_PARTIAL_FAILURE";
        return result;
    }

    for (const name of entries) {
        const file = path.join(cfg.tempRoot, name);
        let st;
        try { st = fs.lstatSync(file); } catch (e) {
            result.errors.push({ path: file, code: e.code || "LSTAT_FAILED", message: e.message });
            continue;
        }
        if (st.isSymbolicLink()) { result.skipped.push({ path: file, reason: "LINK" }); continue; }
        if (st.isDirectory()) { result.skipped.push({ path: file, reason: "DIRECTORY" }); continue; }
        if (!st.isFile()) { result.skipped.push({ path: file, reason: "NOT_REGULAR_FILE" }); continue; }
        if (!BASE_ELIGIBLE.test(name) || (cfg.narrowing && !cfg.narrowing.test(name))) {
            result.skipped.push({ path: file, reason: "NOT_ELIGIBLE" });
            continue;
        }
        if (now - st.mtimeMs <= maxAgeMs) { result.skipped.push({ path: file, reason: "NOT_EXPIRED" }); continue; }

        const problem = recheckBeforeDelete(cfg, file);
        if (problem) {
            result.aborted = { path: file, reason: problem };
            result.error = "CLEANUP_ABORTED";
            return result; // stop all further deletions
        }
        try {
            unlink(file);
            result.deleted++;
            result.deletedFiles.push(file);
        } catch (e) {
            result.errors.push({ path: file, code: e.code || "UNLINK_FAILED", message: e.message });
        }
    }

    if (result.errors.length) result.error = "CLEANUP_PARTIAL_FAILURE";
    return result;
}

module.exports = { cleanupForRepo, validateForRepo, CleanupConfigError, REPO_ROOT };
