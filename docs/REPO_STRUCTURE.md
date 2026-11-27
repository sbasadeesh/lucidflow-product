# Repository structure

Production layout for LucidFlow (branch `refactor/repo-structure`). Runtime output directories `scans/`, `screenshots/`, and `snapshots/` stay at the **repository root** and are created there; paths are defined in `backend/src/config/paths.js` (`REPO_ROOT`, `SCANS_DIR`, `SCREENSHOTS_DIR`, `SNAPSHOTS_DIR`). Do not add new `__dirname` arithmetic for those folders.

```text
.
├── backend/
│   └── src/
│       ├── server.js              # Express scan engine entry
│       ├── config/                # paths.js + *.config.js defaults
│       ├── capture/               # Playwright capture, DOM, screenshots, scripts
│       └── modules/               # Feature modules (dom evidence, guards, provenance, …)
├── frontend/                      # React + Vite UI (package name: lucidflow-frontend)
├── packages/
│   └── schema-contract/           # E1-01 JSON schema + pytest validators
├── tests/
│   └── E2-*_tests/                # Node integration/unit suites (names unchanged)
├── docs/                          # Product and validation documentation
├── .github/workflows/             # CI
├── package.json                   # Backend deps + npm test orchestration
├── scans/                         # Generated scan summaries (gitignored)
├── screenshots/                   # Generated PNG output (gitignored)
└── snapshots/                     # DOM capture output (legacy tracked files may remain)
```

## Folder ownership

| Path | Owns |
|------|------|
| `backend/src/server.js` | HTTP API, scan orchestration, static `/screenshots` |
| `backend/src/config/` | Central paths and engine configuration |
| `backend/src/capture/` | Browser automation, stabilizer, script runner, scan persistence helpers |
| `backend/src/modules/domEvidence/` | Optional DOM/style evidence prototype |
| `backend/src/modules/security-guard/` | Payment/auth guard checks |
| `backend/src/modules/stateFingerprinter/` | State fingerprinting |
| `backend/src/modules/actionJournal/` | Action journal |
| `backend/src/modules/overlayObservation/` | Overlay recurrence observation (off by default) |
| `backend/src/modules/context_analyzer/` | Context matrix analysis |
| `backend/src/modules/provenance/` | Provenance metadata + temp cleanup (was `Provenance & cleanUp`) |
| `frontend/` | Operator UI, Vitest component tests |
| `packages/schema-contract/` | Shared payload schema and Python contract tests |
| `tests/E2-*_tests/` | Regression and integration tests against the real engine |

## How to run

From the repository root (requires Node 18+, Playwright browsers after `npm ci`):

```bash
npm ci
npx playwright install chromium   # if browsers are missing
npm start                         # backend on PORT (default 5000)
npm test                          # full E2 regression slice in package.json
```

Frontend (`frontend/`):

```bash
cd frontend
npm ci
npm run dev          # Vite dev server
npm run build
npm run lint
npm run test:run
```

Schema package (`packages/schema-contract/`):

```bash
cd packages/schema-contract
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt   # Windows
pytest -q
```

## Generated / ignored paths

`.gitignore` includes: `node_modules/`, `dist/`, `.env`, `scans/`, `screenshots/`, `scripts/`, `__pycache__/`, `*.pyc`, `.pytest_cache/`, plus frontend `node_modules` and build output under `frontend/dist/`.