const test = require("node:test");
const assert = require("node:assert/strict");
const { generateProvenance } = require("../../Provenance & cleanUp/provenance");

test("AC1: Provenance includes versions, environment, and budgets", () => {
    const budgets = { maxStates: 10, maxInteractions: 5 };
    const prov = generateProvenance(budgets);
    
    // Check versions
    assert.equal(prov.engineVersion, "1.0.0");
    assert.ok(prov.nodeVersion.startsWith("v"), "Should include Node version");
    assert.ok(prov.os.includes("win32") || prov.os.includes("linux") || prov.os.includes("darwin"), "Should include OS");
    
    // Check environment
    assert.ok(prov.environment.timezone, "Should include timezone");
    assert.ok(prov.environment.memoryMB > 0, "Should include memory");
    
    // Check budgets
    assert.deepEqual(prov.budgets, budgets);
    
    // Check redacted access profile (UPDATED to expect the object)
    assert.equal(prov.accessProfile.name, "default-desktop");
    assert.equal(prov.accessProfile.isAuthenticated, false);
    assert.equal(prov.accessProfile.locale, "en-IN");
    assert.ok(prov.accessProfile.userAgent.includes("Mozilla"), "Should include redacted User-Agent");
});