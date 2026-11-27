# LucidFlow Component Map

## Component-to-Test Mapping

| Component | Source Folder(s) | Test Folder (Grouped) | Ticket(s) | npm script |
|-----------|------------------|-----------------------|-----------|------------|
| render-contract | `backend/src/modules/renderContract/` | `tests/render-contract/` | E2-01 | `test:e2-01` |
| dom-evidence | `backend/src/capture/DOMcapture.js`, `backend/src/capture/stateScriptRunner.js` | `tests/dom-evidence/` | E2-02 | `test:e2-02` |
| screenshot-capture | `backend/src/capture/capture.js`, `backend/src/capture/screenshotStabilizer.js` | `tests/screenshot-capture/` | E2-03 | `test:e2-03` |
| server-integration | `backend/src/server.js`, integration with capture | `tests/server-integration/` | E2-03 | `test:e2-03` |
| screenshot-stability | `backend/src/capture/screenshotStabilizer.js` | `tests/screenshot-stability/` | E2-04 | None (manual) |
| state-scripts | `backend/src/capture/stateScriptRunner.js` | `tests/state-scripts/` | E2-05 | `test:e2-05` |
| error-handling | `backend/src/modules/errorHandler/`, `backend/src/server.js` | `tests/error-handling/` | E2-06 | None (included in root) |
| guards | `backend/src/modules/security-guard/`, `backend/src/modules/payment-guard/` | `tests/guards/` | E2-07 | None (included in root) |
| state-fingerprint | `backend/src/modules/stateFingerprinter/` | `tests/state-fingerprint/` | E2-08 | `test:e2-08` |
| overlay-observation | `backend/src/modules/overlayObservation/` | `tests/overlay-observation/` | E2-09 | `test:e2-09` |
| readiness | `backend/src/modules/readiness/` | `tests/readiness/` | E2-10 | `test:e2-10` |
| context-matrix | `backend/src/modules/contextMatrix/` | `tests/context-matrix/` | E2-11 | `test:e2-11` |
| provenance | `backend/src/modules/provenance/cleanup.js`, `backend/src/modules/provenance/provenance.js` | `tests/provenance/` | E2-14 | `test:e2-14` |

## Data Flow

**Server Request → Evidence Collection → Output:**

1. **server.js** (E2-03/server-integration): Receives HTTP requests, coordinates the scan workflow
2. **capture/DOMcapture.js** (E2-02/dom-evidence): Captures DOM state, processes selectors, extracts computed styles
3. **capture/stateScriptRunner.js** (E2-05/state-scripts): Runs state computation scripts provided by the application
4. **capture/screenshotStabilizer.js** (E2-04/screenshot-stability): Waits for page stability and handles volatile elements
5. **modules/stateFingerprinter/** (E2-08): Hashes state snapshots to detect changes across steps
6. **modules/overlayObservation/** (E2-09): Observes DOM changes via MutationObserver before/after each capture
7. **modules/provenance/** (E2-14/provenance): Records metadata and cleans up temporary files after scan
8. **modules/security-guard/, payment-guard/** (E2-07/guards): Guards enforce access control and payment validation
9. **modules/renderContract/** (E2-01/render-contract): Validates evidence output against JSON schema

**Error & Context Handling:**
- **errorHandler/** (E2-06/error-handling): Centralized error classification and recovery
- **readiness/** (E2-10/readiness): Checks page readiness before each capture
- **contextMatrix/** (E2-11/context-matrix): Tracks browser contexts and test isolation
