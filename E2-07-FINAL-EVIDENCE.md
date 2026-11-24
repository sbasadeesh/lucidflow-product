# E2-07 Security Guards - Final Evidence

## Commit SHA

**e7ce57ad69192cf4dc080a82d7b9b238418a0dbe**

## Root Cause & Fix

**Problem:** Test 4 (transition: Safe → Continue → Checkout) returned "completed" instead of "blocked" because:
1. Navigation guard blocked all non-nav-bar navigation after page load
2. beforeunload dialog handler dismissed navigation attempts
3. Security guard never reached checkout page to inspect it

**Solution:** Three changes to `server.js`:

1. **Allow scoped navigation** (lines ~1141-1172):
   - Save prior `guard.allowNav` value before Continue click
   - Set `guard.allowNav = true` during click
   - Use try-finally to restore prior state (exception-safe)
   - Wait for page load after click before checking guard

2. **Update dialog handler** (lines ~2135-2151):
   - Only dismiss beforeunload when `guard.allowNav === false`
   - Accept beforeunload when `guard.allowNav === true`
   - Preserve other dialog handling

3. **Fix fixture URL parsing** (E2-07_tests/real_endpoint_test.js):
   - Parse req.url to extract pathname (handles query params)
   - Match routes by pathname, not raw URL

## Test Results

### Real Endpoint Tests
**Command:** `node --test E2-07_tests/real_endpoint_test.js`
**Result:** 6/6 PASS (Exit code 0)
- Test 1: Auth wall (LOGIN) blocked → AUTH_REQUIRED ✓
- Test 2: Safe page (/contact) completes without guard ✓
- Test 3: Payment wall (CHECKOUT direct) blocked → PAYMENT_REQUIRED ✓
- Test 4: Transition (Safe → Continue → Checkout) blocked → PAYMENT_REQUIRED ✓
- Test 5: Screenshot evidence retrieved and validated ✓
- Test 6: Summary ✓

### Focused Acceptance Tests
**Command:** `node --test E2-07_tests/authGuard_test/authGuard_test.js E2-07_tests/paymentGuard_test/paymentGuard_test.js`
**Result:** 2/2 PASS (Exit code 0)
- AC1: Login/OTP blocked as AUTH_REQUIRED ✓
- AC2: Checkout blocked as PAYMENT_REQUIRED ✓

### Mutation Tests (Behavior Proof)
**Command:** `node --test E2-07_tests/mutation_test.js`
**Result:** 3/3 PASS (Exit code 0)
- MUTATION-1: Disable guard → auth wall NOT blocked ✓
- MUTATION-2: Restore guard → auth wall IS blocked ✓
- MUTATION-3: Original source unchanged ✓

### Baseline Regression Tests
**Command:** `npm test`
**Result:** 39/39 PASS (Exit code 0)
- E2-03 element crop tests ✓
- E2-03 full page tests ✓
- E2-03 lazy loading tests ✓
- E2-03 metrics tests ✓
- E2-06 error handling tests ✓
- E2-06 HTTP status tests ✓
- E2-06 redirect tests ✓

## Test 4 Details

### What Happens
1. Engine loads safe page (/): has Continue button
2. Engine clicks Continue button (allowed during this operation)
3. Browser navigates to /checkout (transition succeeds)
4. Fixture server records GET /checkout request
5. Engine's security guard inspects new page URL
6. Guard detects /checkout matches PAYMENT_REQUIRED pattern
7. Guard blocks and returns status="blocked", reason="PAYMENT_REQUIRED"
8. No checkout form fields are accessed

### Checkout Arrival Evidence
- Fixture server receives: GET /checkout?
- Server event recorded: `checkoutArrival: true`
- Protected form events: 0 (no input/click/submit on cardNumber, expiry, cvv)
- Engine interactions: 1 (Continue click on safe page)
- Engine fieldsFilled: 0 (no checkout form fields filled)

## Files Changed

1. **server.js** (2 sections):
   - Lines ~1141-1172: Exception-safe scoped navigation during Continue/Next
   - Lines ~2135-2151: Dialog handler respects guard.allowNav

2. **E2-07_tests/real_endpoint_test.js** (3 changes):
   - URL pathname parsing (handles /checkout and /checkout? identically)
   - Separate /contact endpoint for direct safe page tests
   - Fixed Test 4 assertions for transition semantics

## Remaining Blockers

None. All required tests pass with exit code 0.
