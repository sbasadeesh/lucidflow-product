# State fingerprint and action journal — proposed recovery contract

> **Status: PROPOSED.** This contract was written for the local recovery of PR #39 (`feat/lf-w1-p0a-e2-008-state-fingerprints-and-action-journal`), based on that branch's stated purpose. **It is not a recovered E2-08 specification.** Earlier planning called E2-08 "hotspot-directed execution", and no local document resolves that mismatch. This work does not complete E2-08.

Both utilities are **standalone**. Nothing in the scan engine, `server.js`, `/api/script` or the saved scan schema uses them yet (see "Deferred integration").

## 1. State fingerprint — `stateFingerprinter/stateFingerprinter.js`

`getStateFingerprint(page, options?)` returns:

```
{ version: 1, hash: "<64 hex chars>", counts: { textBlocks, controls, sensitiveControls, overlays } }
```

The hash is SHA-256 of a JSON list of the supported signals, in document order. The result contains **no page text, field values or DOM**, only the hash and the counts.

### 1.1 Supported signals

| Signal | What is used | Normalisation |
|---|---|---|
| Visible text | each text node under `<body>` whose parent element passes `checkVisibility({ checkOpacity, checkVisibilityCSS })` | whitespace collapsed to one space, trimmed, empty nodes dropped |
| Checkbox / radio | `checked`, plus the field's `name` or `id` | none |
| Text-like inputs and `<textarea>` | the current `value`, plus `name` or `id`; **visible fields only** | none (the exact value) |
| `<select>` | indexes of the selected options, plus `name` or `id`; **visible fields only** | none |
| Overlays | elements matching `overlaySelectors` that are visible **and** have a non-zero size: tag, `role`, `aria-modal` | none |

`overlaySelectors` defaults to the list used by the original PR #39 code: `[role="dialog"]`, `[aria-modal="true"]`, `.popup`, `.overlay`, `.modal`. A matching element that is `display:none`, `visibility:hidden`, `opacity:0` or zero-sized **does not count**.

### 1.2 What is never used
- **`<input type="hidden">`:** for example tokens.
- **Values of these types:** `password`, `tel`, `file`, and the button types.
- **Fields flagged by the runner's sensitive-field rule:** a field flagged by `isSensitiveField` in `stateScriptRunner.js` contributes only its presence (`counts.sensitiveControls`): no value, no checked state, no selection. It is the same rule and the same `sensitivePattern` from `stateScript.config.js` that stops `type` steps from typing into phone, OTP, vehicle, card or password fields.
- **Ignored elements:** anything inside an element matching `ignoreSelectors`.

### 1.3 Dynamic content
- **No timer inference.** Text such as "9:30" or "ends in" is ordinary page content and stays in the fingerprint.
- **Configured selectors only.** Dynamic content is normalised only when its container matches a configured `ignoreSelectors` entry (`stateFingerprinter/stateFingerprint.config.js`, empty by default, or `options.ignoreSelectors`).
- **Invalid selectors are rejected.** An invalid selector list throws a `TypeError`.

### 1.4 What a fingerprint does not capture
A fingerprint is not a picture of the page. It does not see:
- styling and layout, including colour, position and CSS-only state changes
- images, canvas and video
- `contenteditable` content
- shadow DOM and iframes
- a custom control whose state is not stored in a native `checked`, `value` or `selected` property
- application state that does not reach these DOM signals

Two different-looking pages can therefore have the same fingerprint.

### 1.5 What it does not do
- It does not de-duplicate states.
- It does not suppress or delete screenshots or other evidence.
- It does not stop a scan.
- **No collision codes:** the PR's `STATE_FINGERPRINT_COLLISION` and `STATE_OVERLAY_CHANGED` codes are not part of this contract.

## 2. Action journal — `actionJournal/actionJournal.js`

`buildActionJournal(runResult)` takes the result of `runStateScript` (from `stateScriptRunner.js`) after the run, and returns:

```
[{ index, action, outcome, reason }, ...]
```

| Field | Value |
|---|---|
| `index` | the step number in the script |
| `action` | `click`, `hover`, `type`, `wait`, `capture`; `null` for a missing or unknown action (the action text is not copied) |
| `outcome` | `"ok"` only when the runner recorded `"ok"`; any other status is `"failed"` |
| `reason` | `null` for `"ok"`; otherwise a fixed code (below) |

Reason codes are mapped from the runner's failure messages:
- **Script problems:** `MISSING_ACTION`, `UNKNOWN_ACTION`, `MISSING_SELECTOR`, `MISSING_TEXT`, `INVALID_WAIT`.
- **Element and step failures:** `ELEMENT_NOT_FOUND`, `INVALID_SELECTOR`, `CLICK_FAILED`, `HOVER_FAILED`, `TYPE_FAILED`, `WAIT_TIMEOUT`, `SCREENSHOT_FAILED`.
- **Safety refusal:** `SENSITIVE_FIELD_REFUSED`.
- **Anything else:** `UNEXPECTED_ERROR`, or `STEP_FAILED` as the fallback.

Rules:
- **Order:** one entry per **attempted** step, in script order. Steps the runner skipped (state cap reached, or stopOnFail after a failure) are left out; they remain in the runner's own `steps` list.
- **Runner behavior is untouched.** The runner itself is unchanged: an unknown action still fails with `Unknown action "…"`, and the run status is still `completed_with_failures`.
- **Nothing sensitive is copied.** The journal never contains typed text, selectors, unknown action names, runner messages, browser error text, cookies, tokens or DOM.
- **The run result is unchanged.** Building the journal does not modify the run result or add a field to it.
- **Invalid input is rejected.** Input that isn't a run result with a `steps` list throws a `TypeError`, rather than returning an empty journal.

## 3. Deferred integration (needs a decision)

Not done in this patch; each item changes a public contract:
1. **`/api/script` response:** return the journal (proposal: an `actionJournal` array with the shape above) and a per-state `fingerprint` (`{ version, hash }`).
2. **Saved scans / shared payload schema:** whether journals or fingerprints are persisted, and under which field names.
3. **Runner integration:** compute a fingerprint at each `capture` step (would add a field to `states`).
4. **De-duplication policy:** whether identical fingerprints may ever merge states, and what happens to their screenshots (evidence-first principle).
5. **Timestamps:** the journal currently has no timestamps. A format and timezone would need agreeing.
