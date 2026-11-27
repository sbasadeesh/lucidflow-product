// E2-14 capture provenance.
// Standalone utility: the scan engine does not call it yet, and its output is not part of
// any API response or saved scan schema. Values that cannot be determined are reported as
// "unavailable" - no placeholder or made-up values are substituted.
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const pkg = require("../../../../package.json");

const UNAVAILABLE = "unavailable";
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
const SHA_RE = /^[0-9a-f]{40}$/i;

function text(value) {
    return typeof value === "string" && value.trim() ? value.trim() : UNAVAILABLE;
}

// The code revision, from (in order) the caller, the CI environment, or `git rev-parse HEAD`.
function resolveCodeRevision(options = {}) {
    if (options.codeRevision !== undefined && options.codeRevision !== null) {
        return SHA_RE.test(String(options.codeRevision)) ? String(options.codeRevision).toLowerCase() : UNAVAILABLE;
    }
    const env = options.env || process.env;
    for (const key of ["GITHUB_SHA", "GIT_COMMIT"]) {
        if (SHA_RE.test(String(env[key] || ""))) return String(env[key]).toLowerCase();
    }
    try {
        const out = execFileSync("git", ["rev-parse", "HEAD"], {
            cwd: options.repoDir || REPO_ROOT,
            stdio: ["ignore", "pipe", "ignore"],
            timeout: 5000,
            windowsHide: true,
        }).toString().trim();
        if (SHA_RE.test(out)) {
            // only trust git when the repository found is the one asked for (no parent repository)
            const top = execFileSync("git", ["rev-parse", "--show-toplevel"], {
                cwd: options.repoDir || REPO_ROOT, stdio: ["ignore", "pipe", "ignore"], timeout: 5000, windowsHide: true,
            }).toString().trim();
            if (path.resolve(top).toLowerCase() === path.resolve(options.repoDir || REPO_ROOT).toLowerCase()) return out.toLowerCase();
        }
    } catch { /* git missing or not a repository */ }
    return UNAVAILABLE;
}

/**
 * @param {object} budgets         the run's budgets (copied as given)
 * @param {object} accessProfile   { name, userAgent, locale } as actually used by the caller
 * @param {object} [options]       { codeRevision, env, repoDir }
 */
function generateProvenance(budgets = {}, accessProfile = {}, options = {}) {
    const profile = accessProfile || {};
    return {
        engineVersion: text(pkg.version),
        codeRevision: resolveCodeRevision(options),
        nodeVersion: process.version,
        os: `${os.platform()} ${os.release()}`,
        environment: {
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || UNAVAILABLE,
            memoryMB: Math.round(os.totalmem() / 1024 / 1024),
            cpuCores: os.cpus().length,
        },
        budgets: { ...(budgets || {}) },
        // profile name, user agent and locale as given by the caller; never passwords or cookies
        accessProfile: {
            name: text(profile.name),
            userAgent: text(profile.userAgent),
            locale: text(profile.locale),
            isAuthenticated: false, // P0 never signs in (E2-07 guards stop at login pages)
        },
    };
}

module.exports = { generateProvenance, resolveCodeRevision, UNAVAILABLE };
