// E2-02 DOM/style evidence: configuration limits and timeouts.

module.exports = {
    maxElements: 300,              // reject with TOO_MANY_ELEMENTS if more candidates
    maxDepth: 64,                  // ancestors deeper than this are only counted
    maxDocumentNodes: 50000,       // reject with TOO_LARGE_DOCUMENT if more
    maxFileBytes: 262144,          // 256 KB: reject with TOO_LARGE if larger
    maxCapturePointsPerScan: 25,   // reject later points with LIMIT_REACHED
    captureTimeoutMs: 2000,        // time limit for the in-page collection
    maxStates: 15,                 // passed to the script runner for safety
};
