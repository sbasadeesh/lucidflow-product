const config = require("./guard.config");

async function checkSecurityGuards(page) {
    const currentUrl = page.url();
    const pageText = await page.evaluate(() => document.body ? document.body.innerText : "").catch(() => "");

    // 1. Check Auth Guards (Login, OTP, CAPTCHA)
    for (const pattern of config.authUrlPatterns) {
        if (pattern.test(currentUrl)) {
            return { blocked: true, reason: "AUTH_REQUIRED", details: `URL matched auth pattern: ${pattern}` };
        }
    }
    for (const pattern of config.authTextPatterns) {
        if (pattern.test(pageText)) {
            return { blocked: true, reason: "AUTH_REQUIRED", details: `Page text matched auth pattern: ${pattern}` };
        }
    }

    // 2. Check Payment Guards
    for (const pattern of config.paymentUrlPatterns) {
        if (pattern.test(currentUrl)) {
            return { blocked: true, reason: "PAYMENT_REQUIRED", details: `URL matched payment pattern: ${pattern}` };
        }
    }
    for (const pattern of config.paymentTextPatterns) {
        if (pattern.test(pageText)) {
            return { blocked: true, reason: "PAYMENT_REQUIRED", details: `Page text matched payment pattern: ${pattern}` };
        }
    }

    // Safe!
    return { blocked: false, reason: null, details: null };
}

module.exports = { checkSecurityGuards };