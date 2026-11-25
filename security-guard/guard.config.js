module.exports = {
    // If we land on a page with these URL patterns, stop and flag
    authUrlPatterns: [
        /\/login/i, /\/signin/i, /\/auth/i, /\/otp/i, /\/verify/i, /\/captcha/i
    ],

    // Text on the page that indicates a security block
    authTextPatterns: [
        /enter (the )?otp/i,
        /one[\s-]?time password/i,
        /verify your (mobile|email)/i,
        /recaptcha/i,
        /i'm not a robot/i,
        /sign in to continue/i
    ],

    // If we see these URL patterns, it's a payment area
    paymentUrlPatterns: [
        /\/pay/i, /\/checkout/i, /\/billing/i, /\/payment/i, /\/cart/i
    ],

    // Text that indicates a payment area
    paymentTextPatterns: [
        /card number/i,
        /cvv/i,
        /expiry date/i,
        /proceed to pay/i,
        /make payment/i,
        /net banking/i,
        /upi/i
    ]
};