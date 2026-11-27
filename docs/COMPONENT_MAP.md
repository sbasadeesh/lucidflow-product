# LucidFlow Component Map (Corrected)

## Component-to-Test Mapping

| Component | Source Module(s) | Test Folder (Grouped) | Ticket(s) | npm script |
|-----------|------------------|-----------------------|-----------|------------|
| render-contract | `backend/src/server.js` (render contract validation) | `tests/render-contract/` | E2-01 | `test:e2-01` |
| dom-evidence | `backend/src/modules/domEvidence/`, `backend/src/capture/stateScriptRunner.js` | `tests/dom-evidence/` | E2-02 | `test:e2-02` |
| screenshot-capture | `backend/src/capture/capture.js` | `tests/screenshot-capture/` | E2-03 | `test:e2-03` |
| server-integration | `backend/src/server.js` (HTTP integration tests) | `tests/server-integration/` | E2-03 | `test:e2-03` |
| screenshot-stability | `backend/src/capture/screenshotStabilizer.js` | `tests/screenshot-stability/` | E2-04 | None (included in root) |
| state-scripts | `backend/src/capture/stateScriptRunner.js` | `tests/state-scripts/` | E2-05 | `test:e2-05` |
| error-handling | `backend/src/server.js` (error routes/guards) | `tests/error-handling/` | E2-06 | None (included in root) |
| guards | `backend/src/modules/security-guard/` | `tests/guards/` | E2-07 | None (included in root) |
| state-fingerprint | `backend/src/modules/stateFingerprinter/`, `backend/src/modules/actionJournal/` | `tests/state-fingerprint/` | E2-08 | `test:e2-08` |
| overlay-observation | `backend/src/modules/overlayObservation/` | `tests/overlay-observation/` | E2-09 | `test:e2-09` |
| readiness | `backend/src/capture/screenshotModule.js` (waitForReadiness) | `tests/readiness/` | E2-10 | `test:e2-10` |
| context-matrix | `backend/src/modules/context_analyzer/` | `tests/context-matrix/` | E2-11 | `test:e2-11` |
| provenance | `backend/src/modules/provenance/` | `tests/provenance/` | E2-14 | `test:e2-14` |

## Data Flow

**Server Request → Evidence Collection → Output:**

1. **server.js** (E2-03/server-integration): Receives HTTP requests, coordinates the scan workflow
2. **modules/domEvidence/** (E2-02/dom-evidence): Captures DOM state, processes selectors, extracts computed styles
3. **capture/stateScriptRunner.js** (E2-05/state-scripts): Runs state computation scripts provided by the application
4. **capture/screenshotStabilizer.js** (E2-04/screenshot-stability): Waits for page stability and handles volatile elements
5. **modules/stateFingerprinter/** + **modules/actionJournal/** (E2-08): Fingerprints state, tracks action history
6. **modules/overlayObservation/** (E2-09): Observes DOM changes via MutationObserver before/after each capture
7. **modules/provenance/** (E2-14/provenance): Records metadata and cleans up temporary files after scan
8. **modules/security-guard/** (E2-07/guards): Enforces access control and authentication validation
9. **server.js** (E2-01/render-contract): Validates evidence output against JSON schema

**Support & Context:**
- **server.js** (E2-06/error-handling): Error classification and HTTP error responses
- **capture/screenshotModule.js** (E2-10/readiness): Checks page readiness before each capture (waitForReadiness)
- **modules/context_analyzer/** (E2-11/context-matrix): Tracks browser contexts and test isolation

## Naming Debt

Real module folder names do not follow consistent conventions:
- `security-guard` (kebab-case, not `securityGuard`)
- `context_analyzer` (snake_case, not contextMatrix)
- `action Journal` (camelCase)
- `domEvidence`, `overlayObservation`, `stateFingerprinter` (camelCase)
- `provenance` (lowercase)

**Note**: These inconsistencies are pre-existing and not corrected in this phase.
