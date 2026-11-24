# Overlay recurrence observation — proposed contract (bounded local implementation)

> **Status: PROPOSED.** This contract was approved for a bounded local implementation during the recovery of PR #40 (`feat/lf-w1-p0a-e2-009-same-session-dismissal-observation-window`). **It is not a recovered E2-09 specification.** No authoritative E2-09 acceptance criteria were found locally, and this work does not complete the E2-09 story.

## 1. Purpose
Record, for internal inspection only, whether an overlay **matching** one that the engine **successfully dismissed** becomes visible again in the same page and on the same URL within a configured window. It is an **observation**:
- **No outcome change:** it never changes a scan's `status` or `result`.
- **Not a finding:** it never creates or classifies a dark-pattern finding.
- **No extra actions:** it never clicks, presses keys, hides or marks anything.

## 2. Configuration (`overlayObservation/overlayObservation.config.js`)

| Setting | Default | Override |
|---|---|---|
| `enabled` | `false` | exactly `LF_OVERLAY_OBSERVATION=1` (any other value, including `true`, `yes` and values with spaces, leaves it off) |
| `windowMs` | `3000` | `LF_OVERLAY_OBSERVATION_WINDOW_MS=<integer 1..60000>` |
| `maxTracked` | `10` per popup-wait call | — |

**How `windowMs` values are handled:**
- **Falls back to 3000, silently:** absent, empty, `0`, negative, non-numeric, decimal, exponent, `Infinity`, `NaN`, a leading zero, above the safe-integer range, or **above 60000**.
- **Accepted:** surrounding spaces are trimmed.
- **The 60000 ms cap is a proposed value:** the popup loops last at most 8 s, so a longer window can never complete.
- **When values are read:** once, when the engine starts.

When disabled, the engine makes no extra page calls, no hashing, no snapshots and no output, and its behavior is unchanged.

**What the override can do:** turn on a read-only observation that writes to standard output. It can't change scan behavior, outcomes, waits or saved data.

**CI note:** CI and other test suites **must not** set these variables. Engines started by other suites (for example E2-03 AC4 or the E2-06 `startEngine`) inherit the environment, and would then observe and print diagnostics too. The E2-09 tests remove both variables before starting their own engines.

## 3. Scope (where observation runs)
Only inside the three existing popup-wait loop invocations (`waitAndDismissPopups`):

| Phase label | Endpoint | Existing call |
|---|---|---|
| `screenshot_initial_wait` | `POST /api/screenshot` | `waitAndDismissPopups(page, record)`: before the full-page screenshot |
| `screenshot_post_scroll_wait` | `POST /api/screenshot` | `waitAndDismissPopups(page, record, { waitMs: 4000, minWaitMs: 1500 })`: after scrolling |
| `script_pre_wait` | `POST /api/script` | `waitAndDismissPopups(page, record, { waitMs: 4000, minWaitMs: 1500 })`: before the script |

**Not observed:**
- other `clearPopups` / `dismissOverlays` calls, such as the full-page tile hook and later passes
- `clearPopups` closures, such as cookie banners and generic close buttons
- the last-resort **hidden** dismissal in `dismissOverlays`
- JavaScript dialogs

**Tracked dismissals:** only confirmed **close-control** or **Escape** dismissals made by `dismissOverlays` inside those loops. "Confirmed" means the overlay is no longer visible after the existing check.

**No change to the loops:** no extra waits and no extra dismissal paths are added. The existing quiet-period exit and `waitMs` limit are kept exactly.

## 4. Observation states (one record per tracked dismissal)

| State | Meaning |
|---|---|
| `recurred` | A visible overlay matching the dismissed one (§5) was seen **within** `windowMs` (the deadline is inclusive) after dismissal, either at a tick poll or by the dismissal scan before it acted |
| `not_observed` | A poll was taken at or after `dismissedAt + windowMs`, and no sighting inside the window matched |
| `incomplete` | The window could not be completed. `reason` is one of the codes below |

**`incomplete` reasons:**
- `QUIET_EXIT`: the loop ended early through its existing quiet-period exit
- `BUDGET_ENDED`: the loop reached its existing `waitMs` limit
- `NAVIGATED`: the page URL changed after dismissal
- `PAGE_CLOSED`
- `SNAPSHOT_FAILED`: the read-only check, or the observer itself, failed

**Where sightings come from:**
- **Tick polls:** each tick polls the visible overlays **before** the tick's existing dismissal work.
- **The dismissal scan:** `dismissOverlays` reads each overlay's signature **before acting on it**. If that matches an open record within the window, the record is marked `recurred`. This covers an overlay that comes back after the poll but before the scan, for example while `clearPopups` runs.
- **Only `recurred`:** a scan sighting can only mark a record `recurred`. It never sets `not_observed` or any other ending.

**Rules:**
- **Closed records never change.** A recurrence is counted once, whether the poll or the scan sees it first.
- **Each repeated dismissal opens a new record.** Records are capped at `maxTracked` per loop, and dismissals beyond the cap are counted as `untracked` in the summary.
- **Early exit is never `not_observed`.** Any end of a loop before the window completes gives `incomplete`. A loop that ends without a poll after the deadline also gives `incomplete`.
- **Callers must not read `incomplete` as absence.** `not_observed` means only "not seen in the sampled sightings"; it doesn't prove the overlay never came back.
- **Sampling limit:** sightings happen only at polls (about every 0.5 to 1 s) and at dismissal scans. An overlay that appears and disappears between them is not seen.

**Failure isolation:** every observer call and the diagnostic output are guarded:
- a failed note or a failed output write is ignored
- a failed poll ends the open records as `SNAPSHOT_FAILED`

Observation failures never change dismissal behavior, counts, logs or outcomes. Real page and production errors, such as waiting on a closed page, still propagate as before.

## 5. Matching signature and its limits
A signature is a **matching signature, not a proven identity**. The code calls it "identity".

**Signature fields:**
- **Candidates:** read-only, in the page, using the same candidate rules as `dismissOverlays`.
- **Fields:**
  - tag name, `role` and `aria-modal`
  - `structureHash`: a hash of the counts of child tags, buttons, links and inputs, plus the `id` and class tokens
  - `textHash`: a hash of the normalized full `innerText`, computed **in the page**, plus `textLength`
  - a geometry bucket: position and size rounded to 40 px
- **`overlayId`:** the first 12 hex characters of a SHA-256 of the signature.
- **Match:** two overlays match only if **all** fields are equal.

**Limits:**
- **Identical overlays can't be told apart.** Showing the same element again, an identical replacement, and a distinct overlay with identical text, structure and position all **match**. The observation can't say which happened.
- **Changing text breaks the match.** Changing text (a countdown or a personalized greeting), movement or resizing beyond one bucket, or an entrance animation in progress when the signature is read can all prevent a match, so a real recurrence can be missed.
- **Randomized class names** make the signature less stable across page loads. That doesn't matter within one page session.
- **Not seen:** shadow DOM, iframes and canvas-drawn overlays.
- **No DOM marker is added.** The existing `data-popup-target` attribute is not part of the signature.

**Differences from `dismissOverlays`:**
- The candidate conditions and the outermost filter are the same.
- The snapshot doesn't add or clear `data-popup-target`, and returns no text.
- `textLength` is the normalized text length. `dismissOverlays` uses the raw length, but the two are never compared.
- For the second and later overlays found in one `dismissOverlays` call, the signature is read after the earlier overlays were handled.

## 6. Timestamps
Each record has:
- `dismissedAt`: when the dismissal was **confirmed**. That is about 600 ms after a close-control click and about 500 ms after Escape (the existing checks). An overlay that comes back before that check is treated by the existing logic as not dismissed, and isn't observed.
- `recurrenceObservedAt`: the first matching sighting, or `null`
- `observationEndedAt`
- `observedForMs = observationEndedAt − dismissedAt`: measured with the real clock, not configured

## 7. Privacy (new outputs only)
**Exact standard-output format:**
```
[overlay-observation] {"overlayId":"ov-<12 hex>","method":"close_control"|"escape","phase":"<phase>","state":"recurred"|"not_observed"|"incomplete","reason":null|"<reason>","dismissedAt":"<ISO>","recurrenceObservedAt":"<ISO>"|null,"observationEndedAt":"<ISO>","observedForMs":<int>,"windowMs":<int>}
[overlay-observation-summary] {"phase":"<phase>","windowMs":<int>,"tracked":<int>,"untracked":<int>,"recurred":<int>,"not_observed":<int>,"incomplete":<int>,"open":0}
```
- **Records:** one line per record when the loop ends.
- **Summary:** one line per enabled loop, even when nothing was tracked.
- **What they never contain:** overlay text, labels, selectors, field values, HTML, `id` or class names, URLs, or browser error messages. The URL is kept only in memory for the comparison, and caught errors are discarded.
- **Hashes aren't anonymization.** `overlayId` and the internal text hash could be used to confirm a **guessed** short overlay text.

**Existing exposure (unchanged):** `dismissOverlays` already writes up to 60 characters of overlay text into `actionLog`, which is returned and saved. Redacting that is a **separate tracked follow-up** (decision D6) and is not changed here.

## 8. How observations can be inspected (no public change)
- **No API or schema change:** no response field, saved-scan field or report field is added, and `actionLog` gets no new lines.
- **Standard output only:** the lines above. They are not saved and not returned.
- **Inspecting them:**
  - **Operators** read the engine's console.
  - **Tests** start the engine on a free port and read its output.
  - **Library callers** use `createOverlayObserver(...).records()` directly.

## 9. Limitations (summary)
- **N1:** `windowMs` falls back silently, and is capped at 60000 (proposed).
- **N3:** `dismissedAt` is the confirmation time, not the click time.
- **N5:** a reload or new document at the same URL isn't detected as `NAVIGATED` (hash changes and `pushState` are). A navigation in progress usually shows as `SNAPSHOT_FAILED`, which ends all open records.
- **N7:** the differences from `dismissOverlays` listed in §5.
- **N10:** hashes aren't anonymization (§7).
- **N11:** the candidate rules are **duplicated** in `overlaySnapshot.js` and `dismissOverlays`. A change to one must be made to both; there is no shared function yet.
- **N12:** repeated recurrences open new records, capped at 10 per loop and counted as `untracked` beyond that.
- **Sampling:** sightings happen only at polls and dismissal scans.

## 10. Not in scope
- outcome changes, findings and classification
- new response, saved-scan or report fields
- extra waits and new dismissal paths
- redaction of existing log text (D6)
- observation outside the three loops
