const fs = require("fs");
const path = require("path");
const config = require("./provenance.config");

async function cleanupEphemeralArtifacts(dirs) {
    // Ensure dirs is always an array
    const dirsToClean = Array.isArray(dirs) ? dirs : [dirs];    
    let totalDeleted = 0;
    const now = Date.now();
    const maxAgeMs = config.cleanupAgeDays * 24 * 60 * 60 * 1000;

    for (const dir of dirsToClean) {
        if (!fs.existsSync(dir)) continue;

        try {
            const files = fs.readdirSync(dir);
            for (const file of files) {
                const filePath = path.join(dir, file);
                const stats = fs.statSync(filePath);
                
                // Delete if older than the lifecycle config
                if (now - stats.mtimeMs > maxAgeMs) {
                    fs.unlinkSync(filePath);
                    totalDeleted++;
                }
            }
        } catch (err) {
            return { deleted: totalDeleted, error: `CLEANUP_FAILED: ${err.message}` };
        }
    }
    
    return { deleted: totalDeleted, error: null };
}

module.exports = { cleanupEphemeralArtifacts };