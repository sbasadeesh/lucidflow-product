const config = require("./errorHandling.config");

async function evaluatePageState(page, response) {
    // 1. Check HTTP Status Codes (403, 404, 500)
    if (response && config.blockedStatusCodes.includes(response.status())) {
        return {
            status: "could_not_assess",
            reason: "HTTP_ERROR",
            statusCode: response.status()
        };
    }

    // 2. Check for Bot Challenges or Blocked Pages
    const pageText = await page.evaluate(() => {
        return (document.title || "") + " " + (document.body ? document.body.innerText : "").slice(0, 1000);
    }).catch(() => "");

    for (const pattern of config.botChallengePatterns) {
        if (pattern.test(pageText)) {
            return {
                status: "could_not_assess",
                reason: "BOT_CHALLENGE",
                statusCode: response ? response.status() : null
            };
        }
    }

    // 3. Check for "Soft" 404s (returns 200 OK but says "Not Found")
    for (const pattern of config.unsupportedPatterns) {
        if (pattern.test(pageText) && pageText.length < 300) { // Only if the page is very short
            return {
                status: "could_not_assess",
                reason: "UNSUPPORTED_STATE",
                statusCode: response ? response.status() : null
            };
        }
    }

    // 4. Everything looks good
    return {
        status: "ok",
        reason: null,
        statusCode: response ? response.status() : 200
    };
}

module.exports = { evaluatePageState };