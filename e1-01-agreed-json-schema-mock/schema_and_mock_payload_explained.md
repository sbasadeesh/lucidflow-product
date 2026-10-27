# LucidFlow schema and mock payload guide

## Purpose

`schema.json` is the LucidFlow contract, version 3.0. It uses JSON Schema draft 2020-12. `mock_payload.json` is the one sample that follows it. That sample contains two confirmed findings.

The same contract can carry zero, 100, 1,000, or more findings. `findings`, `evidence`, and `cap_tracker.items` have no maximum length.

Every payload is one object. `additionalProperties` is `false`, so an undeclared field is invalid. These 13 sections are required, in this role:

| Section | Role |
| --- | --- |
| `scan` | The scan that produced the payload |
| `detection` | Whether dark patterns were detected, plus a human-readable reason |
| `findings` | One object per finding |
| `evidence` | Proof rows linked to those findings |
| `kpis` | Counts calculated in code from `findings` |
| `ai_payload` | Confirmed findings only, for writing assistance |
| `report` | PDF cover |
| `assessment` | Scope printed in the PDF |
| `executive_summary` | PDF narrative and theme cards |
| `cap_tracker` | CAP workbook rows |
| `dark_pattern_taxonomy` | The **What are dark patterns?** page, exactly 13 entries |
| `methodology` | How the assessment was carried out |
| `limitations` | What was not assessed |

Build the PDF and the CAP workbook from this one object. The PDF must include **What are dark patterns?** and all 13 taxonomy entries. The PDF must not include **APPENDIX — Responsible Business Practices Beyond Dark Patterns**. `include_responsible_business_appendix` accepts only `false`.

## scan

Required fields: `scan_id`, `started_at`, `completed_at`, `input_urls`, `pages_scanned`, `states_captured`, `rule_versions`, and `status`.

`started_at` and `completed_at` are ISO date-times. `input_urls` is an array of URLs. `pages_scanned` and `states_captured` are integers of 0 or more. `states_captured` is a count, not a list of state objects. Each `rule_versions` item has `rule_id` and `version`. `status` is `completed`, `partial`, or `failed`.

In `mock_payload.json`:

- `scan_id` is `SCAN-CHOLA-2026-001`.
- The scan runs from `2026-10-15T09:00:00Z` to `2026-10-15T12:00:00Z`.
- Three URLs are submitted, `pages_scanned` is `9`, and `states_captured` is `2`.
- The rules used are `DP-010` version `1.0.0` (Nagging) and `DP-004` version `1.0.0` (Forced Action).
- `status` is `completed`.

## detection

Required fields: `result` and `reason`.

`result` allows only `yes`, `no`, or `could_not_assess`. `reason` is a non-empty explanation.

The mock result is `yes`, because confirmed findings were recorded for nagging and forced action.

## findings

`findings` is an array with no `maxItems` limit. The mock has two items. An empty array is valid for a scan that records nothing.

Each finding must include `finding_id`, `rule_id`, `rule_version`, `pattern`, `category`, `severity`, `confidence`, `status`, `state_id`, `evidence_ids`, `created_at`, `title`, `page_name`, `page_scanned`, `remediation_effort`, `owner`, `why_this_matters`, `remediation_fix`, and `cap_id`. `root_cause` is optional. The mock includes it.

Allowed values:

- `severity`: `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`, `OBSERVED`
- `status`: `candidate`, `confirmed`, `rejected`, `observed`
- `remediation_effort`: `LOW EFFORT`, `MEDIUM EFFORT`, `HIGH EFFORT`
- `confidence`: a number from 0 to 1
- `evidence_ids`: at least one id
- `owner` and `remediation_fix`: at least one entry each
- `page_scanned`: a URL
- `created_at`: an ISO date-time

The mock findings:

| finding_id | pattern | rule | state | evidence | cap | confidence |
| --- | --- | --- | --- | --- | --- | --- |
| `F-001` | Nagging | `DP-010` `1.0.0` | `ST-001` | `E-001` | `CAP-001` | 0.86 |
| `F-002` | Forced Action | `DP-004` `1.0.0` | `ST-002` | `E-002` | `CAP-002` | 0.84 |

Both are `MEDIUM` and `confirmed`. `category` uses the same name as `pattern`. `F-001` is the Gaadi Bazaar vehicle listing overlay. `F-002` is bundled terms on the Gaadi Bazaar login page.

## evidence

`evidence` is an array with no `maxItems` limit. The mock has one proof row for each finding.

Each item must include `evidence_id`, `finding_id`, `url`, `captured_at`, `state_id`, `rule_id`, `screenshot_path`, and `dom_snippet`. `summary` is optional. The mock includes it.

| evidence_id | finding_id | state | rule | screenshot |
| --- | --- | --- | --- | --- |
| `E-001` | `F-001` | `ST-001` | `DP-010` | `artifacts/screens/f-001.png` |
| `E-002` | `F-002` | `ST-002` | `DP-004` | `artifacts/screens/f-002.png` |

`url` matches `page_scanned` on the finding. `captured_at` matches `created_at`.

## kpis

`kpis` allows only these fields. They are calculated from `findings`, not written by an AI model:

- `total_findings`
- `confirmed_findings`
- `candidate_findings`
- `rejected_findings`
- `by_severity`
- `by_category`
- `by_pattern`

The mock values match its two findings:

- `total_findings`: 2
- `confirmed_findings`: 2
- `candidate_findings`: 0
- `rejected_findings`: 0
- `by_severity`: `MEDIUM` 2
- `by_category`: Nagging 1, Forced Action 1
- `by_pattern`: Nagging 1, Forced Action 1

## ai_payload

`ai_payload` is the writing hand-off. It must contain confirmed findings only. Rejected findings, personal data, and client-confidential data stay out.

Required fields:

- `included_finding_ids`: `F-001` and `F-002` in the mock
- `confirmed_findings`: a short copy of each confirmed finding, with `finding_id`, `status`, `pattern`, and `severity`. `status` is locked to `confirmed`
- `facts_for_summary`: the same seven KPI figures as `kpis`
- `redactions_applied`: the mock lists rejected findings, personal data, and client-confidential data as excluded
- `contains_personal_data`: locked to `false`
- `contains_client_confidential_data`: locked to `false`
- `generated_at`: `2026-10-15T12:05:00Z` in the mock

## report

Required fields: `report_id`, `version`, `issue_date`, `prepared_for`, `product_name`, and `include_responsible_business_appendix`. `prepared_by` is optional. The mock sets it to `LucidFlow`.

The mock cover is report `LF-CHOLA-2026-001`, version `V1.0`, issued `2026-10-15`, prepared for Cholamandalam Investment and Finance Company Limited. The product name is `Dark Pattern Assessment Report`. `include_responsible_business_appendix` is `false`. There is no responsible-business-practices section anywhere in the schema or the mock.

## assessment

Required fields: `scope_name`, `scope_line`, `pages_screens_assessed`, `journey_urls`, `scan_started_at`, and `scan_completed_at`.

The mock scope is `Cholamandalam Investment and Finance Web journey`, with the line `9 pages/screens assessed`. `pages_screens_assessed` is `9`. The journey URLs and the start and end times match `scan`.

## executive_summary

Required fields: `potential_findings`, `high_critical`, `revalidated_closed`, `pattern_distribution`, `overall_posture`, and `priority_themes`.

In the mock, `potential_findings` is `2`, `high_critical` is `0`, and `revalidated_closed` is `0`. `pattern_distribution` is Nagging 1 and Forced Action 1, the same split as `kpis.by_pattern`. `overall_posture` is the cautious summary paragraph. `priority_themes` has two cards: Choice architecture, and Consent and data.

## cap_tracker

`sheet_name` is locked to `CAP Tracker`. `items` has no maximum length. The mock has one row per finding.

Each row must include `cap_id`, `finding_id`, `pattern`, `severity`, `page_scanned`, `root_cause`, `corrective_action`, `owner`, `due_date`, `status`, `revalidation_result`, `revalidated_on`, and `reviewer_comments`.

`status` is `OPEN`, `IN PROGRESS`, `CLOSED`, or `OVERDUE`. `revalidation_result` is `Not started`, `Passed`, `Failed`, or `Not applicable`. `due_date` and `revalidated_on` may be `null` while those Excel cells are blank. Both mock rows are `OPEN`, `Not started`, with null dates and an empty `reviewer_comments` string.

`CAP-001` joins `F-001`. `CAP-002` joins `F-002`. Pattern, severity, page, and owner are copied from the finding. `corrective_action` joins that finding's `remediation_fix` lines into one cell.

## dark_pattern_taxonomy

`included` is locked to `true`. `section_title` is locked to `What are dark patterns?`. `patterns` must contain exactly 13 objects. Each object has `number` from 1 to 13, `name`, and `definition`.

The mock names, in order, are:

1. False Urgency
2. Basket Sneaking
3. Confirm Shaming
4. Forced Action
5. Subscription Trap
6. Interface Interference
7. Bait and Switch
8. Drip Pricing
9. Disguised Advertisement
10. Nagging
11. Trick Wording
12. SaaS Billing / Unsolicited Billing
13. Rogue Malware / Scareware

This is the last educational page of the PDF. It is not the excluded appendix.

## methodology and limitations

`methodology.included` is locked to `true`. The mock summary says the review used captured screens, page text, observed interface behaviour, and evidence-led classification.

`limitations.included` is locked to `true`. The mock statement says the result is not a legal conclusion. `not_assessed_items` lists authenticated journeys, payment completion, and long-term repeat behaviour beyond the tested session.

## How the IDs connect

Join rows by id. Do not join them by title or page name.

| From | Field | Connects to |
| --- | --- | --- |
| `findings` | `finding_id` | `evidence.finding_id`, `cap_tracker.items.finding_id`, and `ai_payload.included_finding_ids` |
| `findings` | `evidence_ids` | `evidence.evidence_id` |
| `findings` | `cap_id` | `cap_tracker.items.cap_id` |
| `findings` | `rule_id` and `rule_version` | `scan.rule_versions` and `evidence.rule_id` |
| `findings` | `state_id` | `evidence.state_id` |
| `evidence` | `url` | `findings.page_scanned` and `cap_tracker.items.page_scanned` |
| `ai_payload.confirmed_findings` | `finding_id` | A finding whose `status` is `confirmed` |

`schema.json` checks the shape of each section. `validate_payload.py` then checks that those ids line up, that the KPI figures match the findings, and that `ai_payload` lists confirmed findings only.

## How the PDF and CAP use this payload

The PDF reads `report` for the cover, `assessment` and `scan` for scope and timing, `detection.reason` and `executive_summary` for the narrative, `kpis` for the counts, `findings` with the matching `evidence` rows for the finding pages, and `methodology`, `limitations`, and `dark_pattern_taxonomy` for the closing pages.

The CAP workbook reads `cap_tracker.items`. Join each row to its finding with `cap_id` and `finding_id`. Do not keep a second findings list for Excel.
