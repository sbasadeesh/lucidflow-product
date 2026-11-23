# PR #39 — LOCAL recovery validation report

**PR / branch:** #39, `feat/lf-w1-p0a-e2-008-state-fingerprints-and-action-journal`
**Recovery commit:** `7309c3a20d394f00ecb648d948691ebce51f594f` (local `recovery/pr39-state-fingerprint-action-journal`, also on `origin` as `feat/e2-08-state-fingerprint-action-journal-recovery`), built from fetched `origin/main`.
**Publication:** the recovery is being **integrated into the original PR #39 branch** by a history-preserving merge (§11). It is **not** published as a replacement PR.
**Scope:** LOCAL recovery and testing only. This report is not CI evidence, a developer approval or product acceptance.

> **Status: locally validated recovery candidate for a PROPOSED contract, pending review and CI.**
> - **Proposed, not recovered:** the contract (`docs/state-fingerprint-and-action-journal.md`) is based on the branch's stated purpose. It is **not a recovered E2-08 specification**.
> - **Story-ID mismatch unresolved:** earlier planning called E2-08 "hotspot-directed execution". Hotspot-directed execution is out of scope and was not implemented. **E2-08 is not complete.**
> - **State:** the recovery is committed as `7309c3a`. Its merge into the PR #39 branch is a local candidate (§11) and is not committed or pushed.
> - **Paths:** repository-relative, or `<recovery-worktree>` / `<review-worktree>` / `<integration-worktree>`.

---

## 1. Revisions

| Item | SHA / tree |
|---|---|
| PR #39 head (`refs/pull/39/head`; unchanged across fetches) | `996bd3ef705ed212679271511cace67321f3f49e` |
| Fetched `origin/main` (base of the recovery branch) | `295899e9eaabbcd02671b6c4ce0308425e2b56b4` |
| Merge base of the PR and main | `454802d4a605c3211985163592b498391d968fd4` |
| Original PR fingerprinter used for RED | blob `7ff37338abbab6d7091d8f405f8606c08be350a8` |
| First tested source (before the orchestration change; superseded) | tree `6e5ad93d6510cf437585bf964e97924f3e7907dc` |
| **Final tested source** = main plus every repair file (2 modified, 8 new) | tree **`39e1cc15b7b49172d28eb3a3bd02521ca2c91ee7`** |

- **How the tree ID was recorded:**
  - **Steps:** copy the real index to a temporary file, then on that copy run `git add -u` plus `git add --` for each of the 8 new files, then `git write-tree`.
  - **Check:** `git ls-tree` confirmed that all 8 new files are in the tree.
  - **Real index:** untouched.
  - **Stable across testing:** identical before and after the final runs (§6).
  - **Coverage:** the tree covers every source, test and contract-doc file. It excludes only this report.
- **Between the two trees:** `6e5ad93` and `39e1cc1` differ only in `package.json` (`--test-concurrency=3`, §5).
- **Earlier read-only report:** kept unchanged as an untracked file in `<review-worktree>` (detached at `996bd3e`).
- **This report is not part of the tested tree.** It was written after the final runs. Its later edits are wording-only and change no code:
  - a timing figure in §5.2 was corrected
  - `--test-concurrency=3` is described as an explicit cap (§5.3)
  - Linux CI is marked pending (§8)

## 2. Scope: story-ID mismatch (unresolved)

| Source | Says | Authority |
|---|---|---|
| Branch name / PR title | "state fingerprints and action journal" | naming only |
| Earlier planning (from the user) | E2-08 = "hotspot-directed execution" | source not found locally |
| PR test labels (AC1–AC3) | de-duplication, timer exception, collision/overlay codes, repeatable journal | the PR author's labels; no backing document |

**Bounded local search:**
- **Git:** "hotspot" appeared in 0 of the 38 distinct trees on `origin` and the PR ref, and E2-08 wording appeared in no docs on any ref.
- **Files:** the workspace and review logs had no planning record.
- **Broad scan stopped:** a wider scan was stopped on instruction (its PID was verified first).

The recovery implements only the proposed contract. No conflicting requirement was found.

## 3. Original PR defects and trial-merge conflicts

**Trial merge** (`git merge-tree --write-tree 295899e 996bd3e`; **not resolved**): **7 conflicts**:
- content: `.gitignore`, `screenshotModule.js`, `server.js`
- add/add: the 3 `Provenance & cleanUp/` files
- modify/delete: `stabilizer.config.js`

| # | Defect in PR #39 (LOCAL probes, PR runner `script_runner/stateScriptRunner.js` @ `996bd3e`) |
|---|---|
| D1 | click steps don't run: 9 placeholder comments replace the action handlers |
| D2 | unknown actions are silently ignored |
| D3 | input or checkbox changes don't change the fingerprint (`innerText` hash only) |
| D4 | "9:30" counts as a timer, which disables de-duplication |
| D5 | a hidden `.modal` counts as an overlay |
| D6 | the result carries the full page text (`rawText`) |
| D7 | the journal copies raw labels, and has two timestamp formats |

The PR also deletes the E2-06 tests and brings back obsolete module copies (which would revert PR #38). It hard-codes `PORT = 5000` and adds captures of real third-party websites.

## 4. What was ported, repaired and excluded

**Ported (by intent, not by commit):**
- **The two features:** state fingerprinting and an action journal.
- **Names:** the `stateFingerprinter/` folder name and the PR's overlay selector list.
- **Rewritten:** both features were re-implemented against main to the proposed contract. No PR commit was merged or cherry-picked.

**Changed / added** (diff against `295899e`: **10 files, +723 / −13**):

| File | + / − | Change |
|---|---|---|
| `stateScriptRunner.js` | 17 / 12 | **Behavior-preserving refactor** (§7.1): `fieldDescriptor` and `isSensitiveField` are extracted from `looksSensitive` and exported |
| `stateFingerprinter/stateFingerprinter.js` | 128 / 0 | **New.** `getStateFingerprint(page, options)` → `{ version, hash, counts }` |
| `stateFingerprinter/stateFingerprint.config.js` | 13 / 0 | **New.** `ignoreSelectors: []` and `overlaySelectors` (the PR list) |
| `actionJournal/actionJournal.js` | 57 / 0 | **New.** `buildActionJournal(runResult)` → `[{ index, action, outcome, reason }]` |
| `docs/state-fingerprint-and-action-journal.md` | 92 / 0 | **New.** The proposed contract |
| `E2-08_tests/fixture.js` | 31 / 0 | **New.** Local HTML through `page.setContent`; temporary folders under `os.tmpdir()` |
| `E2-08_tests/fingerprint_test/fingerprint_test.js` | 178 / 0 | **New.** 14 tests |
| `E2-08_tests/action_journal_test/action_journal_test.js` | 145 / 0 | **New.** 9 tests |
| `E2-08_tests/runner_integration_test/runner_integration_test.js` | 60 / 0 | **New.** 2 tests |
| `package.json` | 2 / 1 | The `test` script gains `--test-concurrency=3` (§5) and the 3 new files (18 files, all unique). A `test:e2-08` script is added. Other scripts and dependencies are unchanged. |

**Unchanged** (each blob is identical to `295899e`):
- `server.js` (blob `968cdb4…`)
- `package-lock.json`, `.gitignore`
- `stateScript.config.js`, `stabilizer.config.js`
- `screenshotModule.js`, `screenshotStabilizer.js`, `security-guard/securityGuard.js`
- `Provenance & cleanUp/*`
- `.github/workflows/e2-04-validate.yml`
- every existing E2-03/E2-04/E2-05/E2-06/E2-07/E2-14 test file (0 changed)

There are no server, API or schema changes.

**Intentionally excluded from PR #39:**
- **Runner and server code:** the PR's runner (`script_runner/`), its `server.js` changes, and its collision codes.
- **Rules the contract drops:** automatic de-duplication and screenshot suppression, timer inference, `rawText`, and journal timestamps and labels.
- **Obsolete module copies:** `stabilizer/`, `security_guard/`, `dom_capture/`, `error_handler/`, and the old `Provenance & cleanUp/`.
- **The E2-06 test deletions.**
- **Captured content and fixtures:** `screenshots/*.png`, the `snapshots/` website capture, `tata-aig-test.json`, `payload.json`, and the proof JPGs.
- **Other changes:** the `.gitignore` changes and the hard-coded `PORT`.
- **The PR's 5 tests:** they test excluded behavior.
- **No PR fixture was needed.**

## 5. AC4 timeout investigation (E2-03 `ac4-server-integration.test.js`)

### 5.1 The original failure (preserved)
- **First failure:** on tree `6e5ad93` with Node's default file concurrency, `npm test` exited 1 with 123 tests: 119 pass, **2 fail**, 2 skip. Both AC4 tests failed in the `before` hook with `Server did not start within 15000ms`.
- **Rerun:** the full `npm test` rerun on the same tree passed (123 / 121 / 0 / 2), and so did AC4 on its own (2 / 2).
- **Earlier report wording corrected:** it called the server "the changed server.js". **`server.js` is not changed in this recovery.** Its blob equals main's (`968cdb4…`). Only the runner module it loads was refactored.

### 5.2 Findings
- **Startup error output from the failed run: not available.** The AC4 test starts the server with `stdio: ["ignore", "pipe", "pipe"]` and never reads those pipes, so nothing from that child was recorded. The cause of that specific failure is **not confirmed**.
- **Readiness detection:**
  - `checkReady` polls `http://localhost:5000/` and **retries immediately with no delay** on every error or non-200. In the diagnostic runs that meant 213 attempts in 8.5 s, then 331 in 4.5 s, almost all `ECONNREFUSED`.
  - It accepts **any** HTTP 200 on port 5000. A different process holding port 5000 would pass the check.
  - Detection itself works: the first 200 came about 1.0 s (run A) and 0.05 s (run B) after the server logged `listening`.
- **Exit and cleanup:**
  - The `after` hook sends SIGTERM to both children. In every diagnostic run they exited with `signal=SIGTERM`, and no listeners on 5000/8765 or server processes remained.
  - The SIGKILL fallback never runs: `child.killed` becomes `true` once a signal has been *sent*. The hook also doesn't wait for exit.
- **Port ownership and isolation:**
  - AC4 uses **fixed** ports 5000 (server) and 8765 (fixture). No other file in `npm test` uses them.
  - The E2-06 helpers start `server.js` on free ports.
  - Nothing was listening on 5000/8765 before any run.
- **Browser concurrency of the new tests:** each of the 3 new files launches **one** Chromium in `before()` and reuses it through browser contexts, so at most 3 browsers come from the new files.
- **Measured load:** `--require` preload outside the repository, plus a process sampler. Reading the child pipes in this instrumentation drains them, which the unmodified test doesn't do.

| Run (tree, orchestration) | Result | Peak browsers | Peak node processes | AC4 server: start → listening | AC4 first 200 | E2-06 servers: start → listening |
|---|---|---|---|---|---|---|
| Diagnostic A (`6e5ad93`, default concurrency = 11 on this 12-thread machine) | 123 / 121 / 0 / 2 | 11 | 18 | **7.2 s** | 8.5 s | 6.6–8.8 s (3 servers starting at the same time) |
| Diagnostic B (`39e1cc1`, `--test-concurrency=3`) | 123 / 121 / 0 / 2 | 3 | 8 | **3.3 s** | 4.5 s | 2.5–3.4 s |
| Standalone, nothing else running | — | — | — | ready in 1.9 s (main: 3.8 s) | — | — |

- **Exit codes:** the diagnostic runs record TAP totals but **no exit code**; that's a PowerShell `Start-Process` capture limitation.
- **Hypothesis (supported, not proven):** with 11 test files starting at once, about 18 node processes loaded Playwright and Express together, and 4 `server.js` children started within 1 s of each other. That stretched server startup to 7 to 9 s, leaving about 6.5 s of the 15 s budget. The immediate-retry readiness loop adds load. The failed run probably went over the budget. The new E2-08 files come last in the file list, so they only start when earlier files finish; their share of that early contention is not established.

### 5.3 Fix applied
- **The change:** the `test` script now runs `node --test --test-concurrency=3 …`.
- **What it is:** an **explicit concurrency cap**. At most 3 test files run at once, whatever the host.
- **Why it was chosen:** without the cap, Node runs as many files at once as the host has logical CPUs minus 1. That was 11 on this machine, and it depends on the runner environment in CI.
  - **Not a match for every CI runner:** GitHub documents 4 CPUs for `ubuntu-latest` on public repositories, which gives the same value of 3. Smaller runners (for example 2-CPU private-repository runners) would default lower, and the cap doesn't raise that.
  - **Why 3:** it was the value measured in §5.2. It bounds the startup surge on hosts with many CPUs.
- **Support:** `--test-concurrency` is listed by `node --help` on v22.23.5, and CI uses `node-version: '22'`. CI's `test-integration-with-main` job runs this same `npm test` script.
- **What stayed the same:** every test and assertion, the 15 s timeout, retries (none were added), and production code.
- **Cost:** a full local run takes about 105 to 109 s instead of 77 to 100 s.
- **Not changed (recommended follow-ups to the existing E2-03 test, which would need approval):**
  - add a short delay between readiness attempts
  - check that the 200 comes from the spawned child
  - log the child's output when startup fails
  - wait for child exit in `after`

## 6. Results (all LOCAL)

### 6.1 RED (main `295899e` + new tests + original PR fingerprinter blob `7ff3733`; main runner unchanged)

| Suite | Exit | Tests | Pass | Fail | Skip |
|---|---|---|---|---|---|
| `E2-08_tests/fingerprint_test/fingerprint_test.js` | 1 | 14 | 3 | 11 | 0 |
| `E2-08_tests/runner_integration_test/runner_integration_test.js` | 0 | 2 | 2 | 0 | 0 |
| `E2-08_tests/action_journal_test/action_journal_test.js` | 1 | 1 | 0 | 1 (module not found) | 0 |

The runner integration tests guard main's runner, which already behaves correctly. The PR has no standalone journal, so its RED shows only that the module is absent.

### 6.2 First validation (tree `6e5ad93`, default concurrency; superseded)

| Command | Exit | Tests | Pass | Fail | Skip |
|---|---|---|---|---|---|
| `npm.cmd run test:e2-08` | 0 | 25 | 25 | 0 | 0 |
| `npm.cmd test`, first run | **1** | 123 | 119 | **2** (AC4 startup timeout) | 2 |
| E2-04 (4 files) | 0 | 20 | 20 | 0 | 0 |
| E2-07 auth/payment guard tests | 0 | 2 | 2 | 0 | 0 |
| `npm.cmd test`, rerun | 0 | 123 | 121 | 0 | 2 |
| AC4 alone | 0 | 2 | 2 | 0 | 0 |

### 6.3 Final validation (tree `39e1cc1`, `--test-concurrency=3`)

All runs were sequential and used fresh processes with separate logs. Nothing else ran at the same time, `NODE_OPTIONS` was unset, and there was no instrumentation.

| # | Command | Exit | Tests | Pass | Fail | Skip | Time |
|---|---|---|---|---|---|---|---|
| 1 | `npm.cmd test` | 0 | 123 | 121 | 0 | 2 | 106 s |
| 2 | `npm.cmd test` | 0 | 123 | 121 | 0 | 2 | 109 s |
| 3 | `npm.cmd test` | 0 | 123 | 121 | 0 | 2 | 105 s |
| 4 | `npm.cmd run test:e2-08` | 0 | 25 | 25 | 0 | 0 | 18 s |
| 5 | `node --test` on the 4 E2-04 files | 0 | 20 | 20 | 0 | 0 | 19 s |
| 6 | `node --test E2-07_tests/authGuard_test/authGuard_test.js E2-07_tests/paymentGuard_test/paymentGuard_test.js` | 0 | 2 | 2 | 0 | 0 | 3 s |
| 7 | `git diff --check` | 0 | — | — | — | — | — |

- **Three passes are supporting evidence only.** They don't prove the AC4 timeout can't recur, especially on other hardware.
- **Skips in every `npm test` run:**
  - E2-05 `YAML steps are accepted when js-yaml is installed` (`js-yaml` not installed)
  - E2-14 file-symlink test (needs Developer Mode or admin rights on Windows)
- **`npm test` contents** (18 files, each once):
  - the E2-03 suite (including AC4)
  - the E2-06 suite
  - the E2-05 runner suite: script parsing, missing element (including sensitive-field refusal and unknown actions), state cap, script order
  - the E2-14 suite: provenance, cleanup, public API
  - the 3 new files
- **Not run:** `E2-07_tests/mutation_test.js` (it builds its own worktree from `HEAD`, so it wouldn't test these changes) and `E2-07_tests/real_endpoint_test.js` (it starts the server, which writes to the scan and screenshot folders). Neither is in main's `npm test`.
- **Main baseline** (`295899e`): `npm test` 98 / 96 / 0 / 2; E2-04 20/20.
- **Hygiene:**
  - the new files contain no trailing whitespace or machine paths
  - 0 leftover `e2-08-tests-*` folders
  - no listeners left on 5000/8765
  - nothing staged
- **Generated folders:** `scans/` and `screenshots/` in `<recovery-worktree>` are created by the existing E2-03 and E2-06 server tests, as on main. They are git-ignored and are not in the staging list.

## 7. Final diff review

### 7.1 Sensitive-field refactor
`looksSensitive` used to run an inline browser function and then apply the rule. Now:
- the same browser function is the named `fieldDescriptor`: the same attribute list (`type`, `name`, `id`, `placeholder`, `aria-label`, `autocomplete`, `inputmode`, label text) and the same `{ type, text }` result
- the same rule is `isSensitiveField(info, cfg)`: `null` → `false`; `tel`/`password` → `true`; otherwise `sensitivePattern`, case-insensitive

`.catch(() => null)` is kept. The behavior is the same, and the E2-05 test `typing into a sensitive field (mobile number) is refused` passed in every run. The only addition is the two exports.

### 7.2 Test isolation
- **Local fixtures only:** the new tests use only `page.setContent` HTML. They contain no `http(s)://` URLs, no `page.goto`, and no servers or listeners.
- **Disposable output:** the screenshots they write go to `fs.mkdtempSync(os.tmpdir()/e2-08-tests-*)` and are removed in `after`.

### 7.3 Journal output
`buildActionJournal` reads only `index`, `action`, `status` and `reason` from each step:
- `action` is passed through only when it is one of the 5 supported names, otherwise `null`
- `reason` is only matched against fixed patterns and replaced by a code
- no runner text, selector, typed value or browser error text is copied, and tests assert this

The fingerprint result contains only the hash and counts. Page text and non-sensitive field values are read into Node memory only to compute the hash. Sensitive field values are not read.

### 7.4 Journal limitation
The action journal is **reconstructed from the completed runner result**. It is not a durable, live journal written as steps run:
- if `runStateScript` throws (an invalid script) or the process crashes before returning, no journal is available
- skipped steps are left out
- there are no timestamps

A durable live journal would need runner integration, which is deferred.

## 8. Limitations and deferred integration
1. **E2-08 is not complete,** and its story ID is unresolved (§2). The contract is **proposed**.
2. **Standalone only.** Nothing in `server.js`, `/api/script`, saved scans or the shared schema uses either module. The proposed integration items (an `actionJournal` response field, a per-state `fingerprint`, persistence, runner integration at `capture`, a de-duplication policy, timestamps) are listed in `docs/state-fingerprint-and-action-journal.md` §3 and need a decision.
3. **The fingerprint has limited coverage:** it ignores styling and layout, images and canvas, `contenteditable`, shadow DOM, iframes, custom controls without native state, and invisible text inputs.
4. **Sensitive-field coverage equals the runner's rule** (for example, plain email fields are not flagged). Non-sensitive visible field values are hashed (never stored).
5. **Check-to-read race:** a field's label or name changed between the sensitivity check and the value read is not re-checked; only the type is.
6. **Reason codes depend on the runner's message wording;** an unknown message falls back to `STEP_FAILED`.
7. **The journal is reconstructed after the run** (§7.4).
8. **AC4 timing:**
   - The cause of the one failed run is not confirmed.
   - `--test-concurrency=3` reduced startup contention in the measured runs, but the readiness and cleanup weaknesses in the existing E2-03 test (§5.2) remain.
   - Hosts with fewer CPUs (private-repository runners with 2 CPUs) were not tested.
9. **Linux CI coverage is pending.** All results are from Windows, and no CI run of this source has been observed.

## 9. Recommendation and publication plan
**Locally validated recovery candidate for the proposed contract, pending review and CI.** It should not be described as completing E2-08.

**Publication plan (revised):**
- **Keep PR #39 and its original branch.** The recovery is merged into `feat/lf-w1-p0a-e2-008-state-fingerprints-and-action-journal` with an ordinary merge commit (§11). Its history is preserved; there is no force-push or rebase.
- **No replacement PR.** The earlier plan for a new PR is withdrawn. The pushed `feat/e2-08-state-fingerprint-action-journal-recovery` branch stays as a reference to the reviewed commit.
- **Then:** CI runs on the new PR #39 head, followed by developer approval and "Merge pull request" into main. Nothing is pushed directly to main.

## 10. Recovery commit contents (committed as `7309c3a`)
`stateScriptRunner.js`, `package.json`, `stateFingerprinter/stateFingerprinter.js`, `stateFingerprinter/stateFingerprint.config.js`, `actionJournal/actionJournal.js`, `E2-08_tests/fixture.js`, `E2-08_tests/fingerprint_test/fingerprint_test.js`, `E2-08_tests/action_journal_test/action_journal_test.js`, `E2-08_tests/runner_integration_test/runner_integration_test.js`, `docs/state-fingerprint-and-action-journal.md`, `docs/validation/PR-39-local-validation.md`.

## 11. Integration into the original PR #39 branch (local candidate)

**Revisions** (after `git fetch origin`):

| Item | SHA / tree |
|---|---|
| Original PR #39 head (tracking ref and `ls-remote`) | `996bd3ef705ed212679271511cace67321f3f49e` |
| Recovery commit / tree | `7309c3a20d394f00ecb648d948691ebce51f594f` / `6208fec41bf3712a55a458222cfd523dabcbe31a` |
| `origin/main` (an ancestor of the recovery commit) | `295899e9eaabbcd02671b6c4ce0308425e2b56b4` |
| Integration worktree / branch | new worktree `<integration-worktree>`, local branch `integ/pr39-merge-recovery`, created from `996bd3e` |

**Merge:** `git merge --no-commit --no-ff 7309c3a…` on `996bd3e`. The pending merge has HEAD = `996bd3e` and MERGE_HEAD = `7309c3a`, so the merge commit will have those two parents.

**Conflicts (10 paths)**, all resolved to the reviewed recovery content:

| Path | Conflict | Resolution |
|---|---|---|
| `.gitignore` | content | main's version (the old PR dropped the `screenshots/` and `scripts/` entries) |
| `screenshotModule.js` | content | main's version (the old PR's copy predates E2-04/E2-05) |
| `server.js` | content | main's version (blob `968cdb4…`; the old PR hard-coded the port and used obsolete modules) |
| `stabilizer.config.js` | modify/delete (the PR deleted it) | kept, main's version (E2-04 thresholds) |
| `stateScriptRunner.js` | modify/delete (the PR deleted it) | kept, the recovery's version (main's runner plus the reviewed `fieldDescriptor`/`isSensitiveField` extraction) |
| `Provenance & cleanUp/cleanup.js`, `provenance.config.js`, `provenance.js` | add/add | main's versions (the PR #38 / E2-14 repair) |
| `stateFingerprinter/stateFingerprinter.js` | add/add | the recovery's version (replaces the PR's `innerText` hash with timer and collision rules) |
| `E2-08_tests/fingerprint_test/fingerprint_test.js` | add/add | the recovery's 14 tests (the PR's 5 tests cover excluded behavior) |

**Whole-tree reconciliation:**
- **Why:** besides the conflicts, the merge kept 20 obsolete paths that the old PR had added and the recovery doesn't contain. They are:
  - `E2-08_tests/all_unit_test_proof.jpg` and `E2-08_tests/test_proof.jpg`
  - `dom_capture/` (4 files) and `error_handler/` (2 files)
  - `payload.json` and `tata-aig-test.json`
  - `screenshots/` (6 PNGs) and `snapshots/` (2 files from a real website)
  - `script_runner/` (2 files: the placeholder runner and its config)
- **How:** inside the newly created, initially clean integration worktree only, the index and working tree were set to the recovery commit with `git read-tree --reset -u 7309c3a…`. No other worktree was touched, and `git clean` was not used.
- **Result:**
  - 0 unmerged entries and 0 conflict markers (`git grep` for `<<<<<<<` and `>>>>>>>`)
  - 0 unstaged changes and 0 untracked files
  - all 20 obsolete paths gone from disk
  - **staged tree = `6208fec41bf3712a55a458222cfd523dabcbe31a`, identical to the recovery tree (no differences)**

**Candidate diff against current main** (`git diff --cached origin/main`): the same 11 files and +1002 / −13 as the recovery commit. 2 files are modified (`package.json`, `stateScriptRunner.js`) and 9 are added (§10). Against the original PR head, the merge changes 196 paths (+26253 / −7541), mostly by bringing in main's work since October.

**Validation of the integration candidate** (staged tree `6208fec`; `npm ci` from main's lockfile; sequential; all LOCAL):

| Command | Exit | Tests | Pass | Fail | Skip | Time |
|---|---|---|---|---|---|---|
| `npm.cmd run test:e2-08` | 0 | 25 | 25 | 0 | 0 | 12 s |
| `npm.cmd test` (`--test-concurrency=3`, 18 files once each: E2-03 5, E2-06 3, E2-05 4, E2-14 3, E2-08 3) | 0 | 123 | 121 | 0 | 2 | 87 s |
| `node --test` on the 4 E2-04 files | 0 | 20 | 20 | 0 | 0 | 17 s |
| `node --test E2-07_tests/authGuard_test/authGuard_test.js E2-07_tests/paymentGuard_test/paymentGuard_test.js` | 0 | 2 | 2 | 0 | 0 | 2 s |
| `git diff --cached --check` (against HEAD = the old PR head) | **2** | — | — | — | — | — |
| `git diff --cached --check origin/main` | 0 | — | — | — | — | — |

- **Skips:** the E2-05 YAML test (`js-yaml` not installed) and the E2-14 file-symlink test (needs Windows Developer Mode or admin rights).
- **`git diff --cached --check` against the old PR head:** 906 output lines (452 trailing-whitespace lines and 2 blank lines at end of file) in 11 files.
  - All 11 are **byte-identical to main**: `server.js`, `E2-04_tests/stabilizerFixtures.js`, `E2-07_tests/mutation_test.js`, `E2-07_tests/real_endpoint_test.js`, `E2-07-Test-Results.md`, 2 `archives/pr-recovery/*.md` files, and 4 `lucidflow-frontend/` files.
  - `git diff --check 454802d origin/main` produces the same 906 lines, so these come from main's own history. The integration introduces none of them, and they were not changed.
  - Checked against main, the candidate is clean.
- **After tests:** the staged tree was unchanged. There were 0 leftover temporary folders and no listeners on 5000/8765.
- **Earlier runs still apply:** the earlier validation in §5–§6 still applies to the identical source tree, including the first-run AC4 timeout, its diagnosis, the explicit concurrency cap, and the three consecutive passing runs.
- **Linux CI is unobserved.**

**Report change:** this report was edited after the integration tests (the header, §9, §10 and this §11). After those edits, the candidate's only difference from the recovery tree `6208fec` is this file.
