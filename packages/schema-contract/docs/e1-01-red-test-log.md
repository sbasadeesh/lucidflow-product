# E1-01 RED test log

Story: Agreed JSON schema and mock payload. WBS step E1-01.08.

This is the PowerShell log from the failing schema-contract tests. The tests are the RED step. They are expected to fail until the fixtures match the contract.

## Command

Working directory: `C:\Users\HARI R\Desktop\Lucidflow Product\lucidflow-product`

```powershell
python -m pytest e1-01-agreed-json-schema-mock/tests/test_schema_contract.py -q
```

Exit code: `1`

Result: **8 failed, 2 passed in 0.91s**

## Passed

These two checks already match rules in the existing `schema.json`:

- A missing `scan` field fails, and the error names `scan`.
- `detection.result` of `maybe` fails because it is not `yes`, `no`, or `could_not_assess`.

## Failed

```text
FAILED test_given_valid_two_findings_when_validated_then_it_passes
AssertionError: valid_two_findings.json should pass schema validation.
<root>: Additional properties are not allowed ('case', 'findings_count', 'placeholder' were unexpected)
<root>: 'scan' is a required property
<root>: 'detection' is a required property
<root>: 'findings' is a required property
<root>: 'evidence' is a required property
<root>: 'kpis' is a required property
<root>: 'ai_payload' is a required property
<root>: 'report' is a required property
... 6 more validation errors

FAILED test_given_valid_zero_findings_when_validated_then_it_passes
AssertionError: valid_zero_findings.json should pass schema validation.
<root>: Additional properties are not allowed ('case', 'findings_count', 'placeholder' were unexpected)
<root>: 'scan' is a required property
<root>: 'detection' is a required property
<root>: 'findings' is a required property
<root>: 'evidence' is a required property
<root>: 'kpis' is a required property
<root>: 'ai_payload' is a required property
<root>: 'report' is a required property
... 6 more validation errors

FAILED test_given_a_missing_evidence_link_when_validated_then_it_fails
AssertionError: Expected a minItems error because a finding has no evidence link.
<root>: Additional properties are not allowed ('case', 'finding', 'placeholder' were unexpected)
<root>: 'scan' is a required property
<root>: 'detection' is a required property
<root>: 'findings' is a required property
<root>: 'evidence' is a required property
<root>: 'kpis' is a required property
<root>: 'ai_payload' is a required property
<root>: 'report' is a required property
... 6 more validation errors

FAILED test_given_a_rejected_finding_in_ai_payload_when_validated_then_it_fails
AssertionError: Expected an ai_payload error that rejects a rejected finding.
<root>: Additional properties are not allowed ('case', 'placeholder' were unexpected)
<root>: 'scan' is a required property
<root>: 'detection' is a required property
<root>: 'findings' is a required property
<root>: 'evidence' is a required property
<root>: 'kpis' is a required property
<root>: 'report' is a required property
<root>: 'assessment' is a required property
... 12 more validation errors

FAILED test_given_the_appendix_is_enabled_when_validated_then_it_fails
AssertionError: Expected a const error because include_responsible_business_appendix must be false.
<root>: Additional properties are not allowed ('case', 'include_responsible_business_appendix', 'placeholder' were unexpected)
<root>: 'scan' is a required property
<root>: 'detection' is a required property
<root>: 'findings' is a required property
<root>: 'evidence' is a required property
<root>: 'kpis' is a required property
<root>: 'ai_payload' is a required property
<root>: 'report' is a required property
... 6 more validation errors

FAILED test_given_fewer_than_13_taxonomy_patterns_when_validated_then_it_fails
AssertionError: Expected a minimum-size error because exactly 13 taxonomy patterns are required.
<root>: Additional properties are not allowed ('case', 'placeholder', 'taxonomy_count' were unexpected)
<root>: 'scan' is a required property
<root>: 'detection' is a required property
<root>: 'findings' is a required property
<root>: 'evidence' is a required property
<root>: 'kpis' is a required property
<root>: 'ai_payload' is a required property
<root>: 'report' is a required property
... 6 more validation errors

FAILED test_given_an_invalid_severity_when_validated_then_it_fails
AssertionError: Expected an enum error that rejects severity URGENT.
<root>: Additional properties are not allowed ('case', 'placeholder', 'severity' were unexpected)
<root>: 'scan' is a required property
<root>: 'detection' is a required property
<root>: 'findings' is a required property
<root>: 'evidence' is a required property
<root>: 'kpis' is a required property
<root>: 'ai_payload' is a required property
<root>: 'report' is a required property
... 6 more validation errors

FAILED test_given_1000_findings_and_matching_evidence_when_validated_then_it_passes
AssertionError: A payload with 1,000 findings and matching evidence should pass because findings and evidence have no maximum length.
<root>: 'report' is a required property
<root>: 'assessment' is a required property
<root>: 'executive_summary' is a required property
<root>: 'cap_tracker' is a required property
<root>: 'dark_pattern_taxonomy' is a required property
<root>: 'methodology' is a required property
<root>: 'limitations' is a required property
scan: 'scan_id' is a required property
... 17018 more validation errors
```

## Why this is expected

`schema.json` already exists, so the tests run against it. The fixture files are still placeholders, so the two valid payloads do not pass, and the invalid fixtures do not yet produce the specific evidence, rejected-finding, appendix, taxonomy, and severity errors. The 1,000-finding payload is rejected because the rest of the required contract is missing. That failure is not a maximum-length error.

## Later verification run

This section was added after the contract fixtures were completed. The RED log above is unchanged.

Working directory: `C:\Users\HARI R\Desktop\Lucidflow Product\lucidflow-product`

```powershell
python -m pytest e1-01-agreed-json-schema-mock/tests -q --tb=line
```

```text
........................................                             [100%]
40 passed in 1.52s
```

Exit code: `0`

```powershell
python -m ruff check e1-01-agreed-json-schema-mock
```

```text
All checks passed!
```

Exit code: `0`
