# Schema required fields

Review package: v1.0 Draft. The schema file remains `schema.json` at version v3.0.

This note records the six required top-level fields for I1, I2, and DI review. Approval status is Pending. Nothing here is an approval.

| Reviewer | Role | Review focus | Status |
| --- | --- | --- | --- |
| I1 | Implementation reviewer | Field shape, required keys, and who produces each field | Pending |
| I2 | Implementation reviewer | Example payloads and how a consumer reads each field | Pending |
| DI | Domain reviewer | Severity scale, taxonomy names, and appendix exclusion | Pending |

Severity values in the schema are provisional until DI writes a confirmation.

## scan

Purpose: identify the assessment run and the rules used to classify pages.

Minimum contents: `scan_id`, `started_at`, `completed_at`, `input_urls`, `pages_scanned`, `states_captured`, `rule_versions`, and `status`.

Producer: the scanner. Consumer: the report, the CAP tracker, and the validator.

## detection

Purpose: state whether dark patterns were found.

Minimum contents: `result` and `reason`. `result` is `yes`, `no`, or `could_not_assess`.

Producer: the detection step. Consumer: the report summary and the validator.

## findings

Purpose: list every recorded finding. The array may be empty. It has no maximum length.

Minimum contents for each finding: `finding_id`, `pattern`, `category`, `severity`, `confidence`, `state_id`, `status`, and `evidence_ids`. Status supports `candidate`, `confirmed`, `rejected`, and `observed`.

Producer: the rules engine. Consumer: evidence linking, KPI calculation, the CAP tracker, and `ai_payload`.

## evidence

Purpose: keep the captured proof for each finding. The array may be empty when there are no findings. It has no maximum length.

Minimum contents for each item: `evidence_id`, `url`, `captured_at`, `state_id`, `rule_id`, `screenshot_path`, and `dom_snippet`. Every `findings[].evidence_ids` value must exist as an `evidence[].evidence_id`.

Producer: the capture step. Consumer: the finding record and the reviewer.

## kpis

Purpose: hold counts calculated from `findings`. AI output cannot supply these numbers.

Minimum contents: `total_findings`, `confirmed_findings`, `candidate_findings`, `rejected_findings`, `by_severity`, `by_category`, and `by_pattern`.

Producer: validator code. Consumer: the report summary and `ai_payload.facts_for_summary`.

## ai_payload

Purpose: hand confirmed findings to the writing step.

Minimum contents: `included_finding_ids`, `confirmed_findings`, `facts_for_summary`, `redactions_applied`, `contains_personal_data`, `contains_client_confidential_data`, and `generated_at`. Rejected findings are excluded. Both data flags stay `false`.

Producer: the payload builder after validation. Consumer: the AI writing step.
