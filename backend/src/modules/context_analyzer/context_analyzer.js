// context_analyzer.js

function iframeOriginKey(frameUrl) {
    const parsed = new URL(frameUrl);
    return parsed.origin;
}

async function analyzeContexts(page) {
    const matrix = {
        same_origin_iframe_origins: [],
        cross_origin_iframe_origins: [],
        open_shadow_roots: 0,
        suspected_closed_shadow_custom_elements: 0,
        canvases: 0,
        status: "CONTROL_OK",
        reason: null
    };

    try {
        // 1. Analyze iframe origins only (no path, query, or fragment persisted)
        const frames = page.frames();
        let mainOrigin = "";
        try {
            mainOrigin = new URL(page.mainFrame().url()).origin;
        } catch (e) {}

        const sameOrigins = new Set();
        const crossOrigins = new Set();

        for (const frame of frames) {
            if (frame === page.mainFrame()) continue;

            const frameUrl = frame.url();
            if (!frameUrl || frameUrl === "about:blank") continue;

            try {
                const frameOrigin = iframeOriginKey(frameUrl);
                if (frameOrigin === mainOrigin) {
                    sameOrigins.add(frameOrigin);
                } else {
                    crossOrigins.add(frameOrigin);
                }
            } catch (e) {
                crossOrigins.add("(unparseable-frame-url)");
            }
        }

        matrix.same_origin_iframe_origins = [...sameOrigins].sort();
        matrix.cross_origin_iframe_origins = [...crossOrigins].sort();

        // 2. Analyze shadow roots, suspected custom elements, and canvases
        const domAnalysis = await page.evaluate(() => {
            let openShadowCount = 0;
            let suspectedClosedCustomElements = 0;

            const allElements = document.querySelectorAll("*");
            for (const el of allElements) {
                if (el.shadowRoot) {
                    openShadowCount++;
                } else if (el.tagName.includes("-")) {
                    // Heuristic only: custom element without an accessible shadowRoot
                    // (may be closed shadow, light DOM, or not yet upgraded — not verified)
                    suspectedClosedCustomElements++;
                }
            }

            const canvasCount = document.querySelectorAll("canvas").length;
            return { openShadowCount, suspectedClosedCustomElements, canvasCount };
        });

        matrix.open_shadow_roots = domAnalysis.openShadowCount;
        matrix.suspected_closed_shadow_custom_elements = domAnalysis.suspectedClosedCustomElements;
        matrix.canvases = domAnalysis.canvasCount;

        // 3. Determine overall status based on Rule LF-CAP-004
        if (
            matrix.cross_origin_iframe_origins.length > 0
            || matrix.canvases > 0
            || matrix.suspected_closed_shadow_custom_elements > 0
        ) {
            matrix.status = "SAFE_HOLD";
            matrix.reason = "UNSUPPORTED_CONTEXT_DETECTED";
        }

        return matrix;
    } catch (err) {
        return {
            ...matrix,
            status: "SAFE_HOLD",
            reason: "CONTEXT_ANALYSIS_FAILED",
            details: err.message
        };
    }
}

module.exports = { analyzeContexts };