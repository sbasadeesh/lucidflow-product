module.exports = {
    // HTTP status codes that mean we could not assess the page
    blockedStatusCodes: [401, 403, 404, 500, 502, 503, 504],

    // Text patterns that indicate a bot challenge or block page
    botChallengePatterns: [
        /access denied/i,
        /request blocked/i,
        /you don't have permission/i,
        /are you a robot/i,
        /captcha/i,
        /unusual traffic/i,
        /temporarily blocked/i,
        /pardon our interruption/i,
        /checking your browser before accessing/i,
        /cloudflare/i,
        /verify you are human/i,
        /just a moment/i
    ],

    // Error pages that look like a 200 OK but are actually unsupported
    unsupportedPatterns: [
        /page not found/i,
        /404/i,
        /something went wrong/i
    ]
};