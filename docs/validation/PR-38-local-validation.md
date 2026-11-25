# PR #38 — LOCAL validation report

**PR / task:** #38 — E2-14: Capture provenance and cleanup
**Branch:** `feat/lf-w1-p0a-e2-014-capture-provenance-and-cleanup`
**Scope:** LOCAL review, repair and testing only. This report does not show that CI passed, that the live PR has no conflicts, or that a developer approved it.

> **Status:** an approved focused repair (three rounds) is applied in an isolated worktree, referred to below as `<worktree>`. It is **uncommitted and unstaged**, and not pushed.
> This report is an untracked documentation file, written after testing. It is not part of the tested source (§1).
> Paths are written relative to the repository or as `<worktree>` / `<workspace>`. No machine-specific paths are used.

---

## 1. Revisions

| Item | SHA / tree |
|---|---|
| Remote PR #38 head (`git fetch origin`, 2026-11-22 22:00:41) | `9d2f157d96a33c2075f811c14bd84f6e3e7c6b9f` |
| Fetched `origin/main` | `7dcce22b25afa4ea253f7bf20c2b29fd4f079973` (contains the PR #18 merge) |
| **Local merge candidate** (`git merge --no-ff origin/main` on local branch `feat/lf-w1-p0a-e2-014-…`, which tracks `origin`; author `harir2002`; **not pushed**) | `7c4fb027a203e07f687f73c1e14e30832e3eef44`, parents `9d2f157` and `7dcce22`, tree `ac5e0b9a8dd59b911a7406a3fb8992ae7826963a` |
| First repair round (superseded) | tree `b9b31f06b2722d17a510fdcdbeee723acd3a55f0` |
| Second repair round (superseded) | tree `49a1fa60b7acf0f7e330410eb168256f43af3c0d` |
| **Tested source = merge candidate plus the current uncommitted repair** | tree **`0e458ce52ebdddb51d16598ed86df2102ddb8ba2`** |

**How the tree ID is recorded**
- **Steps:** copy the real index to a temporary index file, then on that copy only run `git add -u` and `git add --` for the two new source files, then run `git write-tree`. The real index is untouched; nothing is staged.
- **What it covers:** all 10 repair paths: 8 modified or deleted tracked files plus the 2 new files `Provenance & cleanUp/cleanupCore.js` and `E2-14_tests/cleanup_test/cleanup_public_api_test.js`.
- **What it doesn't cover:** this report, which is the only other untracked file. No other untracked files exist.
- **Unchanged during testing:** the tree was computed before and after the test runs, and both values are `0e458ce`.
- **Checked explicitly before committing:** `git ls-tree 0e458ce` lists both new files, and the blob of each of the 8 present repair files equals `git hash-object` of the working copy. `git diff --name-status 7c4fb02 0e458ce` shows exactly the 10 repair paths (2 added, 6 modified, 2 deleted).
- **Relation to the commit:** the committed tree is `0e458ce` plus this report. No source or test file differs.

**Merge:** no conflicts. The merge tree is identical to the earlier trial merge. It brings in main's E2-04 tests and `e2-04-validate.yml`.

**Dependencies:** none on other unmerged branches.

**Other copies:**
- the earlier trial-merge worktree (`325ff18`)
- the E2-04 checkout
- the PR #18 worktrees
- `<workspace>/Code/.worktrees/e2-14-publish`, an old laptop copy that is identical to `9d2f157` apart from line endings

None of them were touched.

## 2. Environment
- **OS:** Windows (`win32 10.0.26300`), Windows PowerShell 5.1.
- **Tools:** Node.js v22.23.5, npm 10.9.9, git 2.56.1.
- **Playwright:** 1.64.1, using its installed Chromium.
- **Dependencies:** `npm ci` from the committed lockfile, which is unchanged.
- **Ports:** `PORT` was unset.

## 3. The repair (uncommitted)

Diff against `7c4fb02`, including the 2 new files: **10 files, +895 / −204.**

| File | + / − | Change |
|---|---|---|
| `Provenance & cleanUp/cleanupCore.js` | 260 / 0 | **New, internal.** The cleanup logic (§3.1). The repository root is a required explicit argument. |
| `Provenance & cleanUp/cleanup.js` | 37 / 28 | **Production entry point** (§3.2). Derives the repository root from its own location and accepts only 4 options. |
| `Provenance & cleanUp/provenance.config.js` | 10 / 5 | `appVersion` and `eligibleFilePattern` removed. `tempDir: "./temp"` and `cleanupAgeDays: 7` are kept. `protectedDirs: []` now only *adds* to the built-in protection. |
| `Provenance & cleanUp/provenance.js` | 62 / 21 | Version from `package.json`; caller-supplied user agent, locale and profile name; `codeRevision` from the caller, `GITHUB_SHA`/`GIT_COMMIT` or `git rev-parse HEAD`, otherwise `"unavailable"`; no placeholders |
| `E2-14_tests/cleanup_test/cleanup_test.js` | 385 / 55 | 20 isolated tests of the internal core, using fixture repositories under `os.tmpdir()` (§4) |
| `E2-14_tests/cleanup_test/cleanup_public_api_test.js` | 70 / 0 | **New.** 5 tests of the production entry point (§3.2) |
| `E2-14_tests/provenance_test/provenance_test.js` | 69 / 20 | 6 tests (the original AC1 kept; the placeholder expectations replaced) |
| `error_handler/errorHandler.js`, `error_handler/errorHandling.config.js` | 0 / 74 | Deleted. No callers (`git grep` found 0). Main's E2-06 handling in `server.js` is unchanged. |
| `package.json` | 2 / 1 | `test:e2-14` added. The 3 E2-14 files are added once each to `test` (15 files, all unique). No dependency or version change. |

- **Not changed:** `server.js`, the other runtime modules, `package-lock.json`, `stabilizer.config.js` (thresholds), the E2-03/E2-04/E2-05/E2-06/E2-07 tests, `security-guard/` and `.github/`.
- **Folder name:** `Provenance & cleanUp` is kept.

### 3.1 Cleanup rules (internal `cleanupForRepo(repoRoot, targets, options)`)
1. **Root only.**
   - A target must be the temporary root itself, given as the absolute root, `"."` or omitted.
   - A folder inside the root → `SUBFOLDER_TARGET`. Anything else → `OUTSIDE_TEMP_ROOT`.
   - If any target is rejected, the result is `CLEANUP_REJECTED` and **nothing is deleted**.
2. **Configuration is checked before anything is deleted.** Any failure → `CLEANUP_INVALID_CONFIG`, nothing deleted.
   - `repoRoot` must be the real repository or a folder strictly inside the canonical `os.tmpdir()`. An `options.repoRoot` key is rejected.
   - The repository root is resolved to its canonical (real) path.
   - The temporary root must be a **strict descendant** of the repository root, not the root itself.
   - **No folder between the repository root and the temporary root may be a symlink or junction,** and the root's real path must equal its expected canonical location.
   - `maxAgeDays` must be a positive number.
   - The optional `eligibleFilePattern` must be a `RegExp` without the `g` or `y` flag.
   - `protectedDirs` must be an array of non-empty paths.
3. **Protections that can't be weakened.**
   - `scans/` and `screenshots/` of the chosen repository **and** of the real repository are always protected, and the temporary root must not overlap them.
   - `protectedDirs` can only *add* folders.
   - The `tmp-*` name rule is fixed in code. `eligibleFilePattern` can only *narrow* it: a file must match both.
4. **What is deleted.**
   - **Regular files only, directly inside the root.** A file must be named `tmp-*` and be older than `maxAgeDays`.
   - **Everything else is skipped and reported:** links (`LINK`), directories (`DIRECTORY`), other entry types, other names (`NOT_ELIGIBLE`) and files that aren't old enough (`NOT_EXPIRED`). Nothing is followed or entered.
5. **Re-check before each deletion:**
   - no folder on the path from the repository root down has become a link
   - the root is still a plain folder with the same device and inode identity, at the same canonical location
   - the file's parent folder canonically is the root
   - the file is still a regular file, not a link

   If any check fails, or can't be performed, the result is **`CLEANUP_ABORTED`**. No further files are deleted, and the reason is in `aborted`.
6. **A failed delete on one file is recorded in `errors`, and the remaining files are still processed.** The result is then `CLEANUP_PARTIAL_FAILURE`.
7. **A missing root deletes nothing and is not an error.**

### 3.2 Production entry point (`cleanup.js`)
- **Exports only** `cleanupEphemeralArtifacts(targets?, options?)` and `validateCleanupConfig(options?)`.
- **The repository root is fixed:** `path.resolve(__dirname, "..")`, the module's own repository. Callers can't choose another root, including one under `os.tmpdir()`.
- **Allowed options:** `tempRoot`, `maxAgeDays`, `eligibleFilePattern`, `protectedDirs`. Any other key, including `repoRoot` and the internal test hooks `now` and `unlink`, → `CLEANUP_INVALID_CONFIG`, nothing deleted.
- **No environment-variable or `NODE_ENV` switch** exists. Only the tests load `cleanupCore.js` directly; the only non-test caller of the core is `cleanup.js`.

Both utilities are **standalone**. Nothing in the scan engine calls them, and they add **no fields to API responses or saved scan schemas**.

## 4. Test-first evidence (all LOCAL)

| Round | Source under test | Command | Exit | Tests | Pass | Fail | Skip |
|---|---|---|---|---|---|---|---|
| 1, RED | merge `7c4fb02` with only the round-1 tests changed | `node --test E2-14_tests/provenance_test/provenance_test.js E2-14_tests/cleanup_test/cleanup_test.js` | 1 | 19 | 2 | 16 | 1 |
| 1, GREEN | tree `b9b31f0` | `npm.cmd run test:e2-14` | 0 | 19 | 18 | 0 | 1 |
| 2, RED | the round-1 repair with only the round-2 cleanup tests changed | same command as round 1 | 1 | 25 | 14 | 10 | 1 |
| 2, GREEN | tree `49a1fa6` | `npm.cmd run test:e2-14` | 0 | 25 | 24 | 0 | 1 |
| 3, RED | the round-2 repair with only the new public-API test file added | `node --test E2-14_tests/cleanup_test/cleanup_public_api_test.js` | 1 | 5 | 4 | 1 | 0 |

**Tests that failed in the round-2 RED run:**
- strict-descendant root
- the scans/screenshots protection can't be disabled
- eligibility can't be broadened
- `g`/`y` flags rejected
- subfolder target gives zero deletions
- a linked folder above the root is rejected
- the root replaced by a link during the run
- the root replaced by a different folder during the run
- the new invalid-configuration cases
- the strict-descendant default configuration

**Test that failed in the round-3 RED run:** `the production API rejects an alternative repoRoot before deleting anything`. The round-2 code accepted a `repoRoot` under `os.tmpdir()` through the public API. The other 4 public-API tests passed on the round-2 code:
- the production API rejects test-only hooks and unknown options
- the production API rejects a temporary root outside its own repository
- the production module exposes only the production entry points
- the production default configuration is inside the module's own repository (validated, not run)

**Before-fix runs were safe.**
- **Round 2:** the fixture repositories were nested one level down. That way even a "parent of the repository" case points at a disposable folder when run against the older code.
- **Round 3:** the public-API tests only target disposable fixtures under `os.tmpdir()`. No test runs cleanup against the real repository's `temp/`; the production default is only validated.

## 5. Results on the repaired source (tree `0e458ce`, all LOCAL)

| # | Command | Exit | Tests | Pass | Fail | Skip | Time |
|---|---|---|---|---|---|---|---|
| 1 | `npm.cmd run test:e2-14` | 0 | 31 | 30 | 0 | 1 | 5 s |
| 2 | `npm.cmd test` (E2-03, E2-06, E2-05 and E2-14) | 0 | 98 | 96 | 0 | 2 | 61 s |
| 3 | `node --test E2-04_tests/stableBetweenRuns_test/stableBetweenRuns_test.js E2-04_tests/maskVolatile_test/maskVolatile_test.js E2-04_tests/stabilizerUnit_test/stabilizerUnit_test.js E2-04_tests/fullPageFloating_test/fullPageFloatingElement_test.js` | 0 | 20 | 20 | 0 | 0 | 17 s |
| 4 | `git diff --check` (tracked files) | 0 | — | — | — | — | — |
| 5 | trailing-whitespace and conflict-marker scan of the 2 new source files | — | — | — | — | — | 0 lines found |

- **`npm test` count:** 98 = main's 67 + the 31 E2-14 tests (6 provenance, 20 core cleanup, 5 public API).
- **Skip 1, file symlink:** `a file symlink inside the root is skipped and its target survives # SKIP creating file symlinks needs Developer Mode or admin rights on this Windows host`.
  - **Not proven locally.** Linux CI is *expected* to run this test, but that has **not yet been observed**.
  - Directory links (junctions) are tested and pass.
- **Skip 2:** E2-05 `YAML steps are accepted when js-yaml is installed # SKIP js-yaml is not installed`. It is unrelated to this PR.
- **Isolation:**
  - every deletion test used fixtures under `os.tmpdir()`
  - no run changed a tracked file, and nothing was staged in the real index
  - no repo `temp/` folder was created
  - 0 leftover fixtures in the OS temp folder afterwards
- **Not run:** E2-07, because no runtime file changed.

## 6. Acceptance criteria

> No E2-14 requirement document or PR description is available locally. The table maps the **approved repair boundaries** and the original test labels to tests. It does not cover the original E2-14 requirements.

| Criterion | Source | LOCAL |
|---|---|---|
| The production entry point derives its repository root from its own location; an alternative `repoRoot` (including one under `os.tmpdir()`) is rejected before any deletion | approved boundary (round 3) | proven |
| The production entry point rejects `now`, `unlink` and unknown options, and exports only its 2 entry points | approved boundary (round 3) | proven |
| Saved scans, referenced screenshots and unrelated files survive | approved boundary | proven |
| The temporary root is a strict descendant of the canonical repository root and doesn't overlap scans/screenshots | approved boundary | proven |
| Callers can't disable the scans/screenshots protection; they can add protected folders | approved boundary | proven |
| Eligibility can't be broadened beyond `tmp-*`; it can be narrowed; `g`/`y` flags are rejected | approved boundary | proven |
| Outside-root targets and path traversal are rejected with zero deletions | approved boundary | proven |
| A subfolder target is rejected with zero deletions; only the root may be cleaned | approved boundary | proven |
| Directory links/junctions (as target, as entry, as root, as a folder above the root) can't redirect deletion | approved boundary | proven |
| A file symlink can't redirect deletion | approved boundary | **not proven locally** (skipped); expected on Linux CI, not yet observed |
| The root replaced by a link or by another folder during the run → further deletions stop | approved boundary | proven (simulated through the core's injected `unlink`) |
| Directories are skipped without stopping the run | approved boundary | proven |
| One deletion error doesn't stop other eligible files | approved boundary | proven (simulated) |
| Expired eligible files are removed; fresh ones survive | approved boundary / original AC1 | proven |
| Invalid configuration (including a core `repoRoot` outside the OS temp folder that isn't the real repository, and an `options.repoRoot` key) → no deletion | approved boundary | proven |
| A missing temporary root is ignored safely | original AC2 (narrowed) | proven. A missing *subfolder* target is now rejected. |
| Provenance: versions, environment and budgets; the caller's real user agent, locale and profile; `unavailable` instead of placeholders; code revision from the caller, CI or git, or `unavailable` | original AC1 / approved boundary | proven |
| **Still undefined (the original E2-14 requirements aren't available)** | — | Which artifacts count as ephemeral; what produces temporary files and when cleanup runs; the retention period; whether provenance must be saved in scans or reports. **E2-14 is not proven complete.** |

**Provisional configuration (not E2-14 product criteria)**
- **`tmp-*` naming and the `./temp` root:** utility choices made for this repair.
- **7-day retention:** the existing PR #38 value, unconfirmed.

**Out of scope for this patch**
- **Runtime integration:** nothing calls cleanup or provenance during a scan.
- **Saved provenance:** nothing writes provenance into scans, reports or API responses.

## 7. Remaining limitations (honest scope)
1. **A race window remains.** The re-check before each deletion narrows the window between check and delete, but it **doesn't eliminate it**. A folder could still be swapped between the final re-check and the `unlink` call, and Node offers no directory-handle-based delete. **Don't use this utility on a temporary root that untrusted actors can write to concurrently.**
2. **Links above the repository root are trusted.** They are resolved through the canonical repository path. Only links *between* the repository root and the temporary root are rejected.
3. **Folder identity needs inode support.** The identity check needs the filesystem to report an inode or file index. Where it reports `0`, cleanup refuses to run (`CLEANUP_INVALID_CONFIG`) rather than delete without verification.
4. **The internal core is reachable by `require`.** Code that loads `cleanupCore.js` directly can pass a fixture `repoRoot` under the OS temp folder. That is how the tests work. The core still keeps the real repository's `scans/` and `screenshots/` protected, and no production code other than `cleanup.js` calls it. JavaScript has no module-private files, so this is a convention plus a check in the test run, not an enforced boundary.
5. **Age is configurable.** `maxAgeDays` can be overridden with any positive number. Only the naming rule and the protected folders are non-weakenable.
6. **The race tests are simulated.** The root-swap tests use the core's injected `unlink` hook. They show the re-check reacts to a swap that happens after a deletion; they don't show safety against every possible timing.
7. **File-symlink coverage needs a CI run** (§5).
8. **`codeRevision` shells out to `git`** (5 s timeout) when neither the caller nor CI provides it. If git is missing, it returns `unavailable`.

## 8. CI coverage (local `.github/workflows/e2-04-validate.yml` at HEAD; not changed)
- **`test-pr-head`** (`ubuntu-latest`) runs only the 4 E2-04 files. **It doesn't run E2-14.**
- **`test-integration-with-main`** (`ubuntu-latest`) checks out `main`, merges the PR head with `--no-commit`, and runs `npm test`. **This job will run the 31 E2-14 tests.** Its step label "E2-03 and E2-06 regressions" is out of date.
- **File-symlink test:** unprivileged Linux users can create symlinks, so it is **expected** to run rather than skip. That is **not yet observed**.

## 9. Recommendation
**Candidate for commit and review. Not yet ready to merge.**
- The approved cleanup-safety, public-API and provenance boundaries are implemented, and tests written before the fix prove them (LOCAL), except the file-symlink case.
- Still open:
  - the original E2-14 criteria (§6)
  - the documented race limitation (§7)
  - observing the file-symlink test and the full run in CI
  - developer review

## 10. Proposed staging list (not staged)
```
git add -- "E2-14_tests/cleanup_test/cleanup_test.js" "E2-14_tests/cleanup_test/cleanup_public_api_test.js" \
  "E2-14_tests/provenance_test/provenance_test.js" \
  "Provenance & cleanUp/cleanup.js" "Provenance & cleanUp/cleanupCore.js" \
  "Provenance & cleanUp/provenance.config.js" "Provenance & cleanUp/provenance.js" \
  package.json docs/validation/PR-38-local-validation.md
git rm -- error_handler/errorHandler.js error_handler/errorHandling.config.js
```

## 11. PR comment summary (copyable)

```markdown
**LOCAL repair candidate, PR #38 (E2-14). Uncommitted, not pushed.** PR head `9d2f157`; fetched main `7dcce22`; local merge of main `7c4fb02` (no conflicts); tested source tree `0e458ce`.

- Cleanup:
  - **root only**: only `tmp-*` regular files directly inside a dedicated temporary root, older than 7 days; subfolder or outside targets rejected with zero deletions
  - the root must be a strict descendant of the canonical repository root, with no linked or junction folders in between
  - `scans/` and `screenshots/` are always protected; options can only add protection or narrow eligibility; `g`/`y` regex flags rejected
  - the root's identity and location are re-checked before every deletion, and any change stops further deletions
- Public API:
  - logic moved to the internal `cleanupCore.js`; `cleanup.js` is the production entry point
  - the repository root is derived from the module's location; `repoRoot`, `now`, `unlink` and unknown options are rejected before any deletion
  - no environment-variable or `NODE_ENV` bypass
- Provenance:
  - version from `package.json`
  - caller-supplied user agent, locale and profile
  - code revision from the caller, CI or git, otherwise `"unavailable"`
- Removed the unused `error_handler/`. `test:e2-14` is included once in `npm test`. No runtime, dependency, lockfile, threshold or workflow changes.
- Both utilities are standalone. No API or scan schema change.
- Tests written first:
  - round 1: 16 of 19 failed on the old code
  - round 2: 10 of 25 failed on the round-1 repair
  - round 3: 1 of 5 public-API tests (alternative `repoRoot`) failed on the round-2 repair
- LOCAL results on `0e458ce` (all exit 0, 0 failed):
  - `test:e2-14`: 31 tests, 30 passed, 1 skipped
  - `npm test`: 98 tests, 96 passed, 2 skipped
  - E2-04: 20/20
  - `git diff --check`: clean
- Skips:
  - the file-symlink test on Windows (expected to run on Linux CI, not yet observed)
  - the E2-05 YAML test
- Limitations:
  - a check-to-delete race window remains; not for temporary roots writable by untrusted concurrent actors
  - `tmp-*`, `./temp` and 7 days are provisional settings
  - runtime integration and saved provenance are out of scope, so E2-14 is not proven complete
- Not CI evidence and not a developer approval.
```
