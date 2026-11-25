# PR #40 — LOCAL implementation and validation report (bounded, proposed contract)

**PR / original branch:** #40, `feat/lf-w1-p0a-e2-009-same-session-dismissal-observation-window` (head `72aae6928ebb917ee446ac3bcc6aed7125dc2a08`, untouched)
**Implementation branch:** local `impl/pr40-overlay-recurrence-observation`, created from `origin/main` `567366795aa0af447a205cb4674426edeed85f32`. It has no upstream.
**Scope:** LOCAL only. This report is not CI evidence, a developer approval or product acceptance.

> **Status: locally validated, bounded implementation of a PROPOSED contract, after review-repair round 2 (§10), pending review.**
> - **Current evidence:** §10 supersedes the results in §1 and §6 for the current source. The earlier tree `8cc1913` is kept for history only.
> - **Proposed, not recovered:** the contract is in `docs/overlay-recurrence-observation.md`. **It is not a recovered E2-09 specification,** and this work does not complete the E2-09 story.
> - **State:** uncommitted and unstaged; not merged into the original PR #40 branch; not pushed.
> - **Paths:** repository-relative, or `<implementation-worktree>`.

---

## 1. Revisions and tested source

| Item | SHA / tree |
|---|---|
| `origin/main` (base; unchanged at fetch) | `567366795aa0af447a205cb4674426edeed85f32`, tree `e6d7a8911278b55e748c19bb1d7ffc6e01af7013` |
| Original PR #40 head (not used, not changed) | `72aae6928ebb917ee446ac3bcc6aed7125dc2a08` |
| RED source (main + new tests + contract doc; no implementation) | tree `34d92f6d0368c57987694e493d7ab69ac2c2d2fe` |
| **Tested source** (main + all changes below, including every new file) | tree **`8cc19131e6f578dd8484a62f70b4fcb85e072f10`** |

- **How the tree ID was recorded:** copy the index to a temporary file, then on that copy run `git add -u` plus `git add --` for each of the 8 new files, then `git write-tree`.
- **Stable across testing:** the tree was the same before and after both validation runs (§6).
- **Coverage:** the tree covers all source, test, config and contract files. It excludes only this report.

## 2. Approved decisions applied

| # | Decision | Implementation |
|---|---|---|
| D1 | Proposed contract only | `docs/overlay-recurrence-observation.md` is marked PROPOSED |
| D2 | Option A only | no response, saved-scan or report field; no new `actionLog` lines; diagnostics go to **standard output only** |
| D3 | Disabled by default; `windowMs` 3000 | `overlayObservation.config.js`: on only with `LF_OVERLAY_OBSERVATION=1`; window override `LF_OVERLAY_OBSERVATION_WINDOW_MS` |
| D4 | No extra wait; keep the quiet exit and loop limit | polls run on existing ticks; the loop condition and break are unchanged; an early end gives `incomplete` (`QUIET_EXIT` / `BUDGET_ENDED`), never `not_observed` |
| D5 | Read-only matching; no DOM marker; ambiguity documented | identity comes from structure, a text hash and a geometry bucket. A test documents that an identical replacement can't be told apart. |
| D6 | Existing text-log redaction deferred | existing `dismissOverlays` log lines are unchanged; new outputs contain no text |
| D7 | Exclude the hidden fallback; observe only confirmed close-control and Escape dismissals | `noteDismissed` is called only after each existing "still open?" check confirms the dismissal; the hidden path never calls it |
| D8 | No outcome change and no finding | the observer has no access to status or findings; tests confirm identical outcomes |
| D9 | Only the existing popup-loop invocations | inventory below; observation runs in these 3 calls only |

**Popup-loop inventory before wiring** (`server.js` at `5673667`):
- `:2275`: `/api/screenshot` initial wait → phase `screenshot_initial_wait`
- `:2279`: `/api/screenshot` post-scroll wait → phase `screenshot_post_scroll_wait`
- `:2579`: `/api/script` pre-script wait → phase `script_pre_wait`

**Not wired:**
- the other `dismissOverlays` call, the full-page tile hook (`:2289`)
- all `clearPopups` calls
- JavaScript dialogs

## 3. Contract changes made before coding
These were applied to `docs/overlay-recurrence-observation.md`:
- **New `incomplete` reason:** `QUIET_EXIT`, for the quiet-period early exit. It sits alongside `BUDGET_ENDED`, `NAVIGATED`, `PAGE_CLOSED` and `SNAPSHOT_FAILED`.
- **Identical replacements:** the doc no longer promises to tell them apart. It states that identical overlays (the same element shown again, an identical replacement, or a distinct look-alike) can't be distinguished.
- **Privacy scope:** privacy assertions now cover the **new observer outputs** only (records and diagnostic lines). Existing `actionLog` text is out of scope (D6).
- **Equivalence tests:** defined for controlled fixtures (§5): outcome, metrics, response keys and normalized `actionLog` must be equal with observation on and off.
- **Inspection:** described in §8 of the contract: engine standard output (`[overlay-observation]` and `[overlay-observation-summary]` lines), and `createOverlayObserver().records()` for library callers. Nothing is returned or saved.

## 4. Changed files (diff against `567366795…`)

| File | + / − | Change |
|---|---|---|
| `server.js` | +62 / −13 (`git diff --numstat`; part of it is re-indentation inside the new `try`) | 3 requires. `dismissOverlays(page, record, observer = null)`: when an observer is passed, it reads the identity of each tagged overlay before acting and notes **confirmed** close-control or Escape dismissals. `waitAndDismissPopups`: when `options.observationPhase` is set and observation is enabled, it creates an observer, polls before each tick's existing work, ends with `QUIET_EXIT` / `BUDGET_ENDED` (or `PAGE_CLOSED` on an exception) and prints diagnostics. A new helper `pollOverlayObserver`. The 3 call sites gain an `observationPhase` label only. |
| `package.json` | +2 / −1 | the 3 E2-09 test files are added once each to `test` (21 files, all unique; `--test-concurrency=3` kept); `test:e2-09` added. No dependency changes. |
| `overlayObservation/overlayObserver.js` | new | pure state machine: `createOverlayObserver`, `matchIdentity`, `overlayIdOf`, `formatDiagnostics` |
| `overlayObservation/overlaySnapshot.js` | new | read-only `snapshotOverlays(page)` and `identifyTarget(page, idx)`. Candidate rules are copied from `dismissOverlays`; text is hashed in the page. |
| `overlayObservation/overlayObservation.config.js` | new | `enabled: false`, `windowMs: 3000`, `maxTracked: 10`, and `resolveConfig(env)` |
| `E2-09_tests/fixture.js` | new | local 127.0.0.1 site on a random port with 6 controlled pages; engine on a free port with output capture; parsers |
| `E2-09_tests/observer_unit_test/observer_unit_test.js` | new | 14 fake-clock tests |
| `E2-09_tests/overlay_snapshot_test/overlay_snapshot_test.js` | new | 9 browser tests (`page.setContent`) |
| `E2-09_tests/engine_observation_test/engine_observation_test.js` | new | 10 engine tests (3 engines: off, on, on with window 500 ms) |
| `docs/overlay-recurrence-observation.md` | new | the proposed contract |

**Unchanged:**
- main's runner, `stateScript.config.js`, `stabilizer.config.js`, `screenshotModule.js`
- `security-guard/`, `Provenance & cleanUp/` (the E2-14 repair), E2-08 `stateFingerprinter/` and `actionJournal/`
- every existing test, `.github/` and `package-lock.json`

**Excluded from the original PR #40:** all obsolete modules and captures, the fixed 5 s wait, the `not_assessed` outcome, the `overlayRecurrence` field, the listen guard and export, and its 3 tests.

## 5. Tests

**Unit, controlled clock (14):**
- **Outcomes:** `not_observed` after the full window; `recurred` with separate `dismissedAt` / `recurrenceObservedAt` / `observationEndedAt` and a measured `observedForMs`; a different identity is not a recurrence; a match after the window is not a recurrence.
- **Early ends:** `QUIET_EXIT` and `BUDGET_ENDED` give `incomplete`; `NAVIGATED`, `PAGE_CLOSED` and `SNAPSHOT_FAILED` give `incomplete` with that reason; closed records are immutable.
- **Tracking rules:** the hidden fallback and unknown methods are not tracked; `maxTracked` bounds tracking and untracked dismissals are counted.
- **Matching:** every component must be equal, and identical identities match (the documented ambiguity).
- **Outputs and config:** records and diagnostics contain only the allowed keys and no identity components or URLs; invalid input is rejected; config defaults and env parsing work.

**Browser, local HTML (9):**
- **Identity:** stable across loads; an overlay shown again is matched; an identical replacement has the same identity (documented); a different overlay, a moved overlay and a button-vs-link structure change don't match; `identifyTarget` equals the snapshot identity.
- **Exclusions:** hidden elements (`display:none`, `visibility:hidden`, `opacity:0`, too small) are excluded; sticky bars and app shells are excluded.
- **Read-only:** no text, e-mail, phone, input value or id in the output; 0 click/key/focus events and 0 DOM mutations during snapshots.

**Engine, spawned `server.js` on free ports with a local site (10):**
- **Disabled:** observation off writes no observation output.
- **Recurrence:** recurrence after a close-control dismissal (`/api/script`) is recorded as `recurred` with `close_control`, `script_pre_wait`, 0 < `observedForMs` < 3000.
- **Window endings:** with the default 3000 ms window, the quiet-period exit gives `incomplete` / `QUIET_EXIT`. With a 500 ms window the same page gives `not_observed`.
- **No false recurrence:** a different overlay appearing is not a recurrence.
- **Methods:** an Escape dismissal is recorded with `escape`; the hidden fallback (confirmed in the action log) is not recorded.
- **Privacy:** observation output contains no overlay text, e-mail or phone.
- **Equivalence:**
  - **Script endpoint**, on 5 pages: status, result, states, interactions, counts, warnings, step statuses, response keys and normalized `actionLog` are identical with observation on and off.
  - **Screenshot endpoint**, on the recurring page: status, result, states, interactions, `interactionBreakdown`, `popupsHandled`, `fieldsFilled`, response keys and normalized `actionLog` are identical. The `screenshot_initial_wait` phase is observed.

## 6. Results (all LOCAL, Windows, sequential)

**RED** (tree `34d92f6`: main's unchanged `server.js` and `package.json`, plus the new tests; no implementation):

| Suite | Exit | Tests | Pass | Fail | Skip | Cause |
|---|---|---|---|---|---|---|
| observer unit | 1 | 1 | 0 | 1 | 0 | `Cannot find module '../../overlayObservation/overlayObserver'` |
| overlay snapshot | 1 | 1 | 0 | 1 | 0 | `Cannot find module '../../overlayObservation/overlaySnapshot'` |
| engine | 1 | 10 | 3 | 7 | 0 | no observation output from main's engine. The tests that passed were: disabled-output, hidden-fallback-not-observed, script equivalence. The screenshot-equivalence test failed only on its observation assertion; its outcome and log checks passed on main. |

**GREEN** (tree `8cc1913`):

| # | Command | Exit | Tests | Pass | Fail | Skip | Time |
|---|---|---|---|---|---|---|---|
| 1 | `node --test` observer unit | 0 | 14 | 14 | 0 | 0 | 1 s |
| 2 | `node --test` overlay snapshot | 0 | 9 | 9 | 0 | 0 | 8 s |
| 3 | `node --test` engine | 0 | 10 | 10 | 0 | 0 | 179 s |
| 4 | `npm.cmd run test:e2-09` | 0 | 33 | 33 | 0 | 0 | 184 s |
| 5 | `npm.cmd test` run 1 | 0 | 156 | 154 | 0 | 2 | 268 s |
| 6 | `npm.cmd test` run 2 | 0 | 156 | 154 | 0 | 2 | 265 s |
| 7 | `npm.cmd test` run 3 | 0 | 156 | 154 | 0 | 2 | 248 s |
| 8 | `npm.cmd run test:e2-08` | 0 | 25 | 25 | 0 | 0 | 12 s |
| 9 | `node --test` on the 4 E2-04 files | 0 | 20 | 20 | 0 | 0 | 17 s |
| 10 | `node --test` E2-07 auth and payment guard tests | 0 | 2 | 2 | 0 | 0 | 2 s |
| 11 | `git diff --check` | 0 | — | — | — | — | — |

- **`npm test` contents:** 21 files once each, which includes E2-03 (AC4), E2-06, E2-05, E2-14, E2-08 and E2-09. The count is 156 = main's 123 + 33.
- **Skips:** the E2-05 YAML test (`js-yaml` not installed) and the E2-14 file-symlink test (needs Windows Developer Mode or admin rights).
- **Hygiene:** the new files contain no trailing whitespace, conflict markers or machine paths. Afterwards there were 0 leftover temporary folders, no listeners on 5000/8765 and no node processes.
- **Not run:**
  - `E2-07_tests/mutation_test.js` (builds its own worktree from `HEAD`, so it wouldn't include these uncommitted changes)
  - `E2-07_tests/real_endpoint_test.js` (writes to the repository's output folders)
  - Neither is in `npm test`.
- **Output folders:** the engine tests, like the existing E2-06 and E2-03 server tests, make the engine write `scans/` and `screenshots/` in `<implementation-worktree>`. Those are git-ignored and are not in the staging list.

## 7. Limitations
1. **Proposed contract only.** The E2-09 story ID, the original criteria and product acceptance are unresolved, so this does not complete E2-09.
2. **Mostly `incomplete` in practice.** With the default 3000 ms window and the unchanged loops, most observations end `incomplete` / `QUIET_EXIT`: the quiet exit comes about 1.5 s after the last dismissal. `recurred` is seen only when the overlay comes back within that time. This is the expected effect of D4.
3. **Sampling.** Polls run on the loop's existing ticks (about every 0.5 to 1 s), so a brief reappearance between two polls is missed.
4. **Identity ambiguity and fragility** (contract §5): identical overlays are indistinguishable. Changing text, movement beyond the 40 px bucket, shadow DOM, iframes and canvas aren't handled.
5. **Copied candidate rules.** The rules in `overlaySnapshot.js` are a copy of those in `dismissOverlays`. If one changes, the other must change too; there is no shared function.
6. **Exceptions inside the loop** are reported as `PAGE_CLOSED`. The only throwing call is `waitForTimeout`, which throws when the page is closed.
7. **Standard output only.** Diagnostics can be inspected but aren't stored. Any public exposure needs a separate decision (D2 options B and C).
8. **Existing `actionLog` text exposure is unchanged** (D6 follow-up).
9. **Timing-sensitive engine tests.** They rely on fixture timings: a reappearance 800 ms after the click, and the quiet exit occurring before the window ends. They passed in 5 of 5 executions of the engine file locally (the GREEN feature run, `test:e2-09` and the 3 `npm test` runs); slower CI hosts are untested.
10. **Linux CI is unobserved.** All results are from Windows.

## 8. Proposed staging list (not staged)
```
git add -- server.js package.json \
  overlayObservation/overlayObserver.js overlayObservation/overlaySnapshot.js overlayObservation/overlayObservation.config.js \
  E2-09_tests/fixture.js E2-09_tests/observer_unit_test/observer_unit_test.js \
  E2-09_tests/overlay_snapshot_test/overlay_snapshot_test.js \
  E2-09_tests/engine_observation_test/engine_observation_test.js \
  docs/overlay-recurrence-observation.md docs/validation/PR-40-local-validation.md
```

## 10. Review-repair round 2 (B1, B2 and the approved small items)

The final diff review (`validation-reports/PR-40-final-diff-review.md`) found two blocking issues. Both repairs were approved and applied.

### 10.1 Changes
- **B1: gap between the tick poll and the dismissal scan**
  - **New method:** `overlayObserver.js` gains `noteVisible(signature, { context })`.
    - **What it can do:** it only marks **open** records with the same context and a matching signature within the window as `recurred`.
    - **What it can't do:** it never sets `not_observed` or any other ending, and never changes a closed record. A recurrence is therefore counted once, whether `noteVisible` or `poll` sees it first.
  - **Where it's called:** `server.js` calls it in `dismissOverlays` right after the overlay's signature is read, **before** the existing logic acts on the overlay.
- **B2: failure isolation** (`server.js`)
  - **Guarded calls:** `noteVisible` and `noteDismissed` run inside `observe()` (`try/catch`; failures ignored).
  - **Polls:** `pollOverlayObserver` holds only observation work (`hasOpen`, `isClosed`, snapshot, `poll`). Any failure ends the open records as `SNAPSHOT_FAILED`, and that `end` call is guarded too.
  - **Output:** the `finally` block guards `end` and the diagnostic output separately.
  - **Production errors still propagate:** clearing, dismissing and waiting stay outside the guards, so for example `waitForTimeout` on a closed page still propagates.
- **N1 (done):** `windowMs` is capped at **60000** (a proposed value). Larger values fall back to 3000, like other invalid values. This is 2 lines in `overlayObservation.config.js`.
- **N8 (done):** the `/recurs` fixture now reappears **1000 ms** after the click instead of 800 ms. That gives a 400 ms margin before the ~600 ms confirmation check, and B1 now covers the other side of the timing.
- **N9:** `fixture.js` gains `startEngines()`, which stops engines that did start when another fails; `startEngine()` also kills a child that never became ready.
- **N6 / N2 and limitations:** the contract now calls the signature a matching signature, not proven identity. It adds the CI note on inherited variables, documents the `windowMs` handling, the failure isolation and the exact stdout format, and lists N1/N3/N5/N7/N10/N11/N12 as limitations.
- **New tests:**
  - **Unit (6):** `noteVisible` within the window; never ends a record otherwise; no double counting with `poll`; the gap sequence; invalid-signature rejection; the window cap.
  - **Engine fixture `/b1-gap` (event-driven, no timers):** closing the promo reveals an in-page "Accept all" button. On the next tick, **after** the poll, the existing `clearPopups()` clicks it, and its handler shows the same promo again. It is therefore visible only between the poll and the `dismissOverlays` scan.
  - **Engine tests (3):** the B1 gap is attributed (`recurred`, seen before the second dismissal). A **throwing observer** (`E2-09_tests/throwing_observer_preload.js`, a test-only `--require` preload; production code is unaware of it) leaves script scans on 4 pages and a screenshot scan identical to the observation-off engine in outcome, metrics, response keys and normalized action log. It also checks that all four call points were exercised (`noteVisible`, `noteDismissed`, `poll`, output: `end` and `formatDiagnostics`) and that no observer error reaches a response.

### 10.2 RED (new tests against the reviewed implementation)
The implementation files were the **reviewed** ones (blobs equal to `8cc1913`); only the tests had changed.

| Suite | Exit | Tests | Pass | Fail | Notes |
|---|---|---|---|---|---|
| observer unit (first run) | 1 | 20 | 15 | 5 | `o.noteVisible is not a function` ×4; cap test failed |
| observer unit (after tightening the invalid-signature test, which had passed only because calling a missing function also throws `TypeError`) | 1 | 20 | 14 | 6 | all 6 new tests fail |
| overlay snapshot | 0 | 9 | 9 | 0 | unchanged tests |
| engine | 1 | 13 | 10 | 3 | **B1**: both records `incomplete`/`BUDGET_ENDED` although the promo was closed twice. **B2 script**: HTTP 500 vs 200. **B2 screenshot**: HTTP 500 vs 200. |

The engine RED run's "tree after" differs from "tree before" only because the unit test was tightened **during** that run. The implementation was unchanged.

### 10.3 GREEN and regressions (current source)

- **Tested tree:** `a4a9d8350141b50ca720aca957c41f6efacad697` (temp-index `git write-tree` of HEAD `5673667` plus all working-tree changes). It was the same before and after the run.
- **Change since the earlier `897e6ba7` tree:** one line in a test file. `E2-09_tests/engine_observation_test/engine_observation_test.js` line 22 now builds the preload option as `` `--require ${JSON.stringify(THROWING_OBSERVER_PRELOAD)}` ``.
  - **Why:** after the Windows profile rename (`harik` to `Hari R`), the repo path contains a space.
    - Unquoted, `NODE_OPTIONS` split the path at the space (`Cannot find module 'C:\Users\Hari'`).
    - Plain double quotes failed too: Node treats `\` inside quotes in `NODE_OPTIONS` as an escape, so it removed every backslash.
    - `JSON.stringify` quotes the path and doubles each backslash, which works on Windows and Linux.
  - **Standalone check of the fix:** `node -e "console.log('ok')"` with that `NODE_OPTIONS` printed `ok`, the preload was in `require.cache`, and there was no `MODULE_NOT_FOUND`.
  - **Not changed:** `server.js` and the `overlayObservation` modules.
  - **Other paths:** the `spawn` calls in `E2-09_tests/fixture.js` and `E2-06_tests/errorFixtures.js` pass arguments as arrays with no shell, so they are unaffected.
- **Environment:**
  - Windows, node v22.23.5, npm 10.9.9, git 2.56.1.windows.1.
  - `npm ci` exited 0; `npm ls --depth=0` exited 0.
  - `LF_OVERLAY_OBSERVATION*` and `NODE_OPTIONS` were unset; ports 5000 and 8765 were free; there were no leftover processes.
- **Run method:** one script (`validation-reports/scripts/final-run.ps1 -SkipCi`) ran the steps one after another, stopping at the first failure. Its log is `validation-reports/logs/final-run.log`. The two failed attempts are kept as `final-run-attempt1.log` and `final-run-attempt2.log`.

| Step | Exit | Tests | Pass | Fail | Skip |
|---|---|---|---|---|---|
| `npm run test:e2-09` | 0 | 42 | 42 | 0 | 0 |
| `npm test` (**run once locally**; CI will rerun it) | 0 | 165 | 163 | 0 | 2 |
| `npm run test:e2-08` | 0 | 25 | 25 | 0 | 0 |
| E2-04 `stabilizerUnit_test.js` | 0 | 11 | 11 | 0 | 0 |
| E2-04 `maskVolatile_test.js` | 0 | 4 | 4 | 0 | 0 |
| E2-04 `fullPageFloatingElement_test.js` | 0 | 3 | 3 | 0 | 0 |
| E2-04 `stableBetweenRuns_test.js` | 0 | 2 | 2 | 0 | 0 |
| E2-07 `authGuard_test.js` | 0 | 1 | 1 | 0 | 0 |
| E2-07 `paymentGuard_test.js` | 0 | 1 | 1 | 0 | 0 |
| `git diff --check` (tracked, plus new files through the temp index) | 0 | – | – | – | – |

- **`npm test` skips (2, both environment-only):**
  - YAML steps: `js-yaml` is not installed.
  - File symlink: needs Developer Mode or admin rights on this Windows host.
- **AC4:** passed on the first run, with no startup timeout and no rerun.
- **Count change:** `npm test` went from 156 to 165 tests because the 42 E2-09 tests replaced the earlier 33.
- **Earlier evidence:** results recorded for tree `8cc1913` (33/33; 156 tests) apply to that tree only. They are superseded by this run.
- **Linux CI:** still pending.

### 10.4 Next steps

- Review this diff and report.
- If approved:
  - commit on the implementation branch
  - integrate into the original PR #40 branch with the history-preserving merge method used for PR #39 (whole-tree reconciliation to the reviewed tree)
  - run CI on the new PR #40 head, then developer review
- Track D6 (redaction of existing overlay text in `actionLog`) separately.
