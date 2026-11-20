module.exports = {
    // E2-005 Budgets
    maxStates: 5,
    maxInteractions: 15,
    maxTimeMs: 60000,
    stateBoundary: "inclusive",
    interactionBoundary: "inclusive",
    timeBoundary: "exclusive",

    // E2-05 Limits
    hardMaxStates: 10,
    maxActions: 20,
    selectorTimeoutMs: 5000,
    maxWaitMs: 10000,
};