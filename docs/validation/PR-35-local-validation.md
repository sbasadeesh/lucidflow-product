# PR #35 (E2-01): local validation

## 1. What this change is
- **Tests and documentation only.** There is no production change. `server.js`, `screenshotModule.js`, the other modules, the workflows and the existing tests and helpers are unchanged.
- **It is regression coverage of existing behaviour, not a RED-to-GREEN repair.**
  - The tests assert the contract `main` already implements, and they pass against unchanged production code.
  - No failing test was manufactured.
  - Test strength was checked with controlled fixture faults instead (section 5).
- **It supersedes the intent of the original PR #35 branch** (`ec108d7`).
  - It does not incorporate that branch's commit. `ec108d7` is not an ancestor of `main`.
  - Its `capture.js` / `capture.config.js`, the HTTP 502/504 contract, the 30 s limit, the extra network-idle/`readyState` wait, the reworded invalid-URL messages, the captures and the E2-03 test deletions are all **not** ported.
  - The reasons are in `validation-reports/PR-35-contract-and-test-plan.md`.

## 2. Accepted contract (asserted by `E2-01_tests/render_contract_test`)
| ID | Contract | Evidence the test uses |
|---|---|---|
| T1 | `/api/screenshot` rejects bad URLs with HTTP 400 and exactly `{ error }`: `"URL is required"` (missing or empty), `"Invalid URL"` (unparsable, including spaces only, no scheme, plain words, no host, a number, a local host:port without a scheme) or `"Only HTTP and HTTPS URLs are supported"` (`ftp:`, `javascript:`, `file:`, and `localhost:PORT/…`, which parses as a scheme). `/api/script` (with a valid script) rejects with `'Send the page address as "url" (in the request or in the script).'` or the same protocol message | The exact response bodies. The local site's `/probe` counter stays at **0** for every rejected URL that names it; a positive control then shows the counter does count |
| T2 | A valid URL is opened in Chromium with JavaScript on and a 1366 px wide viewport. Content that JavaScript changes **1 s after load** is what the engine reads and what the saved evidence shows. A page that **never stops** making requests (`/ping` every 250 ms) is still assessed | The engine's action log has `Page title: Rendered by JavaScript` (the raw HTML title is `Raw title`). The saved full-page PNG fetched from the engine is **1366 px** wide, and the block JavaScript paints is **red** in it (grey in the raw HTML). At least 10 `/ping` requests arrived during the scan, and none after it (the browser was closed) |
| T3 | A page that never answers stops at the **real 60 s** load limit. The response is HTTP 200, `result: "could not assess"`, `status: "load_failed"`, `errorCode: "TIMEOUT"`, a reason matching "did not load in time", `statusCode: null`, `screenshotUrl: null`, `elementScreenshots: []` (the E2-06 contract) | Elapsed time ≥59 s and <90 s. One request to `/hang` (no retry). The held connection is released by the engine within 15 s. A normal scan right afterwards is `assessed` |

**What T2 does NOT prove:**
- That every dynamic page is "ready". The engine waits for `domcontentloaded` (≤60 s), then a fixed 2.5 s settle. On the screenshot path it adds the popup wait and `scrollToLoadContent`'s capped, best-effort `load`/`networkidle` waits.
- That content appearing after those bounds is captured, or that the page has full visual fidelity.
- Anything about pages that only change after a user action.
- **Measured cost:** on a page that never goes idle, the capped idle waits are paid in full. T2's scan takes about 46 s locally, which is existing behaviour and is recorded, not asserted.

## 3. Files
- `E2-01_tests/fixture.js`: local site on a free port (`/js-page`, `/ping`, `/probe`, `/hang`), counters, `waitFor`. `close()` destroys every socket, including held `/hang` sockets.
- `E2-01_tests/render_contract_test/render_contract_test.js`: T1 to T3.
  - **Engine helper:** one engine from the **unchanged** `E2-09_tests/fixture.js` `startEngine`. It spawns `server.js` with an argument array, so a space in the path is safe. It clears inherited `LF_OVERLAY_OBSERVATION*`, and it kills a child that never becomes ready.
  - **Timeouts:** the `before` hook allows 60 s. T2 and T3 allow 180 s (T3 needs about 62 s for the real limit).
- `package.json`: the new file is **first** in `npm test`, so the long test starts early under the unchanged `--test-concurrency=3`. Also adds `test:e2-01`.
- This document.

## 4. Development run (unchanged production code)
`npm.cmd run test:e2-01` on `main` `d2dd1a8` plus the new files: exit 0, 3 tests, 3 pass, 0 fail, 0 skip, about 121 s.
- T2's scan took 45.8 s, with 172 `/ping` requests.
- T3's timeout scan took 61.5 s.

## 5. Test-strength checks (controlled fixture faults)
**Method:** for each fault, `fixture.js` was temporarily edited, only the affected test was run (`--test-name-pattern`), and the fixture was then restored byte for byte. The SHA-256 matched after each fault and at the end, and the test file was unchanged.

| Fault | Unchanged assertion that failed | Result |
|---|---|---|
| F1: the delayed JavaScript update is suppressed | T2: `Page title: Raw title` instead of `Page title: Rendered by JavaScript` | detected (exit 1) |
| F2: the ongoing `/ping` activity is stopped | T2: "the page kept requesting /ping during the scan (0 requests)" | detected (exit 1) |
| F3: `/hang` answers at once | T3: `result` was `assessed`, expected `could not assess` | detected (exit 1) |

**Not fault-checked:**
- T1, because its assertions are exact strings plus a probe counter with a built-in positive control.
- The viewport, because faulting it would need a production change.

## 6. Final validation
**Run:** one logged script (`validation-reports/scripts/pr35-final.ps1`, log `validation-reports/logs/pr35-final.log`), run sequentially and stopping at the first failure.

**Environment:** Windows, node v22.23.5, npm 10.9.9, `npm.cmd ci` (lockfile unchanged), Playwright 1.64.1 with chromium-1248.
- `LF_OVERLAY_OBSERVATION*` and `NODE_OPTIONS` were unset, and ports 5000/8765 were free.
- The base is `origin/main` `d2dd1a8`, on branch `impl/pr35-render-contract-tests`.

| Step | Exit | Tests | Pass | Fail | Skip | Elapsed s |
|---|---|---|---|---|---|---|
| `npm.cmd run test:e2-01` | 0 | 3 | 3 | 0 | 0 | 124 (T2 scan 42.2 s, 161 `/ping`; T3 timeout scan 61.7 s) |
| `npm.cmd run test:e2-09` | 0 | 42 | 42 | 0 | 0 | 263 |
| `npm.cmd test` (run once) | 0 | 168 | 166 | 0 | 2 | **398** |
| `npm.cmd run test:e2-08` | 0 | 25 | 25 | 0 | 0 | 17 |
| E2-04 (4 files) | 0 | 20 | 20 | 0 | 0 | 21 |
| E2-07 guards (2 files) | 0 | 2 | 2 | 0 | 0 | 4 |
| `git diff --check` (tracked, plus new files through a temporary index) | 0 | – | – | – | – | 0 |

- **Skips** (both environment-only, as before): `YAML steps are accepted when js-yaml is installed` (js-yaml not installed), and `a file symlink inside the root is skipped and its target survives` (needs Developer Mode or admin on Windows; it runs on Linux CI).
- **Tested tree:** `40837e0de1bbaa379e02bf61cbe762283608bb30`, the same before and after the run. No production file changed.
- **Report-only edit:** this section was written **after** the run. It changes only this document, so the committed tree will differ from the tested tree in `docs/validation/PR-35-local-validation.md` alone.
- **Interrupted first attempt:** an earlier run (`pr35-final-attempt1.log`) was cut off at 08:56:40 during `test:e2-09`, when the session was interrupted.
  - No run, engine or browser processes survived.
  - Its last line was the header of a failing E2-09 test #11 ("screenshot endpoint … identical with observation on and off"), with no error details written.
  - The cause can't be determined from that log. `test:e2-09` doesn't use any changed file.
  - The full validation was re-run once from the start, and #11 passed (42/42).

**CI timing risk (reported, nothing changed):**
- **The numbers:** CI's `npm test` step has `timeout-minutes: 5`. The last CI run of `npm test` (PR #40, Linux) took 235 s. Locally, `npm test` went from 352 s (PR #40 validation, 165 tests) to 398 s (168 tests), an increase of about **46 s**.
- **Estimate:** a similar increase on CI gives roughly **280 s of the 300 s limit**.
- **Approach taken:** the new file is listed first so its ~120 s run overlaps the other files under the unchanged `--test-concurrency=3`. The workflow and the timeout test were not changed.
- **Needs approval if the first CI run is too slow:** raising the CI step timeout, or running E2-01 as its own CI step.
