"""Unit tests for the cross-field checks in validate_payload."""

from __future__ import annotations

import copy

import pytest
from jsonschema.exceptions import ValidationError

from tests.helpers.payloads import load_mock, load_schema
from validate_payload import validate_payload


def _expect_failure(payload: dict, schema: dict, message: str) -> None:
    with pytest.raises(ValidationError) as caught:
        validate_payload(payload, schema)
    assert message in str(caught.value), (
        f"Expected the validator to report {message!r}. Actual error: {caught.value}"
    )


def test_given_unknown_evidence_id_when_validated_then_it_fails() -> None:
    payload = load_mock()
    payload["findings"][0]["evidence_ids"] = ["E-MISSING"]
    _expect_failure(
        payload,
        load_schema(),
        "Finding F-001 points at unknown evidence id E-MISSING.",
    )


def test_given_evidence_url_differs_when_validated_then_it_fails() -> None:
    payload = load_mock()
    payload["evidence"][0]["url"] = "https://example.com/other-page"
    _expect_failure(
        payload,
        load_schema(),
        "Evidence E-001 uses a different url.",
    )


def test_given_orphan_evidence_when_validated_then_it_fails() -> None:
    payload = load_mock()
    extra = copy.deepcopy(payload["evidence"][0])
    extra["evidence_id"] = "E-ORPHAN"
    payload["evidence"].append(extra)
    _expect_failure(
        payload,
        load_schema(),
        "Evidence items are not linked from any finding: E-ORPHAN.",
    )


def test_given_cap_id_mismatch_when_validated_then_it_fails() -> None:
    payload = load_mock()
    payload["findings"][0]["cap_id"] = "CAP-999"
    _expect_failure(
        payload,
        load_schema(),
        "Finding F-001 cap_id CAP-999 does not match CAP row CAP-001.",
    )


def test_given_unlisted_rule_version_when_validated_then_it_fails() -> None:
    payload = load_mock()
    payload["findings"][0]["rule_version"] = "9.9.9"
    _expect_failure(
        payload,
        load_schema(),
        "Finding F-001 uses rule DP-010 9.9.9, which is not listed in scan.rule_versions.",
    )


def test_given_taxonomy_names_out_of_order_when_validated_then_it_fails() -> None:
    payload = load_mock()
    names = payload["dark_pattern_taxonomy"]["patterns"]
    names[0], names[1] = names[1], names[0]
    _expect_failure(
        payload,
        load_schema(),
        "dark_pattern_taxonomy.patterns must use the 13 approved pattern names, "
        "in the approved order.",
    )


def test_given_kpi_total_does_not_match_findings_when_validated_then_it_fails() -> None:
    payload = load_mock()
    payload["kpis"]["total_findings"] = 99
    _expect_failure(
        payload,
        load_schema(),
        "kpis.total_findings must be calculated from findings. Expected 2.",
    )


def test_given_summary_facts_do_not_match_kpis_when_validated_then_it_fails() -> None:
    payload = load_mock()
    payload["ai_payload"]["facts_for_summary"]["confirmed_findings"] = 0
    _expect_failure(
        payload,
        load_schema(),
        "ai_payload.facts_for_summary.confirmed_findings must match the code-derived KPI.",
    )


def test_given_confirmed_ids_are_reordered_when_validated_then_it_fails() -> None:
    payload = load_mock()
    payload["ai_payload"]["included_finding_ids"] = ["F-002", "F-001"]
    _expect_failure(
        payload,
        load_schema(),
        "ai_payload.included_finding_ids must list confirmed findings only, in finding order.",
    )


def test_given_duplicate_evidence_id_when_validated_then_it_fails() -> None:
    payload = load_mock()
    payload["evidence"].append(copy.deepcopy(payload["evidence"][0]))
    _expect_failure(payload, load_schema(), "Duplicate evidence id E-001.")


def test_given_evidence_linked_to_another_finding_when_validated_then_it_fails() -> None:
    payload = load_mock()
    payload["evidence"][0]["finding_id"] = "F-002"
    _expect_failure(
        payload,
        load_schema(),
        "Evidence E-001 is linked to F-002, not F-001.",
    )


def test_given_evidence_rule_id_differs_when_validated_then_it_fails() -> None:
    payload = load_mock()
    payload["evidence"][0]["rule_id"] = "DP-004"
    _expect_failure(payload, load_schema(), "Evidence E-001 uses a different rule_id.")


def test_given_evidence_state_id_differs_when_validated_then_it_fails() -> None:
    payload = load_mock()
    payload["evidence"][0]["state_id"] = "ST-002"
    _expect_failure(payload, load_schema(), "Evidence E-001 uses a different state_id.")


def test_given_duplicate_cap_row_when_validated_then_it_fails() -> None:
    payload = load_mock()
    payload["cap_tracker"]["items"].append(copy.deepcopy(payload["cap_tracker"]["items"][0]))
    _expect_failure(payload, load_schema(), "Duplicate CAP row for finding F-001.")


def test_given_a_missing_cap_row_when_validated_then_it_fails() -> None:
    payload = load_mock()
    payload["cap_tracker"]["items"].pop()
    _expect_failure(
        payload,
        load_schema(),
        "CAP rows must match the finding list by finding_id.",
    )


def test_given_cap_pattern_differs_when_validated_then_it_fails() -> None:
    payload = load_mock()
    payload["cap_tracker"]["items"][0]["pattern"] = "Forced Action"
    _expect_failure(
        payload,
        load_schema(),
        "CAP row CAP-001 pattern does not match its finding.",
    )


def test_given_cap_severity_differs_when_validated_then_it_fails() -> None:
    payload = load_mock()
    payload["cap_tracker"]["items"][0]["severity"] = "LOW"
    _expect_failure(
        payload,
        load_schema(),
        "CAP row CAP-001 severity does not match its finding.",
    )


def test_given_cap_page_differs_when_validated_then_it_fails() -> None:
    payload = load_mock()
    payload["cap_tracker"]["items"][0]["page_scanned"] = "https://example.com/other"
    _expect_failure(
        payload,
        load_schema(),
        "CAP row CAP-001 page_scanned does not match its finding.",
    )


def test_given_confirmed_findings_omit_one_id_when_validated_then_it_fails() -> None:
    payload = load_mock()
    payload["ai_payload"]["confirmed_findings"] = payload["ai_payload"]["confirmed_findings"][:1]
    _expect_failure(
        payload,
        load_schema(),
        "ai_payload.confirmed_findings must contain the confirmed findings only.",
    )


def test_given_schema_status_enum_drifts_when_validated_then_it_fails() -> None:
    schema = load_schema()
    schema["properties"]["findings"]["items"]["properties"]["status"]["enum"] = [
        "confirmed"
    ]
    _expect_failure(
        load_mock(),
        schema,
        "finding status in schema.json does not match the contract config.",
    )


def test_given_schema_severity_enum_drifts_when_validated_then_it_fails() -> None:
    schema = load_schema()
    schema["properties"]["findings"]["items"]["properties"]["severity"]["enum"] = ["LOW"]
    _expect_failure(
        load_mock(),
        schema,
        "severity in schema.json does not match the contract config.",
    )


def test_given_schema_appendix_const_drifts_when_validated_then_it_fails() -> None:
    schema = load_schema()
    schema["properties"]["report"]["properties"]["include_responsible_business_appendix"][
        "const"
    ] = True
    _expect_failure(
        load_mock(),
        schema,
        "The appendix flag in schema.json does not match the contract config.",
    )


def test_given_schema_version_drifts_when_validated_then_it_fails() -> None:
    schema = load_schema()
    schema["$id"] = schema["$id"].replace("v3.0", "v9.9")
    _expect_failure(
        load_mock(),
        schema,
        "schema.json $id does not match the contract config schema version.",
    )


def test_given_schema_enum_drifts_from_config_when_validated_then_it_fails() -> None:
    schema = load_schema()
    schema["properties"]["detection"]["properties"]["result"]["enum"] = ["yes", "no"]
    _expect_failure(
        load_mock(),
        schema,
        "detection.result in schema.json does not match the contract config.",
    )
