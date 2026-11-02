# Schema note

The contract file is `schema.json`, Draft 2020-12, version v3.0. The two-finding example is `mock_payload.json`. The zero-finding example is `mock_payload_zero_findings.json`. Shared lists live in `config/schema_contract_config.json`. Structural rules stay in `schema.json`.

## Top-level fields

`scan` records the run. `detection` records yes, no, or could_not_assess. `findings` is the finding list and may be empty. `evidence` holds the captured proof for those findings. `kpis` holds counts calculated by code. `ai_payload` carries confirmed findings only.

The same payload also carries `report`, `assessment`, `executive_summary`, `cap_tracker`, `dark_pattern_taxonomy`, `methodology`, and `limitations`. The taxonomy has exactly 13 patterns. `report.include_responsible_business_appendix` is required and is always `false`.

Severity values `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`, and `OBSERVED` are provisional. DI has not approved them.

## Validation

`validate_payload.py` checks the payload with JSON Schema, then checks evidence links, CAP links, rule versions, taxonomy names, KPI arithmetic, and the AI hand-off. A finding that names a missing evidence id fails. A rejected finding id inside `ai_payload` fails. KPI values that do not match `findings` fail.

Run the contract tests with:

```powershell
python -m pytest e1-01-agreed-json-schema-mock/tests/test_schema_contract.py -q
```

## Changing the contract

Change `schema.json` for shape, types, and required fields. Change `config/schema_contract_config.json` when a shared list changes, and keep it identical to the schema. Update `mock_payload.json` and the fixtures in the same change. Do not add a maximum length to `findings` or `evidence`. Ask I1, I2, and DI to confirm before any schema tag is created.
