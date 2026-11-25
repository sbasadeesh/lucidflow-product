// context_analyzer.js

async function analyzeContexts(page) {
    const matrix = {
        same_origin_iframes: [],
        cross_origin_iframes: [],
        open_shadow_doms: 0,
        closed_shadow_doms: 0,
        canvases: 0,
        status: "CONTROL_OK",
        reason: null
    };

    try {
        // 1. Analyze Iframes using URL Origin (not frame.evaluate which bypasses CORS)
        const frames = page.frames();
        let mainOrigin = "";
        try { 
            mainOrigin = new URL(page.mainFrame().url()).origin; 
        } catch (e) {}

        for (const frame of frames) {
            if (frame === page.mainFrame()) continue;
            
            const frameUrl = frame.url();
            if (!frameUrl || frameUrl === 'about:blank') continue; // Skip empty placeholders
            
            try {
                const frameOrigin = new URL(frameUrl).origin;
                if (frameOrigin === mainOrigin) {
                    matrix.same_origin_iframes.push(frameUrl);
                } else {
                    matrix.cross_origin_iframes.push(frameUrl);
                }
            } catch (e) {
                matrix.cross_origin_iframes.push(frameUrl);
            }
        }

        // 2. Analyze Shadow DOMs and Canvases
        const domAnalysis = await page.evaluate(() => {
            let openShadowCount = 0;
            let closedShadowCount = 0;
            
            const allElements = document.querySelectorAll('*');
            for (const el of allElements) {
                if (el.shadowRoot) {
                    openShadowCount++;
                } else if (el.tagName.includes('-')) {
                    // Custom elements (with a dash) without a shadowRoot are typically closed shadow roots
                    closedShadowCount++;
                }
            }
            
            const canvasCount = document.querySelectorAll('canvas').length;
            return { openShadowCount, closedShadowCount, canvasCount };
        });

        matrix.open_shadow_doms = domAnalysis.openShadowCount;
        matrix.closed_shadow_doms = domAnalysis.closedShadowCount;
        matrix.canvases = domAnalysis.canvasCount;

        // 3. Determine overall status based on Rule LF-CAP-004
        if (matrix.cross_origin_iframes.length > 0 || matrix.canvases > 0 || matrix.closed_shadow_doms > 0) {
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
