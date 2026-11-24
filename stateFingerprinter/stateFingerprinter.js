const crypto = require('crypto');

async function getStateFingerprint(page) {
    const pageData = await page.evaluate(() => {
        // Get the raw text of the page
        const bodyText = document.body ? document.body.innerText : "";
        
        // Check for time-sensitive evidence (timers)
        const hasTimer = /\b\d{1,2}:\d{2}(:\d{2})?\b/.test(bodyText) || /\b(ends? in|expires? in|remaining)\b/i.test(bodyText);
        
        // Check for overlays
        const hasOverlay = !!document.querySelector('[role="dialog"], [aria-modal="true"], .popup, .overlay, .modal');
        
        return { bodyText, hasTimer, hasOverlay };
    });

    const hash = crypto.createHash('sha256').update(pageData.bodyText).digest('hex');

    return {
        hash,
        hasTimer: pageData.hasTimer,
        hasOverlay: pageData.hasOverlay,
        rawText: pageData.bodyText // Used for collision detection
    };
}

// AC2: Detect hash collisions or changed overlay families
function checkForCollision(previousFingerprint, currentFingerprint) {
    if (!previousFingerprint) return null;

    if (previousFingerprint.hash === currentFingerprint.hash) {
        // If the hash is the same, but the actual text is different -> Collision
        if (previousFingerprint.rawText !== currentFingerprint.rawText) {
            return "STATE_FINGERPRINT_COLLISION";
        }
        // If the hash is the same, but an overlay appeared/disappeared -> Overlay family changed
        if (previousFingerprint.hasOverlay !== currentFingerprint.hasOverlay) {
            return "STATE_OVERLAY_CHANGED";
        }
    }
    return null;
}

module.exports = { getStateFingerprint, checkForCollision };