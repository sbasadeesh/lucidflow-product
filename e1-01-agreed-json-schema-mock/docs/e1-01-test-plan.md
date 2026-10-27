# E1-01 test plan

Story: Agreed JSON schema and mock payload.

These are plain Given–When–Then names for the acceptance criteria. The regression tests live in `tests/test_schema_contract.py` and `tests/test_schema.py`. The saved RED run remains in `docs/e1-01-red-test-log.md`.

The future contract requires `scan`, `detection`, `findings`, `evidence`, `kpis`, and `ai_payload`. It must allow zero, two, 100, 1,000, or more findings. `detection.result` may only be `yes`, `no`, or `could_not_assess`. Evidence must carry a URL, timestamp, state ID, rule ID, screenshot path, and DOM snippet. KPI counts must come from code. `ai_payload` may contain confirmed findings only. The dark-pattern taxonomy must contain exactly 13 entries. `include_responsible_business_appendix` must stay `false`, so the Responsible Business Practices appendix stays out of the report.

## Acceptance tests

1. Given a complete payload that meets the contract, when it is validated, then it passes.
2. Given a required top-level field is missing, when it is validated, then it fails with a clear message that names the missing field.
3. Given a valid payload with two findings, when it is validated, then it passes.
4. Given a valid payload with zero findings, when it is validated, then it passes.
5. Given `detection.result` is outside `yes`, `no`, and `could_not_assess`, when it is validated, then it fails.
6. Given a finding has no evidence link, when it is validated, then it fails.
7. Given a rejected finding appears in `ai_payload`, when it is validated, then it fails.
8. Given `include_responsible_business_appendix` is `true`, when it is validated, then it fails.
9. Given the dark-pattern taxonomy has fewer than 13 entries, when it is validated, then it fails.
10. Given a finding uses a severity the contract does not allow, when it is validated, then it fails.

## Edge case

11. Given a payload with 1,000 findings and a matching evidence row for each finding, when it is validated, then it passes, because `findings` and `evidence` must not have a maximum length.

No fixture file is stored for the 1,000-finding case in this step. The RED test can build that payload when the tests are written.
