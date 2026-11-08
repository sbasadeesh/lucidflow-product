# E1-02 local commands

These commands are prepared and have not been run in the temporary worktree.

Temporary validation base: `93ab5e270de8557655c6afbb458f4b4687d1927b`.

This revision is the frontend correction. Its parent is `00310c372ef5f0986be0d1198d8652f058543444`, which is the current E1-02 branch and `origin/main`. Pull request 22 contains that correction and is not merged or approved.

## Python contract

Working directory: `e1-01-agreed-json-schema-mock`

```text
python -m pip install -r requirements.txt
python -m pytest -q
python -m ruff check .
```

`pytest` exits 5 when it collects no tests, so an empty suite does not pass. `ruff check` does not format files.

`requirements.txt` in this temporary worktree includes `pytest-cov>=5.0.0`. Coverage is collected for the validator module only:

```text
python -m pytest -q --cov=validate_payload --cov-report=term-missing --cov-report=xml
```

This measures `validate_payload.py`. It does not measure the frontend or backend. No percentage gate is configured. The command writes `coverage.xml`.

## Frontend

Working directory: `lucidflow-frontend`

```text
npm ci
npm run test:run
npm run lint
npm run test:coverage
npm run build
```

`npm ci` runs install scripts for `esbuild` and optional `fsevents`. The app has no `preinstall` or `postinstall`. Coverage uses the existing Vitest v8 configuration and writes `lucidflow-frontend/coverage`. The build writes `lucidflow-frontend/dist`. `npm run lint` does not use `--fix`. No coverage percentage is configured.

## Backend integration tests

Working directory: repository root.

```text
npm ci
npx playwright install --with-deps chromium
node --test E2-06_tests/http_status_test/http_status_test.js E2-06_tests/redirect_test/redirect_test.js E2-06_tests/could_not_assess_test/could_not_assess_test.js
```

These are browser and server integration tests. They launch Chromium, write under `scans/`, and one case calls a `.invalid` hostname. The root package has no coverage tool and no process-cleanup handler. Do not use bare `npm test` or bare `node --test`. These commands are not part of the workflow until the blockers below are accepted.
