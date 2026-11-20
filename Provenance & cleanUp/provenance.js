const os = require("os");
const process = require("process");
const config = require("./provenance.config");

function generateProvenance(budgets = {}, accessProfile = {}) {
    const provenance = {
        engineVersion: config.appVersion,
        nodeVersion: process.version,
        os: `${os.platform()} ${os.release()}`,
        environment: {
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            memoryMB: Math.round(os.totalmem() / 1024 / 1024),
            cpuCores: os.cpus().length
        },
        budgets: budgets,
        // Store the profile name and user agent, but NO passwords or cookies
        accessProfile: {
            name: accessProfile.name || "default-desktop",
            userAgent: accessProfile.userAgent || "Mozilla/5.0...",
            locale: accessProfile.locale || "en-IN",
            isAuthenticated: false // Always false for P0
        }
    };

    if (!provenance.engineVersion || !provenance.nodeVersion) {
        throw new Error("PROVENANCE_MISSING");
    }

    return provenance;
}

module.exports = { generateProvenance };