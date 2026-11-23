# LucidFlow P0 Test Framework

**Version:** 1.0 Draft

**Owner:** Dev

**Applies to:** All P0 epics, features, rules, payloads, UI components, reports, and AI hand-off work

**Status:** Active working framework

---

## 1. Purpose

This framework defines how LucidFlow tests software during P0.

It applies these principles:

- Write tests before implementation for deterministic behaviour.
- Use saved fixtures and mock data rather than live websites for repeatable automated tests.
- Keep tests, fixtures, mock payloads, expected-result files, and evidence logs in the repository.
- Treat counts, KPIs, evidence, payload structure, and rule outcomes as code-derived facts.
- Treat AI output as wording that must be checked against the source payload.
- Record actual results and failures; never delete, skip, weaken, or fake tests to make a report look green.
- P0 scope is web pages, local fixtures, single URLs, and client-supplied journeys; performance, security, and full UAT are outside this framework unless separately approved.

The P0 strategy targets approximately 100 to 120 automated tests over the product, plus accuracy runs and gate acceptance checks. [file:173]

---

## 2. Mandatory TDD Cycle

Every deterministic feature and detection rule follows this cycle:

1. **Choose one behaviour** with a clear expected result.
2. **RED:** Create the test and fixture first; run it and save proof that it fails for the correct reason.
3. **GREEN:** Implement only enough code to make the test pass.
4. **REFACTOR:** Improve naming, duplication, and structure while keeping all tests green.
5. **PROVE:** Run the relevant suite, then the full suite where required.
6. **COMMIT:** Commit only when tests are green, unless the commit intentionally records a RED test step.

Rules:

- No detection-rule code without a failing test first.
- A real-world bug requires a regression test before the fix.
- Do not change a test merely to make it pass unless the requirement changed and the reason is documented.
- Unit tests must not make network calls.
- Tests must be independent and must not rely on execution order or shared mutable state.
- Every rule change requires the rule’s unit tests, related component tests, and the accuracy suite to be re-run. [file:173]

---

## 3. Repository Structure

Use this structure unless the project already has an approved equivalent:

```text
project-root/
├── src/
│   ├── capture/
│   ├── rules/
│   ├── payload/
│   ├── reports/
│   ├── ui/
│   └── validation/
├── tests/
│   ├── unit/
│   ├── component/
│   ├── integration/
│   ├── accuracy/
│   ├── acceptance/
│   └── helpers/
├── fixtures/
│   ├── html/
│   ├── payloads/
│   ├── journeys/
│   ├── expected/
│   └── README.md
├── labelled-set/
│   ├── manifest.csv
│   ├── held-out/
│   └── README.md
├── docs/
│   ├── TEST_FRAMEWORK.md
│   ├── test-evidence/
│   └── test-reports/
├── artifacts/
│   ├── test-runs/
│   ├── coverage/
│   ├── screenshots/
│   └── reports/
├── config/
│   └── test-config.json
├── schema.json
├── mock_payload.json
├── mock_payload_zero_findings.json
├── pytest.ini
└── requirements.txt
```

### Naming rules

| Asset | Naming pattern | Example |
|---|---|---|
| Unit test | `test_<feature_or_rule>.py` | `test_preselected_addon.py` |
| Component test | `test_<component>.py` | `test_payload_builder.py` |
| Integration test | `test_<flow>_integration.py` | `test_single_url_integration.py` |
| HTML fixture | `<rule>_<scenario>.html` | `preselected_addon_positive.html` |
| Expected result | `<fixture>.expected.json` | `preselected_addon_positive.expected.json` |
| Payload fixture | `<scenario>.json` | `payload_missing_evidence.json` |
| Screenshot evidence | `<scan_id>_<state_id>_<finding_id>.png` | `scan001_state01_find001.png` |
| Test evidence log | `<YYYY-MM-DD>_<suite>.log` | `2026-10-21_full-suite.log` |

Each fixture must have an expected-result file or clearly documented expected outcome. Never remove fixtures that support active or previously completed tests. [file:173]

---

## 4. Test Levels

| Level | Purpose | Target | Run frequency | Primary owner |
|---|---|---:|---|---|
| Unit | One rule/function against a small fixture | 3 to 5 per rule; 40 to 60 total | Every save and commit | Dev / DI |
| Component | One subsystem such as payload builder or KPI calculator | 8 to 10 per component; about 50 total | Every commit | Dev / I1 / I2 |
| Integration | URL/fixture through payload and report workflow | 12 to 15 | Every commit or nightly | Dev / I1 / I2 |
| Accuracy | Precision and recall on labelled data | One run per rule change; full weekly run | Weekly and at G5 | DI / TI / Dev |
| Acceptance | Gate demonstrations and observable product outcomes | One per gate | At each gate | PO / DI / Dev |
| Evidence | Screenshot and source-evidence completeness | Included in component/integration tests | Every payload/report change | I1 / Dev |
| AI-text | AI output grounded in payload facts and cautious wording | Included in hand-off tests | Every AI hand-off change | PO / DI / Dev |

The test strategy proposes 3 to 5 tests per rule, including at least two positive cases, one negative case, and one edge or boundary case where relevant. [file:173]

---

## 5. Quality Gates

| Gate | Required check | Pass condition | Fail condition | Evidence |
|---|---|---|---|---|
| G0 | Schema and mock payload | Schema validates mock payload; I1, I2, and DI sign off | Teams use conflicting contract fields | Validator output and confirmations |
| G1 | Detection result | At least 4 out of 5 labelled URLs/fixtures correct | Fewer than 4 correct | Labelled-run report |
| G2 | KPI accuracy | Counts exactly match manual/domain-reviewer count on 5 examples | Any mismatch | KPI verification report |
| G3 | Evidence completeness | Every finding has screenshot, timestamp, URL, and state | Any evidence gap | Evidence audit report |
| G4 | Report from payload | Three real payloads render without manual fact edits | Manual fact edits needed | Render tests and report output |
| G5 | Accuracy | Meets agreed precision, recall, repeatability, and coverage targets | Any agreed threshold missed | Accuracy report and coverage report |
| G6 | Customer demo | Assessment PDF and CAP produced; each finding reviewed | Unreviewed finding or crash | Demo checklist and review log |

Proposed G5 targets are: overall precision at least 80%, overall recall at least 70%, per-rule precision at least 70%, no more than two false positives across ten clean pages, no false negative for must-catch rules, 100% repeatability, and at least 80% line coverage for rule-library code. These are proposed targets and must be confirmed at G0. [file:173]

---

## 6. Test Framework Tasks

Complete applicable tasks for every epic and feature. Tasks marked **Required** are mandatory for production-ready P0 work.

| ID | Task | Test level | Owner | Done when |
|---|---|---|---|---|
| TF-01 | Define the feature’s acceptance criteria in Given–When–Then form | Planning | Feature owner | Criteria are testable and approved |
| TF-02 | Add a test plan entry with IDs, expected behaviour, and evidence locations | Planning | Dev | Test plan is linked to the story |
| TF-03 | Identify fixture and mock-data needs before coding | Planning | Dev / TI | Fixture list is documented |
| TF-04 | Create valid fixture(s) with expected-result files | Fixture | Dev / TI | Fixtures are valid and named correctly |
| TF-05 | Create invalid/negative fixture(s) where applicable | Fixture | Dev / TI | Invalid cases have expected failures |
| TF-06 | Write RED unit tests before deterministic implementation | Unit | Dev | Tests fail for the intended reason |
| TF-07 | Save RED test command output | Evidence | Dev | Output is stored in `artifacts/test-runs/` or `docs/test-evidence/` |
| TF-08 | Implement minimum code to pass unit tests | Unit | Dev | Targeted unit tests pass |
| TF-09 | Add positive rule tests | Unit | Dev / DI | At least two positive scenarios are covered |
| TF-10 | Add negative rule test | Unit | Dev / DI | Legitimate scenario returns no finding |
| TF-11 | Add edge-case test | Unit | Dev / DI | Missing/hidden/dynamic case is handled safely |
| TF-12 | Add boundary test where a threshold exists | Unit | Dev / DI | Just-above and just-below threshold cases are tested |
| TF-13 | Add rule metadata/version test | Component | Dev | Rule ID, version, rationale, and metadata are validated |
| TF-14 | Add rule-runner resilience test | Component | Dev | One broken rule does not stop other rules |
| TF-15 | Add payload schema-valid test | Component | Dev / I1 | Valid payload validates against `schema.json` |
| TF-16 | Add payload schema-invalid test | Component | Dev / I1 | Missing/invalid fields fail with clear messages |
| TF-17 | Add zero-findings payload test | Component | Dev / I1 | Empty valid scan produces valid zero KPIs |
| TF-18 | Add KPI-calculation test | Component | Dev | Total/category/severity counts match findings exactly |
| TF-19 | Add evidence-completeness test | Component | Dev / I1 | Every finding has URL, timestamp, state, screenshot, and DOM evidence |
| TF-20 | Add finding-status/AI-filter test | Component | Dev / I1 | Rejected findings do not appear in report/AI payload |
| TF-21 | Add render/capture success test | Component | Dev / I1 | Page, DOM snapshot, and screenshot are saved |
| TF-22 | Add blocked/error/timeout test | Component | Dev / I1 | Failure is explicit and returns `could_not_assess` rather than false “no” |
| TF-23 | Add report-renderer payload test | Component | I2 | Report renders from mock and real payloads without changing facts |
| TF-24 | Add UI input/result test | Component | I2 | URL validation and yes/no/could-not-assess result show correctly |
| TF-25 | Add integration test for a known dark-pattern fixture | Integration | Dev / I1 | Fixture flows to finding, evidence, payload, and report |
| TF-26 | Add clean-page integration test | Integration | Dev / I1 | Clean fixture returns `no` with zero findings |
| TF-27 | Add multi-state integration test | Integration | Dev / I1 | Findings carry state IDs across interactions |
| TF-28 | Add multi-page journey integration test | Integration | Dev / I1 | Journey preserves session and captures cross-page findings |
| TF-29 | Add unreachable-page integration test | Integration | Dev / I1 | Error state returns with no misleading report |
| TF-30 | Add repeatability test | Integration | Dev / TI | Same fixture run twice produces identical findings |
| TF-31 | Build and maintain labelled set manifest | Accuracy | TI / DI | At least 30 labelled URLs/fixtures are documented |
| TF-32 | Add held-out labelled examples | Accuracy | TI / DI | 5 to 10 examples are inaccessible to routine tuning |
| TF-33 | Run per-rule precision and recall | Accuracy | DI / Dev | TP, FP, FN, precision, and recall are recorded |
| TF-34 | Record must-catch rule outcomes | Accuracy | DI / Dev | No false negatives on must-catch rules |
| TF-35 | Run evidence audit | Evidence | I1 / Dev | 100% of exported findings contain mandatory evidence |
| TF-36 | Run AI-text grounding checks | AI-text | Dev / DI / PO | No invented URLs, counts, patterns, or legal conclusions |
| TF-37 | Run full suite and coverage | Proof | Dev | Full suite passes and coverage output is saved |
| TF-38 | Run lint and static checks | Proof | Dev | Lint passes or documented configuration gap exists |
| TF-39 | Produce a test-results table | Proof | Dev | What/how/command/result/evidence are recorded |
| TF-40 | Review results and classify defects | Review | Dev / DI / PO | Critical/high blockers are resolved or gate is blocked |

---

## 7. Required Test Matrix

Create and maintain this table for every implemented feature in:

```text
docs/test-reports/<story-id>-test-results.md
```

| Test ID | Feature / rule | What is tested | How it is tested | Fixture or input | Command | Expected result | Actual result | Evidence path | Status |
|---|---|---|---|---|---|---|---|---|---|
| Example: E3-02-U01 | Pre-selected add-on | Checked optional add-on is flagged | Unit test invokes rule on HTML fixture | `fixtures/html/preselected_addon_positive.html` | `python -m pytest tests/unit/test_preselected_addon.py -q` | One finding | Record actual result | `artifacts/test-runs/...` | PASS / FAIL |
| Example: E5-02-C01 | KPI calculator | Counts equal findings list | Component test with known finding set | `fixtures/payloads/kpi_known_counts.json` | `python -m pytest tests/component/test_kpi_calculator.py -q` | Exact totals by category and severity | Record actual result | `artifacts/test-runs/...` | PASS / FAIL |
| Example: E1-01-C01 | JSON schema | Valid mock payload validates | Schema validation test | `mock_payload.json` | `python -m pytest tests/component/test_schema_contract.py -q` | Validation passes | Record actual result | `artifacts/test-runs/...` | PASS / FAIL |

Rules:

- Do not write “PASS” before the command has actually run.
- Use “BLOCKED” if tools, dependencies, or input data are missing.
- Use “NOT RUN” only before execution.
- Save full terminal output in a log file; the table should link to that log.
- Include both RED and GREEN results where TDD is used.

---

## 8. Standard Commands

Adapt paths only if the repository defines different approved commands.

### Run a focused unit test

```powershell
python -m pytest tests/unit/test_<rule_name>.py -q
```

### Run all unit tests

```powershell
python -m pytest tests/unit -q
```

### Run component tests

```powershell
python -m pytest tests/component -q
```

### Run integration tests

```powershell
python -m pytest tests/integration -q
```

### Run full suite

```powershell
python -m pytest -q
```

### Run full suite with coverage

```powershell
python -m pytest -q --cov=src --cov-report=term-missing --cov-report=xml:artifacts/coverage/coverage.xml --cov-report=html:artifacts/coverage/html
```

### Run a schema-contract test

```powershell
python -m pytest tests/component/test_schema_contract.py -q
```

### Save command output in PowerShell

```powershell
New-Item -ItemType Directory -Force artifacts/test-runs | Out-Null
python -m pytest -q 2>&1 | Tee-Object -FilePath artifacts/test-runs/full-suite.log
```

### Check whitespace errors before commit

```powershell
git diff --check
```

### Check repository state

```powershell
git status
```

---

## 9. Evidence Requirements

Every significant test run must have evidence saved under:

```text
artifacts/test-runs/
```

or, if generated artifacts are intentionally excluded from Git:

```text
docs/test-evidence/
```

Each evidence record must include:

| Field | Requirement |
|---|---|
| Test run ID | Unique ID, date, story ID, and suite |
| Date/time | Use local time with timezone or UTC |
| Git branch | Branch used for the run |
| Commit SHA | Current commit, if available |
| Command | Exact command executed |
| Environment | Python version and operating system |
| Input | Fixture, payload, URL, or labelled-set version |
| Result | PASS, FAIL, BLOCKED, or NOT RUN |
| Console log | Complete output, including errors |
| Coverage | Total and per-file results when coverage runs |
| Reviewer | Person who reviewed the evidence, if applicable |

Use this run-log template:

```md
# Test Run: <RUN-ID>

- Story / feature:
- Test level:
- Date and time:
- Branch:
- Commit:
- Operator:
- Environment:
- Command:
- Input fixtures / payloads:
- Expected result:
- Actual result:
- Status:

## Console output

```text
Paste unedited command output here.
```

## Notes

- Failures:
- Follow-up action:
- Evidence files:
```

---

## 10. Accuracy Framework

The accuracy suite uses a labelled set of at least 30 URLs or fixtures:

| Set type | Target quantity | Purpose |
|---|---:|---|
| Known-pattern cases | About 15 | Confirm rules detect expected patterns |
| Clean pages | About 10 | Measure false positives |
| Tricky legitimate cases | About 5 | Prevent over-detection, such as statutory disclosure or KYC |
| Held-out cases | 5 to 10 | Prevent tuning only to development data |

Each labelled item must record:

| Field | Description |
|---|---|
| Label ID | Stable unique identifier |
| Fixture / URL | Local path or approved URL |
| Pattern expected | Pattern ID or `none` |
| Rule expected | Rule ID(s) expected to trigger |
| Domain reviewer | Reviewer who supplied/approved the label |
| Label date | Date created or approved |
| Set type | Known pattern, clean, tricky legitimate, or held-out |
| Notes | Context, exceptions, or limitations |

Use:

\[
\text{Precision} = \frac{TP}{TP + FP}
\]

\[
\text{Recall} = \frac{TP}{TP + FN}
\]

For every rule, report TP, FP, FN, precision, recall, false-positive examples, false-negative examples, and the decision: pass, experimental, disabled, or needs review. [file:173]

---

## 11. Evidence and Visual Checks

For every exported finding, verify:

- URL exists.
- Timestamp exists.
- State ID exists.
- Rule ID exists.
- Screenshot path exists and points to a non-empty file.
- DOM snippet exists.
- Finding references valid evidence.
- Evidence belongs to the same scan/session as the finding.

Visual snapshot testing is optional for P0 report layout. If added, mask dynamic content and record the accepted baseline and pixel-difference threshold. Visual test failures must be reviewed rather than automatically accepted. [file:173]

---

## 12. AI-Text Checks

AI-generated content is not accepted as a source of facts.

Every AI-text test must verify:

- No new URL appears that is absent from the source payload.
- No new finding, pattern, category, count, severity, or evidence claim is invented.
- Counts in text match code-derived payload KPIs.
- Rejected findings do not appear.
- Language uses cautious wording such as “potential finding” rather than legal conclusions such as “violation” or “non-compliant.”
- Output fits the report or CAP template slot.
- Required output fields are present.

---

## 13. Defect Handling

| Severity | Example | Action |
|---|---|---|
| Critical | Incorrect KPI count, finding without evidence, crash on normal URL | Blocks the current gate and release |
| High | Must-catch rule misses a known pattern | Blocks G5 and requires correction |
| Medium | Layout problem or non-critical rule below target | Document, prioritise, fix if time allows |
| Low | Cosmetic issue | Add to backlog |

A test failure must create or link to a defect record with: ID, title, severity, affected feature/rule, reproduction fixture, expected result, actual result, owner, status, and proof of fix.

---

## 14. Definition of Done

A feature, rule, or story is complete only when:

- Acceptance criteria are represented by tests.
- Required fixtures and expected-result files exist.
- RED test proof was captured when applicable.
- Targeted tests pass.
- Related component and integration tests pass.
- No required tests are skipped without a documented reason.
- Payloads validate against the current schema where relevant.
- KPI counts match findings where relevant.
- Every finding includes required evidence where relevant.
- AI output is checked against payload facts where relevant.
- Full suite output is saved.
- Coverage is captured where configured.
- Lint/static checks are clean where configured.
- Test-result table is updated with actual results.
- Critical and high defects are closed.
- Reviewer confirmation is collected where the story requires it.
- Documentation and evidence are committed with the code.

---

## 15. Pull Request Checklist

Before requesting review:

- [ ] Branch is current with `main`.
- [ ] Targeted tests were run.
- [ ] Full test suite was run.
- [ ] Coverage output was saved.
- [ ] Lint/static checks were run or the missing configuration is documented.
- [ ] `git diff --check` passes.
- [ ] Test-results table has actual results and evidence paths.
- [ ] Fixtures, mocks, expected results, and tests were retained.
- [ ] No tests were deleted, skipped, weakened, or marked xfail without an approved requirement change.
- [ ] RED/GREEN evidence is available for TDD work.
- [ ] New defects are logged and severity is assigned.
- [ ] Screenshots/report outputs are attached where relevant.
- [ ] Reviewer instructions are included.

---

## 16. Team Responsibilities

| Role | Testing responsibility |
|---|---|
| Dev | Maintains framework, CI, schema tests, payload tests, rule runner tests, full-suite evidence |
| I1 | Engine, capture, evidence, state, journey, and payload-builder tests |
| I2 | Streamlit UI, report rendering, PDF/CAP, and visual/manual presentation checks |
| DI | Labels domain examples, validates taxonomy/category/severity, reviews false positives/negatives |
| TI | Builds and maintains fixture and labelled sets, maintains expected outcomes, supports regression runs |
| PO | Approves gate thresholds, scope changes, acceptance outcomes, and customer-demo readiness |
| Infra | Maintains CI environment, test dependencies, secrets safety, storage, and accessibility |

---

## 17. Change Control

Changes to this framework require:

1. A documented reason.
2. Review by Dev and PO.
3. Update to this file.
4. Communication to all affected owners.
5. A test or evidence update where the change affects validation behaviour.

Do not reduce quality thresholds, remove tests, or change expected outcomes merely to close a story. Record actual outcomes and seek formal agreement if a target needs revision. [file:173]