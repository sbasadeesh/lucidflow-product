# PR #18 — LOCAL validation report

**PR / task:** #18 — E2-05: Script interactive page states, recovery review
**Branch:** `feat/e2-05-script-interactive-states-page-recovery`
**Scope:** LOCAL testing only. This report does not show that CI passed, that the live PR has no conflicts, or that a developer approved it.
The `npm test` change below will put the E2-05 suite into the CI job that runs `npm test`, but **no CI run has validated that yet**.

> **Latest tested source:** merge commit `5d660c66813065b174baa6f99ee54bdcc731d249`, tree `1c1e459200ef706b623d25a0e7297bd8b24031bb`. That commit merges `origin/main` `981e652` into PR #18; see §10.
> This report itself is documentation only. It was first added in `313e449` (on top of the tested patched tree `34402b4c…`, §1). It was then updated in a separate documentation-only commit after the §10 tests, so that commit's tree is not the tested tree.

---

## 1. Revisions

| Item | SHA / tree |
|---|---|
| Remote PR #18 branch head (from `git fetch origin`, 2026-11-22 18:43:05; unchanged since the 18:26:47 fetch) | `05e86ab294142ad1c4d6550856c5164b5b27a7d1` |
| Fetched `origin/main` (same fetch) | `981e652eca7c8854d20d3dd707c2a3996bddddc8` (merge of PR #19) |
| Merge base of the branch and main | `80dd65df3bf70da2d4eb99feddb3f4b7de42e1f1` |
| **Patched source tree tested** (branch `05e86ab` plus the approved patch) | `34402b4c7da07842aa13aced03c5ad4194d07b59` |
| Temporary local commit of that tree (parent `05e86ab`; never pushed, not on any branch) | `3bf65bb9a19d36cd7d307bca3034700c2fa117c8` |
| **LOCAL integration candidate** (parents `981e652` and `3bf65bb`; never pushed, not committed to the branch) | `ab67841d8314f2a036fe3c7aa1e4243d16598c8c`, tree `342b8c86e34a750cabfc154f6d11b852aab23027` |

- **Integration result:** `git merge-tree --write-tree 981e652 3bf65bb` exited 0, with **no conflicts (LOCAL)**.
- **Freshness:** the refs date from the fetch above and may have changed on GitHub since.
- **Before the patch (for reference):** the original branch `05e86ab` and its trial merge `0218abf` (tree `7ae8f77d…`) were tested first. Those results are in §8.

### Worktrees
- **Branch worktree:** `C:\Users\harik\kiro-work\wt-pr18-branch`, on local branch `feat/e2-05-…-recovery`, which tracks `origin`.
- **Integration worktree:** `C:\Users\harik\kiro-work\wt-pr18-integ`, detached at `ab67841`.
- **Separate checkout:** the E2-04 checkout `lucidflow-product-checkout` was not used or modified.
- **Tracked files after the runs:** no run left changes to tracked files. Each run recorded its index tree first and checked for unstaged tracked changes afterwards, and there were none.
- **Files created by the tests:** the folders `scans/` and `screenshots/`, which `.gitignore` excludes. They are untracked and are not part of the commit.

## 2. Environment
- **OS:** Windows (`Microsoft Windows NT 10.0.26300.0`), Windows PowerShell 5.1.
- **Tools:** Node.js v22.23.5, npm 10.9.9, git 2.56.1.windows.1.
- **Playwright:** 1.64.1, using its installed Chromium.
- **Dependencies:** installed with `npm ci` from the unchanged `package-lock.json`. `js-yaml` is not installed.
- **Ports:** `PORT` was unset, so the tests choose their own ports.

## 3. Approved changes (YAML Option B)
| Change | Files |
|---|---|
| Add a `test:e2-05` script, and add the 4 E2-05 test files to the end of the `test` script | `package.json` (scripts only; `dependencies` unchanged) |
| Require `completed` in the happy-path order test (approved exception to leaving the test source unchanged) | `E2-05_tests/state_script_order_test/state_script_order_test.js` (the only edit: `assert.ok(status === "completed" \|\| status === "completed_with_failures")` becomes `assert.equal(result.status, "completed")`) |
| Delete 7 generated proof images | `E2-05_tests/All_test_proof.jpg`, `E2-05_tests/log_proof.jpg`, `E2-05_tests/protection_error.jpg`, `E2-05_tests/missingElement_test/test_proof.jpg`, `E2-05_tests/script_parsing_test/test_proof.jpg`, `E2-05_tests/state_cap_test/test_proof.jpg`, `E2-05_tests/state_script_order_test/test_proof.jpg` |
| Delete 8 screenshots of third-party sites | `screenshots/state-scan-1793101722968-02-range-of-products-open.png`, `-03-network-of-offices-open.png`, `-04-trustworthiness-open.png`, `-05-reputation-open-again.png`; `screenshots/state-scan-1793167421942-01-home.png`, `-02-products-menu.png`, `-03-claims-menu.png`, `-04-support-menu.png` |

**Unchanged:**
- **Runtime:** `stateScriptRunner.js`, `stateScript.config.js`, `server.js`, `screenshot*.js`, `stabilizer.config.js`.
- **Dependencies:** `package-lock.json` and the `dependencies` list.
- **Kept files:** the 3 `scripts/*.json` examples, `E2-03_tests/` (including its screenshot cleanup) and `security-guard/`.
- **Thresholds:** `threshold: 0.005` and `pixelTolerance: 10` are untouched.

**Each E2-05 file is included exactly once.** The 4 E2-05 files appear once each in `test` and once each in `test:e2-05`. The `test` script lists 12 files, with no duplicates.

## 4. Results on the patched source (all LOCAL)

| # | Where | Command | Exit | Tests | Pass | Fail | Skip | Time |
|---|---|---|---|---|---|---|---|---|
| 1 | patched branch, tree `34402b4` | `npm.cmd run test:e2-05` | 0 | 28 | 27 | 0 | 1 | 18 s |
| 2 | patched branch, tree `34402b4` | `npm.cmd test` (E2-03, E2-06 and E2-05) | 0 | 67 | 66 | 0 | 1 | 71 s |
| 3 | integration `ab67841`, tree `342b8c8` | `npm.cmd test` | 0 | 67 | 66 | 0 | 1 | 69 s |
| 4 | integration `ab67841`, tree `342b8c8` | `node --test E2-04_tests/stableBetweenRuns_test/stableBetweenRuns_test.js E2-04_tests/maskVolatile_test/maskVolatile_test.js E2-04_tests/stabilizerUnit_test/stabilizerUnit_test.js E2-04_tests/fullPageFloating_test/fullPageFloatingElement_test.js` | 0 | 20 | 20 | 0 | 0 | 19 s |

- **Failures:** none. No test failed or was cancelled.
- **The stricter order assertion passed:** the happy-path script returned `completed`.
- **`npm test` count:** 67 = the 39 existing E2-03 and E2-06 tests plus the 28 E2-05 tests.
- **The only skip, in every run:** `YAML steps are accepted when js-yaml is installed # SKIP js-yaml is not installed`. The test skips itself when it can't load `js-yaml`. `stateScriptRunner.js` loads `js-yaml` only if it's available; otherwise it rejects YAML scripts and tells the caller to install it.
  - **YAML support is NOT validated.** Per the approved Option B, YAML stays optional and `js-yaml` was not added.
- **Not re-run on the patched source: E2-07** (guards, endpoint, mutation). The patch changes no runtime file, and E2-07 passed on the unpatched integration (§8).

## 5. What the commit changes compared with fetched main (LOCAL trial merge)
`git diff --stat 981e652 ab67841`: **10 files, 697 insertions, 1 deletion.**
- **New:** the 4 E2-05 test files and 2 helpers.
- **Edited:** `package.json`.
- **New example scripts (3):** in `scripts/`, which `.gitignore` excludes.

The runtime files `stateScriptRunner.js` and `stateScript.config.js` are already on main. They came in byte-identical through PR #12 (`454802d`).

## 6. Acceptance criteria coverage

> These criteria were **inferred from the test file headers and the runner code**. I didn't check them against the PR #18 description or the original E2-05 task, which weren't available locally.

| Criterion (from the test headers) | Tests | Result (LOCAL) |
|---|---|---|
| C1: each defined state is captured in order | `state_script_order_test.js` (5 tests; now requires status `completed`) | pass |
| C2: states over the cap are skipped with a warning | `state_cap_test.js` (7 tests) | pass |
| C3: a missing element fails the step with a logged reason, not a crash | `missingElement_test.js` (9 tests) | pass |
| Extra: script parsing | `script_parsing_test.js` (7 tests) | 6 passed, 1 skipped (YAML) |

- **Coverage gap:** the E2-05 tests call `runStateScript` and `parseScript` directly. `POST /api/script` is exercised only through the E2-06 tests in `npm test`.

## 7. Limitations and remaining review decisions
1. **No CI evidence yet.** CI hasn't run this commit. Wiring the suite into `npm test` is expected to make CI's `test-integration-with-main` job run it, but that is unverified.
2. **YAML is untested.** It stays optional; adding `js-yaml` would change runtime behavior and needs a product decision.
3. **E2-03 cleanup still deletes the screenshot folder.** `E2-03_tests/ac4-server-integration.test.js` deletes the repo's `screenshots/` and `scans/` folders on every `npm test` run, which is why committed screenshots were unsafe. It is unchanged, because changing it would need separate approval.
4. **Two example scripts target live insurer sites.** `scripts/newindia-accordion.json` and `scripts/royalsundaram_test.json` were kept. All 3 examples sit in a folder `.gitignore` excludes. Whether to keep them is an open decision.
5. **The criteria in §6 are inferred** and still need checking against the PR description.
6. **No developer approval** is recorded here.

## 8. Earlier results on the unpatched branch (LOCAL, for reference)
| Where | Command | Exit | Tests | Pass | Fail | Skip |
|---|---|---|---|---|---|---|
| branch `05e86ab` | E2-05 (4 files) | 0 | 28 | 27 | 0 | 1 |
| branch `05e86ab` | `npm.cmd test` | 0 | 39 | 39 | 0 | 0 |
| integration `0218abf` | E2-05 (4 files) | 0 | 28 | 27 | 0 | 1 |
| integration `0218abf` | `npm.cmd test` | 0 | 39 | 39 | 0 | 0 |
| integration `0218abf` | E2-04 | 0 | 20 | 20 | 0 | 0 |
| integration `0218abf` | E2-07 guards | 0 | 2 | 2 | 0 | 0 |
| integration `0218abf` | E2-07 endpoint | 0 | 6 | 6 | 0 | 0 |
| integration `0218abf` | E2-07 mutation | 0 | 3 | 3 | 0 | 0 |

On the unpatched branch, `npm test` deleted the 8 tracked screenshots in both worktrees. I restored them from `HEAD` before applying the patch, and the patch then removed them.

## 10. Branch update: main merged into PR #18 (LOCAL)

**Why the update was needed.** CI job `test-pr-head` failed on `313e449`. The failed job log confirmed that `E2-04_tests` is missing at the PR head.
- **What the job does:** it checks out the PR head on its own and runs `find E2-04_tests -type f -name '*_test.js'`.
- **Why the files were missing:** the branch was cut from `80dd65d`, before PR #19 added `E2-04_tests/` and `.github/workflows/e2-04-validate.yml`.
- **Other job:** CI job `test-integration-with-main` passed.

**The update.** A normal merge commit, with no rebase, no force-push, and no change to the workflow or any test.

| Item | Value |
|---|---|
| Pre-check (fetch 2026-11-22 20:08) | PR branch `313e4494159cbc2379add8776159bb0ee341f211` and main `981e652eca7c8854d20d3dd707c2a3996bddddc8`, both unchanged; working tree clean |
| Command | `git merge --no-ff -m "Merge branch 'main' into feat/e2-05-script-interactive-states-page-recovery" origin/main` (exit 0, no conflicts) |
| Merge commit | `5d660c66813065b174baa6f99ee54bdcc731d249`, parents `313e449` and `981e652`, author `harir2002` (repo-local identity) |
| Merge tree | `1c1e459200ef706b623d25a0e7297bd8b24031bb` |
| Compared with the validated integration tree `342b8c8` | only `A docs/validation/PR-18-local-validation.md` |
| What the merge brought in | `.github/workflows/e2-04-validate.yml`, `E2-04_tests/` (4 test files and 2 helpers), and main's `server.js`, `screenshotModule.js`, `screenshotStabilizer.js`, `stabilizer.config.js` (11 files, +981/−97) |

**Results on merge commit `5d660c6` (all LOCAL).**

| # | Step | Command | Exit | Tests | Pass | Fail | Skip | Time |
|---|---|---|---|---|---|---|---|---|
| 1 | Replay of the workflow's discovery step | `bash -c "find E2-04_tests -type f -name '*_test.js' \| sort"` (Git Bash) | 0 | 4 files found | — | — | — | — |
| 2 | E2-04 | `node --test E2-04_tests/stableBetweenRuns_test/stableBetweenRuns_test.js E2-04_tests/maskVolatile_test/maskVolatile_test.js E2-04_tests/stabilizerUnit_test/stabilizerUnit_test.js E2-04_tests/fullPageFloating_test/fullPageFloatingElement_test.js` | 0 | 20 | 20 | 0 | 0 | 18 s |
| 3 | npm test (E2-03, E2-06 and E2-05) | `npm.cmd test` | 0 | 67 | 66 | 0 | 1 | 61 s |

- **Files found in step 1:**
  - `E2-04_tests/fullPageFloating_test/fullPageFloatingElement_test.js`
  - `E2-04_tests/maskVolatile_test/maskVolatile_test.js`
  - `E2-04_tests/stabilizerUnit_test/stabilizerUnit_test.js`
  - `E2-04_tests/stableBetweenRuns_test/stableBetweenRuns_test.js`
- **The only skip** is the YAML test: `js-yaml is not installed`.
- **Tracked files:** no run changed any tracked file.
- **Not re-run:** E2-07 and `test:e2-05`. The merged tree is the already-validated integration tree, and those suites passed on the earlier trees (§4, §8).
- **Not verified:** CI has not run on `5d660c6`.

## 9. PR comment summary (copyable)

```markdown
**LOCAL validation, PR #18 (E2-05).** Patched tree `34402b4` (commit `313e449`). Branch updated by merging main `981e652` (merge commit `5d660c6`, tree `1c1e459`; no conflicts).

- CI `test-pr-head` failed on `313e449` because the branch predated PR #19 and had no `E2-04_tests/`.
  - That is a missing-files failure, not a test failure.
  - The merge brings in main's E2-04 tests and workflow. No code, test or workflow was changed.
- On `5d660c6` (all LOCAL, exit 0):
  - discovery found 4 E2-04 test files
  - E2-04: 20/20
  - `npm test`: 67 tests, 66 passed, 1 skipped (YAML; js-yaml is not installed)
- The merged tree is identical to the previously validated integration tree `342b8c8`, apart from this report.
- Runtime is already on main (`stateScriptRunner.js` and `stateScript.config.js` came in via PR #12). This PR adds the E2-05 tests and wires them into `npm test`.
- PR #18 patch (`313e449`):
  - `test:e2-05` script, and the 4 E2-05 files added once each to `npm test`
  - the order test now requires status `completed`
  - removed 7 proof images and 8 screenshots of third-party sites
  - no runtime, dependency, lockfile or threshold changes
- Earlier LOCAL results on the patched tree: `test:e2-05` 28 tests, 27 passed, 1 skipped (exit 0).
- Skip: the YAML parsing test (js-yaml is not installed). YAML stays optional and is not validated.
- Open:
  - CI has not yet run on the merged head.
  - The acceptance criteria were inferred from the tests, not checked against the PR description.
  - The 2 live-site example scripts were kept.
  - No developer approval yet.
```
